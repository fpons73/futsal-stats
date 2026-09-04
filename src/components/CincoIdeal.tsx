import { Shield } from "lucide-react";
import { getImgSrc } from "../utils/imageHelpers";

const COORDENADAS: Record<string, { x: number; y: number }> = {
  "Portero": { x: 5, y: 50 },
  "Cierre": { x: 25, y: 50 },
  "Ala": { x: 35, y: 50 },
  "Pivot": { x: 45, y: 50 },
  "Pívot": { x: 45, y: 50 },
  "Universal": { x: 30, y: 50 },
};

export function CincoIdeal({ jugadores }: { jugadores: any[] }) {
  if (!jugadores || jugadores.length === 0) return null;

  return (
    <div className="relative bg-gradient-to-b from-amber-700 to-amber-800 rounded-xl overflow-hidden shadow-2xl border border-white/10" style={{ aspectRatio: "2/1" }}>
      {/* Pista */}
      <div className="absolute inset-2 border-2 border-white/70 rounded"></div>
      <div className="absolute top-1/2 left-2 right-2 h-px bg-white/70"></div>
      <div className="absolute top-1/2 left-1/2 w-16 h-16 border-2 border-white/70 rounded-full -translate-x-1/2 -translate-y-1/2"></div>

      {/* Áreas */}
      <div className="absolute top-1/2 left-2 w-10 h-20 border-2 border-white/70 -translate-y-1/2 rounded-r"></div>
      <div className="absolute top-1/2 right-2 w-10 h-20 border-2 border-white/70 -translate-y-1/2 rounded-l"></div>

      {/* Jugadores */}
      {jugadores.map((jug, i) => {
        const coords = COORDENADAS[jug.posicion_principal] || { x: 30 + (i * 8), y: 50 };
        return (
          <div
            key={jug.id}
            className="absolute flex flex-col items-center group"
            style={{ left: `${coords.x}%`, top: `${coords.y}%`, transform: "translate(-50%, -50%)" }}
          >
            <div className="w-12 h-12 rounded-full border-2 border-white shadow-xl overflow-hidden bg-white flex items-center justify-center">
              {jug.foto_path ? (
                <img src={getImgSrc(jug.foto_path)} className="w-full h-full object-cover" />
              ) : (
                <Shield size={20} className="text-gray-300" />
              )}
            </div>
            {jug.equipo_escudo && (
              <div className="absolute -bottom-1 -left-1 bg-white rounded-full p-0.5 shadow-md w-5 h-5 flex items-center justify-center overflow-hidden border border-gray-100">
                <img src={getImgSrc(jug.equipo_escudo)} className="w-full h-full object-contain" />
              </div>
            )}
            {jug.bandera_path && (
              <div className="absolute top-0 right-0 bg-white rounded-full p-0.5 shadow-md w-4 h-4 flex items-center justify-center overflow-hidden border border-gray-100">
                <img src={getImgSrc(jug.bandera_path)} className="w-full h-full object-cover" />
              </div>
            )}
            <div className="mt-1 bg-white text-gray-900 text-[10px] font-bold px-2 py-0.5 rounded-full shadow-lg whitespace-nowrap border border-gray-200">
              {jug.nombre_deportivo}
            </div>
            <div className="mt-0.5 bg-blue-600 text-white text-[9px] font-black px-1.5 rounded-full shadow-sm">
              {Number(jug.rating_medio || 0).toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
}
