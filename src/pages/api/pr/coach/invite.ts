import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Verifica se eh coach approved
  const { data: coach } = await supabase
    .from("pr_coaches")
    .select("coach_type, status")
    .eq("user_id", locals.athlete.userId)
    .maybeSingle();

  if (!coach || coach.status !== "approved") {
    return jsonError(403, "not_approved", "Cadastro ainda não foi aprovado.");
  }

  const { data, error } = await supabase
    .from("pr_coach_invites")
    .insert({
      coach_id: locals.athlete.userId,
      coach_type: coach.coach_type,
    })
    .select("token, expires_at")
    .single();

  if (error) return jsonError(500, "insert_failed", error.message);

  return new Response(JSON.stringify({ token: data.token, expires_at: data.expires_at }), {
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
