// Customização do avatar do gym virtual.
// Persistido em localStorage por enquanto — quando entrar a feature de
// "visitar o gym do amigo" (V3 do tentpole #2 do PR_TRACKER_VISION.md),
// migrar pra coluna pr_athletes.avatar_prefs (JSONB).

const STORAGE_KEY = "pr_gym_avatar_v3"; // v3 adicionou bodyType

export type Gender = "fluid" | "male" | "female";
export type HairStyle = "short" | "long" | "ponytail" | "bald";

/**
 * Tipos de corpo disponíveis. Cada um afeta proporções do avatar
 * (largura ombro, peito, barriga, perna, altura) em buildAvatar.
 *
 * Curva de progresso: skinny → normal → athletic → strong → giant.
 * gordo/obeso são variações de volume sem músculo definido.
 */
export type BodyType =
  | "skinny" // magro, baixa massa
  | "normal" // estrutura média
  | "athletic" // atlético, definido
  | "strong" // forte, marombeiro
  | "giant" // gigante, halterofilista pesado
  | "chubby" // gordo, forma arredondada com algum tônus
  | "obese"; // obeso, volume grande sem definição

export interface AvatarPrefs {
  gender: Gender;
  /** Cor da pele (hex). */
  skin: string;
  /** Cor do cabelo (hex). Ignorado se hairStyle = "bald". */
  hair: string;
  hairStyle: HairStyle;
  /** Cor da regata. */
  top: string;
  /** Cor do shorts. */
  shorts: string;
  /** Tipo de corpo — afeta proporções na construção do avatar. */
  bodyType: BodyType;
}

export const BODY_TYPES: Array<{ id: BodyType; label: string; emoji: string }> = [
  { id: "skinny", label: "Magro", emoji: "🦴" },
  { id: "normal", label: "Normal", emoji: "🙂" },
  { id: "athletic", label: "Atlético", emoji: "💪" },
  { id: "strong", label: "Forte", emoji: "🔥" },
  { id: "giant", label: "Gigante", emoji: "🦍" },
  { id: "chubby", label: "Gordo", emoji: "🍔" },
  { id: "obese", label: "Obeso", emoji: "🐻" },
];

/**
 * Proporções por bodyType. Multiplicadores aplicados sobre a base
 * "normal" no buildAvatar. Mantém altura constante (avatar não muda
 * de altura), só varia largura/profundidade.
 */
export interface BodyProportions {
  /** Multiplicador da largura do peito/ombros. */
  chestWidth: number;
  /** Multiplicador da profundidade do peito (frente-trás). */
  chestDepth: number;
  /** Multiplicador da largura da barriga (abaixo do peito). */
  bellyWidth: number;
  /** Multiplicador da profundidade da barriga. */
  bellyDepth: number;
  /** Multiplicador da largura dos braços. */
  armWidth: number;
  /** Multiplicador da largura das pernas. */
  legWidth: number;
  /** Cintura (entre peito e barriga) — interpolação visual. */
  hasWaist: boolean;
}

export const BODY_PROPORTIONS: Record<BodyType, BodyProportions> = {
  skinny:   { chestWidth: 0.78, chestDepth: 0.78, bellyWidth: 0.74, bellyDepth: 0.74, armWidth: 0.72, legWidth: 0.78, hasWaist: true },
  normal:   { chestWidth: 1.00, chestDepth: 1.00, bellyWidth: 1.00, bellyDepth: 1.00, armWidth: 1.00, legWidth: 1.00, hasWaist: true },
  athletic: { chestWidth: 1.12, chestDepth: 1.05, bellyWidth: 0.88, bellyDepth: 0.88, armWidth: 1.18, legWidth: 1.10, hasWaist: true },
  strong:   { chestWidth: 1.28, chestDepth: 1.18, bellyWidth: 0.96, bellyDepth: 0.96, armWidth: 1.40, legWidth: 1.22, hasWaist: true },
  giant:    { chestWidth: 1.50, chestDepth: 1.35, bellyWidth: 1.20, bellyDepth: 1.18, armWidth: 1.62, legWidth: 1.42, hasWaist: false },
  chubby:   { chestWidth: 1.18, chestDepth: 1.20, bellyWidth: 1.45, bellyDepth: 1.50, armWidth: 1.18, legWidth: 1.22, hasWaist: false },
  obese:    { chestWidth: 1.42, chestDepth: 1.42, bellyWidth: 1.85, bellyDepth: 1.95, armWidth: 1.40, legWidth: 1.50, hasWaist: false },
};

export const SKIN_TONES = [
  "#f5d7be", // Pálido
  "#e0b18a", // Médio claro
  "#c08a5e", // Médio
  "#8c5a3a", // Médio escuro
  "#5a371f", // Escuro
] as const;

export const HAIR_COLORS = [
  "#1a1410", // Preto
  "#5e3a1f", // Castanho escuro
  "#a06832", // Castanho claro
  "#d4a04a", // Loiro
  "#c2c2c2", // Grisalho
  "#d8ff2c", // Lime (provocativo, lifter brasileiro raiz)
] as const;

export const TOP_COLORS = [
  "#D8FF2C", // Lime (default)
  "#ffffff", // Branco
  "#01002A", // Navy
  "#DA291C", // Vermelho IWF
  "#0057B8", // Azul IWF
  "#111111", // Preto
] as const;

export const SHORTS_COLORS = [
  "#1e1b50", // Navy
  "#111111", // Preto
  "#4d4d51", // Cinza
  "#ffffff", // Branco
] as const;

export const DEFAULT_PREFS: AvatarPrefs = {
  gender: "fluid",
  skin: SKIN_TONES[1] ?? "#e0b18a",
  hair: HAIR_COLORS[1] ?? "#5e3a1f",
  hairStyle: "short",
  top: TOP_COLORS[0] ?? "#D8FF2C",
  shorts: SHORTS_COLORS[0] ?? "#1e1b50",
  bodyType: "athletic",
};

export function loadAvatarPrefs(): AvatarPrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<AvatarPrefs>;
    return {
      ...DEFAULT_PREFS,
      ...parsed,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

export function saveAvatarPrefs(prefs: AvatarPrefs): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // private mode etc — silencioso
  }
}
