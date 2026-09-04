// Mini SVG de la pista de futsal para visualizar zona de gol

export function MiniCanchaAreaSVG({ zona, className = "" }: { zona?: string; className?: string }) {
  return (
    <svg viewBox="0 0 100 50" className={className} style={{ maxHeight: 60 }}>
      {/* Pista */}
      <rect x="1" y="1" width="98" height="48" fill="none" stroke="#666" strokeWidth="1" />
      {/* Medio campo */}
      <line x1="50" y1="1" x2="50" y2="49" stroke="#666" strokeWidth="0.5" />
      <circle cx="50" cy="25" r="8" fill="none" stroke="#666" strokeWidth="0.5" />
      {/* Área izquierda (6m) */}
      <path d="M 1 15 L 10 15 L 10 35 L 1 35" fill="none" stroke="#666" strokeWidth="0.8" />
      {/* Marca de 10m */}
      <path d="M 1 18 Q 14 25 1 32" fill="none" stroke="#999" strokeWidth="0.4" strokeDasharray="1,1" />
      {/* Área derecha */}
      <path d="M 99 15 L 90 15 L 90 35 L 99 35" fill="none" stroke="#666" strokeWidth="0.8" />

      {/* Zona seleccionada */}
      {zona && (
        <circle
          cx={zona.includes("6m") ? 5 : zona.includes("10m") ? 14 : 40}
          cy={25}
          r={3}
          fill="#ef4444"
          opacity={0.7}
        />
      )}
    </svg>
  );
}

export function normalizarZonaGol(zona: string): string {
  const z = zona.toLowerCase();
  if (z.includes("6m") || z.includes("peque")) return "Área de 6m";
  if (z.includes("10m") || z.includes("fuera")) return "Fuera del área (10m)";
  return "Lejos del arco";
}
