import type { APIRoute } from "astro";
import { getAdminSupabase } from "../../../../lib/supabase/server";
import { exerciseLabel, type ExerciseId } from "../../../../lib/pr/exercises";

export const prerender = false;

// Returns a 1080×1920 SVG share card. Useful for desktop preview, browser
// embedding, and editing. NOT a story-ready asset on mobile — Instagram /
// TikTok mobile uploaders don't import SVG; for that we need real PNG via
// Satori/Resvg (TODO #3 in docs/PR_TRACKER_MVP.md).
//
// Service-role read because the card is meant to be embeddable (anyone with
// the link). Treat record.id as the only auth here. If we need privacy
// later, gate behind an athlete-scoped token.

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  if (!id) return new Response("missing id", { status: 400 });

  const sb = getAdminSupabase();
  const { data: record } = await sb
    .from("pr_records")
    .select("exercise, weight_kg, user_id")
    .eq("id", id)
    .maybeSingle();

  if (!record) return new Response("not found", { status: 404 });

  const { data: athlete } = await sb
    .from("pr_athletes")
    .select("display_name, instagram_handle")
    .eq("user_id", record.user_id)
    .maybeSingle();

  const name = athlete?.display_name ?? "Atleta";
  const exercise = exerciseLabel(record.exercise as ExerciseId);
  const weight = record.weight_kg;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#01002A"/>
      <stop offset="1" stop-color="#0a0050"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#bg)"/>
  <text x="540" y="280" text-anchor="middle" fill="#D8FF2C" font-family="Archivo Black, sans-serif" font-size="48" letter-spacing="8">PR TRACKER</text>
  <text x="540" y="700" text-anchor="middle" fill="#fff" font-family="Inter, sans-serif" font-size="56" font-weight="600">${escapeXml(name)}</text>
  <text x="540" y="800" text-anchor="middle" fill="#9ca3af" font-family="Inter, sans-serif" font-size="44" letter-spacing="4">${escapeXml(exercise.toUpperCase())}</text>
  <text x="540" y="1180" text-anchor="middle" fill="#D8FF2C" font-family="Archivo Black, sans-serif" font-size="320" font-weight="900">${weight}</text>
  <text x="540" y="1280" text-anchor="middle" fill="#fff" font-family="Inter, sans-serif" font-size="64" letter-spacing="10">KG</text>
  <text x="540" y="1820" text-anchor="middle" fill="#9ca3af" font-family="Inter, sans-serif" font-size="32" letter-spacing="6">@PR.TRACKER · PRTRACKER.COM.BR</text>
</svg>`;

  // Returning SVG with image/svg+xml works for download and most embeds.
  // For true PNG, swap to a Satori/Resvg pipeline.
  return new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
    },
  });
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
