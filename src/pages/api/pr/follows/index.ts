import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// Follow / unfollow another athlete. POST { user_id } to follow,
// DELETE { user_id } to unfollow. Idempotent on both sides.

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { user_id?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const followee = (body.user_id ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(followee)) {
    return jsonError(400, "invalid_user_id");
  }
  if (followee === athlete.userId) {
    return jsonError(400, "cannot_follow_self");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_follows")
    .upsert(
      { follower_id: athlete.userId, followee_id: followee },
      { onConflict: "follower_id,followee_id" }
    );
  if (error) return jsonError(500, "follow_failed", error.message);

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const DELETE: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { user_id?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const followee = (body.user_id ?? "").trim();
  if (!/^[0-9a-fA-F-]{36}$/.test(followee)) {
    return jsonError(400, "invalid_user_id");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_follows")
    .delete()
    .eq("follower_id", athlete.userId)
    .eq("followee_id", followee);
  if (error) return jsonError(500, "unfollow_failed", error.message);

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
