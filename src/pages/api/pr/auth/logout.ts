import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  const supabase = getServerSupabase({ headers: request.headers, cookies });
  await supabase.auth.signOut();
  return redirect("/pr/login", 302);
};
