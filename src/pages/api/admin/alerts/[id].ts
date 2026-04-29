import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const PATCH: APIRoute = async ({ params, request, locals }) => {
  const id = params.id;
  if (!id) return jsonError(400, "missing_id");
  const admin = (locals as any).admin;
  if (!admin) return jsonError(401, "unauthorized");

  const body = await request.json().catch(() => ({}));
  const action = (body as any).action as "acknowledge" | "resolve" | undefined;
  if (action !== "acknowledge" && action !== "resolve") return jsonError(400, "bad_action");

  const sb = getAdminSupabase();
  const update: any = action === "resolve"
    ? { status: "resolved", resolved_at: new Date().toISOString() }
    : { status: "acknowledged" };

  const { error } = await sb.from("alerts").update(update).eq("id", id);
  if (error) return jsonError(500, "db_error", error.message);

  await sb.from("audit_log").insert({
    actor_email: admin.email,
    action: `alert.${action}`,
    entity_type: "alert",
    entity_id: id,
  });

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
