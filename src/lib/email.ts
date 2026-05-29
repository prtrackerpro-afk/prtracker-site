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

function isValidEmail(value: string | undefined | null): value is string {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function send(args: SendArgs): Promise<void> {
  const apiKey = import.meta.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY missing — skipping", args.subject);
    return;
  }
  const from = import.meta.env.RESEND_FROM ?? DEFAULT_FROM;

  // Normalize "to": array of valid emails only. Resend rejects the whole
  // payload with 422 if any entry is empty or malformed.
  const toList = (Array.isArray(args.to) ? args.to : [args.to]).filter(
    isValidEmail,
  );
  if (toList.length === 0) {
    console.warn("[email] no valid recipient — skipping", args.subject);
    return;
  }

  const payload: Record<string, unknown> = {
    from,
    to: toList,
    subject: args.subject,
    html: args.html,
  };
  if (isValidEmail(args.replyTo)) payload.reply_to = args.replyTo;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(
      `[email] Resend ${res.status} for "${args.subject}" to ${toList.join(
        ",",
      )} from "${from}": ${text.slice(0, 800)}`,
    );
    return;
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  console.log(
    `[email] Resend sent "${args.subject}" to ${toList.join(",")} (id=${data.id ?? "?"})`,
  );
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
  /** Set when the customer chose in-person pickup at a partner location. */
  pickup?: { name: string; address: string };
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
 * Notify-me form do produto "My PR Gym" (em breve). Envia alerta para
 * contato@prtracker.com.br com os dados do interessado para que o time
 * comercial entre em contato quando o produto for lançado.
 */
export async function sendGymInterestAlert(args: {
  email?: string;
  phone?: string;
  config?: string;
  userAgent?: string;
}): Promise<void> {
  const owner = import.meta.env.OWNER_EMAIL ?? DEFAULT_OWNER;
  const to = "contato@prtracker.com.br";
  const safeEmail = args.email ? escapeHtml(args.email) : "—";
  const safePhone = args.phone ? escapeHtml(args.phone) : "—";
  const safeConfig = args.config ? escapeHtml(args.config) : "—";
  const safeUA = args.userAgent ? escapeHtml(args.userAgent.slice(0, 200)) : "—";
  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;background:#01002a;color:#fff;padding:24px;border-radius:12px;max-width:560px;margin:0 auto">
      <h1 style="margin:0 0 8px;font-size:20px;color:#d8ff2c;letter-spacing:0.04em;text-transform:uppercase">
        Novo Interessado no MY PR Gym
      </h1>
      <p style="margin:0 0 16px;font-size:13px;opacity:0.7">
        Alguém pediu pra ser avisado quando o My PR Gym lançar.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#fff;color:#01002a;border-radius:6px;overflow:hidden">
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:700;width:120px">E-mail</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee">${safeEmail}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:700">Telefone</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee">${safePhone}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font-weight:700;vertical-align:top">Configuração</td>
          <td style="padding:10px 14px;border-bottom:1px solid #eee;font-family:monospace;font-size:12px;white-space:pre-wrap">${safeConfig}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;font-weight:700">User-Agent</td>
          <td style="padding:10px 14px;font-family:monospace;font-size:11px;color:#555">${safeUA}</td>
        </tr>
      </table>
    </div>
  `.trim();

  try {
    await send({
      to: [to, owner],
      subject: "Novo Interessado no MY PR Gym",
      html,
      replyTo: args.email,
    });
  } catch (err) {
    console.error("[email] sendGymInterestAlert failed:", err);
  }
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

      <h2 style="font-size:15px;margin:24px 0 8px;color:#444">${data.pickup ? "Retirada" : "Entrega"}</h2>
      <p style="margin:0;font-size:14px;line-height:1.6">
        ${data.pickup
          ? `<strong style="color:#01002A">RETIRADA NA UNIDADE</strong><br>
        ${escapeHtml(data.pickup.name)}<br>
        ${escapeHtml(data.pickup.address)}<br>
        <br>
        <span style="color:#666">Endereço do cliente (cadastro/NF-e):</span><br>
        ${escapeHtml(data.shipping.street)}, ${escapeHtml(data.shipping.number)}${data.shipping.complement ? ` — ${escapeHtml(data.shipping.complement)}` : ""}<br>
        ${escapeHtml(data.shipping.neighborhood)} · ${escapeHtml(data.shipping.city)}/${escapeHtml(data.shipping.state)} · CEP ${escapeHtml(data.shipping.cep)}`
          : `${escapeHtml(data.shipping.street)}, ${escapeHtml(data.shipping.number)}${data.shipping.complement ? ` — ${escapeHtml(data.shipping.complement)}` : ""}<br>
        ${escapeHtml(data.shipping.neighborhood)} · ${escapeHtml(data.shipping.city)}/${escapeHtml(data.shipping.state)}<br>
        CEP ${escapeHtml(data.shipping.cep)}<br>
        <span style="color:#666">Serviço:</span> ${escapeHtml(data.shipping.service)}`}
      </p>

      <h2 style="font-size:15px;margin:24px 0 8px;color:#444">Pagamento</h2>
      <table style="width:100%;font-size:14px;border-collapse:collapse">
        <tr><td style="padding:4px 0;color:#666">Método</td><td>${escapeHtml(data.paymentMethod)}</td></tr>
        <tr><td style="padding:4px 0;color:#666">Status</td><td><strong style="color:#43B02A">${escapeHtml(data.status)}</strong></td></tr>
        <tr><td style="padding:4px 0;color:#666">MP Payment ID</td><td><code>${escapeHtml(String(data.paymentId))}</code></td></tr>
        ${couponLine}
      </table>

      <p style="margin:24px 0 0;padding:12px;background:#f8f9fa;border-radius:6px;font-size:13px;color:#555">
        ${data.pickup
          ? `<strong>Próximo passo:</strong> separar pedido e levar até a <strong>${escapeHtml(data.pickup.name)}</strong>. Quando estiver disponível, avisar o cliente pelo WhatsApp que pode retirar.`
          : `<strong>Próximo passo:</strong> a etiqueta já foi gerada automaticamente no Melhor Envio. Imprima em <a href="https://melhorenvio.com.br/painel/shipments">melhorenvio.com.br/painel/shipments</a> e despache.`}
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
        ${data.pickup
          ? `Recebemos seu pagamento. Sua peça estará disponível para retirada na <strong>${escapeHtml(data.pickup.name)}</strong>. Avisaremos pelo WhatsApp assim que o pedido estiver pronto para retirada.`
          : "Recebemos seu pagamento e já estamos preparando o envio. Você vai receber o código de rastreio assim que a etiqueta for gerada (normalmente até 24h úteis)."}
      </p>

      <h2 style="font-size:14px;margin:0 0 8px;color:#666;text-transform:uppercase;letter-spacing:0.05em">Seu pedido · ${escapeHtml(data.externalRef)}</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">${itemsRows}
        <tr>
          <td style="padding:12px 12px 0;font-weight:600">Total</td>
          <td style="padding:12px 12px 0;text-align:right;font-weight:600">${brl(data.totalBrl)}</td>
        </tr>
      </table>

      <h2 style="font-size:14px;margin:24px 0 8px;color:#666;text-transform:uppercase;letter-spacing:0.05em">${data.pickup ? "Retirada" : "Entrega"}</h2>
      <p style="margin:0 0 4px;font-size:14px;line-height:1.6;color:#333">
        ${data.pickup
          ? `<strong>${escapeHtml(data.pickup.name)}</strong><br>${escapeHtml(data.pickup.address)}`
          : `${escapeHtml(data.shipping.street)}, ${escapeHtml(data.shipping.number)}${data.shipping.complement ? ` — ${escapeHtml(data.shipping.complement)}` : ""}<br>
        ${escapeHtml(data.shipping.neighborhood)} · ${escapeHtml(data.shipping.city)}/${escapeHtml(data.shipping.state)} · CEP ${escapeHtml(data.shipping.cep)}<br>
        <span style="color:#666">Serviço:</span> ${escapeHtml(data.shipping.service)}`}
      </p>

      <p style="margin:28px 0 0;font-size:13px;color:#888;line-height:1.6">
        Dúvidas comuns na nossa página de
        <a href="https://prtracker.com.br/faq" style="color:#01002A">perguntas frequentes</a>.
        Se preferir, responda este e-mail ou fale no WhatsApp
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

// =============================================================================
// Vale-Presente — e-mail enviado quando o vale é emitido (pagamento aprovado).
// =============================================================================

export interface GiftCardIssuedEmailData {
  code: string;
  valueCents: number;
  /** ISO timestamp. */
  expiresAt: string;
  buyerName: string;
  buyerEmail: string;
  /** Se nulo, envia pro comprador (forwarded mode). */
  recipientName: string | null;
  recipientEmail: string | null;
  personalMessage: string | null;
}

function formatExpiresBr(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * E-mail caprichado com o código do vale-presente. Vai pra:
 *   - presenteado (`recipient_email`), se preenchido
 *   - comprador, sempre como cópia / fallback
 * Owner também recebe alerta separado (vai pelo sendOwnerOrderAlert).
 */
export async function sendGiftCardIssued(
  data: GiftCardIssuedEmailData,
): Promise<void> {
  const valueBr = brl(data.valueCents / 100);
  const expiresStr = formatExpiresBr(data.expiresAt);
  const isGift = Boolean(data.recipientEmail);
  const headline = isGift
    ? `Você ganhou um vale-presente PR Tracker`
    : `Seu vale-presente PR Tracker`;
  const greeting = isGift
    ? `${escapeHtml(data.recipientName ?? "atleta")}, ${escapeHtml(data.buyerName.split(" ")[0] ?? "alguém")} mandou esse pra você.`
    : `Obrigado pela compra, ${escapeHtml(data.buyerName.split(" ")[0] ?? "atleta")}. Aqui está seu vale.`;

  const messageBlock = data.personalMessage
    ? `
      <div style="margin:24px auto 0;padding:18px 22px;background:#f8f9fa;border-left:4px solid #d8ff2c;border-radius:6px;max-width:480px;text-align:left">
        <p style="margin:0 0 6px;font-size:11px;color:#888;text-transform:uppercase;letter-spacing:0.1em;font-weight:700">
          Mensagem ${escapeHtml(data.buyerName.split(" ")[0] ?? "do remetente")}
        </p>
        <p style="margin:0;font-size:15px;color:#333;line-height:1.6;font-style:italic">
          "${escapeHtml(data.personalMessage)}"
        </p>
      </div>
    `
    : "";

  const html = `<!doctype html>
<html><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:24px">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 4px 24px rgb(0 0 0 / 0.06)">

    <!-- Hero: brand colors + headline -->
    <div style="background:#01002A;color:#fff;padding:40px 24px 28px;text-align:center">
      <p style="margin:0 0 6px;font-family:Archivo Black,system-ui,sans-serif;font-size:11px;color:#d8ff2c;letter-spacing:0.22em;text-transform:uppercase">
        PR Tracker
      </p>
      <h1 style="margin:0;font-size:26px;line-height:1.15;font-weight:900;letter-spacing:-0.01em">
        ${headline}
      </h1>
      <p style="margin:14px 0 0;color:#fff;opacity:0.78;font-size:15px;line-height:1.5">
        ${greeting}
      </p>
    </div>

    <!-- Value chip -->
    <div style="text-align:center;padding:32px 24px 8px">
      <div style="display:inline-block;padding:14px 28px;background:#d8ff2c;color:#01002A;border-radius:9999px;font-family:Archivo Black,system-ui,sans-serif;font-size:28px;font-weight:900;letter-spacing:-0.01em">
        ${escapeHtml(valueBr)}
      </div>
      <p style="margin:14px 0 0;color:#666;font-size:13px">
        Saldo inicial · use parcial ou integralmente
      </p>
    </div>

    <!-- Code -->
    <div style="padding:24px 24px 0;text-align:center">
      <p style="margin:0 0 10px;font-size:12px;color:#888;text-transform:uppercase;letter-spacing:0.12em;font-weight:700">
        Código pra usar no checkout
      </p>
      <div style="display:inline-block;padding:18px 32px;background:#01002A;color:#d8ff2c;border-radius:8px;font-family:'Courier New',monospace;font-size:24px;font-weight:700;letter-spacing:0.12em;border:2px solid #d8ff2c">
        ${escapeHtml(data.code)}
      </div>
      <p style="margin:12px 0 0;font-size:13px;color:#666;line-height:1.5">
        Cole esse código no campo <strong>"Cupom"</strong> do checkout em prtracker.com.br
      </p>
    </div>

    ${messageBlock}

    <!-- How to use -->
    <div style="padding:32px 24px 8px">
      <h2 style="margin:0 0 14px;font-size:15px;color:#444;text-transform:uppercase;letter-spacing:0.05em">
        Como usar
      </h2>
      <ol style="margin:0;padding-left:20px;color:#333;line-height:1.7;font-size:14px">
        <li>Escolha os produtos em <a href="https://prtracker.com.br" style="color:#01002A;font-weight:600">prtracker.com.br</a></li>
        <li>No checkout, cole <code style="background:#f8f9fa;padding:1px 6px;border-radius:3px;font-family:monospace">${escapeHtml(data.code)}</code> no campo de cupom</li>
        <li>O valor é descontado do total. Sobrou saldo? Fica salvo pra próxima compra.</li>
      </ol>
    </div>

    <!-- Rules -->
    <div style="padding:8px 24px 28px">
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#555">
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;width:40%;color:#888">Validade</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee;font-weight:600;color:#333">${escapeHtml(expiresStr)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#888">Saldo persistente</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee">Sobra do desconto fica salva pra próxima compra</td>
        </tr>
        <tr>
          <td style="padding:8px 0;border-bottom:1px solid #eee;color:#888">Cobre frete?</td>
          <td style="padding:8px 0;border-bottom:1px solid #eee">Não — só desconta o subtotal dos produtos</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#888">Combina com cupom?</td>
          <td style="padding:8px 0">Não na mesma compra — só um código por pedido</td>
        </tr>
      </table>
    </div>

    <!-- CTA -->
    <div style="padding:0 24px 32px;text-align:center">
      <a href="https://prtracker.com.br" style="display:inline-block;padding:14px 32px;background:#d8ff2c;color:#01002A;text-decoration:none;border-radius:9999px;font-family:Archivo Black,system-ui,sans-serif;font-weight:900;font-size:14px;letter-spacing:0.05em;text-transform:uppercase">
        Escolher meu troféu
      </a>
    </div>

    <!-- Footer -->
    <div style="padding:18px 24px;background:#f8f9fa;border-top:1px solid #eee;text-align:center;font-size:11px;color:#888;line-height:1.6">
      <p style="margin:0 0 4px">
        Dúvidas? Responda este e-mail ou WhatsApp
        <a href="https://wa.me/5551982061914" style="color:#01002A;text-decoration:none">(51) 98206-1914</a>
      </p>
      <p style="margin:0">
        PR Tracker · CNPJ 59.947.215/0001-67 · Porto Alegre/RS
      </p>
    </div>
  </div>
</body></html>`;

  // Estratégia de envio:
  //   - Se tem recipient: vai pra ele + cc pro comprador
  //   - Sem recipient: só pro comprador
  const recipients: string[] = [];
  if (data.recipientEmail) recipients.push(data.recipientEmail);
  if (data.buyerEmail && !recipients.includes(data.buyerEmail)) {
    recipients.push(data.buyerEmail);
  }
  if (recipients.length === 0) {
    console.warn("[email] gift card has no recipient — skipping send");
    return;
  }

  const subject = isGift
    ? `Você ganhou um vale-presente PR Tracker · ${valueBr}`
    : `Seu vale-presente PR Tracker · ${valueBr}`;

  await send({
    to: recipients,
    subject,
    html,
    replyTo: data.buyerEmail,
  });
}
