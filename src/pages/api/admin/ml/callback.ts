/**
 * Step 2 of Mercado Livre OAuth — ML redireciona aqui com `?code=` + `?state=`.
 *
 * Valida cookie state (CSRF), troca code por access_token + refresh_token,
 * busca nickname via /users/me, persiste no Supabase, e redireciona pra
 * /admin/ml?ml=connected.
 *
 * Auth: enforced by middleware.ts.
 */

import type { APIRoute } from "astro";
import { exchangeCodeForToken, persistToken } from "~/lib/ml/oauth";
import { getUserMe } from "~/lib/ml/products";
import { getAdminSupabase } from "~/lib/supabase/server";

export const prerender = false;

const STATE_COOKIE = "ml_oauth_state";

export const GET: APIRoute = async ({ url, cookies, redirect, locals }) => {
  const params = url.searchParams;
  const code = params.get("code");
  const state = params.get("state");
  const mlError = params.get("error");
  const mlErrorDescription = params.get("error_description");

  if (mlError) {
    return redirect(
      `/admin/ml?ml=denied&msg=${encodeURIComponent(mlErrorDescription ?? mlError)}`,
      302,
    );
  }

  if (!code || !state) {
    return redirect(`/admin/ml?ml=missing_params`, 302);
  }

  const cookieState = cookies.get(STATE_COOKIE)?.value;
  cookies.delete(STATE_COOKIE, { path: "/" });
  if (!cookieState || cookieState !== state) {
    return redirect(`/admin/ml?ml=state_mismatch`, 302);
  }

  try {
    const token = await exchangeCodeForToken(code);
    // ML retorna user_id mas não nickname no payload do token.
    // Busca via /users/me (usa o access_token recém-emitido).
    let nickname: string | undefined;
    try {
      const me = await getUserMe(token.access_token);
      nickname = me.nickname;
    } catch (e) {
      console.warn("[ml/callback] getUserMe falhou (não-bloqueante):", e);
    }
    await persistToken(token, nickname);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[ml/callback] token exchange failed:", err);
    return redirect(
      `/admin/ml?ml=token_failed&msg=${encodeURIComponent(msg)}`,
      302,
    );
  }

  // Audit-log
  try {
    const sb = getAdminSupabase();
    await sb.from("audit_log").insert({
      actor_email: locals.admin?.email ?? null,
      action: "ml.connected",
      entity_type: "ml_oauth_tokens",
      entity_id: "seller",
    });
  } catch (e) {
    console.warn("[ml/callback] audit log failed (non-blocking):", e);
  }

  return redirect(`/admin/ml?ml=connected`, 302);
};
