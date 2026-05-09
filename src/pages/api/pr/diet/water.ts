import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");
  let body: { qty_ml?: number };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }
  const qty = Math.floor(Number(body.qty_ml ?? 250));
  if (qty < 50 || qty > 5000) return jsonError(400, "invalid_qty");

  const supabase = getServerSupabase({ headers: request.headers, cookies });
  const { data, error } = await supabase
    .from("pr_water_log")
    .insert({ user_id: locals.athlete.userId, qty_ml: qty })
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
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { data, error } = await supabase
    .from("pr_water_log")
    .select("qty_ml")
    .eq("user_id", locals.athlete.userId)
    .gte("consumed_at", today.toISOString());
  if (error) return jsonError(500, "fetch_failed", error.message);
  const total = (data ?? []).reduce((acc, r) => acc + (r.qty_ml as number), 0);
  return new Response(JSON.stringify({ total_ml: total }), {
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
