import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface SeriesDef {
  key: string;
  label: string;
  color: string;
}

interface Props {
  data: Array<Record<string, number | string>>;
  series: SeriesDef[];
  xKey: string;
  height?: number;
  yFormatter?: (value: number) => string;
}

const formatNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return Math.round(n).toString();
};

export default function TrendChart({ data, series, xKey, height = 280, yFormatter }: Props) {
  const fmtY = yFormatter ?? formatNumber;
  return (
    <div style={{ width: "100%", height: "100%", minHeight: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
          <defs>
            {series.map((s) => (
              <linearGradient id={`grad-${s.key}`} key={s.key} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={s.color} stopOpacity={0.32} />
                <stop offset="100%" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid stroke="#22224a" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey={xKey}
            stroke="#5a5a85"
            tick={{ fontSize: 11, fill: "#8585a8" }}
            tickLine={false}
            axisLine={{ stroke: "#22224a" }}
          />
          <YAxis
            stroke="#5a5a85"
            tick={{ fontSize: 11, fill: "#8585a8" }}
            tickFormatter={fmtY}
            tickLine={false}
            axisLine={false}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "#3a3a5e", strokeDasharray: "3 3" }}
            contentStyle={{
              backgroundColor: "#040425",
              border: "1px solid #22224a",
              borderRadius: 10,
              padding: "8px 12px",
              fontSize: 12,
              boxShadow: "0 8px 30px rgba(0,0,0,0.4)",
            }}
            labelStyle={{ color: "#d8ff2c", marginBottom: 4, fontWeight: 600 }}
            itemStyle={{ color: "#e6e6f0" }}
            formatter={(v: number) => fmtY(v)}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#b8b8d0", paddingTop: 8 }}
            iconType="circle"
            iconSize={8}
          />
          {series.map((s) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              fill={`url(#grad-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
