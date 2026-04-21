/**
 * PR Tracker — client-side cart store.
 *
 * Lives in localStorage. Dispatches `cart:change` events on the document
 * whenever state changes, so any badge/drawer listener can re-render.
 *
 * Attached to window.PRCart for inline-script access from Astro components.
 */

import { applyPix } from "~/lib/format";
import type { CartItem, CartSnapshot } from "~/lib/cart-types";

const STORAGE_KEY = "prtracker_cart_v1";

function load(): CartItem[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidItem);
  } catch {
    return [];
  }
}

function isValidItem(x: unknown): x is CartItem {
  if (!x || typeof x !== "object") return false;
  const it = x as Record<string, unknown>;
  return (
    typeof it.id === "string" &&
    typeof it.productSlug === "string" &&
    typeof it.title === "string" &&
    typeof it.image === "string" &&
    typeof it.unitPriceCents === "number" &&
    typeof it.quantity === "number" &&
    it.quantity >= 1
  );
}

function save(items: CartItem[]): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  document.dispatchEvent(new CustomEvent("cart:change", { detail: snapshot(items) }));
}

function snapshot(items = load()): CartSnapshot {
  const subtotalCents = items.reduce(
    (acc, it) => acc + it.unitPriceCents * it.quantity,
    0,
  );
  return {
    items,
    subtotalCents,
    pixTotalCents: applyPix(subtotalCents),
    itemCount: items.reduce((acc, it) => acc + it.quantity, 0),
  };
}

/** Merge-or-append. Items with the same id increment quantity. */
function add(item: CartItem): void {
  const items = load();
  const existing = items.find((it) => it.id === item.id);
  if (existing) {
    existing.quantity += item.quantity;
  } else {
    items.push({ ...item });
  }
  save(items);
  open();
}

function remove(id: string): void {
  save(load().filter((it) => it.id !== id));
}

function updateQuantity(id: string, quantity: number): void {
  if (quantity < 1) return remove(id);
  const items = load();
  const it = items.find((x) => x.id === id);
  if (!it) return;
  it.quantity = quantity;
  save(items);
}

function clear(): void {
  save([]);
}

function open(): void {
  document.dispatchEvent(new CustomEvent("cart:open"));
}

function close(): void {
  document.dispatchEvent(new CustomEvent("cart:close"));
}

function count(): number {
  return snapshot().itemCount;
}

export const cart = {
  add,
  remove,
  updateQuantity,
  clear,
  snapshot,
  open,
  close,
  count,
};

// Expose for inline-script access across the site (Astro components)
if (typeof window !== "undefined") {
  (window as typeof window & { PRCart: typeof cart }).PRCart = cart;
  // Fire initial event so badges render correctly on page load
  queueMicrotask(() => {
    document.dispatchEvent(new CustomEvent("cart:change", { detail: snapshot() }));
  });
}
