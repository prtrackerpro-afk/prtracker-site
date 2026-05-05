/**
 * Mercado Livre OAuth2 (Authorization Code flow).
 *
 * Docs: https://developers.mercadolivre.com.br/pt_br/autenticacao-e-autorizacao
 *
 * Flow:
 *   1. Seller clicks Authorize → redirected to auth.mercadolivre.com.br/authorization
 *      with response_type=code, client_id, redirect_uri, state.
 *   2. ML redirects back with `code` query param.
 *   3. Exchange code for access_token via POST /oauth/token (form-urlencoded)
 *      grant_type=authorization_code + client_id + client_secret + code + redirect_uri.
 *      → returns access_token + refresh_token + user_id + scope.
 *   4. Subsequent API calls use Bearer token via Authorization header.
 *
 * Token lifetime:
 *   - access_token: 6 hours (similar a Bling)
 *   - refresh_token: 6 months. ML rotaciona a cada uso (igual TikTok).
 *
 * Auth response shape:
 *   {
 *     "access_token": "...",
 *     "token_type": "Bearer",
 *     "expires_in": 21600,    // segundos (6h)
 *     "scope": "offline_access read write",
 *     "user_id": 123456789,
 *     "refresh_token": "..."
 *   }
 *
 * Storage: row em public.ml_oauth_tokens keyed por seller_id (user_id ML).
 * Service-role only.
 */

import { getAdminSupabase } from "~/lib/supabase/server";

const SITE_ID = "MLB"; // Mercado Livre Brasil
const AUTHORIZE_URL = `https://auth.mercadolivre.com.br/authorization`;
const TOKEN_URL = "https://api.mercadolivre.com/oauth/token";

// Refresh proativamente quando faltar < 10 min pra expirar (access dura 6h).
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

export interface MLOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface MLTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number; // segundos
  scope: string;
  user_id: number;
  refresh_token: string;
}

interface StoredToken {
  seller_id: number;
  nickname: string | null;
  site_id: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

function getConfig(): MLOAuthConfig {
  const clientId = import.meta.env.ML_CLIENT_ID;
  const clientSecret = import.meta.env.ML_CLIENT_SECRET;
  const redirectUri = import.meta.env.ML_REDIRECT_URI ??
    "https://prtracker.com.br/api/admin/ml/callback";
  if (!clientId || !clientSecret) {
    throw new Error("ML_CLIENT_ID + ML_CLIENT_SECRET obrigatórios em env vars");
  }
  return { clientId, clientSecret, redirectUri };
}

/**
 * Constrói URL de autorização ML. State validation feito pelo caller
 * (usar nonce HttpOnly cookie pra prevenir CSRF).
 */
export function buildAuthorizeUrl(state: string): string {
  const cfg = getConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Troca authorization code por tokens. Chamado pelo callback após o
 * usuário autorizar. ML retorna user_id (seller_id numérico).
 */
export async function exchangeCodeForToken(code: string): Promise<MLTokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ML token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as MLTokenResponse;
}

/**
 * Refresh do access token usando refresh_token. ML rotaciona — sempre
 * persistir o novo refresh_token retornado.
 */
export async function refreshAccessToken(refreshToken: string): Promise<MLTokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ML refresh token failed: ${res.status} ${text}`);
  }
  return (await res.json()) as MLTokenResponse;
}

/**
 * Persiste tokens no Supabase. Após exchange ou refresh, chama isto.
 * `nickname` vem de uma chamada separada GET /users/{user_id}.
 */
export async function persistToken(
  token: MLTokenResponse,
  nickname?: string,
): Promise<void> {
  const supabase = getAdminSupabase();
  const now = Date.now();
  const accessExpires = new Date(now + token.expires_in * 1000).toISOString();
  // Refresh expira em 6 meses (~180 dias). ML não retorna isso explicitamente
  // no payload — assumimos 180d em cada uso (como rotaciona, sempre renova).
  const refreshExpires = new Date(now + 180 * 24 * 60 * 60 * 1000).toISOString();

  const row: StoredToken = {
    seller_id: token.user_id,
    nickname: nickname ?? null,
    site_id: SITE_ID,
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    access_token_expires_at: accessExpires,
    refresh_token_expires_at: refreshExpires,
  };

  const { error } = await supabase
    .from("ml_oauth_tokens")
    .upsert(row, { onConflict: "seller_id" });
  if (error) throw new Error(`Persist ML token failed: ${error.message}`);
}

/**
 * Recupera o registro do token ativo. Hoje retorna o primeiro encontrado
 * (Felipe tem 1 conta ML). Se virar multi-seller, parametrizar.
 */
async function getStoredToken(): Promise<StoredToken | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("ml_oauth_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[ml/oauth] getStoredToken:", error.message);
    return null;
  }
  return data as StoredToken | null;
}

/**
 * Retorna access_token válido — refresha automaticamente se faltar < 10min
 * pra expirar. Lança erro se não houver token persistido (não conectado).
 */
export async function getValidAccess(): Promise<{ accessToken: string; sellerId: number }> {
  const stored = await getStoredToken();
  if (!stored) throw new Error("ML not connected — run OAuth flow first");

  const expiresAt = new Date(stored.access_token_expires_at).getTime();
  const now = Date.now();
  if (expiresAt - now > REFRESH_THRESHOLD_MS) {
    return { accessToken: stored.access_token, sellerId: stored.seller_id };
  }

  // Refresh proativo
  const fresh = await refreshAccessToken(stored.refresh_token);
  await persistToken(fresh, stored.nickname ?? undefined);
  return { accessToken: fresh.access_token, sellerId: fresh.user_id };
}

export async function isConnected(): Promise<boolean> {
  const stored = await getStoredToken();
  return stored !== null;
}

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  sellerId?: number;
  nickname?: string;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
}> {
  const stored = await getStoredToken();
  if (!stored) return { connected: false };
  return {
    connected: true,
    sellerId: stored.seller_id,
    nickname: stored.nickname ?? undefined,
    accessExpiresAt: stored.access_token_expires_at,
    refreshExpiresAt: stored.refresh_token_expires_at,
  };
}
