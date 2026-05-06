import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// Lists the current athlete's notifications. ?unread=1 for filter.
export const GET: APIRoute = async ({ request, cookies, locals, url }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const unreadOnly = new URL(url).searchParams.get("unread") === "1";
  const supabase = getServerSupabase({ headers: request.headers, cookies });

  let q = supabase
    .from("pr_notifications")
    .select("id, type, payload, read_at, created_at, actor_user_id")
    .eq("user_id", athlete.userId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (unreadOnly) q = q.is("read_at", null);

  const { data, error } = await q;
  if (error) return jsonError(500, "list_failed", error.message);

  return new Response(JSON.stringify({ notifications: data ?? [] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

// Marks all unread as read (or specific ids via body { ids: [...] }).
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { ids?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    // empty body = mark all
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const now = new Date().toISOString();

  let q = supabase
    .from("pr_notifications")
    .update({ read_at: now })
    .eq("user_id", athlete.userId)
    .is("read_at", null);
  if (body.ids?.length) q = q.in("id", body.ids);

  const { error } = await q;
  if (error) return jsonError(500, "update_failed", error.message);

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
