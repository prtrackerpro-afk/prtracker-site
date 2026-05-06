/**
 * Shopee Open Platform OAuth (Authorization flow).
 *
 * Docs: https://open.shopee.com/documents/v2/v2.api?module=63&type=2
 *
 * Diferenças vs ML/TikTok:
 *   - Authorize URL não usa OAuth padrão — usa partner_id + redirect + sign
 *     (HMAC-SHA256 do partner_id + path + timestamp + partner_key)
 *   - Token exchange retorna shop_id (não user_id) — é multi-shop por
 *     natureza
 *   - Access token: 4h
 *   - Refresh token: 30 dias, rotaciona a cada uso
 *   - Endpoint Brasil: partner.shopeemobile.com (region BR)
 *
 * Storage: row em public.shopee_oauth_tokens keyed por shop_id.
 * Service-role only.
 */

import crypto from "node:crypto";
import { getAdminSupabase } from "~/lib/supabase/server";

// Shopee Brasil usa endpoint NA (partner.shopeemobile.com) — region detectada
// pelo shop_id durante o flow. Pra produção, conferir com Felipe se conta
// está em região 'BR' (default Brasil).
const PARTNER_HOST = "https://partner.shopeemobile.com";
const AUTHORIZE_PATH = "/api/v2/shop/auth_partner";
const TOKEN_PATH = "/api/v2/auth/token/get";
const REFRESH_PATH = "/api/v2/auth/access_token/get";

// Refresh proativamente quando faltar < 10 min pra expirar (access dura 4h).
const REFRESH_THRESHOLD_MS = 10 * 60 * 1000;

export interface ShopeeOAuthConfig {
  partnerId: number;
  partnerKey: string;
  redirectUri: string;
}

interface ShopeeTokenResponse {
  access_token: string;
  refresh_token: string;
  expire_in: number; // seconds (4h padrão)
  shop_id?: number;
  merchant_id?: number;
  request_id?: string;
  error?: string;
  message?: string;
}

interface StoredToken {
  shop_id: number;
  shop_name: string | null;
  region: string;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string;
  refresh_token_expires_at: string;
}

function getConfig(): ShopeeOAuthConfig {
  const partnerIdRaw = import.meta.env.SHOPEE_PARTNER_ID;
  const partnerKey = import.meta.env.SHOPEE_PARTNER_KEY;
  const redirectUri = import.meta.env.SHOPEE_REDIRECT_URI ??
    "https://prtracker.com.br/api/admin/shopee/callback";
  if (!partnerIdRaw || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY obrigatórios em env vars");
  }
  return {
    partnerId: Number(partnerIdRaw),
    partnerKey,
    redirectUri,
  };
}

/**
 * Computa signature Shopee: HMAC-SHA256(partner_key, partner_id + path + timestamp).
 * Usado em endpoints unprotected (auth flow). Endpoints protected adicionam
 * access_token + shop_id ao base string — ver lib/shopee/api.ts.
 */
export function computeAuthSignature(p: {
  partnerId: number;
  partnerKey: string;
  path: string;
  timestamp: number;
}): string {
  const baseString = `${p.partnerId}${p.path}${p.timestamp}`;
  return crypto
    .createHmac("sha256", p.partnerKey)
    .update(baseString)
    .digest("hex");
}

/**
 * Constrói URL de autorização Shopee. State validation feito pelo caller
 * (cookie nonce HttpOnly pra prevenir CSRF — passado como query param).
 *
 * Shopee NÃO suporta state nativo no flow de auth, então usamos cookie
 * pra validar — Shopee só valida sign + partner_id + redirect.
 */
export function buildAuthorizeUrl(): string {
  const cfg = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = computeAuthSignature({
    partnerId: cfg.partnerId,
    partnerKey: cfg.partnerKey,
    path: AUTHORIZE_PATH,
    timestamp,
  });
  const params = new URLSearchParams({
    partner_id: String(cfg.partnerId),
    timestamp: String(timestamp),
    sign,
    redirect: cfg.redirectUri,
  });
  return `${PARTNER_HOST}${AUTHORIZE_PATH}?${params.toString()}`;
}

/**
 * Troca authorization code por tokens. Após seller autorizar, Shopee
 * redireciona pro `redirect` com `?code=` + `?shop_id=` (não tem state).
 */
export async function exchangeCodeForToken(
  code: string,
  shopId: number,
): Promise<ShopeeTokenResponse> {
  const cfg = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = computeAuthSignature({
    partnerId: cfg.partnerId,
    partnerKey: cfg.partnerKey,
    path: TOKEN_PATH,
    timestamp,
  });
  const url = `${PARTNER_HOST}${TOKEN_PATH}?partner_id=${cfg.partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const body = {
    code,
    shop_id: shopId,
    partner_id: cfg.partnerId,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopee token exchange failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as ShopeeTokenResponse;
  if (json.error) {
    throw new Error(`Shopee token error: ${json.error} ${json.message}`);
  }
  // Shopee retorna shop_id no response; quando nem assim vier, usar param
  json.shop_id = json.shop_id ?? shopId;
  return json;
}

export async function refreshAccessToken(
  refreshToken: string,
  shopId: number,
): Promise<ShopeeTokenResponse> {
  const cfg = getConfig();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = computeAuthSignature({
    partnerId: cfg.partnerId,
    partnerKey: cfg.partnerKey,
    path: REFRESH_PATH,
    timestamp,
  });
  const url = `${PARTNER_HOST}${REFRESH_PATH}?partner_id=${cfg.partnerId}&timestamp=${timestamp}&sign=${sign}`;
  const body = {
    refresh_token: refreshToken,
    shop_id: shopId,
    partner_id: cfg.partnerId,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopee refresh failed: ${res.status} ${text}`);
  }
  const json = (await res.json()) as ShopeeTokenResponse;
  if (json.error) {
    throw new Error(`Shopee refresh error: ${json.error} ${json.message}`);
  }
  json.shop_id = json.shop_id ?? shopId;
  return json;
}

export async function persistToken(
  token: ShopeeTokenResponse,
  shopName?: string,
): Promise<void> {
  if (!token.shop_id) throw new Error("persistToken: shop_id ausente no token response");
  const supabase = getAdminSupabase();
  const now = Date.now();
  const accessExpires = new Date(now + token.expire_in * 1000).toISOString();
  // Refresh expira em 30 dias. Como rotaciona a cada uso, sempre renova.
  const refreshExpires = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString();

  const row: StoredToken = {
    shop_id: token.shop_id,
    shop_name: shopName ?? null,
    region: "BR",
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    access_token_expires_at: accessExpires,
    refresh_token_expires_at: refreshExpires,
  };

  const { error } = await supabase
    .from("shopee_oauth_tokens")
    .upsert(row, { onConflict: "shop_id" });
  if (error) throw new Error(`Persist Shopee token failed: ${error.message}`);
}

async function getStoredToken(): Promise<StoredToken | null> {
  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("shopee_oauth_tokens")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[shopee/oauth] getStoredToken:", error.message);
    return null;
  }
  return data as StoredToken | null;
}

export async function getValidAccess(): Promise<{
  accessToken: string;
  shopId: number;
}> {
  const stored = await getStoredToken();
  if (!stored) throw new Error("Shopee not connected — run OAuth flow first");

  const expiresAt = new Date(stored.access_token_expires_at).getTime();
  const now = Date.now();
  if (expiresAt - now > REFRESH_THRESHOLD_MS) {
    return { accessToken: stored.access_token, shopId: stored.shop_id };
  }

  const fresh = await refreshAccessToken(stored.refresh_token, stored.shop_id);
  await persistToken(fresh, stored.shop_name ?? undefined);
  return { accessToken: fresh.access_token, shopId: fresh.shop_id! };
}

export async function isConnected(): Promise<boolean> {
  return (await getStoredToken()) !== null;
}

export async function getConnectionStatus(): Promise<{
  connected: boolean;
  shopId?: number;
  shopName?: string;
  region?: string;
  accessExpiresAt?: string;
  refreshExpiresAt?: string;
}> {
  const stored = await getStoredToken();
  if (!stored) return { connected: false };
  return {
    connected: true,
    shopId: stored.shop_id,
    shopName: stored.shop_name ?? undefined,
    region: stored.region,
    accessExpiresAt: stored.access_token_expires_at,
    refreshExpiresAt: stored.refresh_token_expires_at,
  };
}
