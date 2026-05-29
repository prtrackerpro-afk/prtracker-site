/**
 * PR Tracker — shared catalog constants.
 *
 * Weights, colors, pricing for barbell plates. Used by the configurator,
 * cart, product pages, and checkout. Single source of truth.
 *
 * See BRIEF.md and CLAUDE.md for the brand decisions behind these values.
 */

/** Plate weight identifier (keep as string to avoid JS float issues with 1.25 etc.). */
export type PlateId = "25" | "20" | "15" | "10" | "5" | "2_5" | "1_25";

export interface PlateSpec {
  /** id used in selects, cart lines, etc. */
  id: PlateId;
  /** label shown in UI. */
  label: string;
  /** actual kg value. */
  kg: number;
  /** CSS fill color (IWF Pantone for 25/20/15/10, BRIEF for smaller). */
  color: string;
  /** Rendered thickness in the SVG, in mm. Real product: 4–8mm. */
  thicknessMm: number;
  /** Price per pair, in BRL cents. */
  pricePerPairCents: number;
  /** Max pairs the buyer can add to one barbell. */
  maxPairs: number;
}

// Real product: all plates share the same 42mm diameter. Only thickness varies.
export const PLATES: PlateSpec[] = [
  { id: "25",   label: "25 kg",   kg: 25,   color: "#DA291C", thicknessMm: 8, pricePerPairCents: 700, maxPairs: 4 },
  { id: "20",   label: "20 kg",   kg: 20,   color: "#0057B8", thicknessMm: 8, pricePerPairCents: 700, maxPairs: 4 },
  { id: "15",   label: "15 kg",   kg: 15,   color: "#FFC72C", thicknessMm: 7, pricePerPairCents: 700, maxPairs: 4 },
  { id: "10",   label: "10 kg",   kg: 10,   color: "#43B02A", thicknessMm: 6, pricePerPairCents: 700, maxPairs: 4 },
  { id: "5",    label: "5 kg",    kg: 5,    color: "#111111", thicknessMm: 5, pricePerPairCents: 700, maxPairs: 4 },
  { id: "2_5",  label: "2.5 kg",  kg: 2.5,  color: "#2563EB", thicknessMm: 4, pricePerPairCents: 700, maxPairs: 1 },
  { id: "1_25", label: "1.25 kg", kg: 1.25, color: "#C0C5CC", thicknessMm: 4, pricePerPairCents: 700, maxPairs: 1 },
];

export function plateById(id: PlateId): PlateSpec {
  const plate = PLATES.find((p) => p.id === id);
  if (!plate) throw new Error(`Unknown plate id: ${id}`);
  return plate;
}

/** Weight of the barbell itself (kg). Display-only. */
export const BARBELL_WEIGHT_KG = 20;

/** Physical space limit per side of the barbell (mm). */
export const MAX_SIDE_SPACE_MM = 45;

/** Pix discount — multiply total by (1 - this) to get the Pix price. */
export const PIX_DISCOUNT = 0.05;

/** Max installments on credit card (no interest). */
export const MAX_INSTALLMENTS = 3;

/** My PR Set exercise list (20). Alphabetical. */
export const EXERCISES = [
  "Back Squat",
  "Bench Press",
  "Clean",
  "Clean & Jerk",
  "Deadlift",
  "Front Squat",
  "Hang Clean",
  "Hang Power Clean",
  "Overhead Squat",
  "Power Clean",
  "Power Snatch",
  "Push Jerk",
  "Push Press",
  "Shoulder Press",
  "Snatch",
  "Split Jerk",
  "Squat Clean",
  "Squat Snatch",
  "Sumo Deadlift",
  "Thruster",
] as const;

export type Exercise = (typeof EXERCISES)[number];

/** Product category → human label for breadcrumbs / cards. */
export const CATEGORY_LABELS: Record<string, string> = {
  "pr-trackers": "PR Trackers",
  "pr-runners": "PR Runners",
  anilhas: "Anilhas",
  camisetas: "Camisetas",
  "gift-cards": "Vale-Presente",
};

/** Denominações oficiais do vale-presente (centavos). */
export const GIFT_CARD_DENOMINATIONS_CENTS = [
  10_000, 15_000, 20_000, 30_000, 50_000,
] as const;
export type GiftCardDenominationCents =
  (typeof GIFT_CARD_DENOMINATIONS_CENTS)[number];

/** Validade padrão do vale-presente em meses. */
export const GIFT_CARD_VALIDITY_MONTHS = 12;

/**
 * Lista de exercícios para os produtos "PR Tracker Board".
 *
 * Atende dois públicos com vocabulários diferentes:
 *   - Crossfitters / atletas internacionais → usam termos em INGLÊS
 *     (Back Squat, Snatch, Clean & Jerk, Deadlift, Bench Press).
 *   - Powerlifters / halterofilistas brasileiros → usam termos em
 *     PORTUGUÊS (Agachamento, Arranco, Arremesso, Levantamento Terra,
 *     Supino).
 *
 * Por isso os 5 exercícios principais com tradução estabelecida no
 * Brasil aparecem em DUAS entradas distintas (EN e PT). O cliente
 * escolhe o termo que prefere ver IMPRESSO no produto físico. O
 * `value` (= termo escolhido) vai pro Bling SKU e é a string que vira
 * o label do board.
 */
export interface BoardExerciseOption {
  /** Valor canônico — mesmo termo que vai pro Bling + impresso no board. */
  value: string;
  /** Label mostrado no dropdown (pode ter sufixo "(EN)" ou "(PT)" pra dirimir). */
  label: string;
  /** Idioma — pra UI poder ordenar/destacar. */
  lang: "pt" | "en";
}

/**
 * Lista ordenada alfabeticamente. Exercícios com nome bilíngue
 * aparecem em ambas as línguas. Demais exercícios (Hang Clean,
 * Thruster etc.) só em inglês — termos consagrados no jargão do
 * CrossFit/LPO brasileiro sem tradução comum.
 */
export const BOARD_EXERCISES: BoardExerciseOption[] = [
  { value: "Agachamento",       label: "Agachamento",        lang: "pt" },
  { value: "Arranco",           label: "Arranco",            lang: "pt" },
  { value: "Arremesso",         label: "Arremesso",          lang: "pt" },
  { value: "Back Squat",        label: "Back Squat",         lang: "en" },
  { value: "Bench Press",       label: "Bench Press",        lang: "en" },
  { value: "Clean",             label: "Clean",              lang: "en" },
  { value: "Clean & Jerk",      label: "Clean & Jerk",       lang: "en" },
  { value: "Deadlift",          label: "Deadlift",           lang: "en" },
  { value: "Front Squat",       label: "Front Squat",        lang: "en" },
  { value: "Hang Clean",        label: "Hang Clean",         lang: "en" },
  { value: "Hang Power Clean",  label: "Hang Power Clean",   lang: "en" },
  { value: "Levantamento Terra", label: "Levantamento Terra", lang: "pt" },
  { value: "Overhead Squat",    label: "Overhead Squat",     lang: "en" },
  { value: "Power Clean",       label: "Power Clean",        lang: "en" },
  { value: "Power Snatch",      label: "Power Snatch",       lang: "en" },
  { value: "Push Jerk",         label: "Push Jerk",          lang: "en" },
  { value: "Push Press",        label: "Push Press",         lang: "en" },
  { value: "Shoulder Press",    label: "Shoulder Press",     lang: "en" },
  { value: "Snatch",            label: "Snatch",             lang: "en" },
  { value: "Split Jerk",        label: "Split Jerk",         lang: "en" },
  { value: "Squat Clean",       label: "Squat Clean",        lang: "en" },
  { value: "Squat Snatch",      label: "Squat Snatch",       lang: "en" },
  { value: "Sumo Deadlift",     label: "Sumo Deadlift",      lang: "en" },
  { value: "Supino",            label: "Supino",             lang: "pt" },
  { value: "Thruster",          label: "Thruster",           lang: "en" },
];

/**
 * Cores disponíveis dos PR Tracker Boards.
 *
 * - `cobre`: cor default, premium, alaranjada (Pantone-like cobre brunido).
 * - `preto`: visual sóbrio, alto contraste com label branco.
 * - `rosa`: cor referência da foto do protótipo (rosa pink vibrante).
 */
export interface BoardColorOption {
  /** Valor canônico (lowercase, sem acento) — vai pro Bling SKU. */
  value: "cobre" | "preto" | "rosa";
  /** Label de display. */
  label: string;
  /** HEX da cor da placa (fundo). */
  hex: string;
  /** HEX do texto/label sobre a placa. */
  textHex: string;
}

export const BOARD_COLORS: BoardColorOption[] = [
  { value: "cobre", label: "Cobre", hex: "#B87333", textHex: "#FFFFFF" },
  { value: "preto", label: "Preto", hex: "#111111", textHex: "#FFFFFF" },
  { value: "rosa",  label: "Rosa",  hex: "#E91E63", textHex: "#FFFFFF" },
];

export type BoardColor = (typeof BOARD_COLORS)[number]["value"];

export function boardColorByValue(value: string): BoardColorOption {
  const c = BOARD_COLORS.find((c) => c.value === value);
  if (!c) throw new Error(`Unknown board color: ${value}`);
  return c;
}

/**
 * Distâncias do "Meus RPs" (PR Runners) — primeira linha de corrida.
 *
 * Cada uma vira uma "linha" no produto físico com a distância (label) e
 * um tempo (ou cadeado se vazio). A ordem é fixa, do mais curto ao mais
 * longo.
 */
export interface RunDistance {
  /** Chave canônica (vai pro cart e pro Bling). */
  key: "5km" | "10km" | "21km" | "42km";
  /** Label exibido no produto e no preview. */
  label: string;
  /** Distância nominal em km (info, não usado para cálculo). */
  km: number;
}

export const RUN_DISTANCES: RunDistance[] = [
  { key: "5km",  label: "5KM",  km: 5 },
  { key: "10km", label: "10KM", km: 10 },
  { key: "21km", label: "21KM", km: 21.0975 },
  { key: "42km", label: "42KM", km: 42.195 },
];

export type RunDistanceKey = (typeof RUN_DISTANCES)[number]["key"];

/**
 * Aceita "hh:mm:ss" ou "mm:ss" e devolve o formato canônico "hh:mm:ss".
 * Retorna `null` se o input não bater no padrão (campo fica vazio = cadeado).
 *
 * Validações:
 *   - hh ∈ [0, 23], mm ∈ [0, 59], ss ∈ [0, 59].
 *   - Aceita "0:00:00" como tempo válido (display real, não cadeado).
 */
export function normalizeRunTime(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = Number(parts[0]); m = Number(parts[1]); s = Number(parts[2]);
  } else {
    m = Number(parts[0]); s = Number(parts[1]);
  }
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null;
  const pad = (n: number) => String(Math.floor(n)).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}
