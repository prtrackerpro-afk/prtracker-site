/**
 * Step 1 of TikTok OAuth — admin clica "Conectar TikTok" e cai aqui.
 *
 * Gera um CSRF state, persiste em cookie HttpOnly de curta duração, e
 * redireciona pro authorize URL do TikTok Shop. Após aprovação do seller,
 * TikTok redireciona pra /api/admin/tiktok/callback com `?code=` + `?state=`.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { buildAuthorizeUrl, TikTokOAuthError } from "~/lib/tiktok/oauth";

export const prerender = false;

const STATE_COOKIE = "tiktok_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 min

export const GET: APIRoute = async ({ cookies, redirect }) => {
  let url: string;
  let state: string;
  try {
    state = crypto.randomBytes(24).toString("hex");
    url = buildAuthorizeUrl(state);
  } catch (err) {
    if (err instanceof TikTokOAuthError) {
      return redirect(
        `/admin/tiktok?tiktok=config_missing&msg=${encodeURIComponent(err.message)}`,
        302,
      );
    }
    throw err;
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
