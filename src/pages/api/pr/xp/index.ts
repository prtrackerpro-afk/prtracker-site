import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";
import { summarizeXp, type XpEventRow } from "../../../../lib/pr/gym/xp";

export const prerender = false;

export const GET: APIRoute = async ({ request, cookies, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  const { data, error } = await supabase
    .from("pr_xp_events")
    .select("source, source_key, amount, awarded_at, payload")
    .eq("user_id", athlete.userId)
    .order("amount", { ascending: false })
    .limit(500);

  if (error) return jsonError(500, "fetch_failed", error.message);

  const breakdown = summarizeXp((data ?? []) as XpEventRow[]);

  return new Response(JSON.stringify(breakdown), {
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
