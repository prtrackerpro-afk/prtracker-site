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
  getProduct,
  listAllProducts,
  updateProduct,
  createProduct,
  type CreateProductInput,
} from "~/lib/bling/products";
import { isConnected } from "~/lib/bling/oauth";

export const prerender = false;

interface RenameSpec {
  /**
   * Identificação do produto a renomear. Pelo menos um dos dois deve
   * ser passado. `fromId` ganha precedência (necessário quando o produto
   * tem código vazio — caso das 9 variações de camiseta auto-criadas
   * pelo webhook do site).
   */
  fromId?: number;
  fromCodigo?: string;
  toCodigo: string;
  /** Se o produto não existir mais (já renomeado, deletado etc.), cria com este input. */
  fallbackCreate?: CreateProductInput;
}

// Renames cobrem dois cenários:
//
// 1) Produtos auto-criados pelo Bling com código placeholder quando
//    recebeu pedidos com SKUs erradas (ex: "001" do TikTok pedido #41,
//    "0001" do site, "KIT-ANILHAS-PERSONAL*" auto-gerado).
//
// 2) Variações de produtos do site cadastradas SEM código (Bling cria
//    com `codigo: ""` quando webhook do site não traz SKU). Renomear
//    requer fromId pois `findProductByCode("")` não funciona.
//
// CONFLITO TEE-MASC-M: existem dois candidatos:
//   - id 16642958620 "001" (criado do pedido #41 — Felipe Laier teste)
//   - id 16595689452 "" "Camiseta Masculina Tamanhos:M" R$80 (variação site)
// Resolução: o R$80 vira TEE-MASC-M canonical (cross-channel site+marketplace);
// o "001" vira TEE-MASC-M-LEGACY pra preservar histórico fiscal pedido #41
// sem ocupar o nome canonical.
//
// SKUs canônicas escolhidas:
//   - Kits-base do site (sem anilhas, "Monte sua barra"): BENCH-SET, DEADLIFT-SET,
//     POWER-SET, MYPR-SET (sem prefixo — site é o canonical channel)
//   - Camisetas (cross-channel, mesma peça em todos canais): TEE-MASC-{P,M,G,GG},
//     TEE-BABY-{P,M,G}
//   - Bundles marketplace com peso fixo: TT-* (TT-BENCH-120, TT-DEAD-200, etc)
const RENAMES: RenameSpec[] = [
  // --- TEE-MASC-M conflict resolution: marca o "001" como LEGACY ANTES
  //     de renomear o R$80 pra TEE-MASC-M (libera o nome canonical).
  {
    fromCodigo: "001",
    toCodigo: "TEE-MASC-M-LEGACY",
  },

  // --- Kits-base do site (modelo "Monte sua barra" — anilhas avulsas) ---
  {
    fromId: 16595689321,
    fromCodigo: "KIT-ANILHAS-PERSONAL-1",
    toCodigo: "BENCH-SET",
    fallbackCreate: {
      codigo: "BENCH-SET",
      nome: "Bench Press Set",
      preco: 169.9,
      pesoBruto: 0.4,
    },
  },
  {
    fromId: 16595689351,
    fromCodigo: "KIT-ANILHAS-PERSONAL-1-1",
    toCodigo: "DEADLIFT-SET",
    fallbackCreate: {
      codigo: "DEADLIFT-SET",
      nome: "Deadlift Set",
      preco: 119.9,
      pesoBruto: 0.4,
    },
  },
  {
    fromId: 16595689283,
    fromCodigo: "KIT-ANILHAS-PERSONAL",
    toCodigo: "POWER-SET",
    fallbackCreate: {
      codigo: "POWER-SET",
      nome: "Power Rack Set",
      preco: 149.9,
      pesoBruto: 0.4,
    },
  },
  {
    fromId: 16593185009,
    fromCodigo: "0001",
    toCodigo: "MYPR-SET",
    fallbackCreate: {
      codigo: "MYPR-SET",
      nome: "My PR Set",
      preco: 134.9,
      pesoBruto: 0.3,
    },
  },

  // --- Camisetas Masculinas (variações site, R$80, código vazio) ---
  // Pai abstrato (não vende sozinho — só pra organizar variações no Bling).
  {
    fromId: 16595689393,
    toCodigo: "TEE-MASC",
    fallbackCreate: {
      codigo: "TEE-MASC",
      nome: "Camiseta de Treino PR Tracker - Masculina",
      preco: 80,
      pesoBruto: 0.2,
    },
  },
  {
    fromId: 16595689456,
    toCodigo: "TEE-MASC-P",
    fallbackCreate: {
      codigo: "TEE-MASC-P",
      nome: "Camiseta de Treino PR Tracker - Masculina P",
      preco: 80,
      pesoBruto: 0.18,
    },
  },
  {
    fromId: 16595689452,
    toCodigo: "TEE-MASC-M",
    fallbackCreate: {
      codigo: "TEE-MASC-M",
      nome: "Camiseta de Treino PR Tracker - Masculina M",
      preco: 80,
      pesoBruto: 0.2,
    },
  },
  {
    fromId: 16595689448,
    toCodigo: "TEE-MASC-G",
    fallbackCreate: {
      codigo: "TEE-MASC-G",
      nome: "Camiseta de Treino PR Tracker - Masculina G",
      preco: 80,
      pesoBruto: 0.22,
    },
  },
  {
    fromId: 16595689430,
    toCodigo: "TEE-MASC-GG",
    fallbackCreate: {
      codigo: "TEE-MASC-GG",
      nome: "Camiseta de Treino PR Tracker - Masculina GG",
      preco: 80,
      pesoBruto: 0.24,
    },
  },

  // --- Camisetas Baby Look (variações site, R$80, código vazio) ---
  {
    fromId: 16595689463,
    toCodigo: "TEE-BABY",
    fallbackCreate: {
      codigo: "TEE-BABY",
      nome: "Camiseta de Treino PR Tracker - Baby Look",
      preco: 80,
      pesoBruto: 0.18,
    },
  },
  {
    fromId: 16595689504,
    toCodigo: "TEE-BABY-P",
    fallbackCreate: {
      codigo: "TEE-BABY-P",
      nome: "Camiseta de Treino PR Tracker - Baby Look P",
      preco: 80,
      pesoBruto: 0.16,
    },
  },
  {
    fromId: 16595689499,
    toCodigo: "TEE-BABY-M",
    fallbackCreate: {
      codigo: "TEE-BABY-M",
      nome: "Camiseta de Treino PR Tracker - Baby Look M",
      preco: 80,
      pesoBruto: 0.18,
    },
  },
  {
    fromId: 16595689494,
    toCodigo: "TEE-BABY-G",
    fallbackCreate: {
      codigo: "TEE-BABY-G",
      nome: "Camiseta de Treino PR Tracker - Baby Look G",
      preco: 80,
      pesoBruto: 0.2,
    },
  },
];

// Bundles a criar (correspondem 1:1 com listagens TikTok que NÃO têm
// histórico de venda — então Bling ainda não auto-criou nada por elas).
// Preço bate com TikTok (sem promoção). Bling Simples Nacional → NCM
// 39264000 (default em createProduct).
const CREATES: CreateProductInput[] = [
  // --- Tier de kits Mini Anilhas (3 níveis, regra "pares × R$10 com leve desconto") ---
  // Felipe valida pricing como `pares × R$10 - R$1..5`. Ver memory project_pricing_kits_tiktok.md.
  {
    codigo: "TT-ANILHA-BASIC",
    nome: "Kit Mini Anilhas Essencial 157,5kg - Réplica Oficial (TikTok)",
    preco: 69.0, // 7 pares × R$10 - R$1
    pesoBruto: 0.19,
  },
  {
    codigo: "TT-ANILHA-SUPER",
    nome: "Super Kit Mini Anilhas 307,5kg - Réplica Oficial (TikTok)",
    preco: 119.0, // 12 pares × R$10 - R$1
    pesoBruto: 0.314,
  },
  {
    codigo: "TT-ANILHA-ULTRA",
    nome: "Ultra Kit Mini Anilhas 747,5kg - Réplica Oficial (TikTok)",
    preco: 265.0, // 27 pares × R$10 - R$5
    pesoBruto: 0.62,
  },
  // --- Bundles Bench/Deadlift/Power Rack/Mega Academia ---
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
    codigo: "TT-MYPR-120",
    nome: "Troféu de Crossfit Mini - 20 Exercícios LPO + 120kg Anilhas (TikTok)",
    preco: 184.0,
    pesoBruto: 0.3,
  },
  {
    codigo: "TT-MEGA-600",
    nome: "Mini Academia Realista +600kg Em Anilhas (TikTok)",
    preco: 597.0,
    pesoBruto: 1.0,
  },
  // Nota: TEE-MASC-* / TEE-BABY-* NÃO ficam em CREATES — vão ser renames
  // das variações site existentes (R$80, código vazio). Ver array RENAMES.
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
    const fromLabel = r.fromCodigo ?? (r.fromId != null ? `id ${r.fromId}` : "?");
    try {
      const existingTo = await findProductByCode(r.toCodigo);
      if (existingTo && existingTo.id !== r.fromId) {
        // Já existe um produto DIFERENTE com o código alvo. Skip pra não
        // colidir. (Se for o mesmo id, significa que rodamos antes — idempotent.)
        log.push({
          action: "skip",
          codigo: r.toCodigo,
          detail: `${r.toCodigo} já existe (id ${existingTo.id})`,
          blingId: existingTo.id,
        });
        continue;
      }

      // Resolve produto-origem. fromId tem precedência (necessário pra
      // produtos com código vazio).
      let existingFrom = null;
      if (r.fromId != null) {
        existingFrom = await getProduct(r.fromId);
      } else if (r.fromCodigo) {
        existingFrom = await findProductByCode(r.fromCodigo);
      }

      if (existingFrom) {
        if (existingFrom.codigo === r.toCodigo) {
          // Já tem o código alvo — provavelmente rodamos antes. Idempotent skip.
          log.push({
            action: "skip",
            codigo: r.toCodigo,
            detail: `id ${existingFrom.id} já tem código ${r.toCodigo}`,
            blingId: existingFrom.id,
          });
          continue;
        }
        if (dryRun) {
          log.push({
            action: "rename",
            codigo: `${fromLabel} → ${r.toCodigo}`,
            detail: `dryRun (id ${existingFrom.id}, "${existingFrom.nome}")`,
            blingId: existingFrom.id,
          });
        } else {
          const updated = await updateProduct(existingFrom.id, {
            codigo: r.toCodigo,
          });
          log.push({
            action: "rename",
            codigo: `${fromLabel} → ${r.toCodigo}`,
            blingId: updated.id,
          });
        }
      } else if (r.fallbackCreate) {
        if (dryRun) {
          log.push({
            action: "create",
            codigo: r.toCodigo,
            detail: "dryRun (fallback create — produto-origem não encontrado)",
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
          codigo: fromLabel,
          detail: "não encontrado e sem fallback",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.push({
        action: "error",
        codigo: `${fromLabel} → ${r.toCodigo}`,
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
    const renameSourceCodes = new Set(
      RENAMES.map((r) => r.fromCodigo).filter((c): c is string => Boolean(c)),
    );
    const renameSourceIds = new Set(
      RENAMES.map((r) => r.fromId).filter((i): i is number => i != null),
    );
    suspects = all
      .filter((p) => {
        if (renameSourceIds.has(p.id)) return false;
        const c = p.codigo;
        if (!c) return true;
        if (renameTargets.has(c) || renameSourceCodes.has(c)) return false;
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
