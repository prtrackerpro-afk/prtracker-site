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

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { error } = await supabase
    .from("pr_athletes")
    .upsert(
      {
        user_id: athlete.userId,
        display_name: displayName,
        instagram_handle: handle || null,
        primary_box_id: body.primary_box_id ?? null,
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
