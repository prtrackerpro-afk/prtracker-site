import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../lib/supabase/server";
import { isAdminEmail } from "../../../lib/admin/auth";
import { getAdminSupabase } from "../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  if (!email || !password) return jsonError(400, "missing_credentials");
  if (!isAdminEmail(email)) return jsonError(403, "not_admin");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return jsonError(401, "invalid_credentials", error?.message);
  }

  // Audit
  try {
    const admin = getAdminSupabase();
    await admin.from("audit_log").insert({
      actor_email: email,
      action: "admin.login",
      ip_address: request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip"),
      user_agent: request.headers.get("user-agent"),
    });
  } catch (e) {
    // non-blocking
    console.warn("[login] audit failed", e);
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
