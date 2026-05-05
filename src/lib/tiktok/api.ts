/**
 * TikTok Shop Open Platform API client.
 *
 * Docs: https://partner.tiktokshop.com/docv2/page/650a6e60ce71fd02b15596c4
 *
 * Critical differences vs Bling:
 *
 * 1) **HMAC-SHA256 SIGNATURE** required on every request. Computed as:
 *    sign = HMAC-SHA256(
 *      app_secret,
 *      app_secret + path + sorted_query_params + body_json + app_secret
 *    )
 *    where:
 *      - sorted_query_params: alphabetical key=value (NO sign, NO access_token)
 *      - body_json: stringified JSON body for POST/PUT/PATCH; "" otherwise
 *      - path: just the request path, e.g. "/product/202309/products/search"
 *      - app_secret bookends the input string (yes, twice).
 *
 * 2) **Required query params** on every call:
 *      - app_key
 *      - timestamp (UNIX seconds)
 *      - sign (the HMAC computed above)
 *      - access_token (HEADER actually: x-tts-access-token, NOT query)
 *      - shop_cipher (for shop-scoped endpoints, which is most of them)
 *
 * 3) **Response envelope**:
 *      { "code": 0, "message": "Success", "data": {...}, "request_id": "..." }
 *    code=0 means success even if HTTP 200 — code !== 0 is an error.
 *
 * 4) **Rate limits** (per app, per shop):
 *      - 10 req/s default for most product/order endpoints
 *      - Some bulk endpoints lower (5 req/s)
 *      - Returns 429 + retry-after header when hit
 *
 * 5) **Versioning**: paths include date version like /product/202309/products
 *    Always use the version recommended in the latest docs.
 */

import crypto from "node:crypto";
import {
  getValidAccess,
  refreshAccessToken,
  getOAuthConfig,
  TikTokNotConnectedError,
} from "./oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

const BASE_URL = "https://open-api.tiktokglobalshop.com";
const USER_AGENT = "PR Tracker (contato@prtracker.com.br)";

// Pacing pra ficar com folga sob 10 req/s. ~150ms = ~6.6 req/s.
const MIN_INTERVAL_MS = 150;
const MAX_429_RETRIES = 4;
let lastCallAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function rateLimitGate(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastCallAt;
  if (elapsed < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - elapsed);
  lastCallAt = Date.now();
}

function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue) return null;
  const seconds = Number(headerValue);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000);
  const ts = Date.parse(headerValue);
  if (!Number.isNaN(ts)) return Math.max(0, ts - Date.now());
  return null;
}

export class TikTokApiError extends Error {
  constructor(
    message: string,
    public readonly httpStatus: number,
    public readonly tiktokCode?: number,
    public readonly tiktokMessage?: string,
    public readonly requestId?: string,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "TikTokApiError";
  }
}

export type TikTokMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface TikTokRequestOptions {
  method?: TikTokMethod;
  /** Query params (excluding app_key/timestamp/sign — those são auto-injetados). */
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /** Override automático shop_cipher. Default: usa o do token armazenado. */
  shopCipher?: string;
  /** Bypass token store, usa esse direto. */
  accessToken?: string;
}

interface SignaturePayload {
  appSecret: string;
  path: string;
  query: Record<string, string>; // já tem app_key + timestamp; NÃO tem sign
  bodyJson: string; // "" pra GET/DELETE
}

/**
 * HMAC-SHA256 signature como TikTok espera.
 *
 * Formato exato (verificado contra docs Apr/2026):
 *   raw = app_secret + path + sortedKeyValues + bodyJson + app_secret
 *   sign = hex(hmac_sha256(app_secret, raw))
 *
 * Os params `sign` e `access_token` NÃO entram no cálculo. `shop_cipher` ENTRA.
 */
function computeSignature(p: SignaturePayload): string {
  const sortedKeys = Object.keys(p.query).sort();
  const concatenated = sortedKeys.map((k) => `${k}${p.query[k]}`).join("");
  const raw = `${p.appSecret}${p.path}${concatenated}${p.bodyJson}${p.appSecret}`;
  return crypto.createHmac("sha256", p.appSecret).update(raw).digest("hex");
}

function buildSignedUrl(
  path: string,
  query: Record<string, string>,
): string {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(query)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

async function doFetch(
  url: string,
  method: TikTokMethod,
  accessToken: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
    "x-tts-access-token": accessToken,
  };
  let init: RequestInit = { method, headers };
  if (body != null) {
    headers["Content-Type"] = "application/json";
    init = { ...init, body: JSON.stringify(body) };
  }
  return fetch(url, init);
}

async function loadRefreshTokenForRetry(): Promise<string | null> {
  const sb = getAdminSupabase();
  const { data } = await sb
    .from("tiktok_oauth_tokens")
    .select("refresh_token")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.refresh_token as string | undefined) ?? null;
}

async function parseError(res: Response): Promise<TikTokApiError> {
  const text = await res.text();
  let parsed: { code?: number; message?: string; request_id?: string } | null = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  return new TikTokApiError(
    `TikTok ${res.status} ${parsed?.message ?? "error"}`,
    res.status,
    parsed?.code,
    parsed?.message,
    parsed?.request_id,
    parsed ?? text,
  );
}

/**
 * Faz uma chamada autenticada à API TikTok Shop.
 *
 * - Injeta app_key, timestamp, sign automaticamente.
 * - Pega access_token + shop_cipher do storage (Supabase) se não passar override.
 * - Retry em 401 (refresh + 1 retry).
 * - Retry em 429 com backoff exponencial honrando retry-after.
 * - Retorna apenas o `data` do envelope TikTok.
 */
export async function tiktokFetch<T = unknown>(
  path: string,
  options: TikTokRequestOptions = {},
): Promise<T> {
  const cfg = getOAuthConfig();
  const method = options.method ?? "GET";

  let accessToken: string;
  let shopCipher: string | undefined = options.shopCipher;
  if (options.accessToken) {
    accessToken = options.accessToken;
    if (!shopCipher) {
      throw new TikTokApiError(
        "shopCipher é obrigatório quando se passa accessToken manualmente",
        400,
      );
    }
  } else {
    const valid = await getValidAccess();
    accessToken = valid.accessToken;
    shopCipher = valid.shopCipher;
  }

  const bodyJson = options.body != null ? JSON.stringify(options.body) : "";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const queryForSig: Record<string, string> = {
    app_key: cfg.appKey,
    timestamp,
  };
  // shop_cipher entra na query string E na assinatura.
  if (shopCipher) queryForSig.shop_cipher = shopCipher;
  // Custom query params do caller (não inclui sign/access_token).
  if (options.query) {
    for (const [k, v] of Object.entries(options.query)) {
      if (v == null) continue;
      queryForSig[k] = String(v);
    }
  }

  const sign = computeSignature({
    appSecret: cfg.appSecret,
    path,
    query: queryForSig,
    bodyJson,
  });

  const finalQuery: Record<string, string> = { ...queryForSig, sign };
  const url = buildSignedUrl(path, finalQuery);

  await rateLimitGate();
  let res = await doFetch(url, method, accessToken, options.body);

  // 401: token revogado / expirado server-side. Refresh + 1 retry.
  if (res.status === 401) {
    const rt = await loadRefreshTokenForRetry();
    if (!rt) throw new TikTokNotConnectedError();
    const refreshed = await refreshAccessToken(rt);
    accessToken = refreshed.access_token;
    // Recompute timestamp + sign com nova janela.
    const newTimestamp = Math.floor(Date.now() / 1000).toString();
    queryForSig.timestamp = newTimestamp;
    const newSign = computeSignature({
      appSecret: cfg.appSecret,
      path,
      query: queryForSig,
      bodyJson,
    });
    const retryUrl = buildSignedUrl(path, { ...queryForSig, sign: newSign });
    await rateLimitGate();
    res = await doFetch(retryUrl, method, accessToken, options.body);
  }

  // 429: rate-limited. Retry com backoff exponencial.
  let retry429 = 0;
  while (res.status === 429 && retry429 < MAX_429_RETRIES) {
    retry429++;
    const headerWait = parseRetryAfterMs(res.headers.get("retry-after"));
    const backoffMs = Math.min(1000 * 2 ** (retry429 - 1), 8000);
    const waitMs = headerWait ?? backoffMs;
    console.warn(
      `[tiktok] 429 received (attempt ${retry429}/${MAX_429_RETRIES}), waiting ${waitMs}ms`,
    );
    await sleep(waitMs);
    // Mesmo URL — timestamp/sign já válidos no retry curto.
    await rateLimitGate();
    res = await doFetch(url, method, accessToken, options.body);
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;

  let parsed: { code?: number; message?: string; data?: T; request_id?: string };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TikTokApiError(
      "TikTok response was not JSON",
      res.status,
      undefined,
      undefined,
      undefined,
      text,
    );
  }

  // TikTok retorna code=0 pra sucesso. Qualquer outro = erro mesmo com HTTP 200.
  if (parsed.code !== 0 && parsed.code != null) {
    throw new TikTokApiError(
      `TikTok code=${parsed.code}: ${parsed.message ?? "unknown error"}`,
      res.status,
      parsed.code,
      parsed.message,
      parsed.request_id,
      parsed,
    );
  }

  return (parsed.data ?? (undefined as unknown as T)) as T;
}
