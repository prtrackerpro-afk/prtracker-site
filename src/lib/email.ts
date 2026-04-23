/**
 * Transactional email via Resend HTTP API. No SDK — a single fetch call
 * keeps the webhook handler light and avoids a cold-start dependency.
 *
 * Env vars (set on Vercel):
 *   RESEND_API_KEY  — "re_..." from https://resend.com/api-keys
 *   RESEND_FROM     — optional. Defaults to "onboarding@resend.dev",
 *                     which works BEFORE domain verification but can
 *                     ONLY deliver to the Resend account owner. After
 *                     verifying prtracker.com.br on Resend, switch this
 *                     to "PR Tracker <contato@prtracker.com.br>" so the
 *                     customer receives their confirmation.
 *   OWNER_EMAIL     — optional, defaults to "prtrackerpro@gmail.com"
 *                     (the Resend account owner — guaranteed deliverable
 *                     even without domain verification).
 *
 * All failures are logged and swallowed — a missed email never blocks
 * the webhook response (MP must get a 200) or the customer's order.
 */

const DEFAULT_FROM = "onboarding@resend.dev";
const DEFAULT_OWNER = "prtrackerpro@gmail.com";

interface SendArgs {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}

async function send(args: SendArgs): Promise<void> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skipping", args.subject);
    return;
  }
  const from = import.meta.env.RESEND_FROM ?? DEFAULT_FROM;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(args.to) ? args.to : [args.to],
      subject: args.subject,
      html: args.html,
      reply_to: args.replyTo,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[email] Resend ${res.status}: ${text.slice(0, 500)}`);
    return;
  }
}

export interface OrderEmailData {
  paymentId: string | number;
  externalRef: string;
  totalBrl: number;
  status: string;
  paymentMethod: string;
  customer: {
    name: string;
    email: string;
    phone: string;
    cpf: string;
  };
  shipping: {
    cep: string;
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    service: string;
  };
  items: Array<{ title: string; quantity: number; totalBrl: number }>;
  couponCode?: string;
  couponCreditedTo?: string;
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Owner alert — shows up in contato@prtracker.com.br when a payment is
 * approved. Everything needed to ship manually from ME dashboard if the
 * automatic label generation failed.
 */
export async function sendOwnerOrderAlert(data: OrderEmailData): Promise<void> {
  const itemsRows = data.items
    .map(
      (i) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">
            ${escapeHtml(i.title)} <span style="color:#888">×${i.quantity}</span>
          </td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">
            ${brl(i.totalBrl)}
          </td>
        </tr>`,
    )
    .join("");

  const couponLine = data.couponCode
    ? `<tr><td>Cupom</td><td><strong>${escapeHtml(data.couponCode.toUpperCase())}</strong>${
        data.couponCreditedTo && data.couponCreditedTo !== data.couponCode
          ? ` — ${escapeHtml(data.couponCreditedTo)}`
          : ""
      }</td></tr>`
    : "";

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#01002A;color:#D8FF2C;padding:20px 24px">
      <h1 style="margin:0;font-size:20px">Novo pedido aprovado</h1>
      <p style="margin:4px 0 0;color:#fff;opacity:0.8">${escapeHtml(data.externalRef)} · ${brl(data.totalBrl)}</p>
    </div>
    <div style="padding:24px">
      <h2 style="font-size:15px;margin:0 0 8px;color:#444">Itens</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px">${itemsRows}</table>

      <h2 style="font-size:15px;margin:24px 0 8px;color:#444">Cliente</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#666">Nome</td><td>${escapeHtml(data.customer.name)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">E-mail</td><td><a href="mailto:${escapeHtml(data.customer.email)}">${escapeHtml(data.customer.email)}</a></td></tr>
        <tr><td style="padding:4px 0;color:#666">Telefone</td><td>${escapeHtml(data.customer.phone)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">CPF</td><td>${escapeHtml(data.customer.cpf)}</td></tr>
      </table>

      <h2 style="font-size:15px;margin:24px 0 8px;color:#444">Entrega</h2>
      <p style="margin:0;font-size:14px;line-height:1.6">
        ${escapeHtml(data.shipping.street)}, ${escapeHtml(data.shipping.number)}${data.shipping.complement ? ` — ${escapeHtml(data.shipping.complement)}` : ""}<br>
        ${escapeHtml(data.shipping.neighborhood)} · ${escapeHtml(data.shipping.city)}/${escapeHtml(data.shipping.state)}<br>
        CEP ${escapeHtml(data.shipping.cep)}<br>
        <span style="color:#666">Serviço:</span> ${escapeHtml(data.shipping.service)}
      </p>

      <h2 style="font-size:15px;margin:24px 0 8px;color:#444">Pagamento</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#666">Método</td><td>${escapeHtml(data.paymentMethod)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Status</td><td><strong style="color:#43B02A">${escapeHtml(data.status)}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#666">MP Payment ID</td><td><code>${escapeHtml(String(data.paymentId))}</code></td></tr>
        ${couponLine}
      </table>

      <p style="margin:24px 0 0;padding:12px;background:#f8f9fa;border-radius:6px;font-size:13px;color:#555">
        <strong>Próximo passo:</strong> a etiqueta já foi gerada automaticamente no Melhor Envio.
        Imprima em <a href="https://melhorenvio.com.br/painel/shipments">melhorenvio.com.br/painel/shipments</a>
        e despache.
      </p>
    </div>
  </div>
</body></html>`;

  await send({
    to: import.meta.env.OWNER_EMAIL ?? DEFAULT_OWNER,
    subject: `[PR Tracker] Novo pedido ${data.externalRef} — ${brl(data.totalBrl)}`,
    html,
    replyTo: data.customer.email,
  });
}

/**
 * Customer confirmation — sent to the buyer's inbox so they have a
 * receipt and know what to expect.
 */
export async function sendCustomerConfirmation(
  data: OrderEmailData,
): Promise<void> {
  if (!data.customer.email) {
    console.warn("[email] customer has no email, skipping confirmation");
    return;
  }

  const itemsRows = data.items
    .map(
      (i) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #eee">
            ${escapeHtml(i.title)} <span style="color:#888">×${i.quantity}</span>
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #eee;text-align:right">
            ${brl(i.totalBrl)}
          </td>
        </tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden">
    <div style="background:#01002A;color:#D8FF2C;padding:32px 24px;text-align:center">
      <h1 style="margin:0;font-size:22px;letter-spacing:0.02em">Pedido confirmado</h1>
      <p style="margin:8px 0 0;color:#fff;opacity:0.85;font-size:14px">
        Obrigado, ${escapeHtml(data.customer.name.split(" ")[0] ?? "atleta")}. Seu PR merece mais do que uma foto.
      </p>
    </div>

    <div style="padding:28px 24px">
      <p style="font-size:15px;line-height:1.6;margin:0 0 20px;color:#333">
        Recebemos seu pagamento e já estamos preparando o envio. Você vai receber o código de rastreio assim que a etiqueta for gerada (normalmente até 24h úteis).
      </p>

      <h2 style="font-size:14px;margin:0 0 8px;color:#666;text-transform:uppercase;letter-spacing:0.05em">Seu pedido · ${escapeHtml(data.externalRef)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">${itemsRows}
        <tr>
          <td style="padding:12px 12px 0;font-weight:600">Total</td>
          <td style="padding:12px 12px 0;text-align:right;font-weight:600">${brl(data.totalBrl)}</td>
        </tr>
      </table>

      <h2 style="font-size:14px;margin:24px 0 8px;color:#666;text-transform:uppercase;letter-spacing:0.05em">Entrega</h2>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#333">
        ${escapeHtml(data.shipping.street)}, ${escapeHtml(data.shipping.number)}${data.shipping.complement ? ` — ${escapeHtml(data.shipping.complement)}` : ""}<br>
        ${escapeHtml(data.shipping.neighborhood)} · ${escapeHtml(data.shipping.city)}/${escapeHtml(data.shipping.state)} · CEP ${escapeHtml(data.shipping.cep)}<br>
        <span style="color:#666">Serviço:</span> ${escapeHtml(data.shipping.service)}
      </p>

      <p style="margin:28px 0 0;font-size:13px;color:#888;line-height:1.6">
        Dúvidas? Responda este e-mail ou fale no WhatsApp
        <a href="https://wa.me/5551982061914" style="color:#01002A">(51) 98206-1914</a>.
      </p>
    </div>

    <div style="padding:16px 24px;background:#f8f9fa;border-top:1px solid #eee;text-align:center;font-size:12px;color:#888">
      PR Tracker · CNPJ 59.947.215/0001-67 · Porto Alegre, RS
    </div>
  </div>
</body></html>`;

  await send({
    to: data.customer.email,
    subject: `Pedido confirmado · ${data.externalRef}`,
    html,
  });
}
