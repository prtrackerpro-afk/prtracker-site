/**
 * Step 1 of OAuth dance — admin clicks "Conectar Bling" and lands here.
 *
 * Generates a CSRF state, persists it in a short-lived HttpOnly cookie,
 * then 302s the browser to Bling's authorization page. After the user
 * approves, Bling redirects to /api/admin/bling/callback with `?code=` + `?state=`.
 *
 * Auth: enforced by middleware.ts (any /api/admin/* route requires admin login).
 */

import type { APIRoute } from "astro";
import crypto from "node:crypto";
import { buildAuthorizeUrl, BlingOAuthError } from "~/lib/bling/oauth";

export const prerender = false;

const STATE_COOKIE = "bling_oauth_state";
const STATE_TTL_SECONDS = 600; // 10 min

export const GET: APIRoute = async ({ cookies, redirect }) => {
  let url: string;
  let state: string;
  try {
    state = crypto.randomBytes(24).toString("hex");
    url = buildAuthorizeUrl(state);
  } catch (err) {
    if (err instanceof BlingOAuthError) {
      return redirect(
        `/admin?bling=config_missing&msg=${encodeURIComponent(err.message)}`,
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
