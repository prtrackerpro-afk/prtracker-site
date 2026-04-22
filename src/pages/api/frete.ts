/**
 * Real-time shipping quote via Melhor Envio.
 *
 * Flow:
 *   cart items → aggregate weight/dims per product → ME /shipment/calculate
 *   → filtered list of shipping options → client renders radio list
 *
 * Auth: personal JWT stored in `ME_ACCESS_TOKEN` (long-lived, 18mo).
 * Origin CEP from `ME_CEP_ORIGEM`. `ME_SANDBOX=true` routes to the
 * melhorenvio sandbox host.
 *
 * We cache responses in-memory per (cep, itemsHash) for 5 min to absorb
 * the two typical double-fires: user tabs away and back, or switches
 * payment method. Cache is per-isolate — Vercel Functions can have many
 * isolates, so this is a best-effort performance win, not a correctness
 * mechanism.
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { z } from "astro:content";

export const prerender = false;

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
  const { cepDestino, items } = parsed.data;

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

  const cacheKey = `${cepDestino}::${hashItems(items)}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return jsonResponse(200, { options: cached.value, cached: true });
  }

  // Build ME product lines from catalog dimensions.
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

  for (const item of items) {
    const product = bySlug.get(item.productSlug);
    if (!product) {
      return jsonResponse(400, {
        error: `Produto não encontrado: ${item.productSlug}`,
      });
    }
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
        // Debug info — only truly helpful until we stabilize the ME integration.
        // Remove or gate behind an env flag once we stop seeing issues.
        debug: {
          me_status: res.status,
          me_body: errText.slice(0, 800),
        },
      });
    }
    rawCarriers = (await res.json()) as MeCarrier[];
  } catch (err) {
    console.error("[frete] ME fetch error:", err);
    return jsonResponse(502, {
      error: "Falha ao consultar frete. Tente novamente.",
    });
  }

  const options: QuoteOption[] = rawCarriers
    .filter((c) => !c.error && c.price != null)
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
        company: c.company?.name ?? "—",
        company_picture: c.company?.picture ?? null,
        price_cents,
        delivery_days_min: days.min,
        delivery_days_max: days.max,
      };
    })
    .filter((o) => Number.isFinite(o.price_cents) && o.price_cents > 0)
    .sort((a, b) => a.price_cents - b.price_cents);

  if (options.length === 0) {
    return jsonResponse(200, {
      options: [],
      error: "Nenhuma transportadora atende esse CEP no momento.",
    });
  }

  cache.set(cacheKey, { at: Date.now(), value: options });
  return jsonResponse(200, { options });
};
