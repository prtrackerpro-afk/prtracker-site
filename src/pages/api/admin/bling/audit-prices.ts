/**
 * GET /api/admin/bling/audit-prices
 *
 * Compara o preço-base canônico do SITE (Content Collection
 * `products` + `catalog.PLATES` para as anilhas) contra o preço
 * cadastrado em cada produto do BLING. Reporta divergências.
 *
 * Read-only — não muta nada. Se quiser aplicar, chama
 * `POST /api/admin/bling/sync-prices`.
 *
 * Por que isso existe: o flow normal MP → Bling cria o produto no Bling
 * apenas na 1ª venda usando o preço daquele momento. Reajustes de preço
 * no site NÃO se propagam ao cadastro Bling — ficam batendo no `valor`
 * de cada NF-e (correto) mas o catálogo Bling fica defasado, e isso
 * polui relatórios + integrações secundárias do Bling com marketplaces.
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { listAllProducts, type BlingProduct } from "~/lib/bling/products";
import { isConnected } from "~/lib/bling/oauth";
import { PLATES } from "~/lib/catalog";
import { evaluateBlingPriceDrift } from "~/lib/admin/alerts-engine";

export const prerender = false;

// Mapeamento site slug → SKU canônico no Bling. Manter alinhado com
// sku-map.ts. Camisetas têm variações por tamanho (TEE-MASC-P etc) —
// como o preço é igual em todos os tamanhos, agrupamos por SKU pai e
// aplicamos o mesmo preço em todas as variações.
const SLUG_TO_BLING_SKUS: Record<string, string[]> = {
  "deadlift-set": ["DEADLIFT-SET"],
  "bench-press-set": ["BENCH-SET"],
  "power-rack-set": ["POWER-SET"],
  "my-pr-set": ["MYPR-SET"],
  "camiseta-masculina": [
    "TEE-MASC",
    "TEE-MASC-P",
    "TEE-MASC-M",
    "TEE-MASC-G",
    "TEE-MASC-GG",
  ],
  "camiseta-feminina-baby-look": [
    "TEE-BABY",
    "TEE-BABY-P",
    "TEE-BABY-M",
    "TEE-BABY-G",
    "TEE-BABY-GG",
  ],
};

interface PriceRow {
  blingId: number;
  codigo: string;
  nome: string;
  sourceLabel: string;
  sitePriceBRL: number;
  blingPriceBRL: number | null;
  drifted: boolean;
  diffBRL: number | null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const GET: APIRoute = async () => {
  if (!(await isConnected())) {
    return new Response(JSON.stringify({ error: "bling not connected" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Tabela canônica: SKU Bling → preço BRL (do site).
    const targetPriceBySku = new Map<
      string,
      { priceBRL: number; sourceLabel: string }
    >();

    // 1) Kits + camisetas: vêm da Content Collection (centavos → reais).
    const siteProducts = await getCollection("products");
    for (const p of siteProducts) {
      const skus = SLUG_TO_BLING_SKUS[p.data.slug];
      if (!skus) continue; // anilhas/my-pr-gym tratados à parte
      const priceBRL = round2(p.data.priceBase / 100);
      for (const sku of skus) {
        targetPriceBySku.set(sku, {
          priceBRL,
          sourceLabel: `site.products["${p.data.slug}"].priceBase`,
        });
      }
    }

    // 2) Anilhas: vêm de catalog.PLATES (pricePerPairCents → BRL/par).
    for (const plate of PLATES) {
      const sku = `ANILHA-${plate.id.replace("_", ".")}`;
      targetPriceBySku.set(sku, {
        priceBRL: round2(plate.pricePerPairCents / 100),
        sourceLabel: `catalog.PLATES["${plate.id}"].pricePerPairCents`,
      });
    }
    // ANILHA-MIX é um SKU especial usado quando o cart tem >1 peso de
    // anilha — pode ficar com o preço da 5kg como default razoável.
    targetPriceBySku.set("ANILHA-MIX", {
      priceBRL: round2(
        (PLATES.find((p) => p.id === "5")?.pricePerPairCents ?? 700) / 100,
      ),
      sourceLabel: "catalog.PLATES — fallback 5kg",
    });

    // Lista todos os produtos do Bling, encontra os canônicos.
    const all: BlingProduct[] = await listAllProducts();
    const rows: PriceRow[] = [];

    for (const bp of all) {
      const codigo = bp.codigo ?? "";
      const target = targetPriceBySku.get(codigo);
      if (!target) continue; // não-canônico (legacy/marketplace), ignora aqui

      const blingPriceBRL = bp.preco ?? null;
      const drifted =
        blingPriceBRL == null
          ? true
          : Math.abs(round2(blingPriceBRL) - target.priceBRL) > 0.01;
      const diffBRL =
        blingPriceBRL == null
          ? null
          : round2(target.priceBRL - blingPriceBRL);

      rows.push({
        blingId: bp.id,
        codigo,
        nome: bp.nome,
        sourceLabel: target.sourceLabel,
        sitePriceBRL: target.priceBRL,
        blingPriceBRL,
        drifted,
        diffBRL,
      });
    }

    // Ordena por: drifted primeiro, depois por código.
    rows.sort((a, b) => {
      if (a.drifted !== b.drifted) return a.drifted ? -1 : 1;
      return a.codigo.localeCompare(b.codigo);
    });

    // SKUs canônicos que existem na fonte do site mas não foram achados
    // no Bling — não falham nada (provavelmente nunca foram vendidos
    // ainda), mas é útil reportar.
    const blingCodigos = new Set(all.map((p) => p.codigo).filter(Boolean));
    const missingInBling: string[] = [];
    for (const sku of targetPriceBySku.keys()) {
      if (!blingCodigos.has(sku)) missingInBling.push(sku);
    }
    missingInBling.sort();

    const summary = {
      total_canonical: rows.length,
      drifted: rows.filter((r) => r.drifted).length,
      aligned: rows.filter((r) => !r.drifted).length,
      missing_in_bling: missingInBling.length,
    };

    // Side-effect: ao auditar, sincronizamos os alerts proativos.
    // Cria alerts pros SKUs drifted (idempotente) e auto-resolve os que
    // voltaram a bater. Falha aqui não bloqueia a resposta (read-only).
    try {
      await evaluateBlingPriceDrift();
    } catch (alertErr) {
      console.warn("[audit-prices] evaluateBlingPriceDrift failed:", alertErr);
    }

    return new Response(
      JSON.stringify({ summary, rows, missingInBling }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "private, max-age=15",
        },
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[audit-prices]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
