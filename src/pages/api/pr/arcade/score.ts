import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

const VALID = new Set(["barbell_bounce", "shaker_mixer", "wod_sprint"]);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  let body: { game_id?: string; score?: number; duration_sec?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const game = String(body.game_id ?? "");
  if (!VALID.has(game)) return jsonError(400, "invalid_game");

  const score = Math.floor(Number(body.score));
  if (!Number.isFinite(score) || score < 0 || score > 1_000_000) {
    return jsonError(400, "invalid_score");
  }

  const dur = Math.floor(Number(body.duration_sec ?? 0));
  if (dur < 0 || dur > 3600) return jsonError(400, "invalid_duration");

  // Anti-cheat basico: max 5 scores/min
  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const sinceMin = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from("pr_arcade_scores")
    .select("id", { head: true, count: "exact" })
    .eq("user_id", locals.athlete.userId)
    .gte("played_at", sinceMin);

  if ((count ?? 0) >= 5) {
    return jsonError(429, "rate_limit", "Muitas tentativas em 1min.");
  }

  const { data, error } = await supabase
    .from("pr_arcade_scores")
    .insert({
      user_id: locals.athlete.userId,
      game_id: game,
      score,
      duration_sec: dur,
    })
    .select("id")
    .single();

  if (error) return jsonError(500, "insert_failed", error.message);

  return new Response(JSON.stringify({ id: data.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async ({ request, cookies, url }) => {
  const game = url.searchParams.get("game_id") ?? "";
  if (!VALID.has(game)) return jsonError(400, "invalid_game");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { data, error } = await supabase
    .from("pr_arcade_scores")
    .select("score, played_at, user_id, pr_athletes!inner(handle, display_name)")
    .eq("game_id", game)
    .order("score", { ascending: false })
    .limit(20);

  if (error) return jsonError(500, "fetch_failed", error.message);
  return new Response(JSON.stringify({ leaderboard: data }), {
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
