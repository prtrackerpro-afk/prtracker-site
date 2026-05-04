/**
 * Bling v3 — NF-e creation + SEFAZ emission.
 *
 * Two-step flow per Bling docs:
 *   1. POST /nfe        → creates NF-e in "EM_DIGITACAO"
 *   2. POST /nfe/{id}/enviar → submits to SEFAZ → "AUTORIZADO" or "REJEITADO"
 *
 * Wired into syncOrderToBling AFTER createSalesOrder so that pedido + NF-e
 * are tracked separately in bling_orders.bling_pedido_id and bling_nfe_id.
 *
 * Skips gracefully (returns ok:true, status:"skipped") if naturezaOperacaoId
 * is not configured — avoids blocking the sync when fiscal data isn't ready.
 *
 * Bling NF-e statuses (raw): EM_DIGITACAO, EM_PROCESSAMENTO, AUTORIZADO,
 * CANCELADO, INUTILIZADO, REJEITADO, etc. We collapse to:
 *   emitted  — AUTORIZADO
 *   failed   — REJEITADO or other terminal error
 *   pending  — EM_PROCESSAMENTO (still in flight at SEFAZ)
 */

import { blingFetch, BlingApiError } from "./api";

export interface NfeItemInput {
  codigo: string;
  descricao: string;
  /** UN, PC, KG, etc — required by SEFAZ. Defaults to "UN". */
  unidade?: string;
  quantidade: number;
  /** Unit price BRL (e.g., 119.90). */
  valor: number;
  /** NCM 8 digits — required, no formatting. */
  ncm: string;
  /** CFOP — defaults to whatever Bling resolves from naturezaOperacao. */
  cfop?: string;
  /** ICMS origem — 0 = nacional. */
  origem?: number;
}

export interface NfeContatoSnapshot {
  /** Razão / nome — populates the destinatário on the NF. */
  nome?: string;
  /** Tipo de pessoa: F = física, J = jurídica. */
  tipoPessoa?: "F" | "J";
  /** CPF/CNPJ — only digits, no formatting. */
  numeroDocumento?: string;
  email?: string;
  telefone?: string;
  /** SEFAZ indIEDest: 1 = contribuinte ICMS, 2 = isento, 9 = não contribuinte.
   *  PF defaults to 9. Without this Bling may serialize the destinatário as
   *  contribuinte and SEFAZ rejects when IE is absent. */
  contribuinte?: 1 | 2 | 9;
  /** Endereço fiscal — REQUIRED by SEFAZ. Bling does not auto-pull
   *  from the contato cadastro for NF-e even when given the contato.id. */
  endereco?: {
    endereco: string;
    numero: string;
    complemento?: string;
    bairro: string;
    cep: string;
    municipio: string;
    uf: string;
    pais?: string;
  };
}

export interface CreateAndEmitNfeInput {
  /** Existing Bling contato (cliente). */
  contatoId: number;
  /** Snapshot of contato data — passed inline so SEFAZ has all required fields
   *  even if the cadastro in Bling is incomplete. */
  contato?: NfeContatoSnapshot;
  /** Required fiscal classification — comes from BLING_NATUREZA_OPERACAO_ID. */
  naturezaOperacaoId: number;
  /** Optional loja (canal de venda) id — same as pedido's loja. */
  lojaId?: number;
  /** Defaults to today. */
  data?: string;
  itens: NfeItemInput[];
  /** Total invoice value (sum after discount + freight). Used for the
   *  default single-installment "à vista" parcel. */
  totalValor: number;
  /** Discount in BRL (Pix 5% + coupon, etc). When > 0, sent as desconto
   *  field so SEFAZ totals match what the customer actually paid. */
  descontoValor?: number;
  /** Forma de pagamento id — Bling-specific (Pix, cartão, etc). Optional;
   *  if absent we omit parcelas and let Bling default to "à vista, sem nf". */
  formaPagamentoId?: number;
  /** Frete BRL (optional, informativo). */
  frete?: number;
  observacoes?: string;
  observacoesInternas?: string;
  /** External order id — populates "número no pedido" field on NF-e. */
  numeroPedido?: string;
}

export type NfeOutcomeStatus = "emitted" | "failed" | "pending" | "skipped";

export interface CreateAndEmitNfeResult {
  ok: boolean;
  status: NfeOutcomeStatus;
  nfeId?: number;
  numero?: string;
  serie?: string;
  chaveAcesso?: string;
  rawBlingStatus?: string;
  error?: string;
  /** When status='failed', surface Bling's structured field errors. */
  fieldErrors?: Array<{ msg: string; element?: string }>;
}

interface NfeCreateResponse {
  id: number;
  numero?: string;
  serie?: string;
  chaveAcesso?: string;
  situacao?: { id: number; valor?: string };
}

interface NfeGetResponse {
  id: number;
  numero?: string;
  serie?: string;
  chaveAcesso?: string;
  situacao?: { id: number; valor?: string };
}

// Bling situacao codes for NF-e (from the v3 docs)
const NFE_SITUACAO = {
  EM_DIGITACAO: 1,
  EM_PROCESSAMENTO: 2,
  AUTORIZADA: 5,
  CANCELADA: 6,
  REJEITADA: 7,
  INUTILIZADA: 9,
} as const;

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function createAndEmitNfe(
  input: CreateAndEmitNfeInput,
  accessToken?: string,
): Promise<CreateAndEmitNfeResult> {
  const data = input.data ?? todayISO();

  // Build contato block: include id reference + snapshot fields so SEFAZ
  // gets a complete destinatário regardless of whether Bling's contato
  // cadastro has all fiscal fields filled in.
  const contatoBody: Record<string, unknown> = { id: input.contatoId };
  if (input.contato?.nome) contatoBody.nome = input.contato.nome;
  if (input.contato?.tipoPessoa) contatoBody.tipoPessoa = input.contato.tipoPessoa;
  if (input.contato?.numeroDocumento) contatoBody.numeroDocumento = input.contato.numeroDocumento;
  if (input.contato?.email) contatoBody.email = input.contato.email;
  if (input.contato?.telefone) contatoBody.fone = input.contato.telefone;
  // contribuinte (indIEDest): default 9 (não contribuinte) for PF when caller
  // didn't specify. Without this Bling may emit indIEDest=1 and SEFAZ rejects
  // because a PF doesn't have IE.
  const contribuinte =
    input.contato?.contribuinte ?? (input.contato?.tipoPessoa === "F" ? 9 : undefined);
  if (contribuinte != null) contatoBody.contribuinte = contribuinte;
  if (input.contato?.endereco) {
    contatoBody.endereco = {
      ...input.contato.endereco,
      pais: input.contato.endereco.pais ?? "Brasil",
    };
  }

  const body: Record<string, unknown> = {
    tipo: 1, // 1 = saída
    finalidade: 1, // 1 = NFe normal
    data,
    dataOperacao: data,
    contato: contatoBody,
    naturezaOperacao: { id: input.naturezaOperacaoId },
    itens: input.itens.map((it) => {
      const item: Record<string, unknown> = {
        codigo: it.codigo,
        descricao: it.descricao,
        unidade: it.unidade ?? "UN",
        quantidade: it.quantidade,
        valor: it.valor,
        tipo: "P", // P = produto
        ncm: it.ncm,
        origem: it.origem ?? 0,
      };
      if (it.cfop) item.cfop = it.cfop;
      return item;
    }),
  };

  if (input.lojaId) body.loja = { id: input.lojaId };
  if (input.numeroPedido) body.numeroPedido = input.numeroPedido;

  // Discount must be sent so SEFAZ totals match what the customer paid.
  // Bling expects { valor, unidade: "REAL" } (REAL = absolute BRL value).
  if (input.descontoValor != null && input.descontoValor > 0) {
    body.desconto = { valor: input.descontoValor, unidade: "REAL" };
  }

  // parcelas is REQUIRED by Bling for NF-e creation (per the v3 schema). The
  // field name is `data`, NOT `dataVencimento` — sending the wrong key is
  // silently accepted by /nfe (draft) but rejected at /enviar because SEFAZ
  // requires the `pag` group on the XML. Always emit a single à-vista parcela
  // matching the total; formaPagamento is included only when caller provides
  // an id (Bling defaults to "Sem pagamento" otherwise).
  if (input.totalValor > 0) {
    const parcela: Record<string, unknown> = {
      data,
      valor: input.totalValor,
    };
    if (input.formaPagamentoId) {
      parcela.formaPagamento = { id: input.formaPagamentoId };
    }
    body.parcelas = [parcela];
  }

  // transporte.fretePorConta is part of the SEFAZ modFrete group (0–9). Even
  // for free shipping it must be set (9 = sem ocorrência de transporte).
  body.transporte = {
    fretePorConta: input.frete != null && input.frete > 0 ? 0 : 9,
    ...(input.frete != null && input.frete > 0 ? { frete: input.frete } : {}),
  };

  if (input.observacoes) body.observacoes = input.observacoes;
  if (input.observacoesInternas) body.observacoesInternas = input.observacoesInternas;

  // ---- Step 1: create NF-e (status = EM_DIGITACAO) ----
  let created: NfeCreateResponse;
  try {
    created = await blingFetch<NfeCreateResponse>("/nfe", {
      method: "POST",
      body,
      accessToken,
    });
  } catch (err) {
    return failResult(err, "create");
  }

  // ---- Step 2: transmit to SEFAZ ----
  try {
    await blingFetch(`/nfe/${created.id}/enviar`, {
      method: "POST",
      accessToken,
    });
  } catch (err) {
    // NF-e was created but couldn't be sent — return partial info so the
    // operator can retry the send from /admin/bling without recreating.
    return failResult(err, "send", {
      nfeId: created.id,
      numero: created.numero,
      serie: created.serie,
    });
  }

  // ---- Step 3: poll once for final status (SEFAZ usually < 5s) ----
  // We do a single poll, not a loop — the webhook is time-boxed (Vercel
  // function timeout). If still EM_PROCESSAMENTO, surface that and let the
  // operator refresh /admin/bling for the eventual outcome.
  let final: NfeGetResponse | null = null;
  try {
    // Tiny wait to let SEFAZ respond before we check status.
    await new Promise((r) => setTimeout(r, 3000));
    final = await blingFetch<NfeGetResponse>(`/nfe/${created.id}`, {
      method: "GET",
      accessToken,
    });
  } catch (err) {
    console.warn("[bling-nfe] post-send GET failed (non-fatal):", err);
  }

  const sitId = final?.situacao?.id ?? created.situacao?.id;
  const sitName = final?.situacao?.valor ?? created.situacao?.valor;

  if (sitId === NFE_SITUACAO.AUTORIZADA) {
    return {
      ok: true,
      status: "emitted",
      nfeId: created.id,
      numero: final?.numero ?? created.numero,
      serie: final?.serie ?? created.serie,
      chaveAcesso: final?.chaveAcesso ?? created.chaveAcesso,
      rawBlingStatus: sitName,
    };
  }

  if (sitId === NFE_SITUACAO.REJEITADA) {
    return {
      ok: false,
      status: "failed",
      nfeId: created.id,
      numero: final?.numero ?? created.numero,
      rawBlingStatus: sitName,
      error: `NF-e rejeitada pela SEFAZ${sitName ? ` (${sitName})` : ""}`,
    };
  }

  // Still EM_PROCESSAMENTO or unknown — return as 'pending' so the UI shows
  // it's in flight and the operator can refresh.
  return {
    ok: true,
    status: "pending",
    nfeId: created.id,
    numero: final?.numero ?? created.numero,
    serie: final?.serie ?? created.serie,
    chaveAcesso: final?.chaveAcesso ?? created.chaveAcesso,
    rawBlingStatus: sitName ?? "EM_PROCESSAMENTO",
  };
}

function failResult(
  err: unknown,
  phase: "create" | "send",
  partial?: { nfeId?: number; numero?: string; serie?: string },
): CreateAndEmitNfeResult {
  if (err instanceof BlingApiError) {
    const fieldErrors = err.fields?.map((f) => ({
      msg: f.msg,
      element: f.element,
    }));
    const lines = [
      `Falha ao ${phase === "create" ? "criar" : "transmitir"} NF-e: ${err.message}`,
    ];
    if (err.description) lines.push(err.description);
    if (fieldErrors?.length) {
      for (const f of fieldErrors) {
        lines.push(`• ${f.element ? `${f.element}: ` : ""}${f.msg}`);
      }
    }
    return {
      ok: false,
      status: "failed",
      nfeId: partial?.nfeId,
      numero: partial?.numero,
      serie: partial?.serie,
      error: lines.join("\n"),
      fieldErrors,
    };
  }
  return {
    ok: false,
    status: "failed",
    nfeId: partial?.nfeId,
    numero: partial?.numero,
    serie: partial?.serie,
    error: `Falha ao ${phase === "create" ? "criar" : "transmitir"} NF-e: ${
      err instanceof Error ? err.message : String(err)
    }`,
  };
}

/**
 * Re-attempt SEFAZ transmission for an existing NF-e (created earlier but
 * stuck in EM_DIGITACAO or REJEITADA). Used by the admin retry button.
 */
export async function retryEmitNfe(
  nfeId: number,
  accessToken?: string,
): Promise<CreateAndEmitNfeResult> {
  try {
    await blingFetch(`/nfe/${nfeId}/enviar`, {
      method: "POST",
      accessToken,
    });
  } catch (err) {
    return failResult(err, "send", { nfeId });
  }

  try {
    await new Promise((r) => setTimeout(r, 3000));
    const final = await blingFetch<NfeGetResponse>(`/nfe/${nfeId}`, {
      method: "GET",
      accessToken,
    });
    const sitId = final.situacao?.id;
    if (sitId === NFE_SITUACAO.AUTORIZADA) {
      return {
        ok: true,
        status: "emitted",
        nfeId,
        numero: final.numero,
        serie: final.serie,
        chaveAcesso: final.chaveAcesso,
        rawBlingStatus: final.situacao?.valor,
      };
    }
    if (sitId === NFE_SITUACAO.REJEITADA) {
      return {
        ok: false,
        status: "failed",
        nfeId,
        rawBlingStatus: final.situacao?.valor,
        error: `NF-e rejeitada pela SEFAZ`,
      };
    }
    return {
      ok: true,
      status: "pending",
      nfeId,
      numero: final.numero,
      rawBlingStatus: final.situacao?.valor ?? "EM_PROCESSAMENTO",
    };
  } catch (err) {
    return failResult(err, "send", { nfeId });
  }
}
