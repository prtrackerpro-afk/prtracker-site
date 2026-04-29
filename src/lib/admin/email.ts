/**
 * Optional email notifications via Resend.
 * Skips silently if RESEND_API_KEY is not configured.
 */

const RESEND_API = "https://api.resend.com/emails";

function getResendKey(): string | null {
  return import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY || null;
}

export function isEmailConfigured(): boolean {
  return !!getResendKey();
}

export async function sendAdminEmail(opts: {
  subject: string;
  html: string;
  to?: string;
}): Promise<{ ok: boolean; reason?: string; id?: string }> {
  const key = getResendKey();
  if (!key) return { ok: false, reason: "resend_not_configured" };

  const from =
    import.meta.env.ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_FROM || "PR Tracker Alerts <onboarding@resend.dev>";
  const to =
    opts.to ||
    import.meta.env.ALERT_EMAIL_TO ||
    process.env.ALERT_EMAIL_TO ||
    "contato@prtracker.com.br";

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject: opts.subject, html: opts.html }),
  });

  const json = (await res.json()) as { id?: string; message?: string };
  if (!res.ok) return { ok: false, reason: json.message ?? `http_${res.status}` };
  return { ok: true, id: json.id };
}
