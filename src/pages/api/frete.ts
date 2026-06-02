/**
 * Real-time shipping quote via Melhor Envio.
 *
 * Política atual (jun/2026): única transportadora oferecida é Correios,
 * com PAC + SEDEX expostos no checkout. Quando subtotal de produtos
 * ≥ R$ 100, a modalidade mais barata (PAC normalmente) vai grátis e a
 * outra (SEDEX) cobra só a diferença em relação à PAC — cliente paga
 * apenas o upgrade de velocidade, não o frete cheio. Abaixo de R$ 100,
 * ambas vão com o preço cheio retornado pela ME.
 *
 * Flow:
 *   cart items → aggregate weight/dims per product → ME /shipment/calculate
 *   → filtra Correios → seleciona PAC e SEDEX → aplica repricing se elegível
 *
 * Auth: personal JWT stored in `ME_ACCESS_TOKEN` (long-lived, 18mo).
 * Origin CEP from `ME_CEP_ORIGEM`. `ME_SANDBOX=true` routes to the
 * melhorenvio sandbox host.
 *
 * Cache em memória por (cep, itemsHash, freeShipEligible) por 5 min pra
 * absorver double-fires típicos. Per-isolate em Vercel Functions,
 * best-effort.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { z } from "astro:content";

export const prerender = false;

// Subtotal de produtos a partir do qual o frete grátis (PAC) é liberado
// automaticamente — sem cupom. SEDEX cobra só a diferença pra PAC; abaixo
// disso, PAC e SEDEX vão com preço cheio da Melhor Envio.
const FREE_SHIPPING_MIN_CENTS = 10_000; // R$ 100,00

const plateSelectionSchema = z.object({
  plateId: z.enum(["25", "20", "15", "10", "5", "2_5", "1_25"]),
  pairs: z.number().int().min(0).max(4),
});

const itemSchema = z.object({
  productSlug: z.string().min(1).max(100),
  quantity: z.number().int().min(1).max(20),
  plates: z.array(plateSelectionSchema).optional(),
});

const payloadSchema = z.object({
  cepDestino: z.string().regex(/^\d{8}$/),
  items: z.array(itemSchema).min(1).max(20),
  // Subtotal de produtos (antes de cupom). Decide se o repricing de frete
  // grátis é aplicado: ≥ R$ 100 → PAC grátis + SEDEX paga delta; < R$ 100
  // → ambos com preço cheio.
  subtotalCents: z.number().int().min(0).max(10_000_000).optional(),
  // Campo mantido por compat com o client; não influencia o preço.
  coupon: z.string().trim().max(50).optional(),
});

type MeCarrier = {
  id: number;
  name: string;
  price: string; // ME returns strings
  custom_price?: string;
  delivery_time?: number;
  delivery_range?: { min: number; max: number };
  company?: { id: number; name: string; picture?: string };
  error?: string;
};

type QuoteOption = {
  id: number;
  name: string;
  company: string;
  company_picture: string | null;
  price_cents: number;
  delivery_days_min: number;
  delivery_days_max: number;
};

const cache = new Map<string, { at: number; value: QuoteOption[] }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hashItems(items: z.infer<typeof itemSchema>[]): string {
  return items
    .map((i) => {
      const platesPart = (i.plates ?? [])
        .map((p) => `${p.plateId}:${p.pairs}`)
        .sort()
        .join(",");
      return `${i.productSlug}×${i.quantity}[${platesPart}]`;
    })
    .sort()
    .join("|");
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "JSON inválido." });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, {
      error: "Payload inválido.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    });
  }
  const { cepDestino, items, subtotalCents } = parsed.data;
  const freeShippingEligible =
    subtotalCents != null && subtotalCents >= FREE_SHIPPING_MIN_CENTS;

  // Trim defensively: Vercel's Sensitive env-var UI has been known to
  // preserve trailing whitespace or a stray newline, which breaks the
  // Bearer header silently (ME returns 401 Unauthenticated).
  const accessToken = (import.meta.env.ME_ACCESS_TOKEN ?? "").trim();
  const cepOrigem = (import.meta.env.ME_CEP_ORIGEM ?? "").trim();
  if (!accessToken || !cepOrigem) {
    return jsonResponse(500, {
      error:
        "Melhor Envio não configurado. Defina ME_ACCESS_TOKEN e ME_CEP_ORIGEM.",
    });
  }

  // Eligibility entra na chave: dois carrinhos com mesmos itens + CEP mas
  // subtotais cruzando o threshold (R$ 99 vs R$ 100) recebem listas
  // diferentes, então não podem compartilhar cache.
  const cacheKey = `${cepDestino}::${hashItems(items)}::free=${freeShippingEligible}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jsonResponse(200, { options: cached.value, cached: true });
  }

  // Build ME product lines from catalog dimensions. Itens digitais
  // (vale-presente) são ignorados — não geram volume físico pra cotar.
  const products = await getCollection("products");
  const bySlug = new Map(products.map((p) => [p.data.slug, p]));

  const meProducts: Array<{
    id: string;
    width: number;
    height: number;
    length: number;
    weight: number; // kg
    insurance_value: number; // BRL
    quantity: number;
  }> = [];
  let anyPhysical = false;

  for (const item of items) {
    const product = bySlug.get(item.productSlug);
    if (!product) {
      return jsonResponse(400, {
        error: `Produto não encontrado: ${item.productSlug}`,
      });
    }
    if (product.data.digital === true) {
      // Digital — pula a cotação física.
      continue;
    }
    anyPhysical = true;
    const dims = product.data.shipping;
    // For standalone anilhas, the "unit" is per pair — scale weight by
    // total pairs selected. PR sets ship as one package regardless of
    // plate config (dimensions are for the whole set).
    const isStandaloneAnilhas = product.data.slug === "anilhas";
    const totalPairs = isStandaloneAnilhas
      ? (item.plates ?? []).reduce((n, p) => n + p.pairs, 0) || 1
      : 1;
    const weightKg = (dims.weight_g * totalPairs) / 1000;
    const insuranceBRL =
      dims.insurance_value_cents != null
        ? dims.insurance_value_cents / 100
        : product.data.priceBase / 100;
    meProducts.push({
      id: item.productSlug,
      width: dims.width_cm,
      height: dims.height_cm,
      length: dims.length_cm,
      weight: Number(weightKg.toFixed(3)),
      insurance_value: Number(insuranceBRL.toFixed(2)),
      quantity: item.quantity,
    });
  }

  // Carrinho 100% digital → uma única opção "Entrega digital" grátis.
  // Sentinela id=-1 reconhecida em order-build.ts.
  if (!anyPhysical) {
    return jsonResponse(200, {
      options: [
        {
          id: -1,
          name: "Entrega digital — por e-mail",
          company: "PR Tracker",
          company_picture: null,
          price_cents: 0,
          delivery_days_min: 0,
          delivery_days_max: 0,
        },
      ],
    });
  }

  const useSandbox = import.meta.env.ME_SANDBOX === "true";
  const meHost = useSandbox
    ? "https://sandbox.melhorenvio.com.br"
    : "https://melhorenvio.com.br";
  const url = `${meHost}/api/v2/me/shipment/calculate`;

  let rawCarriers: MeCarrier[];
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        // ME requires a User-Agent with a contact address for rate-limiting
        // and support. See https://docs.melhorenvio.com.br/
        "User-Agent": "PR Tracker (contato@prtracker.com.br)",
      },
      body: JSON.stringify({
        from: { postal_code: cepOrigem },
        to: { postal_code: cepDestino },
        products: meProducts,
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("[frete] ME HTTP", res.status, errText.slice(0, 500));
      return jsonResponse(502, {
        error: "Serviço de frete indisponível. Tente novamente em instantes.",
      });
    }
    rawCarriers = (await res.json()) as MeCarrier[];
  } catch (err) {
    console.error("[frete] ME fetch error:", err);
    return jsonResponse(502, {
      error: "Falha ao consultar frete. Tente novamente.",
    });
  }

  // Política: única transportadora é Correios. Modalidades expostas: PAC
  // (econômica, padrão) e SEDEX (expressa). A **mais barata vai grátis**
  // (custo absorvido na margem); a outra cobra apenas a *diferença* —
  // cliente paga só o upgrade de velocidade. Variantes de retirada em
  // agência ficam fora.
  const BLOCKED_SERVICE_PATTERNS = [/ponto/i, /centralizado/i, /coleta/i];

  const correiosOptions: QuoteOption[] = rawCarriers
    .filter((c) => {
      if (c.error || c.price == null) return false;
      if (c.company?.name !== "Correios") return false;
      if (BLOCKED_SERVICE_PATTERNS.some((rx) => rx.test(c.name ?? ""))) {
        return false;
      }
      return true;
    })
    .map((c) => {
      const priceStr = c.custom_price ?? c.price;
      const price_cents = Math.round(Number(priceStr) * 100);
      const days =
        c.delivery_range ??
        (c.delivery_time
          ? { min: c.delivery_time, max: c.delivery_time }
          : { min: 0, max: 0 });
      return {
        id: c.id,
        name: c.name,
        company: c.company?.name ?? "Correios",
        company_picture: c.company?.picture ?? null,
        price_cents,
        delivery_days_min: days.min,
        delivery_days_max: days.max,
      };
    })
    .filter((o) => Number.isFinite(o.price_cents) && o.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents);

  if (correiosOptions.length === 0) {
    return jsonResponse(200, {
      options: [],
      error: "Correios não atende esse CEP no momento.",
    });
  }

  // Pega PAC e SEDEX (nomes podem vir como "PAC", "SEDEX", "PAC Mini",
  // "SEDEX 10" etc — match por regex no nome). Em casos onde a ME só
  // retorna um deles pro CEP/volume, expomos só esse.
  const pac = correiosOptions.find((o) => /\bpac\b/i.test(o.name));
  const sedex = correiosOptions.find((o) => /sedex/i.test(o.name));

  // Fallback final: se nem PAC nem SEDEX bateram no regex (raro — nome
  // do serviço mudou no ME), pega o Correios mais barato pra não
  // bloquear venda.
  const fallback = !pac && !sedex ? correiosOptions[0]! : null;
  const exposed = [pac, sedex, fallback].filter(
    (o): o is QuoteOption => o != null,
  );

  // Repricing: só aplica quando carrinho ≥ R$ 100 (frete grátis automático).
  //   - Baseline (mais barata) sai grátis — custo absorvido na margem.
  //   - As outras pagam só a diferença em relação à baseline (upgrade de
  //     velocidade).
  // Abaixo de R$ 100, ambas mantêm o preço cheio retornado pela ME.
  const baselineCents = freeShippingEligible
    ? Math.min(...exposed.map((o) => o.price_cents))
    : 0;

  const priceFor = (opt: QuoteOption): number =>
    freeShippingEligible
      ? Math.max(0, opt.price_cents - baselineCents)
      : opt.price_cents;

  const label = (opt: QuoteOption, fallbackLabel: string): string =>
    opt === pac ? "Correios PAC" : opt === sedex ? "Correios SEDEX" : fallbackLabel;

  const options: QuoteOption[] = exposed.map((opt) => ({
    ...opt,
    name: label(opt, "Correios"),
    price_cents: priceFor(opt),
  }));

  // Ordena por preço pro cliente (mais barata/grátis primeiro) — auto-select
  // no UI pega o primeiro elemento.
  options.sort((a, b) => a.price_cents - b.price_cents);

  cache.set(cacheKey, { at: Date.now(), value: options });

  return jsonResponse(200, { options });
};
