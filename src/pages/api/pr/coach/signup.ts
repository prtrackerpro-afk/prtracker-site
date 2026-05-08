import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

const VALID_TYPES = new Set(["personal_trainer", "nutritionist"]);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  let body: {
    coach_type?: string;
    display_name?: string;
    cref?: string;
    bio?: string;
    city?: string;
    state?: string;
    specialties?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const coachType = String(body.coach_type ?? "");
  if (!VALID_TYPES.has(coachType)) return jsonError(400, "invalid_type");

  const name = String(body.display_name ?? "").trim();
  if (name.length < 3 || name.length > 60) {
    return jsonError(400, "invalid_name");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  const { error } = await supabase.from("pr_coaches").upsert({
    user_id: locals.athlete.userId,
    coach_type: coachType,
    display_name: name,
    cref: body.cref ?? null,
    bio: body.bio ?? null,
    city: body.city ?? null,
    state: body.state ?? null,
    specialties: body.specialties ?? [],
    status: "pending",
  });

  if (error) return jsonError(500, "upsert_failed", error.message);

  return new Response(JSON.stringify({ ok: true }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
