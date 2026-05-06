import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../../lib/supabase/server";

export const prerender = false;

// Adds the current athlete as a member of the box. Idempotent — re-joining
// an already-joined box is a silent no-op. The athlete now appears on the
// box's public leaderboard for any PR they've already logged.

export const POST: APIRoute = async ({ request, cookies, params, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const slug = params.slug;
  if (!slug) return jsonError(400, "missing_slug");

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  const { data: box } = await supabase
    .from("pr_boxes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!box) return jsonError(404, "box_not_found");

  const { error } = await supabase.from("pr_box_members").upsert(
    { box_id: box.id, user_id: athlete.userId },
    { onConflict: "box_id,user_id" }
  );
  if (error) return jsonError(500, "join_failed", error.message);

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
