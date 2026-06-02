/**
 * Extrai cookies de tracking (Meta Pixel + GA4 + UTMs) do header `cookie` da
 * request.
 *
 * O `_fbp` é o browser-id persistente do Meta Pixel; `_fbc` carrega o `fbclid`
 * de quando o usuário caiu via clique em ad. Ambos vão raw no CAPI (não-hashed,
 * per spec da Meta).
 *
 * O `_ga` cookie tem formato `GA1.1.<RANDOM>.<TIMESTAMP>` — o GA4 client_id é
 * só `<RANDOM>.<TIMESTAMP>`, sem o prefixo de versão.
 *
 * O `pr_utm` é um cookie próprio gravado client-side (ver Analytics.astro)
 * quando o visitante chega com `utm_*` na URL. Persiste 30d. Formato:
 * JSON encodado — `{s,m,c,t,n,landing,ts}`. Lemos no servidor durante o
 * checkout pra propagar pra metadata MP e, no webhook, custom_data do CAPI.
 */

export type UtmTuple = {
  source?: string;
  medium?: string;
  campaign?: string;
  term?: string;
  content?: string;
  landing?: string;
  /** Unix timestamp (ms) de quando o UTM foi capturado. */
  ts?: number;
};

export type TrackingCookies = {
  fbp?: string;
  fbc?: string;
  gaClientId?: string;
  utm?: UtmTuple;
};

function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

function extractGaClientId(gaCookie: string | undefined): string | undefined {
  if (!gaCookie) return undefined;
  // `GA1.1.123456789.1700000000` → `123456789.1700000000`
  const m = gaCookie.match(/^GA\d+\.\d+\.(\d+\.\d+)$/);
  return m?.[1];
}

function parseUtmCookie(raw: string | undefined): UtmTuple | undefined {
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    // Keys são abreviadas no cookie pra caber em 4kb mesmo com query longa.
    const t: UtmTuple = {};
    if (typeof obj.s === "string" && obj.s) t.source = obj.s;
    if (typeof obj.m === "string" && obj.m) t.medium = obj.m;
    if (typeof obj.c === "string" && obj.c) t.campaign = obj.c;
    if (typeof obj.t === "string" && obj.t) t.term = obj.t;
    if (typeof obj.n === "string" && obj.n) t.content = obj.n;
    if (typeof obj.landing === "string" && obj.landing) t.landing = obj.landing;
    if (typeof obj.ts === "number") t.ts = obj.ts;
    // Só retorna se pelo menos um campo significativo veio.
    return t.source || t.medium || t.campaign ? t : undefined;
  } catch {
    return undefined;
  }
}

export function extractTrackingCookies(
  cookieHeader: string | null,
): TrackingCookies {
  return {
    fbp: parseCookie(cookieHeader, "_fbp"),
    fbc: parseCookie(cookieHeader, "_fbc"),
    gaClientId: extractGaClientId(parseCookie(cookieHeader, "_ga")),
    utm: parseUtmCookie(parseCookie(cookieHeader, "pr_utm")),
  };
}

/**
 * Achata um `UtmTuple` em chaves planas pra metadata MP / GA4 / CAPI custom_data.
 * Mantém prefixo `utm_` pra coincidir com convenção de attribution.
 */
export function flattenUtm(utm: UtmTuple | undefined): Record<string, string> {
  if (!utm) return {};
  const out: Record<string, string> = {};
  if (utm.source) out.utm_source = utm.source;
  if (utm.medium) out.utm_medium = utm.medium;
  if (utm.campaign) out.utm_campaign = utm.campaign;
  if (utm.term) out.utm_term = utm.term;
  if (utm.content) out.utm_content = utm.content;
  if (utm.landing) out.utm_landing = utm.landing;
  return out;
}
