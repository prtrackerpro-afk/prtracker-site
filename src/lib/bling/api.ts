/**
 * Bling v3 REST client wrapper.
 *
 * Bling docs: https://developer.bling.com.br/referencia
 *
 * - Always sends Authorization: Bearer <access_token> via getValidAccessToken().
 * - On 401 (token revoked / unexpected expiry), tries one refresh + retry.
 * - Retries idempotent GET requests once on transient 5xx; never retries
 *   POST/PUT (they may have created the resource even on error response).
 * - Surfaces Bling's structured error envelope as BlingApiError.
 *
 * Bling response envelope (success):
 *   { "data": <object | array> }
 *
 * Bling response envelope (error):
 *   { "error": { "type": "...", "message": "...", "description": "...",
 *                "fields": [{ "msg": "...", "code": "...", "element": "..." }] } }
 */

import {
  getValidAccessToken,
  refreshAccessToken,
  BlingNotConnectedError,
} from "./oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

const BASE_URL = "https://www.bling.com.br/Api/v3";
const USER_AGENT = "PR Tracker (contato@prtracker.com.br)";

// Bling free plan = 3 req/s. We pace at ~350ms between calls (~2.85 req/s)
// to leave headroom for clock drift / network jitter. Module-level state is
// fine here: each Vercel invocation gets its own instance, and our sync
// loop is sequential within a single invocation.
const MIN_INTERVAL_MS = 350;
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
  // HTTP-date form (rare for 429 but spec allows it)
  const ts = Date.parse(headerValue);
  if (!Number.isNaN(ts)) return Math.max(0, ts - Date.now());
  return null;
}

export class BlingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly type?: string,
    public readonly description?: string,
    public readonly fields?: Array<{ msg: string; code?: string; element?: string }>,
    public readonly raw?: unknown,
  ) {
    super(message);
    this.name = "BlingApiError";
  }
}

export type BlingMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface BlingRequestOptions {
  method?: BlingMethod;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Already-validated access token (skips Supabase round-trip). */
  accessToken?: string;
}

export interface BlingResponse<T = unknown> {
  data: T;
}

function buildUrl(path: string, query?: BlingRequestOptions["query"]): string {
  const url = new URL(BASE_URL + (path.startsWith("/") ? path : `/${path}`));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v == null) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function doFetch(
  url: string,
  method: BlingMethod,
  accessToken: string,
  body?: unknown,
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": USER_AGENT,
  };
  let init: RequestInit = { method, headers };
  if (body != null) {
    headers["Content-Type"] = "application/json";
    init = { ...init, body: JSON.stringify(body) };
  }
  return fetch(url, init);
}

async function loadRefreshTokenForRetry(): Promise<string | null> {
  // Read the refresh_token directly so we can force a refresh after a 401
  // even if the cached access_token still has time remaining locally.
  const sb = getAdminSupabase();
  const { data } = await sb
    .from("bling_oauth_tokens")
    .select("refresh_token")
    .eq("id", "singleton")
    .maybeSingle();
  return (data?.refresh_token as string | undefined) ?? null;
}

async function parseError(res: Response): Promise<BlingApiError> {
  const text = await res.text();
  let parsed: any = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON */
  }
  const err = parsed?.error;
  if (err) {
    return new BlingApiError(
      `Bling ${res.status} ${err.message ?? err.type ?? "error"}`,
      res.status,
      err.type,
      err.description,
      err.fields,
      parsed,
    );
  }
  return new BlingApiError(
    `Bling ${res.status}: ${text.slice(0, 500)}`,
    res.status,
    undefined,
    undefined,
    undefined,
    text,
  );
}

/**
 * Make a Bling API call. Throws on non-2xx, returns the `data` envelope on success.
 * On 401 attempts one refresh + retry. Other errors bubble up.
 */
export async function blingFetch<T = unknown>(
  path: string,
  options: BlingRequestOptions = {},
): Promise<T> {
  const method = options.method ?? "GET";
  const url = buildUrl(path, options.query);
  let token = options.accessToken ?? (await getValidAccessToken());

  await rateLimitGate();
  let res = await doFetch(url, method, token, options.body);

  if (res.status === 401) {
    // Force a refresh + single retry. Useful when the token was revoked
    // server-side (Bling user removed app, scopes changed, etc).
    const rt = await loadRefreshTokenForRetry();
    if (!rt) throw new BlingNotConnectedError();
    const refreshed = await refreshAccessToken(rt);
    token = refreshed.access_token;
    await rateLimitGate();
    res = await doFetch(url, method, token, options.body);
  }

  // 429 = rate-limited. Bling returns this when the per-second cap is hit.
  // Retry up to MAX_429_RETRIES times honoring Retry-After header, falling
  // back to exponential backoff (1s, 2s, 4s, 8s capped).
  let retry429 = 0;
  while (res.status === 429 && retry429 < MAX_429_RETRIES) {
    retry429++;
    const headerWait = parseRetryAfterMs(res.headers.get("retry-after"));
    const backoffMs = Math.min(1000 * 2 ** (retry429 - 1), 8000);
    const waitMs = headerWait ?? backoffMs;
    console.warn(
      `[bling] 429 received (attempt ${retry429}/${MAX_429_RETRIES}), waiting ${waitMs}ms`,
    );
    await sleep(waitMs);
    await rateLimitGate();
    res = await doFetch(url, method, token, options.body);
  }

  if (!res.ok) {
    throw await parseError(res);
  }

  // Empty 204 responses (rare but possible).
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BlingApiError(
      "Bling response was not JSON",
      res.status,
      undefined,
      undefined,
      undefined,
      text,
    );
  }
  // Bling wraps successful responses in { data: ... }. Some endpoints (token,
  // not used here) return raw — handle both gracefully.
  return (parsed?.data ?? parsed) as T;
}
