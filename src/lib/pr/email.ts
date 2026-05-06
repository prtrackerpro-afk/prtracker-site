// Email helpers for athlete-facing notifications. Uses the same Resend
// client configured for admin alerts (RESEND_API_KEY env). Silently
// no-ops if Resend isn't configured.

import type { ExerciseId } from "./exercises";
import { exerciseLabel } from "./exercises";
import { tierLabel, tierColor, type Tier } from "./strength-score";

const RESEND_API = "https://api.resend.com/emails";

function key(): string | null {
  return import.meta.env.RESEND_API_KEY || process.env.RESEND_API_KEY || null;
}

const FROM =
  import.meta.env.ALERT_EMAIL_FROM ||
  process.env.ALERT_EMAIL_FROM ||
  "PR Tracker <onboarding@resend.dev>";

interface LevelUpInput {
  toEmail: string;
  athleteName: string;
  newTier: Tier;
  previousTier: Tier;
  exerciseId: ExerciseId;
  weightKg: number;
  recordId: string;
}

const SITE = (
  import.meta.env.PUBLIC_SITE_URL ||
  process.env.PUBLIC_SITE_URL ||
  "https://prtracker.com.br"
).replace(/\/$/, "");

export async function sendLevelUpEmail(opts: LevelUpInput): Promise<{ ok: boolean }> {
  const k = key();
  if (!k) return { ok: false };

  const tColor = tierColor(opts.newTier);
  const tName = tierLabel(opts.newTier).toUpperCase();
  const prevName = tierLabel(opts.previousTier);
  const movement = exerciseLabel(opts.exerciseId);
  const cardUrl = `${SITE}/api/pr/card/${opts.recordId}.svg`;
  const dashUrl = `${SITE}/pr`;

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="margin:0;padding:0;background:#01002A;font-family:-apple-system,Inter,Helvetica,Arial,sans-serif;color:#fff;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-size:24px;font-weight:900;letter-spacing:8px;color:#D8FF2C;">PR TRACKER</div>
      <div style="height:2px;width:80px;background:#D8FF2C;margin:8px auto 0;"></div>
    </div>

    <div style="text-align:center;padding:32px 16px;border:2px solid ${tColor};border-radius:16px;background:linear-gradient(135deg,#01002A,#0a0050);">
      <div style="font-size:11px;letter-spacing:6px;color:#9ca3af;margin-bottom:8px;">VOCÊ EVOLUIU</div>
      <div style="font-size:48px;font-weight:900;letter-spacing:4px;color:${tColor};line-height:1.1;">${tName}</div>
      <div style="font-size:13px;color:#9ca3af;margin-top:8px;">Antes: <span style="color:#fff;">${prevName}</span></div>
      <div style="margin-top:24px;padding-top:24px;border-top:1px solid rgba(255,255,255,0.1);">
        <div style="font-size:12px;letter-spacing:4px;color:#9ca3af;">${movement.toUpperCase()}</div>
        <div style="font-size:64px;font-weight:900;color:#D8FF2C;line-height:1;margin-top:8px;">${opts.weightKg}<span style="font-size:18px;color:#9ca3af;font-weight:400;letter-spacing:6px;margin-left:8px;">KG</span></div>
      </div>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="${dashUrl}" style="display:inline-block;padding:14px 28px;background:#D8FF2C;color:#01002A;font-weight:700;text-decoration:none;border-radius:8px;font-size:14px;">Ver meu perfil →</a>
    </div>

    <p style="text-align:center;font-size:13px;color:#9ca3af;line-height:1.5;">
      ${opts.athleteName}, esse PR mudou tudo. Você acabou de virar <strong style="color:${tColor};">${tName.toLowerCase()}</strong> em ${movement}.<br>Hora de pedir o troféu físico?
    </p>

    <p style="text-align:center;font-size:11px;color:#5a5f68;margin-top:32px;">
      <a href="${SITE}/pr" style="color:#5a5f68;">PR Tracker</a> · <a href="https://wa.me/5551982061914" style="color:#5a5f68;">WhatsApp</a>
    </p>
  </div>
</body>
</html>`;

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${k}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM,
        to: [opts.toEmail],
        subject: `🔥 Você virou ${tierLabel(opts.newTier)} · PR Tracker`,
        html,
      }),
    });
    return { ok: res.ok };
  } catch {
    return { ok: false };
  }
}
