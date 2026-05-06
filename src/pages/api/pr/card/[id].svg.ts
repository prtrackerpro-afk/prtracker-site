import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../lib/supabase/server";
import { isExercise } from "../../../../lib/pr/exercises";
import { renderCardSvg } from "../../../../lib/pr/card-svg";
import { tierForLift } from "../../../../lib/pr/strength-score";

export const prerender = false;

// Returns a 1080×1920 SVG share card. Composition lives in lib/pr/card-svg.ts
// so the same renderer can be inlined in /pr/celebrate (no extra HTTP hop).
//
// Public read by record id — anyone with the link can render the card.
// IDs are uuid v4, unguessable; treat that as the only auth here.

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });

  const sb = getAdminSupabase();
  const { data: record } = await sb
    .from("pr_records")
    .select("exercise, weight_kg, performed_at, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!record || !isExercise(record.exercise)) {
    return new Response("not found", { status: 404 });
  }

  const { data: athlete } = await sb
    .from("pr_athletes")
    .select("display_name, body_weight_kg, sex")
    .eq("user_id", record.user_id)
    .maybeSingle();

  const bodyWeightKg = athlete?.body_weight_kg != null ? Number(athlete.body_weight_kg) : null;
  const sex = (athlete?.sex as "male" | "female" | undefined) ?? null;

  // Compute the per-lift tier when body data is available.
  const strength = bodyWeightKg && sex
    ? (() => {
        const score = tierForLift(record.exercise, Number(record.weight_kg), bodyWeightKg, sex);
        // Percentile derived from tier rank (V1: static buckets).
        const tierToPercentile = { iniciante: 30, novato: 60, intermediario: 80, avancado: 95, elite: 99 } as const;
        return {
          tier: score.tier,
          ratio: score.ratio,
          percentile: tierToPercentile[score.tier],
          nextTier: score.nextTier,
          nextTierKg: score.kgToNextTier,
        };
      })()
    : null;

  const svg = renderCardSvg({
    athleteName: athlete?.display_name ?? "Atleta",
    exerciseId: record.exercise,
    weightKg: Number(record.weight_kg),
    performedAt: record.performed_at,
    strength,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
};
