/**
 * Import all WooCommerce coupons from the legacy WP site and snapshot
 * them to src/data/coupons.json. The API route uses this snapshot for
 * server-side validation — the file itself never ships to the browser,
 * so the codes remain effectively private (users have to know a code to
 * validate it).
 *
 * Run: node scripts/import-wc-coupons.mjs
 *   WC_API_CK=ck_...   consumer key
 *   WC_API_CS=cs_...   consumer secret
 *   WC_API_BASE=https://www.prtracker.com.br  (optional, this is the default)
 *
 * The "Woo Coupon Usage" plugin attaches an affiliate user via the
 * `wcu_select_coupon_user` meta key. When present we also fetch the
 * user profile so the PR Tracker dashboard can credit sales later.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(here, "..");
const OUT = path.join(ROOT, "src/data/coupons.json");

const BASE = process.env.WC_API_BASE ?? "https://www.prtracker.com.br";
const CK = process.env.WC_API_CK;
const CS = process.env.WC_API_CS;

/**
 * Coupon codes that must NEVER ship to the Astro site, regardless of
 * their status on the legacy WC. These are internal/retired/blocked and
 * are kept excluded across every re-import so future runs don't resurface
 * them. Case-insensitive match against the coupon's code.
 */
const BLOCKED_CODES = new Set(["mateus50off", "atletalpo", "ceci"]);

if (!CK || !CS) {
  console.error(
    "[coupons] WC_API_CK + WC_API_CS required. Aborting without touching the snapshot.",
  );
  process.exit(1);
}

const authHeader =
  "Basic " + Buffer.from(`${CK}:${CS}`, "utf8").toString("base64");

async function wc(path, params = {}) {
  const url = new URL(`${BASE}/wp-json${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: authHeader } });
  if (!res.ok) {
    throw new Error(`WC ${path} ${res.status}: ${await res.text().then((t) => t.slice(0, 300))}`);
  }
  return res.json();
}

// 1. Pull all coupons (paginated to be safe)
const coupons = [];
for (let page = 1; page <= 10; page++) {
  const batch = await wc("/wc/v3/coupons", { per_page: 100, page });
  coupons.push(...batch);
  if (batch.length < 100) break;
}

// 2. Resolve affiliate user meta → single-fetch each unique user id
const affiliateUserIds = new Set();
for (const c of coupons) {
  const userMeta = (c.meta_data ?? []).find(
    (m) => m.key === "wcu_select_coupon_user",
  );
  const id = Number(userMeta?.value);
  if (Number.isFinite(id) && id > 0) affiliateUserIds.add(id);
}

const affiliateNames = new Map();
for (const id of affiliateUserIds) {
  try {
    const user = await wc(`/wp/v2/users/${id}`);
    affiliateNames.set(id, {
      id,
      name: user.name ?? user.slug ?? `User ${id}`,
      slug: user.slug ?? null,
    });
  } catch (err) {
    // Non-fatal: coupon is still valid even if we can't attribute the affiliate.
    affiliateNames.set(id, { id, name: `User ${id}`, slug: null });
  }
}

// 3. Project the WC payload down to just what the checkout needs.
const snapshot = {
  fetchedAt: new Date().toISOString(),
  source: BASE,
  coupons: coupons
    .filter((c) => c.status === "publish")
    .filter((c) => !BLOCKED_CODES.has(c.code.toLowerCase()))
    .map((c) => {
      const affiliateMeta = (c.meta_data ?? []).find(
        (m) => m.key === "wcu_select_coupon_user",
      );
      const affiliateId = Number(affiliateMeta?.value) || null;
      const firstOrderOnly = (c.meta_data ?? []).find(
        (m) => m.key === "wcu_enable_first_order_only",
      );
      return {
        code: c.code.toLowerCase(),
        discount_type: c.discount_type, // 'percent' | 'fixed_cart' | 'fixed_product'
        amount: Number(c.amount),
        date_expires: c.date_expires_gmt ?? null,
        usage_count: c.usage_count ?? 0,
        usage_limit: c.usage_limit ?? null,
        usage_limit_per_user: c.usage_limit_per_user ?? null,
        individual_use: !!c.individual_use,
        free_shipping: !!c.free_shipping,
        minimum_amount_cents: Math.round(Number(c.minimum_amount || 0) * 100),
        maximum_amount_cents: Math.round(Number(c.maximum_amount || 0) * 100),
        product_ids: c.product_ids ?? [],
        excluded_product_ids: c.excluded_product_ids ?? [],
        product_categories: c.product_categories ?? [],
        excluded_product_categories: c.excluded_product_categories ?? [],
        exclude_sale_items: !!c.exclude_sale_items,
        first_order_only: firstOrderOnly?.value === "yes",
        affiliate: affiliateId
          ? affiliateNames.get(affiliateId) ?? { id: affiliateId }
          : null,
      };
    }),
};

await fs.mkdir(path.dirname(OUT), { recursive: true });
await fs.writeFile(OUT, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

console.log(
  `[coupons] ${snapshot.coupons.length} published coupons · ${affiliateUserIds.size} affiliates → src/data/coupons.json`,
);
for (const c of snapshot.coupons) {
  const discount =
    c.discount_type === "percent" ? `${c.amount}%` : `R$ ${c.amount}`;
  const aff = c.affiliate ? ` (${c.affiliate.name})` : "";
  console.log(`  ${c.code.padEnd(24)} ${discount.padStart(8)}${aff}`);
}
