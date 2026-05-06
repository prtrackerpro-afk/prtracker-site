import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// Create a new box, owned by the current authenticated athlete.
// Slug must be unique. Box owner can later edit name/city/coupon via the
// admin page (TODO).

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: {
    name?: string;
    slug?: string;
    city?: string;
    state?: string;
    instagram_handle?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const name = (body.name ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    return jsonError(400, "invalid_name", "Nome deve ter entre 2 e 80 caracteres.");
  }

  const slug = (body.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug)) {
    return jsonError(
      400,
      "invalid_slug",
      "Slug deve ter entre 3-40 caracteres, letras minúsculas, números e hífens."
    );
  }

  const city = body.city?.trim() || null;
  const state = body.state?.trim().toUpperCase() || null;
  const handle = body.instagram_handle?.trim().replace(/^@/, "") || null;
  if (handle && !/^[a-zA-Z0-9._]{1,30}$/.test(handle)) {
    return jsonError(400, "invalid_handle");
  }
  if (state && !/^[A-Z]{2}$/.test(state)) {
    return jsonError(400, "invalid_state", "UF deve ter 2 letras.");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Check uniqueness
  const { data: existing } = await supabase
    .from("pr_boxes")
    .select("id, owner_user_id")
    .eq("slug", slug)
    .maybeSingle();
  if (existing) {
    return jsonError(409, "slug_taken", `Slug "${slug}" já está em uso.`);
  }

  const { data: created, error } = await supabase
    .from("pr_boxes")
    .insert({
      slug,
      name,
      city,
      state,
      instagram_handle: handle,
      owner_user_id: athlete.userId,
    })
    .select("id, slug")
    .single();

  if (error || !created) {
    return jsonError(500, "create_failed", error?.message);
  }

  // Auto-join the owner so the leaderboard includes their PRs.
  await supabase.from("pr_box_members").upsert(
    { box_id: created.id, user_id: athlete.userId },
    { onConflict: "box_id,user_id" }
  );

  return new Response(JSON.stringify({ ok: true, slug: created.slug }), {
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
