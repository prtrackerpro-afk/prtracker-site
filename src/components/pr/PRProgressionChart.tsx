import { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ChartRecord {
  exercise: string;
  exerciseLabel: string;
  weight_kg: number;
  performed_at: string; // YYYY-MM-DD
  is_personal_record: boolean;
}

interface Props {
  records: ChartRecord[];
}

// Tabular dropdown of exercises that have ≥2 records (single-point lines
// don't show progression). Selected by default = exercise with most data.
export default function PRProgressionChart({ records }: Props) {
  const grouped = useMemo(() => groupByExercise(records), [records]);
  const exercises = useMemo(
    () =>
      Object.entries(grouped)
        .filter(([, rs]) => rs.length >= 2)
        .map(([id, rs]) => ({ id, label: rs[0]?.exerciseLabel ?? id, count: rs.length }))
        .sort((a, b) => b.count - a.count),
    [grouped]
  );

  const [selected, setSelected] = useState<string | null>(exercises[0]?.id ?? null);

  if (exercises.length === 0) {
    return (
      <div className="text-sm text-navy-300 text-center py-6">
        Registre 2 PRs do mesmo movimento para ver a progressão.
      </div>
    );
  }

  const data = (selected ? grouped[selected] ?? [] : []).map((r) => ({
    date: fmtMonthDay(r.performed_at),
    weight: r.weight_kg,
    isPR: r.is_personal_record,
  }));

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <select
          value={selected ?? ""}
          onChange={(e) => setSelected(e.target.value)}
          className="rounded-lg border border-navy-600 bg-navy-900 px-2.5 py-1.5 text-sm flex-1 max-w-[240px]"
        >
          {exercises.map((ex) => (
            <option key={ex.id} value={ex.id}>
              {ex.label} ({ex.count})
            </option>
          ))}
        </select>
        <div className="text-[10px] uppercase tracking-widest text-navy-300">progressão</div>
      </div>

      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e1b50" />
            <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="#3a3970" />
            <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} stroke="#3a3970" unit="kg" width={48} />
            <Tooltip
              contentStyle={{
                background: "#0a0050",
                border: "1px solid #3a3970",
                borderRadius: 6,
                fontSize: 12,
              }}
              labelStyle={{ color: "#fff" }}
              itemStyle={{ color: "#D8FF2C" }}
              formatter={((v: number) => [`${v} kg`, "Peso"]) as never}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#D8FF2C"
              strokeWidth={2.5}
              dot={(props: any) => {
                const isPr = props.payload?.isPR;
                return (
                  <circle
                    key={props.index}
                    cx={props.cx}
                    cy={props.cy}
                    r={isPr ? 5 : 3}
                    fill={isPr ? "#D8FF2C" : "#fff"}
                    stroke="#01002A"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{ r: 6, fill: "#D8FF2C", stroke: "#01002A", strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function groupByExercise(records: ChartRecord[]): Record<string, ChartRecord[]> {
  const out: Record<string, ChartRecord[]> = {};
  for (const r of records) {
    const bucket = out[r.exercise] ?? (out[r.exercise] = []);
    bucket.push(r);
  }
  // Sort each group ascending by date for chart.
  for (const k of Object.keys(out)) {
    out[k]?.sort((a, b) => a.performed_at.localeCompare(b.performed_at));
  }
  return out;
}

function fmtMonthDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}
