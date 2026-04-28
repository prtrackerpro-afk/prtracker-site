/**
 * Client-side tracking helpers — Meta Pixel + GA4.
 *
 * Meta Pixel is loaded deferred (see Analytics.astro: requestIdleCallback
 * with 3s fallback), so we mirror that timing here so events don't fire
 * before `window.fbq` exists. GA4's `window.gtag` is set inline in <head>
 * and safe to call immediately — its own queue handles the async library load.
 *
 * Each helper is fire-and-forget: errors are swallowed, missing globals
 * skip cleanly (ad blockers, dev mode where Analytics.astro short-circuits).
 *
 * `eventID` is included on all Meta calls so that server-side CAPI events
 * fired later (from the MP webhook) can deduplicate against client events
 * using the same ID — but the CAPI side isn't implemented yet.
 */

type ProductRef = {
  slug: string;
  title: string;
  priceCents: number;
  category?: string;
};

type CartItemRef = {
  slug: string;
  title: string;
  unitPriceCents: number;
  quantity: number;
  category?: string;
};

type CheckoutRef = {
  items: Array<{
    productSlug: string;
    title: string;
    unitPriceCents: number;
    quantity: number;
    category?: string;
  }>;
  totalCents: number;
};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
  }
}

function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}

function newEventId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function deferMeta(run: () => void): void {
  // If fbq is already loaded, fire synchronously — critical for events that
  // precede a navigation (e.g. InitiateCheckout before redirect to /pagamento).
  // Otherwise wait for idle so we don't block the initial page load.
  if (typeof window.fbq === "function") {
    try { run(); } catch { /* swallow */ }
    return;
  }
  const tryRun = () => {
    if (typeof window.fbq !== "function") return;
    try { run(); } catch { /* swallow */ }
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(tryRun, { timeout: 5000 });
  } else {
    setTimeout(tryRun, 3500);
  }
}

function safeGtag(event: string, params: Record<string, unknown>): void {
  if (typeof window.gtag !== "function") return;
  try {
    window.gtag("event", event, params);
  } catch { /* swallow */ }
}

export function trackViewContent(p: ProductRef): void {
  const value = centsToReais(p.priceCents);
  const eventId = newEventId();
  deferMeta(() => {
    window.fbq!("track", "ViewContent", {
      content_ids: [p.slug],
      content_type: "product",
      content_name: p.title,
      content_category: p.category,
      value,
      currency: "BRL",
    }, { eventID: eventId });
  });
  // Mirror to CAPI server-side beacon — same eventId so Meta dedupes against
  // the Pixel call. keepalive lets the request survive page nav. Failures
  // are swallowed; this is best-effort.
  try {
    fetch("/api/track/view-content", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: p.slug,
        title: p.title,
        priceCents: p.priceCents,
        category: p.category,
        eventId,
      }),
      keepalive: true,
    }).catch(() => { /* swallow */ });
  } catch { /* swallow */ }
  safeGtag("view_item", {
    currency: "BRL",
    value,
    items: [{
      item_id: p.slug,
      item_name: p.title,
      item_category: p.category,
      price: value,
      quantity: 1,
    }],
  });
}

export function trackAddToCart(item: CartItemRef): void {
  const value = centsToReais(item.unitPriceCents * item.quantity);
  const eventId = newEventId();
  deferMeta(() => {
    window.fbq!("track", "AddToCart", {
      content_ids: [item.slug],
      content_type: "product",
      content_name: item.title,
      content_category: item.category,
      value,
      currency: "BRL",
      num_items: item.quantity,
    }, { eventID: eventId });
  });
  safeGtag("add_to_cart", {
    currency: "BRL",
    value,
    items: [{
      item_id: item.slug,
      item_name: item.title,
      item_category: item.category,
      price: centsToReais(item.unitPriceCents),
      quantity: item.quantity,
    }],
  });
}

export function trackInitiateCheckout(cart: CheckoutRef): void {
  const value = centsToReais(cart.totalCents);
  const ids = cart.items.map((i) => i.productSlug);
  const numItems = cart.items.reduce((n, i) => n + i.quantity, 0);
  const eventId = newEventId();
  deferMeta(() => {
    window.fbq!("track", "InitiateCheckout", {
      content_ids: ids,
      content_type: "product",
      num_items: numItems,
      value,
      currency: "BRL",
    }, { eventID: eventId });
  });
  safeGtag("begin_checkout", {
    currency: "BRL",
    value,
    items: cart.items.map((i) => ({
      item_id: i.productSlug,
      item_name: i.title,
      item_category: i.category,
      price: centsToReais(i.unitPriceCents),
      quantity: i.quantity,
    })),
  });
}
