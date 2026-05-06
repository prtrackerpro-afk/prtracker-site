/**
 * Shopee Open Platform API V2 HTTP client (signed requests).
 *
 * Diferença de TikTok/ML/Bling: cada request precisa de signature
 * HMAC-SHA256 envolvendo:
 *   shop_signature = HMAC(partner_key, partner_id + path + timestamp + access_token + shop_id)
 *
 * Query params obrigatórios em todo request: partner_id, timestamp, sign,
 * access_token, shop_id.
 *
 * Refresh automático on 401 (token expirado entre check e uso).
 * Retry on rate-limit com backoff.
 */

import crypto from "node:crypto";
import { getValidAccess } from "./oauth";

const PARTNER_HOST = "https://partner.shopeemobile.com";

export class ShopeeApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ShopeeApiError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Override do access token + shop. */
  accessToken?: string;
  shopId?: number;
  skipAuthRetry?: boolean;
}

function getPartnerCreds(): { partnerId: number; partnerKey: string } {
  const partnerIdRaw = import.meta.env.SHOPEE_PARTNER_ID;
  const partnerKey = import.meta.env.SHOPEE_PARTNER_KEY;
  if (!partnerIdRaw || !partnerKey) {
    throw new Error("SHOPEE_PARTNER_ID + SHOPEE_PARTNER_KEY obrigatórios em env vars");
  }
  return { partnerId: Number(partnerIdRaw), partnerKey };
}

/**
 * Signature pra endpoints SHOP-LEVEL (autenticados):
 *   HMAC(partner_key, partner_id + path + timestamp + access_token + shop_id)
 */
function computeShopSignature(p: {
  partnerId: number;
  partnerKey: string;
  path: string;
  timestamp: number;
  accessToken: string;
  shopId: number;
}): string {
  const baseString = `${p.partnerId}${p.path}${p.timestamp}${p.accessToken}${p.shopId}`;
  return crypto
    .createHmac("sha256", p.partnerKey)
    .update(baseString)
    .digest("hex");
}

export async function shopeeFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", query, body, skipAuthRetry } = options;

  let accessToken = options.accessToken;
  let shopId = options.shopId;
  if (!accessToken || !shopId) {
    const v = await getValidAccess();
    accessToken = v.accessToken;
    shopId = v.shopId;
  }

  const { partnerId, partnerKey } = getPartnerCreds();
  const timestamp = Math.floor(Date.now() / 1000);
  const sign = computeShopSignature({
    partnerId,
    partnerKey,
    path,
    timestamp,
    accessToken,
    shopId,
  });

  const url = new URL(`${PARTNER_HOST}${path}`);
  url.searchParams.set("partner_id", String(partnerId));
  url.searchParams.set("timestamp", String(timestamp));
  url.searchParams.set("sign", sign);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("shop_id", String(shopId));
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    json = await res.text();
  }

  if (!res.ok) {
    throw new ShopeeApiError(
      `Shopee API ${method} ${path} → ${res.status}`,
      res.status,
      json,
    );
  }

  const errResp = json as { error?: string; message?: string };
  if (errResp.error === "error_auth" && !skipAuthRetry && !options.accessToken) {
    const v = await getValidAccess();
    return shopeeFetch<T>(path, {
      ...options,
      accessToken: v.accessToken,
      shopId: v.shopId,
      skipAuthRetry: true,
    });
  }

  if (errResp.error) {
    throw new ShopeeApiError(
      `Shopee API ${method} ${path} → ${errResp.error}: ${errResp.message ?? ""}`,
      res.status,
      json,
    );
  }

  return json as T;
}
