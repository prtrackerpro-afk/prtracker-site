/**
 * Bling v3 — Produtos.
 *
 * Endpoints used:
 *   GET  /produtos?codigo=<sku>     → search by exact código (SKU)
 *   POST /produtos                  → create
 *
 * For NF-e to emit cleanly, every line item on the sales order must
 * reference an existing produto.id in Bling. We map site slugs to Bling
 * codes 1:1 (slug==código) and create on first encounter.
 */

import { blingFetch, BlingApiError } from "./api";

export interface BlingProduct {
  id: number;
  nome: string;
  codigo?: string;
  preco?: number;
  tipo?: string;
  situacao?: string;
  unidade?: string;
}

export interface CreateProductInput {
  nome: string;
  codigo: string;
  preco: number; // BRL
  /** Default "P" = Produto. "S" = Serviço. */
  tipo?: "P" | "S";
  /** "A" = Ativo (default). "I" = Inativo. */
  situacao?: "A" | "I";
  /** "S" = Simples (default). "V" = com Variações. */
  formato?: "S" | "V" | "E";
  unidade?: string; // default "UN"
  /** NCM. Default to 39264000 (estatuetas plástico) — empresa Simples Nacional. */
  ncm?: string;
  /** Origem da mercadoria. 0 = Nacional. */
  origem?: number;
  /** Peso bruto em kg (opcional, ajuda no frete automático). */
  pesoBruto?: number;
}

const DEFAULT_NCM = "39264000";

export async function findProductByCode(
  codigo: string,
  accessToken?: string,
): Promise<BlingProduct | null> {
  const list = await blingFetch<BlingProduct[] | undefined>("/produtos", {
    method: "GET",
    query: { codigo, criterio: "1" }, // criterio=1 = "Apenas ativos"
    accessToken,
  });
  if (!Array.isArray(list) || list.length === 0) return null;
  // /produtos may return multiple matches if the código pattern is loose;
  // take the first exact match (case-sensitive).
  const exact = list.find((p) => p.codigo === codigo);
  return exact ?? list[0] ?? null;
}

export async function createProduct(
  input: CreateProductInput,
  accessToken?: string,
): Promise<BlingProduct> {
  const body: Record<string, unknown> = {
    nome: input.nome,
    codigo: input.codigo,
    preco: input.preco,
    tipo: input.tipo ?? "P",
    situacao: input.situacao ?? "A",
    formato: input.formato ?? "S",
    unidade: input.unidade ?? "UN",
    tributacao: {
      ncm: input.ncm ?? DEFAULT_NCM,
      origem: input.origem ?? 0,
    },
  };
  if (input.pesoBruto != null) body.pesoBruto = input.pesoBruto;

  const created = await blingFetch<BlingProduct>("/produtos", {
    method: "POST",
    body,
    accessToken,
  });
  return created;
}

/**
 * Idempotent: returns existing produto by código, or creates one on first call.
 * Race note: if two webhooks try to create the same product simultaneously,
 * one will get a 422 from Bling (duplicate código). Caller catches that and
 * retries the find.
 */
export async function getOrCreateProduct(
  input: CreateProductInput,
  accessToken?: string,
): Promise<BlingProduct> {
  const existing = await findProductByCode(input.codigo, accessToken);
  if (existing) return existing;
  try {
    return await createProduct(input, accessToken);
  } catch (err) {
    // Bling returns 422 when código already exists (rare race condition
    // between concurrent webhooks). Re-fetch to get the just-created one.
    if (err instanceof BlingApiError && err.status === 422) {
      const retried = await findProductByCode(input.codigo, accessToken);
      if (retried) return retried;
    }
    throw err;
  }
}
