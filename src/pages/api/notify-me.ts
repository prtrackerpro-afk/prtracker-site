/**
 * Endpoint do "Notifique-me quando lançar" do produto My PR Gym.
 *
 * Recebe e-mail e/ou telefone (ao menos um obrigatório) + opcionalmente a
 * configuração das 3 barras escolhida no configurador. Envia o alerta
 * para contato@prtracker.com.br via Resend (lib/email.ts). NÃO grava em
 * banco — manter simples; quando virar volume relevante a gente migra
 * pra Supabase.
 */
import type { APIRoute } from "astro";
import { z } from "astro:content";
import { sendGymInterestAlert } from "~/lib/email";

export const prerender = false;

const payloadSchema = z
  .object({
    email: z.string().email().optional().or(z.literal("")),
    phone: z.string().min(8).max(20).optional().or(z.literal("")),
    config: z.string().max(2000).optional(),
  })
  .refine((d) => (d.email && d.email.length > 0) || (d.phone && d.phone.length > 0), {
    message: "Informe e-mail ou telefone.",
  });

function jsonResponse(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: "JSON inválido." });
  }

  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(400, {
      error:
        parsed.error.issues[0]?.message ?? "Informe e-mail ou telefone válido.",
    });
  }

  const userAgent = request.headers.get("user-agent") ?? undefined;

  // Fire-and-forget — não bloqueia a UX se o Resend falhar.
  try {
    await sendGymInterestAlert({
      email: parsed.data.email || undefined,
      phone: parsed.data.phone || undefined,
      config: parsed.data.config,
      userAgent,
    });
  } catch (err) {
    console.error("[notify-me] email send failed:", err);
  }

  return jsonResponse(200, { ok: true });
};
