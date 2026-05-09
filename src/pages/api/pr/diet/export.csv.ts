import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// CSV export de meal_log + body_log + water dos ultimos 30 dias
export const GET: APIRoute = async ({ request, cookies, locals, url }) => {
  if (!locals.athlete) return new Response("unauthorized", { status: 401 });
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get("days") ?? "30")));

  const past = new Date();
  past.setDate(past.getDate() - days);
  past.setHours(0, 0, 0, 0);

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  const { data: meals = [] } = await supabase
    .from("pr_meal_log")
    .select(
      "consumed_at, meal_type, qty_g, custom_name, custom_kcal, custom_protein_g, custom_carbs_g, custom_fat_g, pr_food_db(name, kcal, protein_g, carbs_g, fat_g)"
    )
    .eq("user_id", locals.athlete.userId)
    .gte("consumed_at", past.toISOString())
    .order("consumed_at", { ascending: true });

  const lines = ["date,meal_type,food,qty_g,kcal,protein_g,carbs_g,fat_g"];
  type MealRow = {
    consumed_at: string;
    meal_type: string;
    qty_g: number;
    custom_name: string | null;
    custom_kcal: number | null;
    custom_protein_g: number | null;
    custom_carbs_g: number | null;
    custom_fat_g: number | null;
    pr_food_db: { name: string; kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null;
  };
  for (const m of (meals ?? []) as MealRow[]) {
    const factor = m.qty_g / 100;
    const food = m.pr_food_db;
    const name = food?.name ?? m.custom_name ?? "?";
    const kcal = (food?.kcal ?? m.custom_kcal ?? 0) * factor;
    const p = (food?.protein_g ?? m.custom_protein_g ?? 0) * factor;
    const c = (food?.carbs_g ?? m.custom_carbs_g ?? 0) * factor;
    const f = (food?.fat_g ?? m.custom_fat_g ?? 0) * factor;
    const date = m.consumed_at.slice(0, 10);
    const safeName = name.replace(/,/g, ";").replace(/"/g, "'");
    lines.push(
      `${date},${m.meal_type},"${safeName}",${m.qty_g},${kcal.toFixed(1)},${p.toFixed(1)},${c.toFixed(1)},${f.toFixed(1)}`
    );
  }

  return new Response(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="dieta_${days}d.csv"`,
    },
  });
};
