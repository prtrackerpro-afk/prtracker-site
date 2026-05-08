import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

const VALID_MEAL_TYPES = new Set([
  "breakfast",
  "morning_snack",
  "lunch",
  "afternoon_snack",
  "dinner",
  "evening_snack",
  "pre_workout",
  "post_workout",
]);

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  let body: {
    meal_type?: string;
    food_id?: string;
    custom_name?: string;
    custom_kcal?: number;
    custom_protein_g?: number;
    custom_carbs_g?: number;
    custom_fat_g?: number;
    qty_g?: number;
    notes?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const mealType = String(body.meal_type ?? "");
  if (!VALID_MEAL_TYPES.has(mealType)) {
    return jsonError(400, "invalid_meal_type");
  }

  const qty = Number(body.qty_g);
  if (!Number.isFinite(qty) || qty <= 0 || qty > 5000) {
    return jsonError(400, "invalid_qty", "Quantidade fora do intervalo.");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  const { data, error } = await supabase
    .from("pr_meal_log")
    .insert({
      user_id: athlete.userId,
      meal_type: mealType,
      food_id: body.food_id ?? null,
      custom_name: body.custom_name ?? null,
      custom_kcal: body.custom_kcal ?? null,
      custom_protein_g: body.custom_protein_g ?? null,
      custom_carbs_g: body.custom_carbs_g ?? null,
      custom_fat_g: body.custom_fat_g ?? null,
      qty_g: qty,
      notes: body.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return jsonError(500, "insert_failed", error.message);

  return new Response(JSON.stringify({ id: data.id }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};

export const GET: APIRoute = async ({ request, cookies, locals, url }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  // Range: hoje (default) ou ?date=YYYY-MM-DD ou ?range=week
  const dateParam = url.searchParams.get("date");
  const range = url.searchParams.get("range");

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  let from: Date;
  let to: Date;
  const now = new Date();
  if (range === "week") {
    from = new Date(now);
    from.setDate(from.getDate() - 6);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  } else if (dateParam) {
    const d = new Date(dateParam + "T00:00:00");
    from = d;
    to = new Date(d);
    to.setHours(23, 59, 59, 999);
  } else {
    from = new Date(now);
    from.setHours(0, 0, 0, 0);
    to = new Date(now);
    to.setHours(23, 59, 59, 999);
  }

  const { data, error } = await supabase
    .from("pr_meal_log")
    .select(
      "id, meal_type, consumed_at, qty_g, notes, food_id, custom_name, custom_kcal, custom_protein_g, custom_carbs_g, custom_fat_g, pr_food_db(name, kcal, protein_g, carbs_g, fat_g)"
    )
    .eq("user_id", athlete.userId)
    .gte("consumed_at", from.toISOString())
    .lte("consumed_at", to.toISOString())
    .order("consumed_at", { ascending: true });

  if (error) return jsonError(500, "fetch_failed", error.message);

  return new Response(JSON.stringify({ meals: data }), {
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
