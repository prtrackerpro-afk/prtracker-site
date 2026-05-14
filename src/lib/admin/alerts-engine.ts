import { getAdminSupabase } from "../supabase/server";
import { getCollection } from "astro:content";
import { listAllProducts } from "../bling/products";
import { isConnected as isBlingConnected } from "../bling/oauth";
import { PLATES } from "../catalog";

interface Threshold {
  type: string;
  severity: "info" | "warning" | "critical";
  check: (row: any) => boolean;
  title: (row: any) => string;
  body: (row: any) => string;
}

const THRESHOLDS: Threshold[] = [
  {
    type: "high_cpm",
    severity: "warning",
    check: (r) => r.cpm > 60,
    title: (r) => `CPM alto na campanha ${r.entity_id}`,
    body: (r) =>
      `CPM = R$ ${Number(r.cpm).toFixed(2)} (acima do threshold R$ 60). Pode indicar audience match ruim ou CTR baixo.`,
  },
  {
    type: "high_frequency",
    severity: "warning",
    check: (r) => r.frequency > 2.5,
    title: (r) => `Frequency alta em ${r.entity_id}`,
    body: (r) =>
      `Frequency = ${Number(r.frequency).toFixed(2)} (acima de 2.5). Audience exhaustion — considerar pausar ou rotacionar criativos.`,
  },
  {
    type: "zero_impressions",
    severity: "critical",
    check: (r) => r.impressions === 0 && r.spend === 0,
    title: (r) => `Sem entrega — ${r.entity_id}`,
    body: () =>
      `Zero impressões nas últimas 24h. Pode ser ad reject, problema de billing ou pixel desconectado.`,
  },
  {
    type: "low_roas",
    severity: "warning",
    check: (r) => r.spend > 50 && r.revenue / Math.max(r.spend, 1) < 1,
    title: (r) => `ROAS < 1 em ${r.entity_id}`,
    body: (r) => {
      const roas = (r.revenue / Math.max(r.spend, 1)).toFixed(2);
      return `Spend R$ ${Number(r.spend).toFixed(2)}, revenue R$ ${Number(r.revenue).toFixed(2)} → ROAS ${roas}. Avaliar pausar ou otimizar.`;
    },
  },
];

export async function evaluateAlerts(opts: { dateRangeDays?: number } = {}) {
  const sb = getAdminSupabase();
  const days = opts.dateRangeDays ?? 1;

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  // Pull yesterday's metrics at campaign level
  const { data: rows, error } = await sb
    .from("meta_insights_daily")
    .select("*")
    .eq("level", "campaign")
    .gte("date", sinceStr);

  if (error) throw error;

  const created: string[] = [];
  for (const row of rows ?? []) {
    for (const t of THRESHOLDS) {
      if (!t.check(row)) continue;

      // Dedupe — don't create duplicate open alerts for same entity+type today
      const { data: existing } = await sb
        .from("alerts")
        .select("id")
        .eq("type", t.type)
        .eq("entity_type", row.level)
        .eq("entity_id", row.entity_id)
        .eq("status", "open")
        .gte("created_at", sinceStr);

      if (existing && existing.length > 0) continue;

      const { data: ins } = await sb
        .from("alerts")
        .insert({
          severity: t.severity,
          type: t.type,
          title: t.title(row),
          body: t.body(row),
          entity_type: row.level,
          entity_id: row.entity_id,
          metadata: {
            date: row.date,
            spend: row.spend,
            cpm: row.cpm,
            frequency: row.frequency,
            roas: row.spend > 0 ? row.revenue / row.spend : 0,
          },
        })
        .select("id")
        .single();
      if (ins?.id) created.push(ins.id);
    }
  }
  return { created: created.length };
}

/**
 * Compara preço-base canônico do site (Content Collection +
 * catalog.PLATES) com o preço cadastrado em cada produto Bling.
 * Cria um alerta `bling_price_drift` por SKU divergente. Idempotente:
 * se já existe alerta aberto pro mesmo SKU, não duplica.
 *
 * Roda no cron diário e também é chamado manualmente pelo painel
 * /admin/bling. Resolve o problema de o cadastro de preço no Bling não
 * acompanhar reajustes no site — assim o time é avisado proativamente.
 */
const SLUG_TO_BLING_SKUS: Record<string, string[]> = {
  "deadlift-set": ["DEADLIFT-SET"],
  "bench-press-set": ["BENCH-SET"],
  "power-rack-set": ["POWER-SET"],
  "my-pr-set": ["MYPR-SET"],
  "camiseta-masculina": [
    "TEE-MASC",
    "TEE-MASC-P",
    "TEE-MASC-M",
    "TEE-MASC-G",
    "TEE-MASC-GG",
  ],
  "camiseta-feminina-baby-look": [
    "TEE-BABY",
    "TEE-BABY-P",
    "TEE-BABY-M",
    "TEE-BABY-G",
    "TEE-BABY-GG",
  ],
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export async function evaluateBlingPriceDrift(): Promise<{
  created: number;
  resolved: number;
  drifted: number;
  skipped?: string;
}> {
  // Sem OAuth Bling não há como checar — não falha o cron, só pula.
  if (!(await isBlingConnected())) {
    return { created: 0, resolved: 0, drifted: 0, skipped: "bling not connected" };
  }

  const sb = getAdminSupabase();

  // Monta target prices (mesma lógica de /api/admin/bling/audit-prices).
  const targetPriceBySku = new Map<string, number>();
  const siteProducts = await getCollection("products");
  for (const p of siteProducts) {
    const skus = SLUG_TO_BLING_SKUS[p.data.slug];
    if (!skus) continue;
    const priceBRL = round2(p.data.priceBase / 100);
    for (const sku of skus) targetPriceBySku.set(sku, priceBRL);
  }
  for (const plate of PLATES) {
    const sku = `ANILHA-${plate.id.replace("_", ".")}`;
    targetPriceBySku.set(sku, round2(plate.pricePerPairCents / 100));
  }
  targetPriceBySku.set(
    "ANILHA-MIX",
    round2((PLATES.find((p) => p.id === "5")?.pricePerPairCents ?? 700) / 100),
  );

  const all = await listAllProducts();
  let drifted = 0;
  let created = 0;
  const driftedSkus = new Set<string>();

  for (const bp of all) {
    const codigo = bp.codigo ?? "";
    const target = targetPriceBySku.get(codigo);
    if (target == null) continue; // não-canônico, ignora
    const current = bp.preco ?? null;
    const isDrifted =
      current == null ? true : Math.abs(round2(current) - target) > 0.01;
    if (!isDrifted) continue;
    drifted++;
    driftedSkus.add(codigo);

    // Dedupe por entity_id + type, status="open"
    const { data: existing } = await sb
      .from("alerts")
      .select("id")
      .eq("type", "bling_price_drift")
      .eq("entity_type", "bling_product")
      .eq("entity_id", codigo)
      .eq("status", "open")
      .limit(1);
    if (existing && existing.length > 0) continue;

    const currentLabel =
      current == null
        ? "—"
        : `R$ ${current.toFixed(2).replace(".", ",")}`;
    const targetLabel = `R$ ${target.toFixed(2).replace(".", ",")}`;

    const { data: ins } = await sb
      .from("alerts")
      .insert({
        severity: "warning",
        type: "bling_price_drift",
        title: `Preço Bling desatualizado — ${codigo}`,
        body: `O Bling cadastra "${codigo}" em ${currentLabel}, mas o site usa ${targetLabel}. NF-e sai correta, mas o catálogo Bling está defasado. Vá em /admin/bling → "Aplicar no Bling" para sincronizar.`,
        entity_type: "bling_product",
        entity_id: codigo,
        metadata: {
          bling_id: bp.id,
          bling_price: current,
          site_price: target,
          diff: round2(target - (current ?? 0)),
        },
      })
      .select("id")
      .single();
    if (ins?.id) created++;
  }

  // Auto-resolve alertas abertos cujo SKU agora está alinhado.
  const { data: openAlerts } = await sb
    .from("alerts")
    .select("id, entity_id")
    .eq("type", "bling_price_drift")
    .eq("status", "open");
  let resolved = 0;
  for (const a of openAlerts ?? []) {
    if (!driftedSkus.has(a.entity_id)) {
      await sb
        .from("alerts")
        .update({
          status: "resolved",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", a.id);
      resolved++;
    }
  }

  return { created, resolved, drifted };
}
