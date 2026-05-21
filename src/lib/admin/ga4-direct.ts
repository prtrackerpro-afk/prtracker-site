/**
 * GA4 Data API direct client — substitui o conector Windsor.ai.
 *
 * Autentica via Service Account JWT bearer flow (RFC 7523) e chama runReport.
 * Chave da SA em GA4_SA_KEY_BASE64 (env var Vercel) — base64 do JSON inteiro
 * pra evitar escape de `\n` no `private_key`.
 *
 * SA: `claude-analytics-reader@project-fb633253-a31a-4373-9b8.iam.gserviceaccount.com`,
 * adicionada como Viewer na property 525987283 em 2026-05-21 via Admin API.
 *
 * Filtra pelo stream "prtracker.com.br" (13664841350) — exclui o stream
 * "PR Tracker v2" (G-B2EPJXKSPZ) que foi descontinuado.
 */
import crypto from "node:crypto";

const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const STREAM_ID = "13664841350";

type SaKey = {
  client_email: string;
  private_key: string;
};

function getSaKey(): SaKey | null {
  const b64 =
    import.meta.env.GA4_SA_KEY_BASE64 || process.env.GA4_SA_KEY_BASE64;
  if (!b64) return null;
  try {
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json) as SaKey;
  } catch {
    return null;
  }
}

export function isGa4DirectConfigured(): boolean {
  return getSaKey() !== null;
}

let cachedToken: { value: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const key = getSaKey();
  if (!key) throw new Error("GA4_SA_KEY_BASE64 not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iss: key.client_email,
      scope: SCOPE,
      aud: TOKEN_ENDPOINT,
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");
  const sig = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(key.private_key, "base64url");
  const assertion = `${header}.${payload}.${sig}`;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${assertion}`,
  });
  if (!res.ok) {
    throw new Error(
      `GA4 token exchange failed: ${res.status} ${await res.text()}`,
    );
  }
  const json = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };
  cachedToken = {
    value: json.access_token,
    exp: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

type Ga4Row = {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
};
type Ga4Response = {
  rows?: Ga4Row[];
  error?: { message: string; code: number };
};

export interface Ga4DailyRow {
  date: string;
  source: string;
  medium: string;
  campaign: string;
  sessions: number;
  users: number;
  new_users: number;
  page_views: number;
  engaged_sessions: number;
  conversions: number;
  transactions: number;
  purchase_revenue: number;
}

function formatYmd(s: string | undefined): string {
  if (!s || s.length !== 8) return "";
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export async function fetchGa4DailyDirect(opts: {
  daysBack: number;
  propertyId: string;
}): Promise<Ga4DailyRow[]> {
  const token = await getAccessToken();
  const until = new Date();
  const since = new Date();
  since.setDate(since.getDate() - opts.daysBack);
  const startDate = since.toISOString().slice(0, 10);
  const endDate = until.toISOString().slice(0, 10);

  const body = JSON.stringify({
    dateRanges: [{ startDate, endDate }],
    dimensions: [
      { name: "date" },
      { name: "sessionSource" },
      { name: "sessionMedium" },
      { name: "sessionCampaignName" },
    ],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "newUsers" },
      { name: "screenPageViews" },
      { name: "engagedSessions" },
      { name: "conversions" },
      { name: "ecommercePurchases" },
      { name: "totalRevenue" },
    ],
    dimensionFilter: {
      filter: {
        fieldName: "streamId",
        stringFilter: { value: STREAM_ID },
      },
    },
    limit: 100000,
  });

  const res = await fetch(
    `${DATA_API_BASE}/properties/${opts.propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body,
    },
  );
  const json = (await res.json()) as Ga4Response;
  if (!res.ok || json.error) {
    throw new Error(
      `GA4 runReport failed: ${json.error?.message ?? res.status}`,
    );
  }
  return (json.rows ?? []).map((r) => ({
    date: formatYmd(r.dimensionValues[0]?.value),
    source: r.dimensionValues[1]?.value || "(direct)",
    medium: r.dimensionValues[2]?.value || "(none)",
    campaign: r.dimensionValues[3]?.value || "(not set)",
    sessions: Number(r.metricValues[0]?.value ?? 0),
    users: Number(r.metricValues[1]?.value ?? 0),
    new_users: Number(r.metricValues[2]?.value ?? 0),
    page_views: Number(r.metricValues[3]?.value ?? 0),
    engaged_sessions: Number(r.metricValues[4]?.value ?? 0),
    conversions: Number(r.metricValues[5]?.value ?? 0),
    transactions: Number(r.metricValues[6]?.value ?? 0),
    purchase_revenue: Number(r.metricValues[7]?.value ?? 0),
  }));
}
