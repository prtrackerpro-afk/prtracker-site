/**
 * Step 2 of Amazon LWA OAuth — Amazon redireciona aqui com:
 *   ?selling_partner_id=...&spapi_oauth_code=...&state=...
 *
 * (Ou se modo beta: ?selling_partner_id=...&mws_auth_token=...&spapi_oauth_code=...&state=...)
 *
 * Valida cookie state (CSRF), troca code por LWA tokens, persiste no
 * Supabase, redireciona pra /admin/amazon?amazon=connected.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import { exchangeCodeForToken, persistToken } from "~/lib/amazon/oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

const STATE_COOKIE = "amazon_oauth_state";

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const params = url.searchParams;
  const code = params.get("spapi_oauth_code");
  const sellingPartnerId = params.get("selling_partner_id");
  const state = params.get("state");
  const errCode = params.get("error");
  const errMsg = params.get("error_description");

  if (errCode) {
    return redirect(
      `/admin/amazon?amazon=denied&msg=${encodeURIComponent(errMsg ?? errCode)}`,
      302,
    );
  }

  if (!code || !state || !sellingPartnerId) {
    return redirect(`/admin/amazon?amazon=missing_params`, 302);
  }

  const cookieState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/" });
  if (!cookieState || cookieState !== state) {
    return redirect(`/admin/amazon?amazon=state_mismatch`, 302);
  }

  try {
    const token = await exchangeCodeForToken(code);
    await persistToken(token, sellingPartnerId);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[amazon/callback] LWA token exchange failed:", err);
    return redirect(
      `/admin/amazon?amazon=token_failed&msg=${encodeURIComponent(msg)}`,
      302,
    );
  }

  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "amazon.connected",
      entity_type: "amazon_oauth_tokens",
      entity_id: sellingPartnerId,
    });
  } catch (e) {
    console.warn("[amazon/callback] audit log failed (non-blocking):", e);
  }

  return redirect(`/admin/amazon?amazon=connected`, 302);
};
