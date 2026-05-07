import type { APIRoute } from "astro";
import {
  getServerSupabase,
  getAdminSupabase,
} from "../../../../lib/supabase/server";
import {
  xpForLiftPR,
  xpForSkillTier,
  xpForRunPR,
  xpForStreakDay,
} from "../../../../lib/pr/gym/xp";
import { tierForLift, type Tier } from "../../../../lib/pr/strength-score";
import {
  SKILL_TIER_META,
  tierForReps,
  type SkillTier,
} from "../../../../lib/pr/gym/skills";
import type { ExerciseId } from "../../../../lib/pr/exercises";

export const prerender = false;

/**
 * Backfill idempotente do XP do atleta. Lê histórico de:
 *   - pr_records (PRs de força)
 *   - pr_skills (best_reps por skill → tier)
 *   - pr_runs (best_time por distância)
 *   - pr_records.performed_at (streak diário)
 *
 * Insere eventos faltantes em pr_xp_events. Não duplica
 * (unique constraint user_id+source+source_key).
 *
 * Usa admin client porque RLS de write em pr_xp_events é bloqueado
 * no client (só leitura).
 */
export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const userId = athlete.userId;
  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const admin = getAdminSupabase();

  const eventsToInsert: Array<{
    user_id: string;
    source: string;
    source_key: string;
    amount: number;
    payload: unknown;
  }> = [];

  // === 1. LIFT PRs — todos os pr_records com is_personal_record = true ===
  // Cada peak distinto é um evento. Tier calculado com bodyweight do atleta
  // ao tempo do PR (aproximação: usa bodyweight atual; ok pra V14).
  const bw = athlete.bodyWeightKg;
  const sex = athlete.sex;
  if (bw && sex) {
    const { data: prRows } = await supabase
      .from("pr_records")
      .select("exercise, weight_kg, performed_at")
      .eq("user_id", userId)
      .eq("is_personal_record", true)
      .order("performed_at", { ascending: true });

    // Agrupa por exercise, mantendo só o melhor — a fórmula só recompensa
    // peak histórico, não cada batida intermediária. Se PR foi 100→110→120,
    // dá XP só pro 120.
    const peakByExercise = new Map<string, { weight: number; date: string }>();
    for (const r of prRows ?? []) {
      const ex = String(r.exercise);
      const w = Number(r.weight_kg);
      const cur = peakByExercise.get(ex);
      if (!cur || w > cur.weight) {
        peakByExercise.set(ex, { weight: w, date: String(r.performed_at) });
      }
    }

    for (const [ex, peak] of peakByExercise) {
      const score = tierForLift(ex as ExerciseId, peak.weight, bw, sex);
      const xp = xpForLiftPR(peak.weight, score.tier as Tier);
      if (xp <= 0) continue;
      eventsToInsert.push({
        user_id: userId,
        source: "lift_pr",
        source_key: `lift:${ex}:${peak.weight}`,
        amount: xp,
        payload: { exercise: ex, weight_kg: peak.weight, tier: score.tier, date: peak.date },
      });
    }
  }

  // === 2. SKILL TIERS — para cada skill, dá XP de TODOS os tiers atingidos ===
  // Ex: best_reps=12 → ganhou unlocked + bronze + silver + gold (4 eventos).
  const { data: skillRows } = await supabase
    .from("pr_skills")
    .select("skill_id, best_reps")
    .eq("user_id", userId);

  for (const s of skillRows ?? []) {
    const reps = Number(s.best_reps);
    const reachedTier = tierForReps(reps);
    // Lista todos os tiers até reachedTier (inclusive)
    const tiersInOrder: SkillTier[] = ["unlocked", "bronze", "silver", "gold", "diamond"];
    const stopRank = SKILL_TIER_META[reachedTier].rank;
    for (const t of tiersInOrder) {
      if (SKILL_TIER_META[t].rank > stopRank) break;
      if (SKILL_TIER_META[t].rank === 0) continue; // skip locked
      const xp = xpForSkillTier(t);
      if (xp <= 0) continue;
      eventsToInsert.push({
        user_id: userId,
        source: "skill_tier",
        source_key: `skill:${s.skill_id}:${t}`,
        amount: xp,
        payload: { skill_id: s.skill_id, tier: t, reps },
      });
    }
  }

  // === 3. RUN PRs — uma entrada por melhor tempo registrado por distância ===
  // (V14: não temos histórico de tempos anteriores, só o melhor atual.
  // Trata como "primeiro registro" → XP base completo.)
  const { data: runRows } = await supabase
    .from("pr_runs")
    .select("distance, best_time_sec")
    .eq("user_id", userId);

  for (const r of runRows ?? []) {
    const dist = String(r.distance);
    const sec = Number(r.best_time_sec);
    const xp = xpForRunPR(dist, sec, null);
    if (xp <= 0) continue;
    eventsToInsert.push({
      user_id: userId,
      source: "run_pr",
      source_key: `run:${dist}:${sec}`,
      amount: xp,
      payload: { distance: dist, time_sec: sec },
    });
  }

  // === 4. STREAK DAYS — cada data distinta com PR vira 1 evento ===
  const { data: dateRows } = await supabase
    .from("pr_records")
    .select("performed_at")
    .eq("user_id", userId)
    .eq("is_personal_record", true)
    .order("performed_at", { ascending: true });

  const uniqueDays = new Set<string>();
  for (const d of dateRows ?? []) {
    const day = String(d.performed_at).slice(0, 10);
    if (uniqueDays.has(day)) continue;
    uniqueDays.add(day);
    const xp = xpForStreakDay();
    eventsToInsert.push({
      user_id: userId,
      source: "streak_day",
      source_key: `streak:${day}`,
      amount: xp,
      payload: { day },
    });
  }

  // === Insert em batches usando ON CONFLICT DO NOTHING (idempotente) ====
  let inserted = 0;
  if (eventsToInsert.length > 0) {
    // Supabase não suporta ON CONFLICT DO NOTHING direto, então usamos
    // upsert com ignoreDuplicates: true — não atualiza linhas existentes,
    // só insere as faltantes.
    const { error, count } = await admin
      .from("pr_xp_events")
      .upsert(eventsToInsert, {
        onConflict: "user_id,source,source_key",
        ignoreDuplicates: true,
        count: "exact",
      });
    if (error) return jsonError(500, "insert_failed", error.message);
    inserted = count ?? 0;
  }

  // Re-leia o total atualizado pelo trigger
  const { data: athleteRow } = await admin
    .from("pr_athletes")
    .select("xp_total")
    .eq("user_id", userId)
    .maybeSingle();

  return new Response(
    JSON.stringify({
      inserted,
      total_events_attempted: eventsToInsert.length,
      xp_total: Number(athleteRow?.xp_total ?? 0),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
