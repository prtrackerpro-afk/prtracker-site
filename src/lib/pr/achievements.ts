// Achievements / Quests catalog.
//
// V1 keeps it derive-on-read: no extra DB tables. We compute earned
// achievements from existing pr_records + pr_best_lifts + body data.
// Achievements drive engagement loops (each PR session can unlock
// something visible) without needing a separate quest engine yet.

import type { ExerciseId } from "./exercises";
import { TIER_META, type Tier } from "./strength-score";

export interface Achievement {
  id: string;
  label: string;
  description: string;
  emoji: string;
  earned: boolean;
  /** Optional progress info shown to athlete when not yet earned. */
  progress?: { current: number; target: number; unit?: string };
}

export interface AchievementInput {
  totalRecords: number;
  totalPRs: number;
  bestLifts: Partial<Record<ExerciseId, number>>;
  overallTier: Tier | null;
  liveStreakMonths: number;
}

/** Big-3 lifts considered for the "Powerlifter" achievement. */
const BIG_THREE: ExerciseId[] = ["back_squat", "bench_press", "deadlift"];
const OLYMPIC: ExerciseId[] = [
  "snatch", "power_snatch", "squat_snatch",
  "clean", "power_clean", "squat_clean", "hang_clean", "hang_power_clean",
  "clean_and_jerk", "split_jerk", "push_jerk",
];

export function computeAchievements(input: AchievementInput): Achievement[] {
  const achievements: Achievement[] = [];

  // 1. First PR
  achievements.push({
    id: "first_pr",
    label: "Primeiro PR",
    description: "Registrou seu primeiro recorde pessoal.",
    emoji: "🥇",
    earned: input.totalPRs >= 1,
  });

  // 2. Centena — any big-3 lift hits 100 kg
  const heaviestBig3 = Math.max(
    input.bestLifts.back_squat ?? 0,
    input.bestLifts.bench_press ?? 0,
    input.bestLifts.deadlift ?? 0,
  );
  achievements.push({
    id: "centena",
    label: "Clube dos 100",
    description: "Levantou 100 kg em Squat, Bench ou Deadlift.",
    emoji: "💯",
    earned: heaviestBig3 >= 100,
    progress: heaviestBig3 < 100 ? { current: heaviestBig3, target: 100, unit: "kg" } : undefined,
  });

  // 3. Powerlifter — logged all 3 big lifts
  const big3Logged = BIG_THREE.filter((id) => (input.bestLifts[id] ?? 0) > 0).length;
  achievements.push({
    id: "powerlifter",
    label: "Powerlifter",
    description: "Registrou Squat, Bench e Deadlift.",
    emoji: "🏋️",
    earned: big3Logged === 3,
    progress: big3Logged < 3 ? { current: big3Logged, target: 3 } : undefined,
  });

  // 4. Olímpico — logged ≥3 olympic lifts
  const olympicLogged = OLYMPIC.filter((id) => (input.bestLifts[id] ?? 0) > 0).length;
  achievements.push({
    id: "olympic",
    label: "Halterofilista",
    description: "Registrou pelo menos 3 levantamentos olímpicos.",
    emoji: "🇧🇷",
    earned: olympicLogged >= 3,
    progress: olympicLogged < 3 ? { current: olympicLogged, target: 3 } : undefined,
  });

  // 5. Streak Mestre — 3 consecutive months with PR
  achievements.push({
    id: "streak_3",
    label: "Sequência de Aço",
    description: "3 meses seguidos com pelo menos 1 PR.",
    emoji: "🔥",
    earned: input.liveStreakMonths >= 3,
    progress: input.liveStreakMonths < 3 ? { current: input.liveStreakMonths, target: 3, unit: "meses" } : undefined,
  });

  // 6. Veterano — 100 records logged total
  achievements.push({
    id: "veteran",
    label: "Veterano",
    description: "100 registros no histórico.",
    emoji: "📔",
    earned: input.totalRecords >= 100,
    progress: input.totalRecords < 100 ? { current: input.totalRecords, target: 100 } : undefined,
  });

  // 7. Avançado — reach Avançado tier
  const tierRank = input.overallTier ? TIER_META[input.overallTier].rank : -1;
  achievements.push({
    id: "avancado",
    label: "Avançado",
    description: "Atingiu o tier Avançado.",
    emoji: "⭐",
    earned: tierRank >= 3,
  });

  // 8. Elite — reach Elite tier
  achievements.push({
    id: "elite",
    label: "Elite",
    description: "Atingiu o tier Elite (top ~5% nacional).",
    emoji: "👑",
    earned: tierRank >= 4,
  });

  return achievements;
}
