import type { APIRoute } from "astro";
import { getServerSupabase } from "../../../../lib/supabase/server";

export const prerender = false;

const SITE_URL =
  import.meta.env.PUBLIC_SITE_URL || process.env.PUBLIC_SITE_URL || "https://prtracker.com.br";

export const POST: APIRoute = async ({ request, cookies }) => {
  let body: { email?: string; next?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "invalid_body");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const next = sanitizeNext(body.next);

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonError(400, "invalid_email", "Email inválido.");
  }

  const supabase = getServerSupabase({ headers: request.headers, cookies });

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: `${SITE_URL}/pr/auth/callback?next=${encodeURIComponent(next)}`,
      // Allow new users to sign up automatically — anyone can be an athlete.
      shouldCreateUser: true,
    },
  });

  if (error) {
    return jsonError(500, "send_failed", error.message);
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

function sanitizeNext(input: unknown): string {
  if (typeof input !== "string") return "/pr";
  // Only allow same-origin redirects to /pr/*
  if (!input.startsWith("/pr")) return "/pr";
  return input;
}

function jsonError(status: number, code: string, message?: string) {
  return new Response(JSON.stringify({ error: code, message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
