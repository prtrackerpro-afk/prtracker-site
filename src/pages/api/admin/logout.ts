import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies }) => {
  const supabase = getServerSupabase({ headers: request.headers, cookies });
  await supabase.auth.signOut();
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
