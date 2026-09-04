interface Props {
  label: string;
  localValue: number;
  visitanteValue: number;
  localNombre: string;
  visitanteNombre: string;
  type?: "percent" | "number";
}

export function ComparisonMetricBar({ label, localValue, visitanteValue, type = "number" }: Props) {
  const total = (localValue || 0) + (visitanteValue || 0);
  const localPct = total > 0 ? ((localValue || 0) / total) * 100 : 50;
  const visitantePct = 100 - localPct;

  const formatValue = (v: number) => type === "percent" ? `${v}%` : String(v);

  return (
    <div className="flex items-center gap-3 py-1.5">
      {/* Local value */}
      <div className="w-12 text-right text-xs font-bold text-blue-600 dark:text-blue-400">
        {formatValue(localValue || 0)}
      </div>

      {/* Bar */}
      <div className="flex-1 flex items-center gap-1">
        <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-l-full overflow-hidden flex justify-end">
          <div className="h-full bg-blue-500 dark:bg-blue-500 transition-all duration-500" style={{ width: `${localPct}%` }} />
        </div>
        <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 px-1 whitespace-nowrap">{label}</span>
        <div className="flex-1 h-5 bg-gray-100 dark:bg-gray-800 rounded-r-full overflow-hidden">
          <div className="h-full bg-red-500 dark:bg-red-500 transition-all duration-500" style={{ width: `${visitantePct}%` }} />
        </div>
      </div>

      {/* Visitante value */}
      <div className="w-12 text-left text-xs font-bold text-red-600 dark:text-red-400">
        {formatValue(visitanteValue || 0)}
      </div>
    </div>
  );
}
