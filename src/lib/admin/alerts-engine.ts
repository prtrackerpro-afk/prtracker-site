import { getAdminSupabase } from "../supabase/server";

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
