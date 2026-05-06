import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../lib/supabase/server";
import { isExercise } from "../../../../lib/pr/exercises";
import { renderCardSvg } from "../../../../lib/pr/card-svg";

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
    .select("display_name")
    .eq("user_id", record.user_id)
    .maybeSingle();

  const svg = renderCardSvg({
    athleteName: athlete?.display_name ?? "Atleta",
    exerciseId: record.exercise,
    weightKg: Number(record.weight_kg),
    performedAt: record.performed_at,
  });

  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
};
