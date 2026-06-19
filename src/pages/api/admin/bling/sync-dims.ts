/**
 * GET /api/admin/bling/sync-dims
 *
 * Backfill de dimensões da embalagem (cm) + descrição curta nos produtos
 * TikTok do Bling, casando por SKU. Necessário pro export ao TikTok Shop, que
 * exige largura/altura/profundidade e descrição preenchidos.
 *
 * Segurança: por padrão roda em DRY RUN (só mostra o plano, não escreve).
 * Pra aplicar de verdade, abra com `?apply=1`.
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */
import type { APIRoute } from "astro";
import { isConnected } from "~/lib/bling/oauth";
import { syncDimensoesDescricao, type DimsDescInput } from "~/lib/bling/products";

export const prerender = false;

// Dimensões reais das caixas (cm) + descrição curta, por SKU.
const DATA: Record<string, DimsDescInput> = {
  "TT-DEAD-120": {
    largura: 27, altura: 7, profundidade: 12,
    descricao: "Troféu Deadlift com 120kg em mini anilhas. Base MDF + borracha, barra em aço inox, anilhas padrão Olímpico. Réplica oficial PR Tracker.",
  },
  "TT-DEAD-200": {
    largura: 27, altura: 7, profundidade: 12,
    descricao: "Troféu Deadlift com 200kg em mini anilhas. Base MDF + borracha, barra em aço inox, anilhas padrão Olímpico. Réplica oficial PR Tracker.",
  },
  "TT-MYPR-120": {
    largura: 27, altura: 7, profundidade: 12,
    descricao: "Troféu de LPO/Crossfit com 120kg em mini anilhas — escolha o exercício. Barra aço inox, anilhas padrão Olímpico. Réplica oficial PR Tracker.",
  },
  "TT-POWER-120": {
    largura: 27, altura: 12, profundidade: 12,
    descricao: "Mini Power Rack com 120kg em mini anilhas. Estrutura em alumínio, barra aço inox, anilhas padrão Olímpico. Réplica oficial PR Tracker.",
  },
  "TT-POWER-200": {
    largura: 27, altura: 12, profundidade: 12,
    descricao: "Mini Power Rack com 200kg em mini anilhas. Estrutura em alumínio, barra aço inox, anilhas padrão Olímpico. Réplica oficial PR Tracker.",
  },
  "TT-BENCH-120": {
    largura: 27, altura: 12, profundidade: 12,
    descricao: "Mini banco de supino com 120kg em mini anilhas. Alumínio + barra aço inox, anilhas padrão Olímpico. Réplica oficial PR Tracker.",
  },
  "TT-MEGA-600": {
    largura: 27, altura: 12, profundidade: 12,
    descricao: "Mini academia realista com 600kg em mini anilhas: power rack + supino + plataforma de deadlift. Réplica oficial PR Tracker.",
  },
  "TT-MEGA-1000": {
    largura: 27, altura: 12, profundidade: 12,
    descricao: "Mini academia realista com 1000kg em mini anilhas: power rack + supino + plataforma de deadlift. Réplica oficial PR Tracker.",
  },
  "TT-ANILHA-BASIC": {
    largura: 22, altura: 4, profundidade: 15,
    descricao: "Kit essencial de mini anilhas — 157,5kg. Réplica oficial PR Tracker, padrão Olímpico, plástico de alta densidade.",
  },
  "TT-ANILHA-SUPER": {
    largura: 22, altura: 4, profundidade: 15,
    descricao: "Super kit de mini anilhas — 307,5kg. Réplica oficial PR Tracker, padrão Olímpico, plástico de alta densidade.",
  },
  "TT-ANILHA-ULTRA": {
    largura: 22, altura: 4, profundidade: 15,
    descricao: "Ultra kit de mini anilhas — 747,5kg. Réplica oficial PR Tracker, padrão Olímpico, plástico de alta densidade.",
  },
  "TEE-MASC": {
    largura: 21, altura: 5, profundidade: 21,
    descricao: "Camiseta de treino PR Tracker masculina. Tecido respirável, leve e confortável pros treinos mais pesados.",
  },
  "TEE-BABY": {
    largura: 21, altura: 5, profundidade: 21,
    descricao: "Camiseta de treino PR Tracker baby look. Tecido respirável, leve e confortável pros treinos mais pesados.",
  },
};

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const GET: APIRoute = async ({ url }) => {
  if (!(await isConnected())) {
    return json({ error: "bling not connected" }, 503);
  }
  const apply = url.searchParams.get("apply") === "1";
  try {
    const report = await syncDimensoesDescricao(DATA, { dryRun: !apply });
    return json(
      {
        note: apply
          ? "APLICADO no Bling"
          : "DRY RUN (nada foi escrito) — abra com ?apply=1 pra aplicar de verdade",
        ...report,
      },
      200,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[bling/sync-dims]", msg);
    return json({ error: msg }, 502);
  }
};
