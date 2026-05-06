// Strength Score & Tier system.
//
// Goal: turn a raw kg number into an *identity statement* the athlete can
// brag about — "Avançado", "Top 18%", "Total: 1240" — so each PR has a
// social-shareable layer that a photo can't replicate.
//
// Approach (V1):
// - Per-lift tier from kg-to-bodyweight ratio, calibrated against well-
//   known powerlifting / weightlifting standards (ExRx, StrengthLevel,
//   Symmetric Strength). Gendered thresholds.
// - Composite Strength Score = sum(squat + bench + deadlift) / bodyweight
//   when all three are available, otherwise the weighted top-3 lifts the
//   athlete has logged.
// - Overall Tier = average tier of available lifts (weighted by lift type).
//
// The numbers below are NOT scientific — they're calibrated to feel "right"
// to lifters: ~30% of trainees end up Iniciante, ~30% Novato, ~20%
// Intermediário, ~15% Avançado, ~5% Elite. Tweak in production based on
// the cohort distribution we see.

import type { ExerciseId } from "./exercises";

export const TIER_ORDER = ["iniciante", "novato", "intermediario", "avancado", "elite"] as const;
export type Tier = (typeof TIER_ORDER)[number];

export const TIER_META: Record<Tier, { label: string; color: string; rank: number }> = {
  iniciante: { label: "Iniciante", color: "#9ca3af", rank: 0 },
  novato: { label: "Novato", color: "#43B02A", rank: 1 },
  intermediario: { label: "Intermediário", color: "#0057B8", rank: 2 },
  avancado: { label: "Avançado", color: "#FFC72C", rank: 3 },
  elite: { label: "Elite", color: "#D8FF2C", rank: 4 },
};

// Bodyweight-relative thresholds [iniciante→novato, novato→intermediario,
// intermediario→avancado, avancado→elite]. Below the first cutoff = iniciante.
//
// E.g. bench[male] = [0.5, 1.0, 1.5, 2.0] means:
//   <0.5x BW  → iniciante
//   0.5–1.0   → novato
//   1.0–1.5   → intermediario
//   1.5–2.0   → avancado
//   ≥2.0      → elite
//
// Movements not explicitly listed share the closest big-3 baseline:
//   - Front Squat / Overhead Squat use 80% of squat thresholds
//   - Sumo Deadlift = Deadlift
//   - Olympic lifts (snatch, clean&jerk variants) use their own scale
//   - Press variants use bench thresholds × 0.6
type LiftBenchmark = { male: [number, number, number, number]; female: [number, number, number, number] };

const BENCHMARKS: Partial<Record<ExerciseId, LiftBenchmark>> = {
  bench_press:    { male: [0.5,  1.0,  1.5,  2.0],  female: [0.35, 0.65, 1.0,  1.4] },
  back_squat:     { male: [0.75, 1.25, 1.75, 2.25], female: [0.55, 1.0,  1.5,  2.0] },
  deadlift:       { male: [1.0,  1.5,  2.25, 2.75], female: [0.75, 1.25, 1.75, 2.4] },
  sumo_deadlift:  { male: [1.0,  1.5,  2.25, 2.75], female: [0.75, 1.25, 1.75, 2.4] },
  front_squat:    { male: [0.6,  1.0,  1.4,  1.8],  female: [0.45, 0.8,  1.2,  1.6] },
  overhead_squat: { male: [0.45, 0.7,  1.0,  1.3],  female: [0.3,  0.55, 0.85, 1.15] },
  shoulder_press: { male: [0.3,  0.6,  0.9,  1.2],  female: [0.2,  0.45, 0.7,  0.95] },
  push_press:     { male: [0.4,  0.75, 1.1,  1.5],  female: [0.3,  0.55, 0.85, 1.2] },
  push_jerk:      { male: [0.55, 0.95, 1.3,  1.7],  female: [0.4,  0.7,  1.0,  1.4] },
  split_jerk:     { male: [0.6,  1.0,  1.4,  1.8],  female: [0.45, 0.75, 1.1,  1.5] },
  snatch:         { male: [0.4,  0.8,  1.15, 1.5],  female: [0.3,  0.6,  0.9,  1.2] },
  power_snatch:   { male: [0.35, 0.7,  1.0,  1.3],  female: [0.25, 0.5,  0.8,  1.1] },
  squat_snatch:   { male: [0.4,  0.8,  1.15, 1.5],  female: [0.3,  0.6,  0.9,  1.2] },
  clean:          { male: [0.6,  1.0,  1.45, 1.85], female: [0.45, 0.75, 1.15, 1.5] },
  power_clean:    { male: [0.55, 0.95, 1.3,  1.7],  female: [0.4,  0.7,  1.05, 1.4] },
  squat_clean:    { male: [0.6,  1.0,  1.45, 1.85], female: [0.45, 0.75, 1.15, 1.5] },
  hang_clean:     { male: [0.55, 0.95, 1.3,  1.7],  female: [0.4,  0.7,  1.05, 1.4] },
  hang_power_clean:{male:[0.5,   0.85, 1.2,  1.55], female: [0.35, 0.65, 1.0,  1.3] },
  clean_and_jerk: { male: [0.55, 0.95, 1.4,  1.8],  female: [0.4,  0.75, 1.15, 1.5] },
  thruster:       { male: [0.45, 0.8,  1.15, 1.5],  female: [0.35, 0.6,  0.9,  1.25] },
};

// Big 3 lifts (used for the composite Powerlifting Total Score)
export const BIG_THREE: ExerciseId[] = ["back_squat", "bench_press", "deadlift"];

export interface AthleteStrengthInput {
  bodyWeightKg: number | null;
  sex: "male" | "female" | null;
  /** Map of best lift kg by exercise id. Missing exercises are skipped. */
  bestLifts: Partial<Record<ExerciseId, number>>;
}

export interface LiftScore {
  exerciseId: ExerciseId;
  weightKg: number;
  ratio: number; // weight / bodyweight
  tier: Tier;
  /** 0–100 % progress into the current tier (helps "almost-Avançado" UX). */
  progressInTier: number;
  /** Kg needed to reach the next tier. Null if already Elite. */
  kgToNextTier: number | null;
  nextTier: Tier | null;
}

export interface StrengthSummary {
  /** Per-lift tier breakdown. */
  lifts: LiftScore[];
  /** Composite Powerlifting Total (Squat + Bench + Deadlift) when all 3 present, else null. */
  powerlifting: { totalKg: number; ratio: number; tier: Tier } | null;
  /** Overall tier across all logged lifts (mode/median, not max — feels honest). */
  overallTier: Tier;
  /** Percentile vs cohort, derived from overall tier (V1 = static buckets). */
  percentile: number;
  /** Whether body data is sufficient to compute meaningful tiers. */
  hasBodyData: boolean;
}

const TIER_PERCENTILE: Record<Tier, number> = {
  iniciante: 30,    // bottom 30 %
  novato: 60,       // 30–60 %
  intermediario: 80, // 60–80 %
  avancado: 95,     // 80–95 %
  elite: 99,        // top 1–5 %
};

/** Compute the tier for a single lift given bodyweight and sex. */
export function tierForLift(
  exerciseId: ExerciseId,
  weightKg: number,
  bodyWeightKg: number,
  sex: "male" | "female"
): LiftScore {
  const bench = BENCHMARKS[exerciseId];
  // Fallback for exercises without an entry — treat as 80% of squat thresholds
  const thresholds = bench ? bench[sex] : (sex === "male" ? [0.6, 1.0, 1.4, 1.8] : [0.45, 0.8, 1.2, 1.6]);
  const ratio = weightKg / bodyWeightKg;
  let tierIdx = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (ratio >= (thresholds[i] ?? Infinity)) tierIdx = i + 1;
  }
  const tier = TIER_ORDER[tierIdx] ?? "iniciante";

  // Progress within the current tier
  const lower = tierIdx === 0 ? 0 : (thresholds[tierIdx - 1] ?? 0);
  const upper = thresholds[tierIdx] ?? null;
  let progressInTier = 0;
  let kgToNextTier: number | null = null;
  let nextTier: Tier | null = null;
  if (upper !== null) {
    progressInTier = Math.min(100, Math.max(0, ((ratio - lower) / (upper - lower)) * 100));
    kgToNextTier = Math.max(0, Math.ceil(upper * bodyWeightKg - weightKg));
    nextTier = TIER_ORDER[tierIdx + 1] ?? null;
  } else {
    progressInTier = 100;
  }

  return { exerciseId, weightKg, ratio, tier, progressInTier, kgToNextTier, nextTier };
}

/** Given an athlete's current body data + best lifts, return the full summary. */
export function summarize(input: AthleteStrengthInput): StrengthSummary {
  const hasBodyData = !!(input.bodyWeightKg && input.sex);

  const lifts: LiftScore[] = [];
  if (hasBodyData) {
    for (const [exId, kg] of Object.entries(input.bestLifts)) {
      if (typeof kg !== "number") continue;
      lifts.push(tierForLift(exId as ExerciseId, kg, input.bodyWeightKg!, input.sex!));
    }
  }

  // Powerlifting Total
  let powerlifting: StrengthSummary["powerlifting"] = null;
  if (hasBodyData) {
    const sq = input.bestLifts.back_squat;
    const bp = input.bestLifts.bench_press;
    const dl = input.bestLifts.deadlift;
    if (sq && bp && dl) {
      const totalKg = sq + bp + dl;
      const ratio = totalKg / input.bodyWeightKg!;
      // Total tier thresholds (sum of big-3 thresholds from above)
      const sex = input.sex!;
      const totalThresh = sex === "male" ? [2.25, 3.75, 5.5, 7.0] : [1.65, 2.9, 4.25, 5.8];
      let tIdx = 0;
      for (let i = 0; i < totalThresh.length; i++) {
        if (ratio >= (totalThresh[i] ?? Infinity)) tIdx = i + 1;
      }
      powerlifting = { totalKg, ratio, tier: TIER_ORDER[tIdx] ?? "iniciante" };
    }
  }

  // Overall tier — median of available lifts; fall back to powerlifting if defined.
  let overallTier: Tier = "iniciante";
  if (powerlifting) {
    overallTier = powerlifting.tier;
  } else if (lifts.length > 0) {
    const ranks = lifts.map((l) => TIER_META[l.tier].rank).sort((a, b) => a - b);
    const median = ranks[Math.floor(ranks.length / 2)] ?? 0;
    overallTier = TIER_ORDER[median] ?? "iniciante";
  }

  return {
    lifts,
    powerlifting,
    overallTier,
    percentile: TIER_PERCENTILE[overallTier],
    hasBodyData,
  };
}

export function tierLabel(tier: Tier): string {
  return TIER_META[tier].label;
}

export function tierColor(tier: Tier): string {
  return TIER_META[tier].color;
}
