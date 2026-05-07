import type { APIRoute } from "astro";
import {
  getServerSupabase,
  getAdminSupabase,
} from "../../../../lib/supabase/server";
import { xpForRunPR } from "../../../../lib/pr/gym/xp";

export const prerender = false;

const VALID_DISTANCES = new Set(["5k", "10k", "21k", "42k"]);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: { distance?: string; time_sec?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const distance = String(body.distance ?? "").toLowerCase();
  if (!VALID_DISTANCES.has(distance)) {
    return jsonError(400, "invalid_distance", "Distância desconhecida.");
  }

  const timeSec = Math.floor(Number(body.time_sec));
  if (!Number.isFinite(timeSec) || timeSec <= 0 || timeSec >= 86400) {
    return jsonError(400, "invalid_time", "Tempo fora do intervalo aceito.");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Upsert: só sobrescreve se tempo for MENOR (mais rápido) que existente.
  const { data: existing } = await supabase
    .from("pr_runs")
    .select("best_time_sec")
    .eq("user_id", athlete.userId)
    .eq("distance", distance)
    .maybeSingle();

  const currentBest = existing?.best_time_sec ?? null;
  if (currentBest != null && timeSec >= currentBest) {
    return new Response(
      JSON.stringify({
        distance,
        best_time_sec: currentBest,
        improved: false,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  const { error } = await supabase.from("pr_runs").upsert(
    {
      user_id: athlete.userId,
      distance,
      best_time_sec: timeSec,
      achieved_at: new Date().toISOString().slice(0, 10),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,distance" }
  );

  if (error) {
    return jsonError(500, "upsert_failed", error.message);
  }

  // XP: prêmio com base no tempo (e melhoria, se já tinha tempo anterior).
  void grantRunXp(athlete.userId, distance, timeSec, currentBest);

  return new Response(
    JSON.stringify({ distance, best_time_sec: timeSec, improved: true }),
    { status: 201, headers: { "Content-Type": "application/json" } }
  );
};

async function grantRunXp(
  userId: string,
  distance: string,
  timeSec: number,
  previousTimeSec: number | null
) {
  try {
    const xp = xpForRunPR(distance, timeSec, previousTimeSec);
    if (xp <= 0) return;
    const admin = getAdminSupabase();
    await admin.from("pr_xp_events").upsert(
      [
        {
          user_id: userId,
          source: "run_pr",
          source_key: `run:${distance}:${timeSec}`,
          amount: xp,
          payload: {
            distance,
            time_sec: timeSec,
            previous_time_sec: previousTimeSec,
          },
        },
      ],
      { onConflict: "user_id,source,source_key", ignoreDuplicates: true }
    );
  } catch (e) {
    console.warn("[pr:grantRunXp] failed", e);
  }
}

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
