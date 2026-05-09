import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");
  let body: {
    kcal_target?: number;
    protein_g_target?: number;
    carbs_g_target?: number;
    fat_g_target?: number;
    water_ml_target?: number;
    goal?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const kcal = Math.floor(Number(body.kcal_target ?? 2200));
  const p = Math.floor(Number(body.protein_g_target ?? 150));
  const c = Math.floor(Number(body.carbs_g_target ?? 250));
  const f = Math.floor(Number(body.fat_g_target ?? 70));
  const w = Math.floor(Number(body.water_ml_target ?? 2500));
  const goal = String(body.goal ?? "maintain");

  if (kcal < 800 || kcal > 6000) return jsonError(400, "invalid_kcal");
  if (p < 30 || p > 400) return jsonError(400, "invalid_protein");
  if (c < 0 || c > 800) return jsonError(400, "invalid_carbs");
  if (f < 0 || f > 300) return jsonError(400, "invalid_fat");
  if (w < 500 || w > 8000) return jsonError(400, "invalid_water");
  if (!["bulk", "cut", "maintain"].includes(goal)) return jsonError(400, "invalid_goal");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_diet_targets")
    .upsert({
      user_id: locals.athlete.userId,
      kcal_target: kcal,
      protein_g_target: p,
      carbs_g_target: c,
      fat_g_target: f,
      water_ml_target: w,
      goal,
      updated_at: new Date().toISOString(),
    });
  if (error) return jsonError(500, "upsert_failed", error.message);

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
