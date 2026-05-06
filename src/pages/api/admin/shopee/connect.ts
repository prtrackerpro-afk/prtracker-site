/**
 * Step 1 of Shopee OAuth — admin clica "Conectar Shopee" e cai aqui.
 *
 * Shopee não suporta `state` nativo no flow de auth. Usamos cookie
 * HttpOnly de short-TTL pra prevenir CSRF (validado no callback). O
 * authorize URL é assinado com partner_key — Shopee valida sign +
 * partner_id + redirect.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { buildAuthorizeUrl } from "~/lib/shopee/oauth";

export const prerender = false;

const STATE_COOKIE = "shopee_oauth_state";
const STATE_TTL_SECONDS = 600;

export const GET: APIRoute = async ({ cookies, redirect }) => {
  let url: string;
  let state: string;
  try {
    state = crypto.randomBytes(24).toString("hex");
    url = buildAuthorizeUrl();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return redirect(
      `/admin/shopee?shopee=config_missing&msg=${encodeURIComponent(msg)}`,
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

  return redirect(url, 302);
};
