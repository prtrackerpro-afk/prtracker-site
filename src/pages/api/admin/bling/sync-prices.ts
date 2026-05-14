/**
 * POST /api/admin/bling/sync-prices
 *
 * Aplica o preço-base canônico do SITE no cadastro de cada produto
 * Bling correspondente. Usa a mesma fonte de verdade do
 * `audit-prices` (Content Collection + catalog.PLATES).
 *
 * Body JSON (opcional):
 *   { dryRun?: boolean, only?: string[] }
 *
 *   - `dryRun: true` (default false) → calcula o plano de update mas
 *     NÃO chama o Bling. Útil pra preview no admin antes de confirmar.
 *   - `only: ["DEADLIFT-SET", ...]` → restringe o sync aos SKUs
 *     fornecidos. Omitido → atualiza tudo que está drifted.
 *
 * Resposta:
 *   { applied: PriceUpdateResult[], skipped: string[], dryRun: bool }
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import {
  listAllProducts,
  updateProduct,
  type BlingProduct,
} from "~/lib/bling/products";
import { isConnected } from "~/lib/bling/oauth";
import { PLATES } from "~/lib/catalog";

export const prerender = false;

// Mantém alinhado com audit-prices.ts.
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

interface UpdateResult {
  blingId: number;
  codigo: string;
  nome: string;
  oldPriceBRL: number | null;
  newPriceBRL: number;
  status: "ok" | "no-op" | "error";
  error?: string;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await isConnected())) {
    return new Response(JSON.stringify({ error: "bling not connected" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: { dryRun?: boolean; only?: string[] } = {};
  try {
    const text = await request.text();
    body = text ? JSON.parse(text) : {};
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const dryRun = body.dryRun === true;
  const onlyFilter = Array.isArray(body.only) ? new Set(body.only) : null;

  try {
    // Build target table (igual ao audit-prices).
    const targetPriceBySku = new Map<string, number>();
    const siteProducts = await getCollection("products");
    for (const p of siteProducts) {
      const skus = SLUG_TO_BLING_SKUS[p.data.slug];
      if (!skus) continue;
      const priceBRL = round2(p.data.priceBase / 100);
      for (const sku of skus) targetPriceBySku.set(sku, priceBRL);
    }
    for (const plate of PLATES) {
      const sku = `ANILHA-${plate.id.replace("_", ".")}`;
      targetPriceBySku.set(sku, round2(plate.pricePerPairCents / 100));
    }
    targetPriceBySku.set(
      "ANILHA-MIX",
      round2(
        (PLATES.find((pp) => pp.id === "5")?.pricePerPairCents ?? 700) / 100,
      ),
    );

    const all: BlingProduct[] = await listAllProducts();
    const updates: UpdateResult[] = [];
    const skipped: string[] = [];

    for (const bp of all) {
      const codigo = bp.codigo ?? "";
      const target = targetPriceBySku.get(codigo);
      if (target == null) continue;
      if (onlyFilter && !onlyFilter.has(codigo)) {
        skipped.push(codigo);
        continue;
      }
      const current = bp.preco ?? null;
      const drifted =
        current == null
          ? true
          : Math.abs(round2(current) - target) > 0.01;
      if (!drifted) {
        updates.push({
          blingId: bp.id,
          codigo,
          nome: bp.nome,
          oldPriceBRL: current,
          newPriceBRL: target,
          status: "no-op",
        });
        continue;
      }

      if (dryRun) {
        updates.push({
          blingId: bp.id,
          codigo,
          nome: bp.nome,
          oldPriceBRL: current,
          newPriceBRL: target,
          status: "ok",
        });
        continue;
      }

      try {
        await updateProduct(bp.id, { preco: target });
        updates.push({
          blingId: bp.id,
          codigo,
          nome: bp.nome,
          oldPriceBRL: current,
          newPriceBRL: target,
          status: "ok",
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        updates.push({
          blingId: bp.id,
          codigo,
          nome: bp.nome,
          oldPriceBRL: current,
          newPriceBRL: target,
          status: "error",
          error: msg,
        });
      }
    }

    return new Response(
      JSON.stringify({
        dryRun,
        applied: updates.filter((u) => u.status === "ok"),
        noOp: updates.filter((u) => u.status === "no-op"),
        errors: updates.filter((u) => u.status === "error"),
        skipped,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[sync-prices]", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};
