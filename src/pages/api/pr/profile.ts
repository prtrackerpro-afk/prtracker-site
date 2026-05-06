import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../lib/supabase/server";

export const prerender = false;

// Upsert the athlete's profile (display_name + instagram_handle + box).
// Idempotent — first call inserts, subsequent calls update.

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: {
    display_name?: string;
    instagram_handle?: string | null;
    primary_box_id?: string | null;
    body_weight_kg?: number | null;
    sex?: "male" | "female" | null;
    birth_year?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const displayName = (body.display_name ?? "").trim();
  if (displayName.length < 2 || displayName.length > 60) {
    return jsonError(400, "invalid_display_name", "Nome deve ter entre 2 e 60 caracteres.");
  }

  const handle = (body.instagram_handle ?? "").toString().trim().replace(/^@/, "");
  if (handle && !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
    return jsonError(400, "invalid_handle", "Handle do Instagram inválido.");
  }

  const bw = body.body_weight_kg;
  if (bw != null && (typeof bw !== "number" || bw < 30 || bw > 300)) {
    return jsonError(400, "invalid_body_weight", "Peso corporal fora do intervalo aceito (30–300 kg).");
  }

  const sex = body.sex ?? null;
  if (sex != null && sex !== "male" && sex !== "female") {
    return jsonError(400, "invalid_sex");
  }

  const currentYear = new Date().getFullYear();
  const birthYear = body.birth_year ?? null;
  if (birthYear != null && (typeof birthYear !== "number" || birthYear < 1920 || birthYear > currentYear)) {
    return jsonError(400, "invalid_birth_year");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_athletes")
    .upsert(
      {
        user_id: athlete.userId,
        display_name: displayName,
        instagram_handle: handle || null,
        primary_box_id: body.primary_box_id ?? null,
        body_weight_kg: bw ?? null,
        sex,
        birth_year: birthYear,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    return jsonError(500, "save_failed", error.message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
