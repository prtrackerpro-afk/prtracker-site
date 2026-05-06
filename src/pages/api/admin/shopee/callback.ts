/**
 * Step 2 of Shopee OAuth — Shopee redireciona aqui com `?code=` + `?shop_id=`.
 *
 * Valida cookie state (CSRF), troca code por access_token + refresh_token,
 * persiste no Supabase, redireciona pra /admin/shopee?shopee=connected.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import { exchangeCodeForToken, persistToken } from "~/lib/shopee/oauth";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

const STATE_COOKIE = "shopee_oauth_state";

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const params = url.searchParams;
  const code = params.get("code");
  const shopIdRaw = params.get("shop_id");
  const errCode = params.get("error");
  const errMsg = params.get("message");

  if (errCode) {
    return redirect(
      `/admin/shopee?shopee=denied&msg=${encodeURIComponent(errMsg ?? errCode)}`,
      302,
    );
  }

  if (!code || !shopIdRaw) {
    return redirect(`/admin/shopee?shopee=missing_params`, 302);
  }

  // Shopee não retorna state nativo — só validamos que o cookie existe
  // (proteção contra clickjacking básico). Sem cookie = call estranha.
  const cookieState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/" });
  if (!cookieState) {
    return redirect(`/admin/shopee?shopee=state_missing`, 302);
  }

  const shopId = Number(shopIdRaw);
  if (!Number.isFinite(shopId) || shopId <= 0) {
    return redirect(`/admin/shopee?shopee=invalid_shop_id`, 302);
  }

  try {
    const token = await exchangeCodeForToken(code, shopId);
    await persistToken(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[shopee/callback] token exchange failed:", err);
    return redirect(
      `/admin/shopee?shopee=token_failed&msg=${encodeURIComponent(msg)}`,
      302,
    );
  }

  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "shopee.connected",
      entity_type: "shopee_oauth_tokens",
      entity_id: String(shopId),
    });
  } catch (e) {
    console.warn("[shopee/callback] audit log failed (non-blocking):", e);
  }

  return redirect(`/admin/shopee?shopee=connected`, 302);
};
