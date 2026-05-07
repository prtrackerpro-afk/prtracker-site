/**
 * POST /api/pr/gym/visibility — atualiza pr_athletes.gym_visibility do caller.
 * Body: { visibility: 'public' | 'friends' | 'private' }
 */
import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

const VALID = new Set(["public", "friends", "private"]);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { visibility?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const v = String(body.visibility ?? "");
  if (!VALID.has(v)) return jsonError(400, "invalid_visibility");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_athletes")
    .update({ gym_visibility: v })
    .eq("user_id", athlete.userId);

  if (error) return jsonError(500, "save_failed", error.message);

  return new Response(JSON.stringify({ visibility: v }), {
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
