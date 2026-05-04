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

  let res = await doFetch(url, method, token, options.body);

  if (res.status === 401) {
    // Force a refresh + single retry. Useful when the token was revoked
    // server-side (Bling user removed app, scopes changed, etc).
    const rt = await loadRefreshTokenForRetry();
    if (!rt) throw new BlingNotConnectedError();
    const refreshed = await refreshAccessToken(rt);
    token = refreshed.access_token;
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
