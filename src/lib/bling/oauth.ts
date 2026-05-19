/**
 * Bling v3 OAuth2 (Authorization Code flow + refresh token rotation).
 *
 * Bling docs: https://developer.bling.com.br/aplicativos#fluxo-de-autoriza%C3%A7%C3%A3o
 *
 * Endpoints:
 *   GET  https://www.bling.com.br/Api/v3/oauth/authorize  ← user consent (página)
 *   POST https://api.bling.com.br/Api/v3/oauth/token       ← token exchange + refresh (API)
 *
 * Em 2026 Bling baniu chamadas API em `www.bling.com.br` — token endpoint
 * agora vive em `api.bling.com.br`. AUTHORIZE_URL fica em `www` porque é
 * redirect de browser (página de consentimento do usuário), não chamada API.
 *
 * Tokens:
 *   - access_token  expires in 6h
 *   - refresh_token expires in 30d (rotated on every refresh — must persist new one)
 *
 * The token request uses HTTP Basic auth: `Authorization: Basic base64(client_id:client_secret)`,
 * NOT client_id/client_secret in the form body.
 *
 * Storage: single row in public.bling_oauth_tokens (id='singleton'). Service-role
 * only — never read from the browser.
 */

import { getAdminSupabase } from "~/lib/supabase/server";

const AUTHORIZE_URL = "https://www.bling.com.br/Api/v3/oauth/authorize";
const TOKEN_URL = "https://api.bling.com.br/Api/v3/oauth/token";

// Refresh proactively when less than 10 min remain. Bling access_token is 6h,
// so this gives plenty of buffer for slow webhook chains.
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

export interface BlingOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface BlingTokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number; // seconds
  scope?: string;
}

interface StoredToken {
  access_token: string;
  refresh_token: string;
  token_type: string;
  scope: string | null;
  expires_at: string; // ISO timestamp
}

export class BlingOAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "BlingOAuthError";
  }
}

export class BlingNotConnectedError extends Error {
  constructor() {
    super("Bling não está conectado. Acesse /admin → Conectar Bling.");
    this.name = "BlingNotConnectedError";
  }
}

export function getOAuthConfig(): BlingOAuthConfig {
  const clientId = import.meta.env.BLING_CLIENT_ID || process.env.BLING_CLIENT_ID;
  const clientSecret =
    import.meta.env.BLING_CLIENT_SECRET || process.env.BLING_CLIENT_SECRET;
  const redirectUri =
    import.meta.env.BLING_REDIRECT_URI || process.env.BLING_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new BlingOAuthError(
      "BLING_CLIENT_ID, BLING_CLIENT_SECRET e BLING_REDIRECT_URI são obrigatórios. " +
        "Cadastre o app em https://www.bling.com.br/b/integradores e adicione no Vercel.",
    );
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Build the URL Felipe clicks to authorize the app inside Bling.
 *
 * `state` is a CSRF token round-tripped through Bling. Generate it in the
 * /connect endpoint and verify in /callback.
 */
export function buildAuthorizeUrl(state: string): string {
  const cfg = getOAuthConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

function basicAuthHeader(cfg: BlingOAuthConfig): string {
  const raw = `${cfg.clientId}:${cfg.clientSecret}`;
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(raw, "utf8").toString("base64")
      : btoa(raw);
  return `Basic ${b64}`;
}

async function postToken(form: URLSearchParams): Promise<BlingTokenResponse> {
  const cfg = getOAuthConfig();
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuthHeader(cfg),
    },
    body: form.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new BlingOAuthError(
      `Bling token exchange failed: ${res.status}`,
      res.status,
      text,
    );
  }
  let parsed: BlingTokenResponse;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BlingOAuthError(
      "Bling token response was not JSON",
      res.status,
      text,
    );
  }
  if (!parsed.access_token || !parsed.refresh_token) {
    throw new BlingOAuthError(
      "Bling token response missing access_token/refresh_token",
      res.status,
      text,
    );
  }
  return parsed;
}

/**
 * Exchange the `code` returned by Bling on /callback for the initial
 * access_token + refresh_token. Persists them to Supabase.
 */
export async function exchangeCodeForToken(code: string): Promise<StoredToken> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
  });
  const tok = await postToken(form);
  return await persistToken(tok);
}

/**
 * Refresh an expired access_token. Bling rotates the refresh_token on
 * every call — we MUST persist the new one or the next refresh fails.
 */
export async function refreshAccessToken(
  currentRefreshToken: string,
): Promise<StoredToken> {
  const form = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: currentRefreshToken,
  });
  const tok = await postToken(form);
  return await persistToken(tok);
}

async function persistToken(tok: BlingTokenResponse): Promise<StoredToken> {
  const expiresAt = new Date(Date.now() + tok.expires_in * 1000).toISOString();
  const sb = getAdminSupabase();
  const row = {
    id: "singleton",
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    token_type: tok.token_type ?? "Bearer",
    scope: tok.scope ?? null,
    expires_at: expiresAt,
    obtained_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("bling_oauth_tokens")
    .upsert(row, { onConflict: "id" });
  if (error) {
    throw new BlingOAuthError(
      `Failed to persist Bling token to Supabase: ${error.message}`,
    );
  }
  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    token_type: row.token_type,
    scope: row.scope,
    expires_at: row.expires_at,
  };
}

async function loadStoredToken(): Promise<StoredToken | null> {
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("bling_oauth_tokens")
    .select("access_token, refresh_token, token_type, scope, expires_at")
    .eq("id", "singleton")
    .maybeSingle();
  if (error) {
    throw new BlingOAuthError(
      `Failed to load Bling token from Supabase: ${error.message}`,
    );
  }
  return data as StoredToken | null;
}

/**
 * Returns a guaranteed-valid access_token, refreshing if within
 * REFRESH_THRESHOLD_MS of expiry. Throws BlingNotConnectedError if no
 * token is stored at all (Felipe hasn't run the OAuth dance yet).
 *
 * Race note: if two serverless invocations refresh simultaneously, the
 * second one's `refresh_token` becomes invalid the moment Bling rotates
 * it. Both invocations end up with a usable access_token (each got their
 * own response), but the one whose refresh_token was rotated out will
 * fail on its NEXT refresh — at which point Felipe has to re-authorize.
 * Acceptable for current low-volume webhook traffic; revisit when
 * concurrency grows (option: distributed lock via pg advisory lock).
 */
export async function getValidAccessToken(): Promise<string> {
  const stored = await loadStoredToken();
  if (!stored) throw new BlingNotConnectedError();

  const expiresAtMs = new Date(stored.expires_at).getTime();
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs > REFRESH_THRESHOLD_MS) {
    return stored.access_token;
  }
  const refreshed = await refreshAccessToken(stored.refresh_token);
  return refreshed.access_token;
}

/**
 * Returns true if a token is stored (regardless of validity). Used by the
 * /admin UI to show "Conectado" vs "Conectar Bling".
 */
export async function isConnected(): Promise<boolean> {
  try {
    const stored = await loadStoredToken();
    return stored != null;
  } catch {
    return false;
  }
}

export interface ConnectionStatus {
  connected: boolean;
  expires_at: string | null;
  scope: string | null;
}

/**
 * Returns connection status for /admin UI. Always returns the same shape
 * (with nulls when disconnected) so consumers don't have to narrow.
 */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const stored = await loadStoredToken().catch(() => null);
  if (!stored) return { connected: false, expires_at: null, scope: null };
  return {
    connected: true,
    expires_at: stored.expires_at,
    scope: stored.scope,
  };
}
