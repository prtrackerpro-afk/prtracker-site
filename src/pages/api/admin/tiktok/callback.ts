/**
 * Step 2 of TikTok OAuth — TikTok redireciona aqui com `?code=` + `?state=`.
 *
 * Valida cookie state (CSRF), troca code por access_token + refresh_token
 * via lib/tiktok/oauth.ts (que persiste no Supabase), e redireciona pra
 * /admin/tiktok?tiktok=connected.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import { exchangeCodeForToken, TikTokOAuthError } from "~/lib/tiktok/oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

const STATE_COOKIE = "tiktok_oauth_state";

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const params = url.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const tiktokError = params.get("error");
  const tiktokErrorDescription = params.get("error_description");

  if (tiktokError) {
    return redirect(
      `/admin/tiktok?tiktok=denied&msg=${encodeURIComponent(tiktokErrorDescription ?? tiktokError)}`,
      302,
    );
  }

  if (!code || !state) {
    return redirect(`/admin/tiktok?tiktok=missing_params`, 302);
  }

  const cookieState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/" });
  if (!cookieState || cookieState !== state) {
    return redirect(`/admin/tiktok?tiktok=state_mismatch`, 302);
  }

  try {
    await exchangeCodeForToken(code);
  } catch (err) {
    const msg =
      err instanceof TikTokOAuthError
        ? `${err.message}${err.body ? ` — ${err.body.slice(0, 300)}` : ""}`
        : err instanceof Error
        ? err.message
        : String(err);
    console.error("[tiktok/callback] token exchange failed:", err);
    return redirect(
      `/admin/tiktok?tiktok=token_failed&msg=${encodeURIComponent(msg)}`,
      302,
    );
  }

  // Audit-log
  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "tiktok.connected",
      entity_type: "tiktok_oauth_tokens",
      entity_id: "shop",
    });
  } catch (e) {
    console.warn("[tiktok/callback] audit log failed (non-blocking):", e);
  }

  return redirect(`/admin/tiktok?tiktok=connected`, 302);
};
