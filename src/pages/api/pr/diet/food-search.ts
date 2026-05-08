import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, locals, url }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return new Response(JSON.stringify({ foods: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // ILIKE com prefix + match parcial (limite 20)
  const { data, error } = await supabase
    .from("pr_food_db")
    .select("id, name, brand, kcal, protein_g, carbs_g, fat_g, category")
    .eq("status", "approved")
    .ilike("name", `%${q}%`)
    .limit(20);

  if (error) return jsonError(500, "fetch_failed", error.message);

  return new Response(JSON.stringify({ foods: data ?? [] }), {
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
