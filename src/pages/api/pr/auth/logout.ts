import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

async function signOut(request: Request, cookies: Parameters<APIRoute>[0]["cookies"]) {
  const supabase = getServerSupabase({ headers: request.headers, cookies });
  await supabase.auth.signOut();
}

export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  await signOut(request, cookies);
  return redirect("/pr/login", 302);
};

// GET handler para permitir usar <a href> direto no header sem precisar
// montar um <form>. CSRF risk é desprezível pra logout (pior caso: user
// é deslogado, faz login de novo).
export const GET: APIRoute = async ({ request, cookies, redirect }) => {
  await signOut(request, cookies);
  return redirect("/pr/login", 302);
};
