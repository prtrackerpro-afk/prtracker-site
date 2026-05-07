// PR Tracker — XP system (V14)
//
// XP é ganho APENAS em eventos de progresso real ("novo PR"):
//   - Bater PR de força (peso > recorde anterior no exercício)
//   - Subir tier em skill (BMU/MU/HSPU/T2B/DU/Pistol)
//   - Bater PR de corrida (tempo melhor que o anterior na distância)
//   - Streak de dias consecutivos com PR
//
// Registros que não batem PR não dão XP — alinhado com o briefing:
// "PR é apenas recorde". Isso evita inflar XP só por logar treino.

import type { Tier } from "../strength-score";
import { TIER_META } from "../strength-score";
import type { SkillTier } from "./skills";
import { SKILL_TIER_META } from "./skills";

// =================================================================
// FÓRMULAS — todas centralizadas aqui pra ser fácil ajustar curva
// =================================================================

/** Multiplicador por tier de força. Força bruta vs qualidade. */
const LIFT_TIER_MULT: Record<Tier, number> = {
  iniciante: 0.5,
  novato: 1.0,
  intermediario: 2.0,
  avancado: 4.0,
  elite: 8.0,
};

/**
 * XP por PR de força:
 *   weight_kg × tier_multiplier × 1.0
 *
 * Ex: 100kg @ Intermediário = 100 × 2.0 = 200 XP
 *     180kg @ Avançado = 180 × 4.0 = 720 XP
 *     250kg @ Elite = 250 × 8.0 = 2.000 XP
 */
export function xpForLiftPR(weightKg: number, tier: Tier): number {
  return Math.round(weightKg * (LIFT_TIER_MULT[tier] ?? 1.0));
}

/**
 * XP por subir tier em skill. One-shot por (skill, tier).
 * Curva exponencial — Diamante vale muito mais.
 */
const SKILL_TIER_XP: Record<SkillTier, number> = {
  locked: 0,
  unlocked: 20,
  bronze: 50,
  silver: 150,
  gold: 500,
  diamond: 1500,
};

export function xpForSkillTier(tier: SkillTier): number {
  return SKILL_TIER_XP[tier] ?? 0;
}

/**
 * XP por bater PR de corrida. Base por distância × ratio de melhoria
 * (sub-linear pra não premiar exagero — 10% melhor não vale 10% a mais).
 *
 * Primeira vez registrando uma distância: ratio = 1.0 (XP base completo).
 * Atualização: ratio = sqrt(improvement_pct), capped at 1.0.
 */
const RUN_BASE_XP: Record<string, number> = {
  "5k": 200,
  "10k": 500,
  "21k": 1500,
  "42k": 4000,
};

export function xpForRunPR(
  distance: string,
  newTimeSec: number,
  previousTimeSec: number | null
): number {
  const base = RUN_BASE_XP[distance] ?? 0;
  if (previousTimeSec == null) {
    // Primeiro registro daquela distância — XP cheio
    return base;
  }
  if (newTimeSec >= previousTimeSec) return 0; // não deveria entrar aqui
  const improvementPct = (previousTimeSec - newTimeSec) / previousTimeSec;
  const ratio = Math.min(1.0, Math.sqrt(improvementPct));
  return Math.round(base * ratio);
}

/**
 * XP por dia em streak. Linear simples pra não escalar fora de controle.
 * Marcos extras (7/30/100 dias) ficam pra outro PR.
 */
export function xpForStreakDay(): number {
  return 50;
}

// =================================================================
// LEVEL — converte XP total em level (curva sqrt)
// Lvl 1 = 0 XP    Lvl 5 = ~1.6k    Lvl 10 = ~9k    Lvl 20 = ~36k
// Lvl 50 = ~240k    Lvl 100 = ~990k
// =================================================================

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  return 1 + Math.floor(Math.sqrt(xp / 100));
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.pow(level - 1, 2) * 100;
}

export function xpToNextLevel(xp: number): {
  current: number;
  next: number;
  needed: number;
  pctInLevel: number;
} {
  const lvl = levelFromXp(xp);
  const floor = xpForLevel(lvl);
  const ceil = xpForLevel(lvl + 1);
  const inLvl = xp - floor;
  const span = ceil - floor;
  return {
    current: lvl,
    next: lvl + 1,
    needed: ceil - xp,
    pctInLevel: span > 0 ? Math.min(100, (inLvl / span) * 100) : 0,
  };
}

// =================================================================
// BREAKDOWN — agrupa eventos por source pra mostrar no modal
// =================================================================

export interface XpEventRow {
  source: "lift_pr" | "skill_tier" | "run_pr" | "streak_day";
  source_key: string;
  amount: number;
  awarded_at: string;
  payload: unknown;
}

export interface XpBreakdown {
  total: number;
  bySource: {
    lift_pr: number;
    skill_tier: number;
    run_pr: number;
    streak_day: number;
  };
  level: number;
  pctInLevel: number;
  needed: number;
  /** Top 5 eventos mais valiosos pra mostrar como "destaque". */
  topEvents: XpEventRow[];
}

export function summarizeXp(events: XpEventRow[]): XpBreakdown {
  const bySource = {
    lift_pr: 0,
    skill_tier: 0,
    run_pr: 0,
    streak_day: 0,
  };
  let total = 0;
  for (const e of events) {
    bySource[e.source] = (bySource[e.source] ?? 0) + e.amount;
    total += e.amount;
  }
  const lvl = levelFromXp(total);
  const next = xpToNextLevel(total);
  const topEvents = [...events]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5);
  return {
    total,
    bySource,
    level: lvl,
    pctInLevel: next.pctInLevel,
    needed: next.needed,
    topEvents,
  };
}

export function liftTierLabel(tier: Tier): string {
  return TIER_META[tier].label;
}

export function skillTierLabel(tier: SkillTier): string {
  return SKILL_TIER_META[tier].label;
}
