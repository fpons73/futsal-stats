import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from "recharts";

export interface RadarCategory {
  metric: string;
  local: number;
  visitante: number;
  fullMark: number;
}

interface Props {
  data: RadarCategory[];
  localNombre: string;
  visitanteNombre: string;
}

export function TeamPerformanceRadar({ data, localNombre, visitanteNombre }: Props) {
  if (!data || data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid stroke="#374151" />
        <PolarAngleAxis dataKey="metric" tick={{ fill: "#9ca3af", fontSize: 10 }} />
        <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 8 }} />
        <Radar name={localNombre} dataKey="local" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
        <Radar name={visitanteNombre} dataKey="visitante" stroke="#ef4444" fill="#ef4444" fillOpacity={0.3} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
