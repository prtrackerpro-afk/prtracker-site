/**
 * TikTok Shop Open Platform OAuth2 (Authorization Code flow).
 *
 * Docs: https://partner.tiktokshop.com/docv2/page/64f199555cee8202be4be3ed
 *
 * Flow (TikTok-specific quirks vs Bling):
 *   1. Seller clicks Authorize → redirected to auth.tiktok-shops.com/oauth/authorize
 *      with app_key + redirect_uri + state.
 *   2. TikTok redirects back to redirect_uri with `code` (NOT `auth_code` — older
 *      docs may say auth_code, the latest v2 uses `code` query param).
 *   3. Exchange code for access_token via GET /api/v2/token/get com
 *      app_key + app_secret + auth_code + grant_type=authorized_code como
 *      query params (TikTok usa GET nos endpoints de auth, não POST — uma
 *      peculiaridade vs OAuth padrão).
 *      → returns access_token + refresh_token + open_id + seller_name + shop_id.
 *   4. Tokens scoped per shop_cipher (encrypted shop ID). All subsequent API
 *      calls must pass shop_cipher as a query param.
 *
 * Token lifetime:
 *   - access_token: 7 days
 *   - refresh_token: 365 days (only ROTATES on use, doesn't shorten)
 *
 * Auth response shape (different from Bling — no `expires_in` in seconds!):
 *   {
 *     "access_token": "...",
 *     "access_token_expire_in": 1234567890, // UNIX TS
 *     "refresh_token": "...",
 *     "refresh_token_expire_in": 1234567890, // UNIX TS
 *     "open_id": "...",
 *     "seller_name": "PR Tracker",
 *     "seller_base_region": "BR",
 *     "user_type": 0
 *   }
 *
 * Storage: row in public.tiktok_oauth_tokens keyed by shop_id (or 'singleton'
 * if Felipe only has 1 shop). Service-role only.
 */

import crypto from "node:crypto";
import { getAdminSupabase } from "~/lib/supabase/server";

// Brasil/Sudamerica usa o endpoint global. TikTok Shop ainda não cria endpoint
// regional separado pra BR (Apr/2026). Pode mudar quando expandir; nesse caso
// mover pra env var.
const AUTHORIZE_URL = "https://services.us.tiktokshop.com/open/authorize";
const TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
const REFRESH_TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/refresh";
const OPEN_API_BASE = "https://open-api.tiktokglobalshop.com";

// Refresh proativamente quando faltar < 1 dia pra expirar (access dura 7d).
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface TikTokOAuthConfig {
  appKey: string;
  appSecret: string;
  redirectUri: string;
}

/**
 * Resposta crua do endpoint de token TikTok. Os timestamps de expiração
 * são UNIX seconds (não duration like Bling), então convertemos pra
 * ISO antes de persistir.
 */
export interface TikTokTokenResponse {
  access_token: string;
  access_token_expire_in: number; // UNIX timestamp seconds
  refresh_token: string;
  refresh_token_expire_in: number; // UNIX timestamp seconds
  open_id: string;
  seller_name?: string;
  seller_base_region?: string;
  user_type?: number;
  shop_list?: Array<{
    id: string;
    name: string;
    region: string;
    cipher: string;
  }>;
}

interface StoredToken {
  shop_id: string;
  shop_cipher: string;
  shop_name: string | null;
  access_token: string;
  refresh_token: string;
  access_token_expires_at: string; // ISO
  refresh_token_expires_at: string; // ISO
  seller_name: string | null;
  region: string | null;
}

export class TikTokOAuthError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly body?: string,
  ) {
    super(message);
    this.name = "TikTokOAuthError";
  }
}

export class TikTokNotConnectedError extends Error {
  constructor() {
    super("TikTok Shop não está conectado. Acesse /admin/tiktok → Conectar.");
    this.name = "TikTokNotConnectedError";
  }
}

export function getOAuthConfig(): TikTokOAuthConfig {
  const appKey = import.meta.env.TIKTOK_APP_KEY || process.env.TIKTOK_APP_KEY;
  const appSecret =
    import.meta.env.TIKTOK_APP_SECRET || process.env.TIKTOK_APP_SECRET;
  const redirectUri =
    import.meta.env.TIKTOK_REDIRECT_URI || process.env.TIKTOK_REDIRECT_URI;

  if (!appKey || !appSecret || !redirectUri) {
    throw new TikTokOAuthError(
      "TIKTOK_APP_KEY, TIKTOK_APP_SECRET e TIKTOK_REDIRECT_URI são obrigatórios. " +
        "Cadastre o app em partner.tiktokshop.com e configure no Vercel.",
    );
  }
  return { appKey, appSecret, redirectUri };
}

/**
 * URL que o seller clica pra autorizar o app dentro do TikTok Shop.
 * `state` é um CSRF token round-tripped — gere no /connect e valide no /callback.
 */
export function buildAuthorizeUrl(state: string): string {
  const cfg = getOAuthConfig();
  const params = new URLSearchParams({
    app_key: cfg.appKey,
    state,
  });
  // TikTok não exige redirect_uri no query — usa o cadastrado no app.
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

async function tokenRequest<T>(
  url: string,
  params: Record<string, string | number>,
): Promise<T> {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, String(v));
  }
  const res = await fetch(u.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TikTokOAuthError(
      `TikTok token endpoint failed: ${res.status}`,
      res.status,
      text,
    );
  }
  let parsed: { code?: number; message?: string; data?: T };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TikTokOAuthError(
      "TikTok token response was not JSON",
      res.status,
      text,
    );
  }
  // TikTok envelopa em { code, message, data }. code !== 0 = erro mesmo com HTTP 200.
  if (parsed.code !== 0 && parsed.code != null) {
    throw new TikTokOAuthError(
      `TikTok token error code=${parsed.code}: ${parsed.message ?? "unknown"}`,
      res.status,
      text,
    );
  }
  if (!parsed.data) {
    throw new TikTokOAuthError("TikTok token response missing data", res.status, text);
  }
  return parsed.data;
}

/**
 * Exchange the `code` returned on /callback for the initial access_token.
 * Persists token + shop info to Supabase. Returns the shop_id Felipe is
 * authenticated as.
 *
 * TikTok v2 separa user-level tokens (este endpoint) de shop list — se a
 * resposta vier sem `shop_list`, busca via /authorization/202309/shops.
 */
export async function exchangeCodeForToken(code: string): Promise<StoredToken> {
  const cfg = getOAuthConfig();
  const tok = await tokenRequest<TikTokTokenResponse>(TOKEN_URL, {
    app_key: cfg.appKey,
    app_secret: cfg.appSecret,
    auth_code: code,
    grant_type: "authorized_code",
  });
  if (!tok.shop_list || tok.shop_list.length === 0) {
    tok.shop_list = await fetchAuthorizedShops(tok.access_token);
  }
  return await persistToken(tok);
}

/**
 * Lista as shops que o seller autorizou pro app. Chamada signed (HMAC-SHA256)
 * — não usa tiktokFetch porque ainda não temos shop_cipher no momento dessa
 * chamada (bootstrap).
 */
async function fetchAuthorizedShops(
  accessToken: string,
): Promise<NonNullable<TikTokTokenResponse["shop_list"]>> {
  const cfg = getOAuthConfig();
  const path = "/authorization/202309/shops";
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const queryForSig: Record<string, string> = {
    app_key: cfg.appKey,
    timestamp,
  };
  const sortedKeys = Object.keys(queryForSig).sort();
  const concatenated = sortedKeys.map((k) => `${k}${queryForSig[k]}`).join("");
  const raw = `${cfg.appSecret}${path}${concatenated}${cfg.appSecret}`;
  const sign = crypto
    .createHmac("sha256", cfg.appSecret)
    .update(raw)
    .digest("hex");

  const url = new URL(path, OPEN_API_BASE);
  url.searchParams.set("app_key", cfg.appKey);
  url.searchParams.set("timestamp", timestamp);
  url.searchParams.set("sign", sign);

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-tts-access-token": accessToken,
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new TikTokOAuthError(
      `TikTok /authorization/202309/shops failed: ${res.status}`,
      res.status,
      text,
    );
  }
  let parsed: {
    code?: number;
    message?: string;
    data?: {
      shops?: Array<{
        id?: string;
        name?: string;
        region?: string;
        cipher?: string;
      }>;
    };
  };
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TikTokOAuthError(
      "TikTok shops response was not JSON",
      res.status,
      text,
    );
  }
  if (parsed.code !== 0 && parsed.code != null) {
    throw new TikTokOAuthError(
      `TikTok shops error code=${parsed.code}: ${parsed.message ?? "unknown"}`,
      res.status,
      text,
    );
  }
  const shops = parsed.data?.shops ?? [];
  if (shops.length === 0) {
    throw new TikTokOAuthError(
      "TikTok /authorization/202309/shops retornou lista vazia — seller não autorizou nenhuma loja?",
    );
  }
  return shops
    .map((s) => ({
      id: s.id ?? "",
      name: s.name ?? "",
      region: s.region ?? "BR",
      cipher: s.cipher ?? "",
    }))
    .filter((s) => s.id && s.cipher);
}

/**
 * Refresh expired access_token. TikTok rotates refresh_token on each call —
 * persist the new one or next refresh fails.
 */
export async function refreshAccessToken(
  currentRefreshToken: string,
): Promise<StoredToken> {
  const cfg = getOAuthConfig();
  const tok = await tokenRequest<TikTokTokenResponse>(REFRESH_TOKEN_URL, {
    app_key: cfg.appKey,
    app_secret: cfg.appSecret,
    refresh_token: currentRefreshToken,
    grant_type: "refresh_token",
  });
  if (!tok.shop_list || tok.shop_list.length === 0) {
    tok.shop_list = await fetchAuthorizedShops(tok.access_token);
  }
  return await persistToken(tok);
}

async function persistToken(tok: TikTokTokenResponse): Promise<StoredToken> {
  // shop_list é o que importa pra fluxo multi-shop. Pra PR Tracker (1 shop só)
  // pegamos o primeiro. Quando expandir pra múltiplas lojas, refatora pra
  // persistir todas e expor selector na UI.
  const shop = tok.shop_list?.[0];
  if (!shop) {
    throw new TikTokOAuthError(
      "TikTok token response sem shop_list — seller não autorizou nenhuma loja?",
    );
  }

  const sb = getAdminSupabase();
  const row = {
    shop_id: shop.id,
    shop_cipher: shop.cipher,
    shop_name: shop.name,
    region: shop.region,
    open_id: tok.open_id,
    seller_name: tok.seller_name ?? null,
    access_token: tok.access_token,
    refresh_token: tok.refresh_token,
    access_token_expires_at: new Date(
      tok.access_token_expire_in * 1000,
    ).toISOString(),
    refresh_token_expires_at: new Date(
      tok.refresh_token_expire_in * 1000,
    ).toISOString(),
    obtained_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const { error } = await sb
    .from("tiktok_oauth_tokens")
    .upsert(row, { onConflict: "shop_id" });
  if (error) {
    throw new TikTokOAuthError(
      `Failed to persist TikTok token to Supabase: ${error.message}`,
    );
  }
  return {
    shop_id: row.shop_id,
    shop_cipher: row.shop_cipher,
    shop_name: row.shop_name,
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    access_token_expires_at: row.access_token_expires_at,
    refresh_token_expires_at: row.refresh_token_expires_at,
    seller_name: row.seller_name,
    region: row.region,
  };
}

async function loadStoredToken(): Promise<StoredToken | null> {
  // PR Tracker tem 1 shop só (BRLCXGLWNY). Quando virar multi-shop, recebe
  // shop_id como argumento e seleciona o row específico.
  const sb = getAdminSupabase();
  const { data, error } = await sb
    .from("tiktok_oauth_tokens")
    .select(
      "shop_id, shop_cipher, shop_name, access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, seller_name, region",
    )
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    throw new TikTokOAuthError(
      `Failed to load TikTok token from Supabase: ${error.message}`,
    );
  }
  return data as StoredToken | null;
}

/**
 * Returns guaranteed-valid access_token + shop_cipher (needed pra TODA chamada
 * de API TikTok). Throws TikTokNotConnectedError se OAuth nunca rodou.
 */
export async function getValidAccess(): Promise<{
  accessToken: string;
  shopCipher: string;
  shopId: string;
}> {
  const stored = await loadStoredToken();
  if (!stored) throw new TikTokNotConnectedError();

  const expiresAtMs = new Date(stored.access_token_expires_at).getTime();
  const remainingMs = expiresAtMs - Date.now();
  if (remainingMs > REFRESH_THRESHOLD_MS) {
    return {
      accessToken: stored.access_token,
      shopCipher: stored.shop_cipher,
      shopId: stored.shop_id,
    };
  }
  const refreshed = await refreshAccessToken(stored.refresh_token);
  return {
    accessToken: refreshed.access_token,
    shopCipher: refreshed.shop_cipher,
    shopId: refreshed.shop_id,
  };
}

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
  shop_id: string | null;
  shop_name: string | null;
  seller_name: string | null;
  region: string | null;
  access_expires_at: string | null;
  refresh_expires_at: string | null;
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const stored = await loadStoredToken().catch(() => null);
  if (!stored) {
    return {
      connected: false,
      shop_id: null,
      shop_name: null,
      seller_name: null,
      region: null,
      access_expires_at: null,
      refresh_expires_at: null,
    };
  }
  return {
    connected: true,
    shop_id: stored.shop_id,
    shop_name: stored.shop_name,
    seller_name: stored.seller_name,
    region: stored.region,
    access_expires_at: stored.access_token_expires_at,
    refresh_expires_at: stored.refresh_token_expires_at,
  };
}
