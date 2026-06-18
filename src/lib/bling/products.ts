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
  /** Marca (string de topo no produto Bling v3). */
  marca?: string;
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
  /** Marca. Default PR_TRACKER_BRAND — todo produto nosso é PR Tracker. */
  marca?: string;
}

const DEFAULT_NCM = "39264000";

/** Marca canônica — todo produto do catálogo é da marca PR Tracker. */
export const PR_TRACKER_BRAND = "PR Tracker";

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
    marca: input.marca ?? PR_TRACKER_BRAND,
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
 * PUT /produtos/{id} — atualiza campos parciais. Bling rejeita PUTs com
 * payload incompleto (a doc fala em validar o produto inteiro), então
 * fazemos spread do produto atual e só sobrescrevemos o que veio no
 * patch. Garante que tributação/dimensões/formato cadastrados manualmente
 * pelo Felipe não sejam zerados.
 *
 * Caveat: alguns campos vêm com `null` no GET (ex: dataValidade) e Bling
 * pode rejeitar `null` em alguns deles no PUT. Removemos chaves null/undefined
 * defensivamente.
 */
export interface ProductPatch {
  codigo?: string;
  nome?: string;
  preco?: number;
  situacao?: "A" | "I";
  marca?: string;
  imagensExternas?: string[]; // URLs públicas que o Bling busca e armazena
}

/**
 * Monta o body de um PUT /produtos/{id} a partir do produto ATUAL + um patch
 * parcial. Faz spread do produto atual (Bling rejeita PUT incompleto) e só
 * sobrescreve o que veio no patch, preservando tributação/dimensões/formato
 * cadastrados manualmente. Remove chaves null/undefined defensivamente.
 *
 * Separado de `updateProduct` pra poder reusar quando o produto atual já foi
 * buscado (ex: `syncMarca`, que lê `current` pra detectar drift) — evita um
 * GET redundante.
 */
function buildProductPutBody(
  current: BlingProduct,
  patch: ProductPatch,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ...(current as unknown as Record<string, unknown>),
  };
  // O id não vai no body do PUT, ele já está na URL.
  delete body.id;

  if (patch.codigo != null) body.codigo = patch.codigo;
  if (patch.nome != null) body.nome = patch.nome;
  if (patch.preco != null) body.preco = patch.preco;
  if (patch.situacao != null) body.situacao = patch.situacao;
  if (patch.marca != null) body.marca = patch.marca;

  if (patch.imagensExternas) {
    const existingMidia = (body.midia ?? {}) as Record<string, unknown>;
    const existingImagens = (existingMidia.imagens ?? {}) as Record<string, unknown>;
    body.midia = {
      ...existingMidia,
      imagens: {
        ...existingImagens,
        externas: patch.imagensExternas.map((link) => ({ link })),
      },
    };
  }

  // Remove chaves com null no top-level — Bling tende a rejeitar `null`
  // em campos opcionais tipo dataValidade quando vêm explicitamente nulos.
  for (const k of Object.keys(body)) {
    if (body[k] === null) delete body[k];
  }

  return body;
}

export async function updateProduct(
  id: number,
  patch: ProductPatch,
  accessToken?: string,
): Promise<BlingProduct> {
  const current = await getProduct(id, accessToken);
  if (!current) throw new BlingApiError(`produto ${id} não encontrado`, 404);

  const body = buildProductPutBody(current, patch);

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

export interface SyncMarcaOptions {
  /** true → monta o plano mas NÃO chama o Bling (preview). */
  dryRun?: boolean;
  /** Marca alvo. Default PR_TRACKER_BRAND ("PR Tracker"). */
  marca?: string;
  /** Restringe aos códigos (SKU) informados. Omitido = todos os produtos. */
  only?: string[] | null;
}

export interface SyncMarcaItemResult {
  blingId: number;
  codigo: string | null;
  nome: string;
  oldMarca: string | null;
  newMarca: string;
  status: "ok" | "no-op" | "error" | "planned";
  error?: string;
}

export interface SyncMarcaReport {
  dryRun: boolean;
  marca: string;
  total: number;
  applied: SyncMarcaItemResult[];
  noOp: SyncMarcaItemResult[];
  planned: SyncMarcaItemResult[];
  errors: SyncMarcaItemResult[];
}

/**
 * Carimba a marca (default "PR Tracker") em todos os produtos do Bling.
 *
 * Lê cada produto pra detectar quem já está com a marca certa (no-op) e só
 * faz PUT em quem está divergente — idempotente. Coleta erros por-produto
 * sem abortar o lote.
 *
 * Produtos novos criados pelo webhook já nascem com a marca via
 * `createProduct` (default PR_TRACKER_BRAND); esta função é o backfill dos
 * que já existiam (ou foram criados/editados fora do nosso fluxo).
 */
export async function syncMarca(
  opts: SyncMarcaOptions = {},
): Promise<SyncMarcaReport> {
  const dryRun = opts.dryRun === true;
  const marca = (opts.marca && opts.marca.trim()) || PR_TRACKER_BRAND;
  const onlyFilter =
    opts.only && opts.only.length > 0 ? new Set(opts.only) : null;

  const all = await listAllProducts();
  const results: SyncMarcaItemResult[] = [];

  for (const p of all) {
    if (onlyFilter && !(p.codigo && onlyFilter.has(p.codigo))) continue;

    // Precisa do produto completo: a listagem não traz `marca` de forma
    // garantida, e o PUT exige o body inteiro (spread em buildProductPutBody).
    const full = await getProduct(p.id);
    if (!full) continue;

    const oldMarca = (full.marca ?? "").trim() || null;
    const base = {
      blingId: p.id,
      codigo: p.codigo ?? null,
      nome: p.nome,
      oldMarca,
      newMarca: marca,
    };

    if (oldMarca === marca) {
      results.push({ ...base, status: "no-op" });
      continue;
    }
    if (dryRun) {
      results.push({ ...base, status: "planned" });
      continue;
    }

    try {
      const body = buildProductPutBody(full, { marca });
      await blingFetch<BlingProduct>(`/produtos/${p.id}`, {
        method: "PUT",
        body,
      });
      results.push({ ...base, status: "ok" });
    } catch (err) {
      results.push({
        ...base,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    dryRun,
    marca,
    total: results.length,
    applied: results.filter((r) => r.status === "ok"),
    noOp: results.filter((r) => r.status === "no-op"),
    planned: results.filter((r) => r.status === "planned"),
    errors: results.filter((r) => r.status === "error"),
  };
}
