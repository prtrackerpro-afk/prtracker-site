/**
 * Step 1 of Mercado Livre OAuth — admin clica "Conectar Mercado Livre" e cai aqui.
 *
 * Gera um CSRF state, persiste em cookie HttpOnly de curta duração, e
 * redireciona pro authorize URL do ML. Após aprovação do seller,
 * ML redireciona pra /api/admin/ml/callback com `?code=` + `?state=`.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { buildAuthorizeUrl } from "~/lib/ml/oauth";

export const prerender = false;

const STATE_COOKIE = "ml_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 min

export const GET: APIRoute = async ({ cookies, redirect }) => {
  let url: string;
  let state: string;
  try {
    state = crypto.randomBytes(24).toString("hex");
    url = buildAuthorizeUrl(state);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return redirect(
      `/admin/ml?ml=config_missing&msg=${encodeURIComponent(msg)}`,
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
