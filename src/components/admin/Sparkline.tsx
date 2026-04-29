import { Area, AreaChart, ResponsiveContainer } from "recharts";

interface Props {
  data: Array<{ v: number }>;
  color?: string;
  height?: number;
}

/**
 * Tiny inline trend line for KPI cards. No axes, no tooltip — pure visual rhythm.
 * Caller provides series as `[{ v: number }, ...]`. ~30px tall by default.
 */
export default function Sparkline({ data, color = "#d8ff2c", height = 36 }: Props) {
  if (!data || data.length < 2) {
    return <div style={{ height, opacity: 0.25 }} />;
  }
  const id = `sparkfill-${Math.random().toString(36).slice(2, 8)}`;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${id})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
