import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.athlete) return jsonError(401, "unauthorized");

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const token = String(body.token ?? "").trim();
  if (token.length < 16 || token.length > 64) {
    return jsonError(400, "invalid_token");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Busca o convite
  const { data: invite, error: fetchErr } = await supabase
    .from("pr_coach_invites")
    .select("token, coach_id, coach_type, expires_at, redeemed_by, redeemed_at")
    .eq("token", token)
    .maybeSingle();

  if (fetchErr || !invite) {
    return jsonError(404, "invite_not_found", "Convite inválido ou expirado.");
  }
  if (invite.redeemed_at) {
    return jsonError(409, "already_redeemed", "Convite já foi usado.");
  }
  if (new Date(invite.expires_at) < new Date()) {
    return jsonError(410, "expired", "Convite expirou. Pede novo ao coach.");
  }
  if (invite.coach_id === locals.athlete.userId) {
    return jsonError(400, "self_invite", "Você não pode aceitar seu próprio convite.");
  }

  // Marca como redeemed
  const { error: updErr } = await supabase
    .from("pr_coach_invites")
    .update({
      redeemed_by: locals.athlete.userId,
      redeemed_at: new Date().toISOString(),
    })
    .eq("token", token);

  if (updErr) return jsonError(500, "redeem_failed", updErr.message);

  // Cria vínculo coach <-> atleta
  const { error: linkErr } = await supabase.from("pr_coach_athletes").insert({
    coach_id: invite.coach_id,
    athlete_id: locals.athlete.userId,
    coach_type: invite.coach_type,
    started_at: new Date().toISOString().slice(0, 10),
  });

  if (linkErr && !linkErr.message.includes("duplicate")) {
    return jsonError(500, "link_failed", linkErr.message);
  }

  return new Response(
    JSON.stringify({ ok: true, coach_type: invite.coach_type }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
