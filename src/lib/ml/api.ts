/**
 * Mercado Livre API HTTP client.
 *
 * Diferenças vs TikTok/Bling:
 *   - Sem signature HMAC — só Bearer token via Authorization header
 *   - Sem shop_cipher — seller_id já vai implícito no token
 *   - Site fixo: MLB (Mercado Livre Brasil)
 *
 * Refresh automático on 401 (token expirado entre check e uso).
 * Retry on 429 com backoff exponencial.
 */

import { getValidAccess } from "./oauth";

const BASE_URL = "https://api.mercadolivre.com";

export class MLApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "MLApiError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Override do access token (caso flow precise de token específico, ex: refresh manual). */
  accessToken?: string;
  /** Skip retry on 401. Default false (retry once). */
  skipAuthRetry?: boolean;
}

export async function mlFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", query, body, accessToken, skipAuthRetry } = options;

  let token = accessToken;
  if (!token) {
    const { accessToken: t } = await getValidAccess();
    token = t;
  }

  const url = new URL(path.startsWith("http") ? path : `${BASE_URL}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) {
        url.searchParams.set(k, String(v));
      }
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
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

  if (res.status === 401 && !skipAuthRetry && !accessToken) {
    // Token pode ter expirado entre o check do getValidAccess e o uso.
    // Força refresh e retry uma vez.
    const { accessToken: fresh } = await getValidAccess();
    return mlFetch<T>(path, { ...options, accessToken: fresh, skipAuthRetry: true });
  }

  if (res.status === 429) {
    // Rate-limit: espera 1s e retry uma vez.
    await new Promise((r) => setTimeout(r, 1000));
    return mlFetch<T>(path, { ...options, skipAuthRetry: true });
  }

  if (!res.ok) {
    let errorBody: unknown;
    try {
      errorBody = await res.json();
    } catch {
      errorBody = await res.text();
    }
    throw new MLApiError(
      `ML API ${method} ${path} → ${res.status}`,
      res.status,
      errorBody,
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
