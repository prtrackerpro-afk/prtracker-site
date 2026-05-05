/**
 * POST /api/admin/bling/sync-marketplace-skus
 *
 * One-shot tool pra arrumar SKUs marketplace TikTok:
 *  - Renomeia produtos auto-criados em pedidos prévios (`001`, `0001`,
 *    códigos truncados tipo `KIT-ANILHAS-*`) pra SKUs canônicas `TT-*`.
 *  - Cria bundles `TT-*` que ainda não existem.
 *  - Reporta produtos suspeitos (auto-criados não mapeados) pra investigação.
 *
 * Idempotente: skipa o que já existe. Pode rodar N vezes sem efeito colateral.
 *
 * Body JSON (opcional):
 *   { dryRun?: boolean }   // true = só reporta plano, sem mutar
 *
 * Auth: admin middleware. Bling deve estar conectado (OAuth).
 */

import type { APIRoute } from "astro";
import {
  findProductByCode,
  listAllProducts,
  updateProduct,
  createProduct,
  type CreateProductInput,
} from "~/lib/bling/products";
import { isConnected } from "~/lib/bling/oauth";

export const prerender = false;

interface RenameSpec {
  fromCodigo: string;
  toCodigo: string;
  /** Se `fromCodigo` não existir mais (já renomeado ou outro motivo), cria com este input. */
  fallbackCreate?: CreateProductInput;
}

// Renames de produtos auto-criados pelo Bling quando recebeu pedidos
// TikTok com SKUs erradas. Ver pedido #41 (camiseta) — Bling criou
// código "001" porque o TikTok mandou SKU "001".
//
// Outros suspeitos (KIT-ANILHAS-*, 0001) — descobrimos pelo report
// embutido neste endpoint e refatoramos depois.
const RENAMES: RenameSpec[] = [
  {
    fromCodigo: "001",
    toCodigo: "TT-TEE-MASC",
    fallbackCreate: {
      codigo: "TT-TEE-MASC",
      nome: "A melhor camiseta de treino! (TikTok)",
      preco: 89.0,
      pesoBruto: 0.25,
    },
  },
];

// Bundles a criar (correspondem 1:1 com listagens TikTok que NÃO têm
// histórico de venda — então Bling ainda não auto-criou nada por elas).
// Preço bate com TikTok (sem promoção). Bling Simples Nacional → NCM
// 39264000 (default em createProduct).
const CREATES: CreateProductInput[] = [
  {
    codigo: "TT-ANILHA-ULTRA",
    nome: "Ultra Kit Mini Anilhas - Réplica Oficial (TikTok)",
    preco: 360.0,
    pesoBruto: 0.5,
  },
  {
    codigo: "TT-ANILHA-SUPER",
    nome: "Super Kit Mini Anilhas - Réplica Oficial (TikTok)",
    preco: 219.0,
    pesoBruto: 0.4,
  },
  {
    codigo: "TT-BENCH-120",
    nome: "Mini Bench Press + 120kg em anilhas (TikTok)",
    preco: 219.0,
    pesoBruto: 0.6,
  },
  {
    codigo: "TT-DEAD-200",
    nome: "Deadlift + 200kg em Anilhas (TikTok)",
    preco: 223.0,
    pesoBruto: 0.6,
  },
  {
    codigo: "TT-DEAD-120",
    nome: "Deadlift + 120kg em Anilhas (TikTok)",
    preco: 178.0,
    pesoBruto: 0.5,
  },
  {
    codigo: "TT-MEGA-1000",
    nome: "Mini Academia Realista +1000kg Em Anilhas (TikTok)",
    preco: 897.0,
    pesoBruto: 1.5,
  },
  {
    codigo: "TT-POWER-120",
    nome: "Mini Power Rack + 120kg em anilhas (TikTok)",
    preco: 194.0,
    pesoBruto: 0.6,
  },
  {
    codigo: "TT-POWER-200",
    nome: "Mini Power Rack + 200kg em anilhas (TikTok)",
    preco: 239.0,
    pesoBruto: 0.7,
  },
  {
    codigo: "TT-MYPR",
    nome: "Troféu de Crossfit - PR de Todos os Exercícios (TikTok)",
    preco: 184.0,
    pesoBruto: 0.5,
  },
  {
    codigo: "TT-MEGA-600",
    nome: "Mini Academia Realista +600kg Em Anilhas (TikTok)",
    preco: 597.0,
    pesoBruto: 1.0,
  },
];

// Patterns que indicam produto auto-criado pelo Bling (não cadastrado
// manualmente nem pelo nosso webhook). Usado pra reportar suspeitos.
const AUTO_CREATED_PATTERNS = [
  /^0+\d{1,4}$/, // "001", "0001", "00012"
  /^KIT-ANILHAS/i,
  /^[A-Z0-9]{1,4}$/, // códigos curtos demais pra ser canônicos (DEAD-V1 tem 7)
];

function isLikelyAutoCreated(codigo: string | undefined): boolean {
  if (!codigo) return true;
  if (codigo.startsWith("TT-")) return false;
  if (codigo.startsWith("ML-")) return false;
  if (codigo.startsWith("SP-")) return false;
  return AUTO_CREATED_PATTERNS.some((p) => p.test(codigo));
}

interface ActionLog {
  action: "rename" | "create" | "skip" | "error";
  codigo: string;
  detail?: string;
  blingId?: number;
}

export const POST: APIRoute = async ({ request }) => {
  if (!(await isConnected())) {
    return new Response(
      JSON.stringify({ error: "bling not connected" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  let dryRun = false;
  try {
    const body = (await request.json()) as { dryRun?: unknown };
    dryRun = body.dryRun === true;
  } catch {
    // body opcional
  }

  const log: ActionLog[] = [];

  // --- RENAMES ---
  for (const r of RENAMES) {
    try {
      const existingTo = await findProductByCode(r.toCodigo);
      if (existingTo) {
        log.push({
          action: "skip",
          codigo: r.toCodigo,
          detail: `${r.toCodigo} já existe (id ${existingTo.id})`,
          blingId: existingTo.id,
        });
        continue;
      }

      const existingFrom = await findProductByCode(r.fromCodigo);
      if (existingFrom) {
        if (dryRun) {
          log.push({
            action: "rename",
            codigo: `${r.fromCodigo} → ${r.toCodigo}`,
            detail: `dryRun (id ${existingFrom.id})`,
            blingId: existingFrom.id,
          });
        } else {
          const updated = await updateProduct(existingFrom.id, {
            codigo: r.toCodigo,
          });
          log.push({
            action: "rename",
            codigo: `${r.fromCodigo} → ${r.toCodigo}`,
            blingId: updated.id,
          });
        }
      } else if (r.fallbackCreate) {
        if (dryRun) {
          log.push({
            action: "create",
            codigo: r.toCodigo,
            detail: "dryRun (fallback create — fromCodigo não encontrado)",
          });
        } else {
          const created = await createProduct(r.fallbackCreate);
          log.push({
            action: "create",
            codigo: r.toCodigo,
            blingId: created.id,
          });
        }
      } else {
        log.push({
          action: "skip",
          codigo: r.fromCodigo,
          detail: "não encontrado e sem fallback",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push({
        action: "error",
        codigo: `${r.fromCodigo} → ${r.toCodigo}`,
        detail: msg,
      });
    }
  }

  // --- CREATES ---
  for (const c of CREATES) {
    try {
      const existing = await findProductByCode(c.codigo);
      if (existing) {
        log.push({
          action: "skip",
          codigo: c.codigo,
          detail: "já existe",
          blingId: existing.id,
        });
        continue;
      }
      if (dryRun) {
        log.push({ action: "create", codigo: c.codigo, detail: "dryRun" });
      } else {
        const created = await createProduct(c);
        log.push({
          action: "create",
          codigo: c.codigo,
          blingId: created.id,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push({ action: "error", codigo: c.codigo, detail: msg });
    }
  }

  // --- REPORT: auto-criados que ainda não mapeamos ---
  // Lista todos produtos e flagga qualquer um cujo código bate com
  // pattern de auto-criado mas não está no plano de RENAMES.
  let suspects: Array<{ id: number; codigo: string; nome: string; preco?: number }> = [];
  try {
    const all = await listAllProducts();
    const renameTargets = new Set(RENAMES.map((r) => r.toCodigo));
    const renameSources = new Set(RENAMES.map((r) => r.fromCodigo));
    suspects = all
      .filter((p) => {
        const c = p.codigo;
        if (!c) return true;
        if (renameTargets.has(c) || renameSources.has(c)) return false;
        return isLikelyAutoCreated(c);
      })
      .map((p) => ({
        id: p.id,
        codigo: p.codigo ?? "(sem código)",
        nome: p.nome,
        preco: p.preco,
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.push({
      action: "error",
      codigo: "(report)",
      detail: `falha ao listar produtos pra report: ${msg}`,
    });
  }

  const summary = {
    renames: log.filter((l) => l.action === "rename").length,
    creates: log.filter((l) => l.action === "create").length,
    skips: log.filter((l) => l.action === "skip").length,
    errors: log.filter((l) => l.action === "error").length,
    suspects: suspects.length,
  };

  return new Response(
    JSON.stringify(
      {
        ok: summary.errors === 0,
        dryRun,
        summary,
        log,
        suspects,
      },
      null,
      2,
    ),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
