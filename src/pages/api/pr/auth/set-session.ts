import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// Accepts access_token + refresh_token (extracted from a hash-style auth
// redirect by client JS) and persists them as the user's session cookies.
//
// Used by /pr/auth/callback when the magic link came from
// auth.admin.generateLink — that endpoint returns tokens in the URL hash
// (implicit flow), which the server can't see, so the callback page reads
// them with JS and posts here.
export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { access_token?: string; refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const accessToken = body.access_token;
  const refreshToken = body.refresh_token;
  if (!accessToken || !refreshToken) {
    return jsonError(400, "missing_tokens");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    return jsonError(401, "set_session_failed", error.message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
