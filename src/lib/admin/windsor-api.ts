/**
 * Windsor.ai Custom API client.
 *
 * Pulls aggregated cross-channel marketing data via Windsor.ai connectors
 * (GA4, Facebook, TikTok, Amazon, Mercado Livre, Shopee, etc.).
 *
 * Auth: API key in `api_key` query param. Generate at
 * https://windsor.ai/account/integrations/?tab=api after logging in.
 *
 * Endpoint: https://connectors.windsor.ai/all
 *
 * Docs: https://windsor.ai/api-reference/
 */

const WINDSOR_BASE = "https://connectors.windsor.ai";

function getApiKey(): string | null {
  return (
    import.meta.env.WINDSOR_API_KEY ||
    process.env.WINDSOR_API_KEY ||
    null
  );
}

export function isWindsorConfigured(): boolean {
  return !!getApiKey();
}

export interface WindsorRow {
  [field: string]: string | number | null;
}

export async function fetchWindsor(opts: {
  connector: string;
  fields: string[];
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  accountId?: string;
}): Promise<WindsorRow[]> {
  const key = getApiKey();
  if (!key) throw new Error("WINDSOR_API_KEY not configured");

  const url = new URL(`${WINDSOR_BASE}/all`);
  url.searchParams.set("api_key", key);
  url.searchParams.set("connector", opts.connector);
  url.searchParams.set("fields", opts.fields.join(","));
  url.searchParams.set("date_from", opts.dateFrom);
  url.searchParams.set("date_to", opts.dateTo);
  url.searchParams.set("date_preset", "custom");
  if (opts.accountId) url.searchParams.set("_account", opts.accountId);

  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  const json = (await res.json()) as { data?: WindsorRow[]; error?: string };
  if (!res.ok || json.error) {
    throw new Error(`Windsor.ai error: ${json.error ?? res.status}`);
  }
  return json.data ?? [];
}

/**
 * GA4-specific helper. Returns daily metrics with attribution dimensions.
 */
export async function fetchGA4Daily(opts: {
  daysBack: number;
  propertyId: string;
}): Promise<WindsorRow[]> {
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - opts.daysBack);
  const fields = [
    "date",
    "source",
    "medium",
    "campaign",
    "sessions",
    "users",
    "new_users",
    "page_views",
    "engaged_sessions",
    "conversions",
    "transactions",
    "purchase_revenue",
  ];
  return fetchWindsor({
    connector: "googleanalytics4",
    fields,
    dateFrom: since.toISOString().slice(0, 10),
    dateTo: until.toISOString().slice(0, 10),
    accountId: opts.propertyId,
  });
}
