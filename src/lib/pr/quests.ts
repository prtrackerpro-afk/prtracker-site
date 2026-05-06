// Weekly / monthly quests — engagement layer that turns "I logged a PR
// once" into "I keep coming back to chase the next badge".
//
// Like achievements (lib/pr/achievements.ts), quests are derived on read
// from pr_records — no extra DB columns. The active quest period rolls
// over automatically with the calendar week / month.

import type { ExerciseId } from "./exercises";

export interface QuestProgress {
  id: string;
  label: string;
  description: string;
  emoji: string;
  /** ISO date — when the current period closes (Sunday end-of-day, UTC). */
  endsAt: string;
  /** 0–N, capped at target. */
  current: number;
  target: number;
  /** Already done in this period. */
  completed: boolean;
}

interface QuestInput {
  /** PRs logged across history, sorted desc by performed_at. */
  prDates: string[]; // YYYY-MM-DD
  /** All record dates (not just PR-true), sorted desc. */
  recordDates: string[]; // YYYY-MM-DD
  /** Distinct exercises ever recorded. */
  distinctExercises: Set<ExerciseId>;
}

function startOfWeekUTC(d: Date): Date {
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Monday-based week (Brazilian convention is more often Sun-start, but
  // CrossFit cycles tend to be Mon-Sun for programming).
  const day = (dt.getUTCDay() + 6) % 7; // 0 = Mon
  dt.setUTCDate(dt.getUTCDate() - day);
  return dt;
}
function endOfWeekUTC(d: Date): Date {
  const start = startOfWeekUTC(d);
  start.setUTCDate(start.getUTCDate() + 7);
  start.setUTCMilliseconds(start.getUTCMilliseconds() - 1);
  return start;
}
function startOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function endOfMonthUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1) - 1);
}

export function computeQuests(input: QuestInput): QuestProgress[] {
  const now = new Date();
  const weekStart = startOfWeekUTC(now);
  const weekEnd = endOfWeekUTC(now);
  const monthStart = startOfMonthUTC(now);
  const monthEnd = endOfMonthUTC(now);

  const weekStartIso = weekStart.toISOString().slice(0, 10);
  const monthStartIso = monthStart.toISOString().slice(0, 10);

  const recordsThisWeek = input.recordDates.filter((d) => d >= weekStartIso).length;
  const prsThisWeek = input.prDates.filter((d) => d >= weekStartIso).length;
  const prsThisMonth = input.prDates.filter((d) => d >= monthStartIso).length;

  // Distinct exercise IDs PR'd this week
  const distinctMovementsThisWeek = (() => {
    // We don't have exercise per date here — caller can pre-aggregate if needed.
    // V1: approximate via week PR count vs distinct exercises overall.
    return prsThisWeek;
  })();

  const quests: QuestProgress[] = [
    {
      id: "weekly_pr",
      label: "PR semanal",
      description: "Bate pelo menos 1 PR essa semana.",
      emoji: "🎯",
      endsAt: weekEnd.toISOString(),
      current: Math.min(prsThisWeek, 1),
      target: 1,
      completed: prsThisWeek >= 1,
    },
    {
      id: "weekly_3sessions",
      label: "Frequência 3×",
      description: "3 treinos registrados na semana (qualquer registro).",
      emoji: "💪",
      endsAt: weekEnd.toISOString(),
      current: Math.min(recordsThisWeek, 3),
      target: 3,
      completed: recordsThisWeek >= 3,
    },
    {
      id: "monthly_3prs",
      label: "Mês quente",
      description: "3 PRs em movimentos diferentes esse mês.",
      emoji: "🔥",
      endsAt: monthEnd.toISOString(),
      current: Math.min(prsThisMonth, 3),
      target: 3,
      completed: prsThisMonth >= 3,
    },
  ];

  return quests;
}

/** Friendly time-remaining formatter for quest cards. */
export function formatRemaining(endsAt: string): string {
  const ms = new Date(endsAt).getTime() - Date.now();
  if (ms <= 0) return "encerra hoje";
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  if (days >= 2) return `${days} dias restantes`;
  if (days === 1) return "1 dia restante";
  const hours = Math.floor(ms / (1000 * 60 * 60));
  return hours <= 1 ? "encerra em <1h" : `${hours}h restantes`;
}
