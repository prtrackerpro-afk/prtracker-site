/**
 * Mercado Pago Payments search client.
 *
 * Pulls approved payments via /v1/payments/search with date range filtering.
 * Used by the admin cron to backfill the `sales` table from MP history.
 *
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments_search/get
 */

const MP_BASE = "https://api.mercadopago.com";

export interface MpPaymentRecord {
  id: number;
  status: string;
  status_detail?: string;
  date_approved?: string | null;
  date_created?: string;
  transaction_amount: number;
  payment_method_id?: string;
  external_reference?: string | null;
  /**
   * MP user ID do vendedor que recebeu o pagamento. Quando a conta MP do PR Tracker
   * paga algo (compra de embalagens com saldo, etc), o /payments/search devolve
   * esses payments com `collector_id` de outro vendedor. Usamos pra filtrar
   * outbound payments e não inflar `sales` com nossas próprias compras.
   */
  collector_id?: number;
  payer?: {
    id?: number;
    email?: string;
    first_name?: string;
    last_name?: string;
    identification?: { number?: string };
  };
  metadata?: Record<string, unknown>;
  additional_info?: {
    items?: Array<{
      id?: string;
      title?: string;
      quantity?: number | string;
      unit_price?: number | string;
    }>;
  };
}

interface SearchResponse {
  paging?: { total?: number; limit?: number; offset?: number };
  results?: MpPaymentRecord[];
}

function getToken(): string | null {
  return (
    import.meta.env.MP_ACCESS_TOKEN ||
    process.env.MP_ACCESS_TOKEN ||
    null
  );
}

export function isMpConfigured(): boolean {
  return !!getToken();
}

let cachedMpUserId: number | null = null;

/**
 * Retorna o MP user ID da conta autenticada (o nosso `collector_id` quando
 * vendemos). Cache in-memory por processo — só faz uma chamada /users/me na
 * primeira invocação. Lança se /users/me falhar — fail-closed pra evitar
 * ingerir tudo sem filtro caso o lookup quebre.
 */
export async function getMpUserId(): Promise<number> {
  if (cachedMpUserId !== null) return cachedMpUserId;
  const token = getToken();
  if (!token) throw new Error("MP_ACCESS_TOKEN not configured");

  const res = await fetch(`${MP_BASE}/users/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`MP /users/me failed: ${res.status} ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { id?: number };
  if (typeof json.id !== "number") {
    throw new Error(`MP /users/me returned no id: ${JSON.stringify(json).slice(0, 200)}`);
  }
  cachedMpUserId = json.id;
  return cachedMpUserId;
}

/**
 * Page through approved payments in a date range. Defaults to last 90 days.
 *
 * MP returns max 100 records per page; we follow paging cursors until the
 * results stop coming. Daily volume for PR Tracker is small enough that the
 * full 90d backfill is well under 100 records.
 *
 * Filtra via `collector.id=<our_mp_user_id>` pra não trazer payments outbound
 * (compras nossas com saldo MP), que de outro modo viram falsas "vendas" no
 * `sales` table.
 */
export async function searchApprovedPayments(opts: {
  daysBack?: number;
}): Promise<MpPaymentRecord[]> {
  const token = getToken();
  if (!token) throw new Error("MP_ACCESS_TOKEN not configured");

  const ourMpUserId = await getMpUserId();

  const daysBack = opts.daysBack ?? 90;
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const sinceIso = since.toISOString();

  const all: MpPaymentRecord[] = [];
  const limit = 100;
  let offset = 0;

  while (true) {
    const url = new URL(`${MP_BASE}/v1/payments/search`);
    url.searchParams.set("status", "approved");
    url.searchParams.set("collector.id", String(ourMpUserId));
    url.searchParams.set("range", "date_approved");
    url.searchParams.set("begin_date", sinceIso);
    url.searchParams.set("end_date", new Date().toISOString());
    url.searchParams.set("sort", "date_approved");
    url.searchParams.set("criteria", "desc");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`MP /payments/search failed: ${res.status} ${body.slice(0, 200)}`);
    }
    const json = (await res.json()) as SearchResponse;
    const results = json.results ?? [];
    // Defesa em profundidade: mesmo com filtro de API, descarta tudo que
    // não venha com nosso collector_id (caso o MP ignore o filtro num cenário
    // de borda — já vi acontecer com ranges antigos).
    const filtered = results.filter((p) => {
      if (typeof p.collector_id === "number" && p.collector_id !== ourMpUserId) {
        return false;
      }
      return true;
    });
    all.push(...filtered);
    if (results.length < limit) break;
    offset += limit;
    // Safety stop — should never trigger at PR Tracker volume
    if (offset > 5000) break;
  }

  return all;
}
