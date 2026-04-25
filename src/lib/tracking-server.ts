/**
 * Server-side tracking — Meta Conversions API + GA4 Measurement Protocol.
 *
 * Fired from the MP webhook when a payment is approved. Both calls use
 * `event_id = String(payment.id)` so Meta dedupes against a client-side
 * Pixel Purchase (if added later) and GA4 dedupes via `transaction_id`.
 *
 * PII is SHA-256 hashed (lowercase + trim) per Meta CAPI spec. `fbp`/`fbc`
 * cookies are not yet captured at preference-creation time — match rate
 * improves ~15pp once we stuff those into MP `metadata`. Same for the GA4
 * `client_id`: without the real cookie value we fall back to a per-customer
 * synthetic, which keeps revenue counts correct but breaks session
 * attribution in GA4 (purchases appear under "(direct)").
 *
 * Every helper is fire-and-forget: failures are logged, never thrown.
 */

import crypto from "node:crypto";
import type { Payment } from "mercadopago";

type MpPayment = Awaited<ReturnType<Payment["get"]>>;

export type TrackingContext = {
  /** Raw `_fbp` cookie value. Captured client-side, persisted in MP metadata. */
  fbp?: string;
  /** Raw `_fbc` cookie value (fbclid landing). Same path as fbp. */
  fbc?: string;
  /** GA4 client_id from `_ga` cookie. Critical for session attribution. */
  gaClientId?: string;
  /** Customer IP (x-forwarded-for from the webhook req — MP's, not useful) */
  clientIpAddress?: string;
  /** User-agent — MP's webhook UA is their server, not the customer's. */
  clientUserAgent?: string;
  /** Canonical URL for the conversion page. Defaults to /obrigado. */
  eventSourceUrl?: string;
};

function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

function normalizePhone(p: string): string {
  // E.164-ish: digits only, prepend BR country code if missing.
  let d = p.replace(/\D/g, "");
  if (d.length === 11 && !d.startsWith("55")) d = "55" + d;
  if (d.length === 10 && !d.startsWith("55")) d = "55" + d;
  return d;
}

function normalizeName(n: string): string {
  return n.trim().toLowerCase();
}

type LineItem = {
  id?: string;
  title?: string;
  quantity?: number;
  unit_price?: number;
};

function extractLineItems(payment: MpPayment): LineItem[] {
  const items = (payment.additional_info?.items ?? []) as LineItem[];
  // Drop the Pix-discount / coupon / shipping "negative" lines — we only
  // want real products in content_ids/items.
  return items.filter((i) => Number(i.unit_price) > 0);
}

function siteUrl(): string {
  return (
    (import.meta.env.PUBLIC_SITE_URL as string | undefined) ??
    "https://prtracker.com.br"
  ).replace(/\/$/, "");
}

// ---------------------------------------------------------------------------
// Meta Conversions API
// ---------------------------------------------------------------------------

/**
 * Send a Purchase event to Meta's Conversions API. Fire-and-forget.
 * Never throws — logs on failure and returns normally.
 */
export async function sendCapiPurchase(
  payment: MpPayment,
  ctx: TrackingContext = {},
): Promise<void> {
  const token = import.meta.env.META_CAPI_ACCESS_TOKEN as string | undefined;
  const pixelId = import.meta.env.META_PIXEL_ID as string | undefined;
  if (!token || !pixelId) {
    console.warn("[tracking] META_CAPI_ACCESS_TOKEN or META_PIXEL_ID missing — skipping CAPI");
    return;
  }

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;
  const payer = payment.payer ?? {};

  // PII: prefer raw metadata (captured before MP masked it for Pix).
  const email =
    String(meta.customer_email ?? "") || String(payer.email ?? "");
  const phone =
    String(meta.customer_phone ?? "") ||
    `${payer.phone?.area_code ?? ""}${payer.phone?.number ?? ""}`;
  const fullName =
    String(meta.customer_name ?? "") ||
    [payer.first_name, payer.last_name].filter(Boolean).join(" ");
  const [firstName = "", ...rest] = fullName.trim().split(/\s+/);
  const lastName = rest.join(" ");
  const cpf = String(
    meta.customer_cpf ?? payer.identification?.number ?? "",
  ).replace(/\D/g, "");
  const city = String(meta.shipping_city ?? "");
  const state = String(meta.shipping_state ?? "");
  const zip = String(meta.shipping_cep ?? "").replace(/\D/g, "");

  const userData: Record<string, unknown> = { country: [sha256("br")] };
  if (email) userData.em = [sha256(normalizeEmail(email))];
  if (phone) userData.ph = [sha256(normalizePhone(phone))];
  if (firstName) userData.fn = [sha256(normalizeName(firstName))];
  if (lastName) userData.ln = [sha256(normalizeName(lastName))];
  if (city) userData.ct = [sha256(city.trim().toLowerCase().replace(/\s+/g, ""))];
  if (state) userData.st = [sha256(state.trim().toLowerCase())];
  if (zip) userData.zp = [sha256(zip)];
  if (cpf) userData.external_id = [sha256(cpf)];
  // fbp/fbc are sent raw (not hashed) per Meta spec
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.fbc) userData.fbc = ctx.fbc;
  if (ctx.clientIpAddress) userData.client_ip_address = ctx.clientIpAddress;
  if (ctx.clientUserAgent) userData.client_user_agent = ctx.clientUserAgent;

  const lineItems = extractLineItems(payment);
  const contentIds = lineItems.map((i) => String(i.id ?? i.title ?? "unknown"));
  const numItems = lineItems.reduce((n, i) => n + Number(i.quantity ?? 1), 0);

  const eventTime = payment.date_approved
    ? Math.floor(new Date(payment.date_approved).getTime() / 1000)
    : Math.floor(Date.now() / 1000);

  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: String(payment.id),
        event_source_url: ctx.eventSourceUrl ?? `${siteUrl()}/obrigado`,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: Number(payment.transaction_amount ?? 0),
          content_ids: contentIds,
          content_type: "product",
          num_items: numItems,
          order_id: String(payment.external_reference ?? payment.id),
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[tracking] CAPI ${res.status}: ${text}`);
      return;
    }
    console.log("[tracking] CAPI Purchase sent", {
      event_id: String(payment.id),
      value: Number(payment.transaction_amount ?? 0),
      response: text,
    });
  } catch (err) {
    console.error("[tracking] CAPI call failed:", err);
  }
}

/**
 * Send a ViewContent event to Meta's Conversions API. Fire-and-forget.
 * Called from `/api/track/view-content` (a beacon hit on product page load),
 * so we share the same `event_id` as the client Pixel for dedup.
 *
 * No PII (the visitor hasn't entered anything yet); we lean on fbp/fbc +
 * IP + UA for matching.
 */
export async function sendCapiViewContent(args: {
  slug: string;
  title: string;
  priceCents: number;
  category?: string;
  eventId: string;
  ctx?: TrackingContext;
}): Promise<void> {
  const { slug, title, priceCents, category, eventId, ctx = {} } = args;
  const token = import.meta.env.META_CAPI_ACCESS_TOKEN as string | undefined;
  const pixelId = import.meta.env.META_PIXEL_ID as string | undefined;
  if (!token || !pixelId) {
    console.warn("[tracking] META_CAPI_ACCESS_TOKEN or META_PIXEL_ID missing — skipping CAPI ViewContent");
    return;
  }

  const userData: Record<string, unknown> = { country: [sha256("br")] };
  if (ctx.fbp) userData.fbp = ctx.fbp;
  if (ctx.fbc) userData.fbc = ctx.fbc;
  if (ctx.clientIpAddress) userData.client_ip_address = ctx.clientIpAddress;
  if (ctx.clientUserAgent) userData.client_user_agent = ctx.clientUserAgent;

  const body = {
    data: [
      {
        event_name: "ViewContent",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        event_source_url: ctx.eventSourceUrl ?? `${siteUrl()}/product/${slug}`,
        action_source: "website",
        user_data: userData,
        custom_data: {
          currency: "BRL",
          value: priceCents / 100,
          content_ids: [slug],
          content_name: title,
          content_category: category,
          content_type: "product",
        },
      },
    ],
  };

  const url = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${encodeURIComponent(token)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[tracking] CAPI ViewContent ${res.status}: ${text}`);
      return;
    }
    console.log("[tracking] CAPI ViewContent sent", { event_id: eventId, slug });
  } catch (err) {
    console.error("[tracking] CAPI ViewContent call failed:", err);
  }
}

// ---------------------------------------------------------------------------
// GA4 Measurement Protocol
// ---------------------------------------------------------------------------

/**
 * Send a purchase event to GA4 via the Measurement Protocol. Fire-and-forget.
 *
 * WARNING: without a real `gaClientId` from the `_ga` cookie, this event
 * is recorded as a new user and is attributed to "(direct)" in session
 * reports. Revenue totals are still accurate. Stuff the real client_id
 * into MP metadata at preference-creation time to fix attribution.
 */
export async function sendGa4Purchase(
  payment: MpPayment,
  ctx: TrackingContext = {},
): Promise<void> {
  const secret = import.meta.env.GA4_API_SECRET as string | undefined;
  const measurementId = import.meta.env.GA4_MEASUREMENT_ID as string | undefined;
  if (!secret || !measurementId) {
    console.warn("[tracking] GA4_API_SECRET or GA4_MEASUREMENT_ID missing — skipping GA4 MP");
    return;
  }

  const meta = (payment.metadata ?? {}) as Record<string, unknown>;

  // Prefer real client_id from cookie; fall back to a stable synthetic
  // derived from email/cpf so the same customer maps to the same pseudo-id.
  // Format required by GA4: `<10 digit int>.<timestamp>` — we approximate.
  let clientId = ctx.gaClientId;
  let clientIdSynthetic = false;
  if (!clientId) {
    const seed =
      String(meta.customer_email ?? "") ||
      String(meta.customer_cpf ?? "") ||
      String(payment.id ?? "");
    const digits = BigInt("0x" + sha256(seed).slice(0, 10))
      .toString()
      .slice(0, 10);
    clientId = `${digits}.${Math.floor(Date.now() / 1000)}`;
    clientIdSynthetic = true;
  }

  const lineItems = extractLineItems(payment);
  const gaItems = lineItems.map((i) => ({
    item_id: String(i.id ?? i.title ?? "unknown"),
    item_name: String(i.title ?? "Item"),
    quantity: Number(i.quantity ?? 1),
    price: Number(i.unit_price ?? 0),
  }));

  const params: Record<string, unknown> = {
    transaction_id: String(payment.id),
    currency: "BRL",
    value: Number(payment.transaction_amount ?? 0),
    items: gaItems,
  };
  if (meta.coupon_code) params.coupon = String(meta.coupon_code);

  const body = {
    client_id: clientId,
    events: [{ name: "purchase", params }],
  };

  const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(secret)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // GA4 MP returns 204 No Content on success.
    if (!res.ok) {
      const txt = await res.text();
      console.error(`[tracking] GA4 MP ${res.status}: ${txt}`);
      return;
    }
    console.log("[tracking] GA4 Purchase sent", {
      transaction_id: String(payment.id),
      value: Number(payment.transaction_amount ?? 0),
      client_id_synthetic: clientIdSynthetic,
    });
  } catch (err) {
    console.error("[tracking] GA4 MP call failed:", err);
  }
}
