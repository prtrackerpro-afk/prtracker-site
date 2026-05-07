// Customização do avatar do gym virtual.
// Persistido em localStorage por enquanto — quando entrar a feature de
// "visitar o gym do amigo" (V3 do tentpole #2 do PR_TRACKER_VISION.md),
// migrar pra coluna pr_athletes.avatar_prefs (JSONB).

const STORAGE_KEY = "pr_gym_avatar_v2";

export type Gender = "fluid" | "male" | "female";
export type HairStyle = "short" | "long" | "ponytail" | "bald";

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
}

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
