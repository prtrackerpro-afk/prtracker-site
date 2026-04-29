import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

interface Props {
  data: Array<Record<string, number | string>>;
  series: Array<{ key: string; label: string; color: string }>;
  xKey: string;
  height?: number;
  yFormatter?: (value: number) => string;
}

export default function TrendChart({ data, series, xKey, height = 260, yFormatter }: Props) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 10, left: 0 }}>
          <CartesianGrid stroke="#22224a" strokeDasharray="3 3" />
          <XAxis dataKey={xKey} stroke="#8585a8" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="#8585a8"
            tick={{ fontSize: 11 }}
            tickFormatter={yFormatter}
            width={70}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#040425",
              border: "1px solid #22224a",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#d8ff2c" }}
            formatter={(v: number) => (yFormatter ? yFormatter(v) : v)}
          />
          <Legend wrapperStyle={{ fontSize: 12, color: "#b8b8d0" }} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
