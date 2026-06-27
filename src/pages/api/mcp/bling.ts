/**
 * POST /api/mcp/bling — Servidor MCP (Model Context Protocol) over HTTP para o Bling.
 *
 * Expõe a conta Bling (a MESMA conexão de produção — tokens no Supabase
 * `bling_oauth_tokens`, auto-refresh via getValidAccessToken) como ferramentas
 * MCP que o Claude pode chamar de qualquer lugar (Claude Code, claude.ai web,
 * celular, agentes agendados).
 *
 * Reusa o stack que já existe: blingFetch() (api.ts), createSalesOrder (orders.ts),
 * syncInfiniteStock / postStockMovement (estoque.ts). NÃO cria OAuth novo.
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 * Header obrigatório:  Authorization: Bearer <MCP_BLING_TOKEN>
 * MCP_BLING_TOKEN é uma env secreta (Vercel). Sem ela setada → 503.
 * Fica FORA de /api/admin/ de propósito: o middleware admin usa cookie de
 * sessão (Supabase) que um connector não tem; aqui a auth é o bearer token.
 *
 * ── Protocolo ─────────────────────────────────────────────────────────────
 * MCP stateless sobre JSON-RPC 2.0. Métodos: initialize, ping, tools/list,
 * tools/call, e notifications/* (sem resposta → 202). Sem SSE (GET → 405).
 *
 * ── Registrar no Claude ───────────────────────────────────────────────────
 *   claude mcp add --transport http bling \
 *     https://prtracker.com.br/api/mcp/bling \
 *     --header "Authorization: Bearer <MCP_BLING_TOKEN>"
 * ou como connector custom no claude.ai (mesma URL + header).
 */
import type { APIRoute } from "astro";
import { timingSafeEqual } from "node:crypto";
import { getConnectionStatus } from "~/lib/bling/oauth";
import { blingFetch } from "~/lib/bling/api";
import { createSalesOrder, type CreateSalesOrderInput } from "~/lib/bling/orders";
import {
  resolveDepositoId,
  postStockMovement,
  syncInfiniteStock,
  type EstoqueOperacao,
} from "~/lib/bling/estoque";

export const prerender = false;

const SERVER_INFO = { name: "bling-prtracker", version: "1.0.0" };
const DEFAULT_PROTOCOL = "2025-06-18";

// ── helpers ─────────────────────────────────────────────────────────────────

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Monta a query string de um GET do Bling, suportando arrays (`idsProdutos[]`). */
function qs(query?: Record<string, unknown>): string {
  if (!query) return "";
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) {
        if (item === undefined || item === null || item === "") continue;
        sp.append(`${k}[]`, String(item));
      }
    } else {
      sp.append(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

function num(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`valor numérico inválido: ${String(v)}`);
  return n;
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Valida o bearer token. Retorna uma Response de erro, ou null se OK. */
function checkAuth(request: Request): Response | null {
  const expected =
    import.meta.env.MCP_BLING_TOKEN || process.env.MCP_BLING_TOKEN;
  if (!expected) return json({ error: "MCP_BLING_TOKEN não configurado" }, 503);
  const header = request.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  const provided = m?.[1]?.trim() ?? "";
  if (!provided || !timingSafeEqualStr(provided, expected)) {
    return json({ error: "unauthorized" }, 401);
  }
  return null;
}

// ── tools ───────────────────────────────────────────────────────────────────

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: any) => Promise<unknown>;
}

const obj = (
  properties: Record<string, unknown>,
  required?: string[],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required ? { required } : {}),
});
const sInt = (description: string) => ({ type: "integer", description });
const sNum = (description: string) => ({ type: "number", description });
const sStr = (description: string) => ({ type: "string", description });
const sIntArr = (description: string) => ({
  type: "array",
  items: { type: "integer" },
  description,
});
const sStrArr = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});
const PAG = {
  pagina: sInt("Página (começa em 1)."),
  limite: sInt("Itens por página (padrão 100)."),
};

const TOOLS: McpTool[] = [
  {
    name: "bling_connection_status",
    description:
      "Status da conexão Bling (conectado?, expiração do token, escopos). Use se outras chamadas derem erro de conexão.",
    inputSchema: obj({}),
    handler: async () => getConnectionStatus(),
  },

  // ── Pedidos de venda ──
  {
    name: "bling_list_orders",
    description: "Lista pedidos de venda. Filtros por período, contato, situação e número.",
    inputSchema: obj({
      ...PAG,
      dataInicial: sStr("Data inicial de emissão (YYYY-MM-DD)."),
      dataFinal: sStr("Data final de emissão (YYYY-MM-DD)."),
      idContato: sInt("ID do contato (cliente)."),
      idsSituacoes: sIntArr("IDs das situações a filtrar."),
      numero: sStr("Número do pedido."),
      numeroLoja: sStr("Número externo do pedido (numeroLoja)."),
      idLoja: sInt("ID da loja/canal."),
    }),
    handler: async (a) => blingFetch(`/pedidos/vendas${qs(a)}`),
  },
  {
    name: "bling_get_order",
    description: "Detalha um pedido de venda pelo ID.",
    inputSchema: obj({ id: sInt("ID do pedido de venda.") }, ["id"]),
    handler: async (a) => blingFetch(`/pedidos/vendas/${num(a.id)}`),
  },

  // ── Produtos ──
  {
    name: "bling_list_products",
    description: "Lista produtos. Filtros por código (SKU), nome, tipo e categoria.",
    inputSchema: obj({
      ...PAG,
      codigo: sStr("Código/SKU do produto."),
      nome: sStr("Nome (ou parte) do produto."),
      tipo: sStr("Tipo do produto."),
      idCategoria: sInt("ID da categoria."),
      criterio: sInt("Critério (ex.: 2 = somente ativos)."),
    }),
    handler: async (a) => blingFetch(`/produtos${qs(a)}`),
  },
  {
    name: "bling_get_product",
    description: "Detalha um produto pelo ID.",
    inputSchema: obj({ id: sInt("ID do produto.") }, ["id"]),
    handler: async (a) => blingFetch(`/produtos/${num(a.id)}`),
  },

  // ── Estoque ──
  {
    name: "bling_stock_balance",
    description:
      "Saldo de estoque de produtos. Filtre por idsProdutos e/ou codigos (SKU). idDeposito opcional para um depósito específico.",
    inputSchema: obj({
      idsProdutos: sIntArr("IDs dos produtos."),
      codigos: sStrArr("Códigos/SKUs dos produtos."),
      idDeposito: sInt("ID do depósito (opcional)."),
    }),
    handler: async (a) => {
      const base = a.idDeposito
        ? `/estoques/saldos/${num(a.idDeposito)}`
        : "/estoques/saldos";
      return blingFetch(
        `${base}${qs({ idsProdutos: a.idsProdutos, codigos: a.codigos })}`,
      );
    },
  },

  // ── Contatos ──
  {
    name: "bling_list_contacts",
    description: "Lista contatos (clientes/fornecedores). Busca livre ou por CPF/CNPJ.",
    inputSchema: obj({
      ...PAG,
      pesquisa: sStr("Texto livre (nome, etc.)."),
      numeroDocumento: sStr("CPF ou CNPJ."),
      idTipoContato: sInt("ID do tipo de contato."),
    }),
    handler: async (a) => blingFetch(`/contatos${qs(a)}`),
  },
  {
    name: "bling_get_contact",
    description: "Detalha um contato pelo ID.",
    inputSchema: obj({ id: sInt("ID do contato.") }, ["id"]),
    handler: async (a) => blingFetch(`/contatos/${num(a.id)}`),
  },

  // ── NFe ──
  {
    name: "bling_list_invoices",
    description: "Lista NFe. Filtros por período de emissão, situação e tipo.",
    inputSchema: obj({
      ...PAG,
      situacao: sInt("Situação da nota."),
      tipo: sInt("Tipo (0 = entrada, 1 = saída)."),
      dataEmissaoInicial: sStr("Emissão inicial (YYYY-MM-DD)."),
      dataEmissaoFinal: sStr("Emissão final (YYYY-MM-DD)."),
      numeroLoja: sStr("Número da loja."),
    }),
    handler: async (a) => blingFetch(`/nfe${qs(a)}`),
  },
  {
    name: "bling_get_invoice",
    description: "Detalha uma NFe pelo ID.",
    inputSchema: obj({ id: sInt("ID da nota fiscal.") }, ["id"]),
    handler: async (a) => blingFetch(`/nfe/${num(a.id)}`),
  },

  // ── Financeiro ──
  {
    name: "bling_list_receivables",
    description: "Lista contas a receber. Filtros por situação e período.",
    inputSchema: obj({
      ...PAG,
      situacoes: sIntArr("IDs das situações."),
      tipoFiltroData: sInt("Qual data filtrar (ver doc Bling)."),
      dataInicial: sStr("Data inicial (YYYY-MM-DD)."),
      dataFinal: sStr("Data final (YYYY-MM-DD)."),
      idContato: sInt("ID do contato."),
    }),
    handler: async (a) => blingFetch(`/contas/receber${qs(a)}`),
  },
  {
    name: "bling_list_payables",
    description: "Lista contas a pagar. Filtros por situação e períodos.",
    inputSchema: obj({
      ...PAG,
      situacao: sInt("Situação da conta."),
      idContato: sInt("ID do contato (fornecedor)."),
      dataEmissaoInicial: sStr("Emissão inicial (YYYY-MM-DD)."),
      dataEmissaoFinal: sStr("Emissão final (YYYY-MM-DD)."),
      dataVencimentoInicial: sStr("Vencimento inicial (YYYY-MM-DD)."),
      dataVencimentoFinal: sStr("Vencimento final (YYYY-MM-DD)."),
    }),
    handler: async (a) => blingFetch(`/contas/pagar${qs(a)}`),
  },

  // ── Escrita ──
  {
    name: "bling_create_order",
    description:
      "Cria um pedido de venda (reusa createSalesOrder — pode disparar NF-e automática conforme config). Mínimo: contatoId + itens (cada item com produtoId, quantidade, valor).",
    inputSchema: obj(
      {
        contatoId: sInt("ID do contato (cliente) no Bling."),
        data: sStr("Data do pedido (YYYY-MM-DD). Default: hoje."),
        itens: {
          type: "array",
          description: "Itens do pedido.",
          items: obj(
            {
              produtoId: sInt("ID do produto no Bling."),
              quantidade: sNum("Quantidade."),
              valor: sNum("Valor unitário (BRL)."),
              descricao: sStr("Descrição opcional (sobrescreve o nome na NF-e)."),
            },
            ["produtoId", "quantidade", "valor"],
          ),
        },
        frete: sNum("Frete em BRL (separado, não como item)."),
        descontoValor: sNum("Desconto em BRL."),
        numeroLoja: sStr("ID externo do pedido (idempotência/relatório)."),
        lojaId: sInt("ID da loja/canal."),
        depositoId: sInt("ID do depósito."),
        naturezaOperacaoId: sInt("ID da natureza de operação."),
        observacoes: sStr("Observação pública (sai no PDF)."),
        observacoesInternas: sStr("Observação interna (auditoria)."),
      },
      ["contatoId", "itens"],
    ),
    handler: async (a) => createSalesOrder(a as CreateSalesOrderInput),
  },
  {
    name: "bling_stock_movement",
    description:
      'Lança movimento de estoque. operacao: "E" soma, "S" subtrai, "B" balanço (define saldo absoluto). Resolve o depósito automaticamente se não informado.',
    inputSchema: obj(
      {
        produtoId: sInt("ID do produto."),
        operacao: {
          type: "string",
          enum: ["E", "S", "B"],
          description: 'E = entrada, S = saída, B = balanço (saldo absoluto).',
        },
        quantidade: sNum("Quantidade."),
        depositoId: sInt("ID do depósito (opcional — auto-resolve)."),
        observacoes: sStr("Observação opcional."),
      },
      ["produtoId", "operacao", "quantidade"],
    ),
    handler: async (a) => {
      const depositoId = await resolveDepositoId(
        a.depositoId ? num(a.depositoId) : undefined,
      );
      return postStockMovement({
        produtoId: num(a.produtoId),
        depositoId,
        operacao: a.operacao as EstoqueOperacao,
        quantidade: num(a.quantidade),
        observacoes: a.observacoes,
      });
    },
  },
  {
    name: "bling_sync_infinite_stock",
    description:
      'Fixa "estoque infinito" (teto alto via balanço) nos produtos físicos. Idempotente. Use dryRun=true para preview.',
    inputSchema: obj({
      dryRun: { type: "boolean", description: "true → só monta o plano, não chama o Bling." },
      target: sInt("Saldo alvo (default 9999)."),
      only: sStrArr("Restringe aos SKUs informados; omitido = todos os físicos."),
    }),
    handler: async (a) =>
      syncInfiniteStock({
        dryRun: a.dryRun === true,
        target: a.target,
        only: Array.isArray(a.only) ? a.only : null,
      }),
  },

  // ── Escape hatches ──
  {
    name: "bling_get_raw",
    description:
      "GET cru em qualquer endpoint da API v3 do Bling (relativo a /Api/v3). Para endpoints não cobertos pelas ferramentas acima.",
    inputSchema: obj(
      {
        path: sStr("Caminho relativo, ex.: /categorias/produtos."),
        query: { type: "object", description: "Parâmetros de query (arrays viram key[]=...)." },
      },
      ["path"],
    ),
    handler: async (a) => blingFetch(`${a.path}${qs(a.query)}`),
  },
  {
    name: "bling_post_raw",
    description:
      "POST cru em qualquer endpoint da API v3 do Bling. Use com cuidado (cria/altera dados).",
    inputSchema: obj(
      {
        path: sStr("Caminho relativo, ex.: /contatos."),
        body: { type: "object", description: "Corpo JSON da requisição." },
      },
      ["path", "body"],
    ),
    handler: async (a) => blingFetch(a.path, { method: "POST", body: a.body }),
  },
];

// ── JSON-RPC ──────────────────────────────────────────────────────────────

function rpcOk(id: unknown, result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}
function rpcErr(id: unknown, code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

async function handleMessage(msg: any): Promise<object | null> {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") {
    return rpcErr(msg?.id, -32600, "Invalid Request");
  }
  const { method, id, params } = msg;
  const isNotification = id === undefined || id === null;

  switch (method) {
    case "initialize":
      return rpcOk(id, {
        protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
        capabilities: { tools: {} },
        serverInfo: SERVER_INFO,
      });
    case "ping":
      return rpcOk(id, {});
    case "tools/list":
      return rpcOk(id, {
        tools: TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      });
    case "tools/call": {
      const tool = TOOLS.find((t) => t.name === params?.name);
      if (!tool) {
        return rpcOk(id, {
          content: [{ type: "text", text: `Ferramenta desconhecida: ${params?.name}` }],
          isError: true,
        });
      }
      try {
        const result = await tool.handler(params?.arguments ?? {});
        const text =
          typeof result === "string" ? result : JSON.stringify(result, null, 2);
        return rpcOk(id, { content: [{ type: "text", text }] });
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        return rpcOk(id, {
          content: [{ type: "text", text: `Erro: ${m}` }],
          isError: true,
        });
      }
    }
    default:
      if (isNotification || method.startsWith("notifications/")) return null;
      return rpcErr(id, -32601, `Method not found: ${method}`);
  }
}

// ── HTTP ──────────────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  const authErr = checkAuth(request);
  if (authErr) return authErr;

  let payload: unknown;
  try {
    const text = await request.text();
    payload = text ? JSON.parse(text) : null;
  } catch {
    return json(rpcErr(null, -32700, "Parse error"), 200);
  }

  if (Array.isArray(payload)) {
    const out: object[] = [];
    for (const msg of payload) {
      const r = await handleMessage(msg);
      if (r) out.push(r);
    }
    if (out.length === 0) return new Response(null, { status: 202 });
    return json(out, 200);
  }

  const res = await handleMessage(payload);
  if (!res) return new Response(null, { status: 202 });
  return json(res, 200);
};

export const GET: APIRoute = () =>
  json({ error: "method not allowed — use POST (MCP over HTTP)" }, 405);

export const OPTIONS: APIRoute = () =>
  new Response(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS", "Content-Type": "application/json" },
  });
