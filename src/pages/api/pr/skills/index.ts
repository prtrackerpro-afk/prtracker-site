import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

const VALID_SKILLS = new Set(["bmu", "mu", "hspu", "t2b", "du", "pistol"]);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { skill_id?: string; reps?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const skillId = String(body.skill_id ?? "").toLowerCase();
  if (!VALID_SKILLS.has(skillId)) {
    return jsonError(400, "invalid_skill", "Skill desconhecida.");
  }

  const reps = Math.floor(Number(body.reps));
  if (!Number.isFinite(reps) || reps < 0 || reps > 5000) {
    return jsonError(400, "invalid_reps", "Reps fora do intervalo aceito.");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Upsert: só sobrescreve se reps for maior que o existente (best-only).
  const { data: existing } = await supabase
    .from("pr_skills")
    .select("best_reps")
    .eq("user_id", athlete.userId)
    .eq("skill_id", skillId)
    .maybeSingle();

  const currentBest = existing?.best_reps ?? 0;
  if (reps <= currentBest) {
    return new Response(
      JSON.stringify({
        skill_id: skillId,
        best_reps: currentBest,
        improved: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error } = await supabase.from("pr_skills").upsert(
    {
      user_id: athlete.userId,
      skill_id: skillId,
      best_reps: reps,
      achieved_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,skill_id" }
  );

  if (error) {
    return jsonError(500, "upsert_failed", error.message);
  }

  return new Response(
    JSON.stringify({ skill_id: skillId, best_reps: reps, improved: true }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
