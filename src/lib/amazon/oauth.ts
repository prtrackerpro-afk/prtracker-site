/**
 * Amazon Login with Amazon (LWA) OAuth — SP-API authorization.
 *
 * Docs: https://developer-docs.amazon.com/sp-api/docs/website-authorization-workflow
 *
 * Flow:
 *   1. Seller clica "Conectar Amazon" → redirecionado pra
 *      https://sellercentral.amazon.com/apps/authorize/consent?application_id=...
 *   2. Após autorizar, Amazon redireciona pro `redirect_uri` com:
 *      ?selling_partner_id=...&spapi_oauth_code=...&state=...
 *   3. Trocamos `spapi_oauth_code` por LWA tokens via
 *      POST https://api.amazon.com/auth/o2/token (form-urlencoded):
 *      grant_type=authorization_code + code + client_id + client_secret + redirect_uri
 *      → retorna access_token + refresh_token (refresh NÃO EXPIRA)
 *   4. Persistimos refresh_token + access_token + expires_at
 *
 * Token lifetime:
 *   - access_token: 1 hora
 *   - refresh_token: ∞ (não expira até seller revogar autorização)
 *
 * IMPORTANTE — SP-API requires AWS SigV4 signing:
 *   Pra chamar https://sellingpartnerapi-na.amazon.com/* não basta o
 *   LWA access_token. Precisa também:
 *     - Header `x-amz-access-token` com o LWA access
 *     - Header `Authorization` com AWS SigV4 signature usando
 *       AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY do IAM user/role
 *       que tem `execute-api:Invoke` no SP-API resource ARN.
 *   Esta lib só implementa LWA. Ver lib/amazon/api.ts pra TODO de SigV4.
 *
 * Storage: row em public.amazon_oauth_tokens keyed por selling_partner_id.
 */

import { getAdminSupabase } from "~/lib/supabase/server";

const AMAZON_AUTH_HOST = "https://sellercentral.amazon.com.br";
const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

const REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5min antes de expirar

export interface AmazonLWAConfig {
  appId: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface LWATokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number; // segundos (3600 = 1h)
}

interface StoredToken {
  selling_partner_id: string;
  marketplace_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
}

function getConfig(): AmazonLWAConfig {
  const appId = import.meta.env.AMAZON_SPAPI_APP_ID;
  const clientId = import.meta.env.AMAZON_LWA_CLIENT_ID;
  const clientSecret = import.meta.env.AMAZON_LWA_CLIENT_SECRET;
  const redirectUri = import.meta.env.AMAZON_REDIRECT_URI ??
    "https://prtracker.com.br/api/admin/amazon/callback";
  if (!appId || !clientId || !clientSecret) {
    throw new Error(
      "AMAZON_SPAPI_APP_ID + AMAZON_LWA_CLIENT_ID + AMAZON_LWA_CLIENT_SECRET obrigatórios em env vars",
    );
  }
  return { appId, clientId, clientSecret, redirectUri };
}

/**
 * URL pro seller autorizar o app. Diferente de OAuth padrão:
 * Amazon usa application_id ao invés de client_id, e marketplace
 * é seller_central regional (.com.br pra Brasil).
 *
 * `version=beta` ativa o modo dev-sandbox enquanto app não publicado.
 * Remover quando app for aprovado pra produção.
 */
export function buildAuthorizeUrl(state: string, devMode: boolean = true): string {
  const cfg = getConfig();
  const params = new URLSearchParams({
    application_id: cfg.appId,
    state,
    redirect_uri: cfg.redirectUri,
  });
  if (devMode) params.set("version", "beta");
  return `${AMAZON_AUTH_HOST}/apps/authorize/consent?${params.toString()}`;
}

/**
 * Troca spapi_oauth_code por refresh_token + access_token. Chamado pelo
 * callback. Diferença vs ML/Shopee: code é nomeado `spapi_oauth_code` no
 * query param do redirect, mas no token exchange continua sendo `code`.
 */
export async function exchangeCodeForToken(code: string): Promise<LWATokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
  });
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon LWA token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as LWATokenResponse;
}

export async function refreshAccessToken(refreshToken: string): Promise<LWATokenResponse> {
  const cfg = getConfig();
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
  });
  const res = await fetch(LWA_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon LWA refresh failed: ${res.status} ${text}`);
  }
  return (await res.json()) as LWATokenResponse;
}

export async function persistToken(
  token: LWATokenResponse,
  sellingPartnerId: string,
  marketplaceId: string = "A2Q3Y263D00KWC",
): Promise<void> {
  const supabase = getAdminSupabase();
  const accessExpires = new Date(Date.now() + token.expires_in * 1000).toISOString();
  const row: StoredToken = {
    selling_partner_id: sellingPartnerId,
    marketplace_id: marketplaceId,
    refresh_token: token.refresh_token,
    access_token: token.access_token,
    access_token_expires_at: accessExpires,
  };
  const { error } = await supabase
    .from("amazon_oauth_tokens")
    .upsert(row, { onConflict: "selling_partner_id" });
  if (error) throw new Error(`Persist Amazon token failed: ${error.message}`);
}

async function getStoredToken(): Promise<StoredToken | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("amazon_oauth_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[amazon/oauth] getStoredToken:", error.message);
    return null;
  }
  return data as StoredToken | null;
}

/**
 * Retorna access token válido — refresha se < 5min pra expirar.
 * Refresh token LWA não expira, então sempre temos como renovar.
 */
export async function getValidAccess(): Promise<{
  accessToken: string;
  sellingPartnerId: string;
  marketplaceId: string;
}> {
  const stored = await getStoredToken();
  if (!stored) throw new Error("Amazon not connected — run LWA OAuth flow first");

  const expiresAt = stored.access_token_expires_at
    ? new Date(stored.access_token_expires_at).getTime()
    : 0;
  const now = Date.now();

  if (stored.access_token && expiresAt - now > REFRESH_THRESHOLD_MS) {
    return {
      accessToken: stored.access_token,
      sellingPartnerId: stored.selling_partner_id,
      marketplaceId: stored.marketplace_id,
    };
  }

  // Refresh
  const fresh = await refreshAccessToken(stored.refresh_token);
  await persistToken(fresh, stored.selling_partner_id, stored.marketplace_id);
  return {
    accessToken: fresh.access_token,
    sellingPartnerId: stored.selling_partner_id,
    marketplaceId: stored.marketplace_id,
  };
}

export async function isConnected(): Promise<boolean> {
  return (await getStoredToken()) !== null;
}

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  sellingPartnerId?: string;
  marketplaceId?: string;
  accessExpiresAt?: string;
}> {
  const stored = await getStoredToken();
  if (!stored) return { connected: false };
  return {
    connected: true,
    sellingPartnerId: stored.selling_partner_id,
    marketplaceId: stored.marketplace_id,
    accessExpiresAt: stored.access_token_expires_at ?? undefined,
  };
}
