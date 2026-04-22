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
  { id: "25",   label: "25 kg",   kg: 25,   color: "#DA291C", thicknessMm: 8, pricePerPairCents: 1500, maxPairs: 4 },
  { id: "20",   label: "20 kg",   kg: 20,   color: "#0057B8", thicknessMm: 8, pricePerPairCents: 1000, maxPairs: 4 },
  { id: "15",   label: "15 kg",   kg: 15,   color: "#FFC72C", thicknessMm: 7, pricePerPairCents: 1000, maxPairs: 4 },
  { id: "10",   label: "10 kg",   kg: 10,   color: "#43B02A", thicknessMm: 6, pricePerPairCents: 1000, maxPairs: 4 },
  { id: "5",    label: "5 kg",    kg: 5,    color: "#111111", thicknessMm: 5, pricePerPairCents: 1000, maxPairs: 4 },
  { id: "2_5",  label: "2.5 kg",  kg: 2.5,  color: "#2563EB", thicknessMm: 4, pricePerPairCents: 1000, maxPairs: 1 },
  { id: "1_25", label: "1.25 kg", kg: 1.25, color: "#C0C5CC", thicknessMm: 4, pricePerPairCents: 1000, maxPairs: 1 },
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
export const MAX_INSTALLMENTS = 6;

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
  anilhas: "Anilhas",
  camisetas: "Camisetas",
};
