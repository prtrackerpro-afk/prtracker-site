// Skills (ginásticos) — sistema de tiers por reps consecutivos.
// V13: BMU, MU, HSPU, T2B, DU, Pistol com 5 níveis (locked → diamond).

export type SkillId = "bmu" | "mu" | "hspu" | "t2b" | "du" | "pistol";

export type SkillTier = "locked" | "unlocked" | "bronze" | "silver" | "gold" | "diamond";

export interface SkillCatalogEntry {
  id: SkillId;
  short: string;
  label: string;
  /** Unidade de medida — "reps" pra BMU/MU/etc, "reps" tb pra DU. */
  unit: "reps";
}

export const SKILL_CATALOG: SkillCatalogEntry[] = [
  { id: "bmu", short: "BMU", label: "Bar Muscle-Up", unit: "reps" },
  { id: "mu", short: "MU", label: "Ring Muscle-Up", unit: "reps" },
  { id: "hspu", short: "HSPU", label: "Handstand Push-Up", unit: "reps" },
  { id: "t2b", short: "T2B", label: "Toes-to-Bar", unit: "reps" },
  { id: "du", short: "DU", label: "Double-Under", unit: "reps" },
  { id: "pistol", short: "PISTOL", label: "Pistol Squat", unit: "reps" },
];

/**
 * Thresholds por tier — baseados em reps consecutivos.
 * DU é diferente (corda dá número alto fácil) mas mantemos
 * a mesma curva pra V13. Ajuste futuro: por skill.
 */
export const SKILL_THRESHOLDS: Array<{ tier: SkillTier; minReps: number }> = [
  { tier: "diamond", minReps: 20 },
  { tier: "gold", minReps: 10 },
  { tier: "silver", minReps: 5 },
  { tier: "bronze", minReps: 3 },
  { tier: "unlocked", minReps: 1 },
];

export function tierForReps(reps: number): SkillTier {
  for (const t of SKILL_THRESHOLDS) {
    if (reps >= t.minReps) return t.tier;
  }
  return "locked";
}

export interface SkillTierMeta {
  label: string;
  /** Cor do disco da medalha. */
  color: string;
  /** Cor do texto/sigla sobre o disco. */
  textColor: string;
  /** Ícone curto pra HUD. */
  icon: string;
  rank: number;
}

export const SKILL_TIER_META: Record<SkillTier, SkillTierMeta> = {
  locked: {
    label: "Bloqueado",
    color: "#3a3a44",
    textColor: "#6a6a74",
    icon: "?",
    rank: 0,
  },
  unlocked: {
    label: "Desbloqueado",
    color: "#9aa3b0",
    textColor: "#01002A",
    icon: "✓",
    rank: 1,
  },
  bronze: {
    label: "Bronze",
    color: "#cd7f32",
    textColor: "#1a0a00",
    icon: "🥉",
    rank: 2,
  },
  silver: {
    label: "Prata",
    color: "#c0c5cc",
    textColor: "#0a0a14",
    icon: "🥈",
    rank: 3,
  },
  gold: {
    label: "Ouro",
    color: "#FFC72C",
    textColor: "#1a1100",
    icon: "🥇",
    rank: 4,
  },
  diamond: {
    label: "Diamante",
    color: "#7df9ff",
    textColor: "#001a1f",
    icon: "💎",
    rank: 5,
  },
};

/** Próximo tier a partir do atual + reps faltando. Null se diamante. */
export function nextTierGoal(reps: number): { tier: SkillTier; repsToGo: number } | null {
  const ascending = [...SKILL_THRESHOLDS].reverse();
  for (const t of ascending) {
    if (reps < t.minReps) return { tier: t.tier, repsToGo: t.minReps - reps };
  }
  return null;
}

// =================================================================
// RUNS — corrida 5K/10K/21K/42K com tempo em segundos
// =================================================================

export type RunDistance = "5k" | "10k" | "21k" | "42k";

export interface RunCatalogEntry {
  id: RunDistance;
  short: string;
  label: string;
}

export const RUN_CATALOG: RunCatalogEntry[] = [
  { id: "5k", short: "5KM", label: "5 km" },
  { id: "10k", short: "10KM", label: "10 km" },
  { id: "21k", short: "21KM", label: "Meia maratona" },
  { id: "42k", short: "42KM", label: "Maratona" },
];

/** Formata segundos como HH:MM:SS (sempre, mesmo se for menor que 1h). */
export function formatRunTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

/** Parse "MM:SS" ou "HH:MM:SS" ou "h:mm:ss" pra segundos. Null se inválido. */
export function parseRunTime(input: string): number | null {
  const clean = input.trim();
  if (!clean) return null;
  const parts = clean.split(":").map((p) => p.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  let h = 0, m = 0, s = 0;
  if (parts.length === 2) {
    [m, s] = nums as [number, number];
  } else {
    [h, m, s] = nums as [number, number, number];
  }
  if (m >= 60 || s >= 60) return null;
  const total = h * 3600 + m * 60 + s;
  if (total <= 0 || total >= 86400) return null;
  return total;
}
