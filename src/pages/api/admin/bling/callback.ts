/**
 * Step 2 of OAuth dance — Bling redirects here with `?code=` + `?state=`.
 *
 * Validates the state cookie, exchanges the code for an access_token +
 * refresh_token (lib/bling/oauth.ts persists them to Supabase), then
 * redirects to /admin?bling=connected so the UI can confirm.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import { exchangeCodeForToken, BlingOAuthError } from "~/lib/bling/oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

const STATE_COOKIE = "bling_oauth_state";

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const params = url.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const blingError = params.get("error");
  const blingErrorDescription = params.get("error_description");

  // Bling can return error in the redirect (user denied, etc).
  if (blingError) {
    return redirect(
      `/admin?bling=denied&msg=${encodeURIComponent(blingErrorDescription ?? blingError)}`,
      302,
    );
  }

  if (!code || !state) {
    return redirect(
      `/admin?bling=missing_params`,
      302,
    );
  }

  // Validate state vs cookie (CSRF protection).
  const cookieState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/" });
  if (!cookieState || cookieState !== state) {
    return redirect(`/admin?bling=state_mismatch`, 302);
  }

  try {
    await exchangeCodeForToken(code);
  } catch (err) {
    const msg =
      err instanceof BlingOAuthError
        ? `${err.message}${err.body ? ` — ${err.body.slice(0, 300)}` : ""}`
        : err instanceof Error
        ? err.message
        : String(err);
    console.error("[bling/callback] token exchange failed:", err);
    return redirect(
      `/admin?bling=token_failed&msg=${encodeURIComponent(msg)}`,
      302,
    );
  }

  // Audit-log the connection.
  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "bling.connected",
      entity_type: "bling_oauth_tokens",
      entity_id: "singleton",
    });
  } catch (e) {
    console.warn("[bling/callback] audit log failed (non-blocking):", e);
  }

  return redirect(`/admin?bling=connected`, 302);
};
