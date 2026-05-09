import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");
  let body: { weight_kg?: number; body_fat_pct?: number; notes?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }
  const w = Number(body.weight_kg);
  if (!Number.isFinite(w) || w < 30 || w > 300) return jsonError(400, "invalid_weight");
  const bf = body.body_fat_pct != null ? Number(body.body_fat_pct) : null;
  if (bf !== null && (!Number.isFinite(bf) || bf < 3 || bf > 60)) {
    return jsonError(400, "invalid_bf");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("pr_body_log")
    .upsert(
      {
        user_id: locals.athlete.userId,
        measured_at: today,
        weight_kg: w,
        body_fat_pct: bf,
        notes: body.notes ?? null,
      },
      { onConflict: "user_id,measured_at" }
    )
    .select("id")
    .single();
  if (error) return jsonError(500, "insert_failed", error.message);
  return new Response(JSON.stringify({ id: data.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");
  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { data, error } = await supabase
    .from("pr_body_log")
    .select("measured_at, weight_kg, body_fat_pct")
    .eq("user_id", locals.athlete.userId)
    .order("measured_at", { ascending: false })
    .limit(30);
  if (error) return jsonError(500, "fetch_failed", error.message);
  return new Response(JSON.stringify({ logs: data ?? [] }), {
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
