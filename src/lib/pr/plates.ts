// Greedy split of total weight into pairs of plates, respecting the
// per-plate maximums in the official price table (Brand Bible §Preços).
//
// Bar weight is fixed at 20 kg (Olympic). Total weight = bar + 2 × Σplates.

export const BAR_KG = 20;

// Order matters: greedy descends from heaviest. Limits mirror the
// "Anilhas avulsas" table in CLAUDE.md. `id` matches `PlateId` in
// src/lib/catalog.ts so the configurator can read our `?p=` querystring.
export const PLATE_CATALOG = [
  { id: "25",   kg: 25,   maxPairs: 4 },
  { id: "20",   kg: 20,   maxPairs: 4 },
  { id: "15",   kg: 15,   maxPairs: 4 },
  { id: "10",   kg: 10,   maxPairs: 4 },
  { id: "5",    kg: 5,    maxPairs: 4 },
  { id: "2_5",  kg: 2.5,  maxPairs: 1 },
  { id: "1_25", kg: 1.25, maxPairs: 1 },
] as const;

export type PlateKg = (typeof PLATE_CATALOG)[number]["kg"];

export interface PlateSplit {
  /** kg per side (excluding bar). */
  perSide: number;
  /** Pairs of each plate weight, in descending order. */
  pairs: { kg: PlateKg; count: number }[];
  /** Total weight the split actually achieves (may differ from input if not representable). */
  achieved: number;
  /** Leftover kg that couldn't fit into the catalog (rounded to .25). */
  leftover: number;
}

/**
 * Greedy split. Input is *total* PR weight in kg (bar included).
 * Returns the closest representable configuration not exceeding the input.
 */
export function splitPlates(totalKg: number): PlateSplit {
  const target = totalKg - BAR_KG;
  if (target <= 0) {
    return { perSide: 0, pairs: [], achieved: BAR_KG, leftover: Math.max(0, target) };
  }
  let remaining = target / 2; // per side
  const pairs: { kg: PlateKg; count: number }[] = [];

  for (const { kg, maxPairs } of PLATE_CATALOG) {
    if (remaining <= 0) break;
    const count = Math.min(maxPairs, Math.floor(remaining / kg + 1e-9));
    if (count > 0) {
      pairs.push({ kg, count });
      remaining -= count * kg;
    }
  }

  const perSide = (target / 2) - remaining;
  return {
    perSide,
    pairs,
    achieved: BAR_KG + perSide * 2,
    leftover: Math.max(0, Math.round(remaining * 100) / 100),
  };
}

/**
 * Builds the deep-link query string for the BarbellConfigurator.
 * The configurator (src/components/BarbellConfigurator.astro) reads:
 *   ?p=<plateId>x<pairs>;<plateId>x<pairs>... — pre-selected plates
 *   ?ex=<exercise_id>                          — pre-selected exercise (My PR Set)
 *   ?w=<totalKg>                               — informational, used by banner
 *   ?from=<source>                             — UTM-style source tag
 *   ?prId=<uuid>                               — back-reference for attribution
 *
 * Plate IDs match `PlateId` in src/lib/catalog.ts (e.g. "2_5" not "2.5").
 */
export function configuratorQuery(
  totalKg: number,
  exerciseId: string,
  source: string = "pr",
  prRecordId?: string
): string {
  const split = splitPlates(totalKg);
  const idByKg = new Map(PLATE_CATALOG.map((p) => [p.kg, p.id]));
  const params = new URLSearchParams({
    w: String(totalKg),
    ex: exerciseId,
    from: source,
  });
  if (prRecordId) params.set("prId", prRecordId);
  if (split.pairs.length > 0) {
    params.set(
      "p",
      split.pairs
        .map((p) => `${idByKg.get(p.kg) ?? p.kg}x${p.count}`)
        .join(";")
    );
  }
  return params.toString();
}
