/**
 * Meta Marketing API client (read-only).
 * Reuses the System User token configured in env.
 */

const META_API_VERSION =
  import.meta.env.META_API_VERSION || process.env.META_API_VERSION || "v23.0";

function getMetaConfig() {
  const token = import.meta.env.META_ACCESS_TOKEN || process.env.META_ACCESS_TOKEN;
  const account =
    import.meta.env.META_AD_ACCOUNT_ID || process.env.META_AD_ACCOUNT_ID;
  if (!token || !account) {
    throw new Error("META_ACCESS_TOKEN or META_AD_ACCOUNT_ID env var missing");
  }
  return { token, account };
}

async function metaGet<T = any>(
  path: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  const { token } = getMetaConfig();
  const url = new URL(`https://graph.facebook.com/${META_API_VERSION}/${path.replace(/^\//, "")}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) {
    const err = (json as any).error;
    throw new Error(`Meta API ${res.status}: ${err?.message ?? JSON.stringify(json)}`);
  }
  return json as T;
}

export async function fetchAllPages<T>(
  initial: { data: T[]; paging?: { next?: string } }
): Promise<T[]> {
  const out: T[] = [...initial.data];
  let next = initial.paging?.next;
  while (next) {
    const res = await fetch(next);
    const j = (await res.json()) as { data: T[]; paging?: { next?: string } };
    out.push(...(j.data || []));
    next = j.paging?.next;
  }
  return out;
}

export interface MetaCampaign {
  id: string;
  name: string;
  objective?: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  bid_strategy?: string;
  buying_type?: string;
  created_time?: string;
}

export interface MetaAdset {
  id: string;
  campaign_id: string;
  name: string;
  status?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  optimization_goal?: string;
  billing_event?: string;
  targeting?: any;
  promoted_object?: any;
  attribution_spec?: any;
  start_time?: string;
  end_time?: string;
}

export interface MetaAd {
  id: string;
  adset_id: string;
  campaign_id: string;
  name: string;
  status?: string;
  effective_status?: string;
  creative?: { id: string; name?: string; thumbnail_url?: string };
}

export interface MetaInsight {
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  reach?: string;
  frequency?: string;
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
  campaign_id?: string;
  adset_id?: string;
  ad_id?: string;
}

export async function listCampaigns(): Promise<MetaCampaign[]> {
  const { account } = getMetaConfig();
  const r = await metaGet<{ data: MetaCampaign[] }>(`${account}/campaigns`, {
    fields: "id,name,objective,status,effective_status,daily_budget,lifetime_budget,bid_strategy,buying_type,created_time",
    limit: 200,
  });
  return r.data || [];
}

export async function listAdsets(): Promise<MetaAdset[]> {
  const { account } = getMetaConfig();
  const r = await metaGet<{ data: MetaAdset[] }>(`${account}/adsets`, {
    fields:
      "id,campaign_id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,billing_event,targeting,promoted_object,attribution_spec,start_time,end_time",
    limit: 500,
  });
  return r.data || [];
}

export async function listAds(): Promise<MetaAd[]> {
  const { account } = getMetaConfig();
  const r = await metaGet<{ data: MetaAd[] }>(`${account}/ads`, {
    fields: "id,adset_id,campaign_id,name,status,effective_status,creative{id,name,thumbnail_url}",
    limit: 1000,
  });
  return r.data || [];
}

export async function getInsights(
  level: "account" | "campaign" | "adset" | "ad",
  daysBack: number
): Promise<MetaInsight[]> {
  const { account } = getMetaConfig();
  const since = new Date();
  since.setDate(since.getDate() - daysBack);
  const until = new Date();
  const sinceStr = since.toISOString().slice(0, 10);
  const untilStr = until.toISOString().slice(0, 10);

  const r = await metaGet<{ data: MetaInsight[] }>(
    `${account}/insights`,
    {
      level,
      time_range: JSON.stringify({ since: sinceStr, until: untilStr }),
      time_increment: 1,
      fields:
        "spend,impressions,clicks,ctr,cpm,cpc,reach,frequency,actions,action_values,campaign_id,adset_id,ad_id",
      limit: 5000,
    }
  );
  return r.data || [];
}

/**
 * Extract metric from actions array.
 */
export function action(insight: MetaInsight, type: string): number {
  const a = (insight.actions || []).find((x) => x.action_type === type);
  return a ? Number(a.value) || 0 : 0;
}

export function actionValue(insight: MetaInsight, type: string): number {
  const a = (insight.action_values || []).find((x) => x.action_type === type);
  return a ? Number(a.value) || 0 : 0;
}
