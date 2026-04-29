export const fmtBRL = (n: number | null | undefined) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";

export const fmtInt = (n: number | null | undefined) =>
  typeof n === "number" ? n.toLocaleString("pt-BR") : "—";

export const fmtPct = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" ? `${n.toFixed(digits)}%` : "—";

export const fmtNumber = (n: number | null | undefined, digits = 2) =>
  typeof n === "number" ? n.toFixed(digits) : "—";

export function daysAgoIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Aggregate insights rows into a single summary.
 */
export function aggregateInsights(
  rows: Array<{
    spend: number;
    impressions: number;
    clicks: number;
    purchases: number;
    add_to_cart: number;
    initiate_checkout: number;
    view_content: number;
    landing_page_view: number;
    revenue: number;
    reach: number;
  }>
) {
  const sum = rows.reduce(
    (acc, r) => ({
      spend: acc.spend + (r.spend ?? 0),
      impressions: acc.impressions + (r.impressions ?? 0),
      clicks: acc.clicks + (r.clicks ?? 0),
      purchases: acc.purchases + (r.purchases ?? 0),
      add_to_cart: acc.add_to_cart + (r.add_to_cart ?? 0),
      initiate_checkout: acc.initiate_checkout + (r.initiate_checkout ?? 0),
      view_content: acc.view_content + (r.view_content ?? 0),
      landing_page_view: acc.landing_page_view + (r.landing_page_view ?? 0),
      revenue: acc.revenue + (r.revenue ?? 0),
      reach: Math.max(acc.reach, r.reach ?? 0),
    }),
    {
      spend: 0,
      impressions: 0,
      clicks: 0,
      purchases: 0,
      add_to_cart: 0,
      initiate_checkout: 0,
      view_content: 0,
      landing_page_view: 0,
      revenue: 0,
      reach: 0,
    }
  );
  return {
    ...sum,
    ctr: sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : 0,
    cpm: sum.impressions > 0 ? (sum.spend / sum.impressions) * 1000 : 0,
    cpc: sum.clicks > 0 ? sum.spend / sum.clicks : 0,
    cpa: sum.purchases > 0 ? sum.spend / sum.purchases : 0,
    roas: sum.spend > 0 ? sum.revenue / sum.spend : 0,
  };
}
