/**
 * Bling v3 — Produtos.
 *
 * Endpoints used:
 *   GET  /produtos                  → list (paginated)
 *   GET  /produtos?codigo=<sku>     → search by exact código (SKU)
 *   GET  /produtos/{id}             → fetch full product (inclui imagens)
 *   POST /produtos                  → create
 *   PUT  /produtos/{id}             → update (preço, situação, mídia)
 *
 * For NF-e to emit cleanly, every line item on the sales order must
 * reference an existing produto.id in Bling. We map site slugs to Bling
 * codes 1:1 (slug==código) and create on first encounter.
 */

import { blingFetch, BlingApiError } from "./api";

export interface BlingProductImageExternal {
  link: string;
}

export interface BlingProductMidia {
  imagens?: {
    externas?: BlingProductImageExternal[];
    internas?: Array<{ link?: string }>;
  };
}

export interface BlingProduct {
  id: number;
  nome: string;
  codigo?: string;
  preco?: number;
  tipo?: string;
  situacao?: string;
  unidade?: string;
  midia?: BlingProductMidia;
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
 * Lista paginada de produtos. Bling devolve 100 por página por padrão.
 * Use limite=100 explicitamente; pagina = 1-based.
 */
export async function listProducts(
  options: { pagina?: number; limite?: number; situacao?: "A" | "I" | "T" } = {},
  accessToken?: string,
): Promise<BlingProduct[]> {
  const list = await blingFetch<BlingProduct[] | undefined>("/produtos", {
    method: "GET",
    query: {
      pagina: options.pagina ?? 1,
      limite: options.limite ?? 100,
      // Bling: criterio=2 = "Apenas inativos", criterio=1 = "Apenas ativos",
      // criterio=5 = "Todos". Default a "todos" pra audit ver o estado real.
      criterio: options.situacao === "A" ? 1 : options.situacao === "I" ? 2 : 5,
    },
    accessToken,
  });
  return Array.isArray(list) ? list : [];
}

/**
 * Lista todas as páginas concatenadas. Pra catálogos grandes (≥500 produtos)
 * isso pode ser lento — use com moderação. Pra catálogo PR Tracker (~14)
 * cabe tranquilamente em 1 página.
 */
export async function listAllProducts(
  accessToken?: string,
): Promise<BlingProduct[]> {
  const out: BlingProduct[] = [];
  let pagina = 1;
  while (true) {
    const page = await listProducts({ pagina, limite: 100 }, accessToken);
    out.push(...page);
    if (page.length < 100) break;
    pagina++;
    if (pagina > 50) break; // safety cap (5000 produtos)
  }
  return out;
}

/**
 * Busca produto por ID — retorna o objeto completo incluindo `midia`.
 * `findProductByCode` chama /produtos?codigo=, que NÃO devolve mídia.
 */
export async function getProduct(
  id: number,
  accessToken?: string,
): Promise<BlingProduct | null> {
  try {
    return await blingFetch<BlingProduct>(`/produtos/${id}`, {
      method: "GET",
      accessToken,
    });
  } catch (err) {
    if (err instanceof BlingApiError && err.status === 404) return null;
    throw err;
  }
}

/**
 * PUT /produtos/{id} — atualiza campos parciais. Bling exige enviar o
 * payload "completo" no PUT, então buscamos o produto antes e mesclamos
 * apenas os campos a alterar (Bling mantém os outros, mas mesclar local
 * preserva qualquer cadastro fiscal que poderia ser sobrescrito por
 * defaults).
 */
export async function updateProduct(
  id: number,
  patch: Partial<{
    codigo: string;
    nome: string;
    preco: number;
    situacao: "A" | "I";
    imagensExternas: string[]; // URLs públicas que o Bling busca e armazena
  }>,
  accessToken?: string,
): Promise<BlingProduct> {
  const current = await getProduct(id, accessToken);
  if (!current) throw new BlingApiError(`produto ${id} não encontrado`, 404);

  const body: Record<string, unknown> = {
    // Campos obrigatórios (mantém o atual se não vier no patch).
    nome: patch.nome ?? current.nome,
    codigo: patch.codigo ?? current.codigo,
    preco: patch.preco ?? current.preco,
    tipo: current.tipo ?? "P",
    situacao: patch.situacao ?? (current.situacao === "I" ? "I" : "A"),
    unidade: current.unidade ?? "UN",
  };

  if (patch.imagensExternas) {
    body.midia = {
      imagens: {
        externas: patch.imagensExternas.map((link) => ({ link })),
      },
    };
  }

  return await blingFetch<BlingProduct>(`/produtos/${id}`, {
    method: "PUT",
    body,
    accessToken,
  });
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
