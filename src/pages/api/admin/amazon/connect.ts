/**
 * Step 1 of Amazon LWA OAuth — admin clica "Conectar Amazon" e cai aqui.
 *
 * Diferença vs ML/Shopee/TikTok: Amazon usa `application_id` ao invés de
 * `client_id` no authorize URL, e redireciona pra sellercentral.amazon.com.br
 * (region-specific).
 *
 * `version=beta` query param ativa modo dev-sandbox enquanto app SP-API não
 * está aprovado pra produção. Remover quando Amazon aprovar.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { buildAuthorizeUrl } from "~/lib/amazon/oauth";

export const prerender = false;

const STATE_COOKIE = "amazon_oauth_state";
const STATE_TTL_SECONDS = 600;

export const GET: APIRoute = async ({ cookies, redirect, url }) => {
  // Permite ?prod=1 pra forçar modo produção (sem ?version=beta) quando app aprovar.
  const devMode = url.searchParams.get("prod") !== "1";

  let authUrl: string;
  let state: string;
  try {
    state = crypto.randomBytes(24).toString("hex");
    authUrl = buildAuthorizeUrl(state, devMode);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return redirect(
      `/admin/amazon?amazon=config_missing&msg=${encodeURIComponent(msg)}`,
      302,
    );
  }

  cookies.set(STATE_COOKIE, state, {
    path: "/",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: STATE_TTL_SECONDS,
  });

  return redirect(authUrl, 302);
};
