import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

// React (or unreact) to a PR record. POST { emoji } toggles — if the
// athlete has already reacted with this emoji it's removed, otherwise
// inserted. Returns the updated reaction count map for the record.

const ALLOWED = ["🔥", "💪", "🇧🇷", "👏", "🤘", "⭐"] as const;

export const POST: APIRoute = async ({ request, cookies, params, locals }) => {
  const athlete = locals.athlete;
  if (!athlete) return jsonError(401, "unauthorized");

  const recordId = params.recordId;
  if (!recordId || !/^[0-9a-fA-F-]{36}$/.test(recordId)) {
    return jsonError(400, "invalid_record_id");
  }

  let body: { emoji?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const emoji = body.emoji ?? "";
  if (!(ALLOWED as readonly string[]).includes(emoji)) {
    return jsonError(400, "invalid_emoji");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  // Check existing — if present, delete (toggle off). If absent, insert.
  const { data: existing } = await supabase
    .from("pr_reactions")
    .select("emoji")
    .eq("record_id", recordId)
    .eq("user_id", athlete.userId)
    .eq("emoji", emoji)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("pr_reactions")
      .delete()
      .eq("record_id", recordId)
      .eq("user_id", athlete.userId)
      .eq("emoji", emoji);
  } else {
    const { error } = await supabase
      .from("pr_reactions")
      .insert({ record_id: recordId, user_id: athlete.userId, emoji });
    if (error) return jsonError(500, "react_failed", error.message);
  }

  return new Response(
    JSON.stringify({ ok: true, toggled: existing ? "off" : "on" }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
