import { convertFileSrc } from "@tauri-apps/api/core";
import { Shield } from "lucide-react";
import { FaUserTie } from "react-icons/fa6";

const resolveSrc = (path: string | undefined | null) => {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("blob") || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return path;
  if (path.startsWith("banderas")) return "/" + path;
  return convertFileSrc(path);
};

const calcularEdad = (fechaNacimientoStr: string | null | undefined, fechaReferenciaStr?: string): number | null => {
  if (!fechaNacimientoStr) return null;
  const nacimiento = new Date(fechaNacimientoStr);
  if (isNaN(nacimiento.getTime())) return null;
  const referencia = fechaReferenciaStr ? new Date(fechaReferenciaStr) : new Date();
  if (isNaN(referencia.getTime())) return null;
  let edad = referencia.getFullYear() - nacimiento.getFullYear();
  const mes = referencia.getMonth() - nacimiento.getMonth();
  if (mes < 0 || (mes === 0 && referencia.getDate() < nacimiento.getDate())) edad--;
  return edad;
};

const calcularMediaEdad = (jugadores: any[], fechaReferenciaStr?: string): string => {
  const edades = jugadores
    .map(j => calcularEdad(j.fecha_nacimiento, fechaReferenciaStr))
    .filter((e): e is number => e !== null);
  if (edades.length === 0) return "-";
  return (edades.reduce((a, b) => a + b, 0) / edades.length).toFixed(1) + "a";
};

// Coordenadas para posiciones de futsal en pista de 40x20m (vista de arriba)
// X: 0 (portería propia) -> 100 (portería rival)
// Y: 0 (banda superior) -> 100 (banda inferior)
const COORDENADAS: Record<string, { x: number; y: number }> = {
  "Portero": { x: 5, y: 50 },
  "Cierre": { x: 25, y: 50 },
  "Ala Izquierdo": { x: 35, y: 15 },
  "Ala Derecho": { x: 35, y: 85 },
  "Pívot": { x: 45, y: 50 },
  "Pivot": { x: 45, y: 50 },
  "Universal": { x: 30, y: 50 },
};

const TACTICAS = ["1-3-1", "1-2-1-1", "1-1-2-1", "1-3-1-0", "1-2-2", "1-1-3", "1-4-0", "1-0-4"];

type Props = {
  localNombre: string;
  visitanteNombre: string;
  localEscudo?: string;
  visitanteEscudo?: string;
  localBandera?: string;
  visitanteBandera?: string;
  alineacionLocal: any[];
  alineacionVisitante: any[];
  formacionLocalGuardada?: string;
  formacionVisitanteGuardada?: string;
  onCambiarFormacion?: (equipo: "local" | "visitante", nuevaFormacion: string) => void;
  fechaPartido?: string;
  arbitroNombre?: string;
  arbitroFoto?: string;
  arbitroBandera?: string;
};

export function CampoFutsal({
  localNombre, visitanteNombre, localEscudo, visitanteEscudo, localBandera, visitanteBandera,
  alineacionLocal, alineacionVisitante,
  formacionLocalGuardada, formacionVisitanteGuardada, onCambiarFormacion, fechaPartido,
  arbitroNombre, arbitroFoto, arbitroBandera
}: Props) {
  const titularesLocal = alineacionLocal.filter(j => j.estado === "titular" && !j.es_entrenador);
  const titularesVisitante = alineacionVisitante.filter(j => j.estado === "titular" && !j.es_entrenador);
  const entrenadorLocal = alineacionLocal.find(j => j.es_entrenador && j.estado === "titular");
  const entrenadorVisitante = alineacionVisitante.find(j => j.es_entrenador && j.estado === "titular");

  const getFormacionCalculada = (jugadores: any[]) => {
    if (jugadores.length === 0) return "1-3-1";
    const defs = jugadores.filter(j => (j.posicion_partido || "").includes("Cierre")).length;
    const als = jugadores.filter(j => (j.posicion_partido || "").includes("Ala")).length;
    const pivs = jugadores.filter(j => (j.posicion_partido || "").includes("Pivot") || (j.posicion_partido || "").includes("Pívot")).length;
    return `1-${defs || als}-${pivs || 0}`;
  };

  const formacionLocal = formacionLocalGuardada || getFormacionCalculada(titularesLocal);
  const formacionVisitante = formacionVisitanteGuardada || getFormacionCalculada(titularesVisitante);

  const esForaneo = (j: any, banderaEquipo?: string) => {
    if (!banderaEquipo || !j.bandera1) return false;
    return j.bandera1.toLowerCase().trim() !== banderaEquipo.toLowerCase().trim();
  };

  const foraneosLocal = localBandera ? titularesLocal.filter(j => esForaneo(j, localBandera)).length : 0;
  const pctForaneosLocal = titularesLocal.length && localBandera ? ((foraneosLocal / titularesLocal.length) * 100).toFixed(1) : "0.0";
  const foraneosVisitante = visitanteBandera ? titularesVisitante.filter(j => esForaneo(j, visitanteBandera)).length : 0;
  const pctForaneosVisitante = titularesVisitante.length && visitanteBandera ? ((foraneosVisitante / titularesVisitante.length) * 100).toFixed(1) : "0.0";

  const edadMediaLocalXI = calcularMediaEdad(titularesLocal, fechaPartido);
  const edadMediaVisitanteXI = calcularMediaEdad(titularesVisitante, fechaPartido);

  const distribuirJugadores = (jugadores: any[], esLocal: boolean) => {
    const jugConCoords = jugadores.map(j => {
      let base = COORDENADAS[j.posicion_partido];
      if (!base) {
        const p = (j.posicion_partido || "").toLowerCase();
        if (p.includes("portero")) base = COORDENADAS["Portero"];
        else if (p.includes("cierre")) base = COORDENADAS["Cierre"];
        else if (p.includes("pivot") || p.includes("pívot")) base = COORDENADAS["Pívot"];
        else if (p.includes("ala") && p.includes("izq")) base = COORDENADAS["Ala Izquierdo"];
        else if (p.includes("ala") && p.includes("der")) base = COORDENADAS["Ala Derecho"];
        else if (p.includes("ala")) base = { x: 35, y: 50 };
        else if (p.includes("universal")) base = COORDENADAS["Universal"];
        else base = { x: 30, y: 50 };
      }
      return { ...j, baseX: base.x, baseY: base.y };
    });

    const grupos: Record<string, typeof jugConCoords> = {};
    jugConCoords.forEach(j => {
      const k = `${j.baseX}-${j.baseY}`;
      if (!grupos[k]) grupos[k] = [];
      grupos[k].push(j);
    });

    return Object.values(grupos).flatMap(grupo => {
      if (grupo.length === 1) {
        const j = grupo[0];
        return [{
          ...j,
          style: {
            left: esLocal ? `${j.baseX}%` : `${100 - j.baseX}%`,
            top: esLocal ? `${j.baseY}%` : `${100 - j.baseY}%`,
            transform: "translate(-50%, -50%)"
          }
        }];
      } else {
        return grupo.map((j, i) => {
          let y = 50;
          if (j.baseY === 50) {
            const step = 60 / (grupo.length + 1);
            y = 20 + step * (i + 1);
          } else {
            y = j.baseY + (i - (grupo.length - 1) / 2) * 10;
          }
          return {
            ...j,
            style: {
              left: esLocal ? `${j.baseX}%` : `${100 - j.baseX}%`,
              top: esLocal ? `${y}%` : `${100 - y}%`,
              transform: "translate(-50%, -50%)"
            }
          };
        });
      }
    });
  };

  const renderLocal = distribuirJugadores(titularesLocal, true);
  const renderVisitante = distribuirJugadores(titularesVisitante, false);

  const PanelEquipo = ({ nombre, escudo, bandera, entrenador, formacion, colorBorder, esLocal }: any) => (
    <div className={`w-28 flex flex-col justify-between items-center py-6 bg-gradient-to-b from-gray-900 via-gray-800 to-gray-950 border-${colorBorder} border-gray-800 relative`}>
      <div className="flex flex-col items-center gap-3">
        {escudo ? (
          <div className="p-2 rounded-2xl bg-white shadow-xl border border-gray-200/20 flex items-center justify-center w-16 h-16">
            <img src={resolveSrc(escudo)} className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="w-16 h-16 bg-white/5 rounded-2xl border border-white/10 flex items-center justify-center"><Shield size={28} className="text-white/20" /></div>
        )}
        {bandera && <div className="rounded overflow-hidden shadow-md border border-white/10"><img src={resolveSrc(bandera)} className="w-7 h-auto opacity-90" /></div>}
      </div>
      <div className="w-full px-2 text-center my-4">
        <span className="text-xs font-black tracking-wider text-gray-200 uppercase truncate block">{nombre}</span>
      </div>
      <div className="flex flex-col items-center gap-2 w-full px-2 mt-auto">
        <span className="text-[9px] uppercase font-black text-gray-500 tracking-wider">Entrenador</span>
        <div className="relative group cursor-help">
          {entrenador?.foto_path ? (
            <img src={resolveSrc(entrenador.foto_path)} className={`w-12 h-12 rounded-full border-2 ${esLocal ? "border-blue-500" : "border-red-500"} object-cover shadow-lg`} />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center border-2 border-gray-700 bg-gray-900`}><FaUserTie size={20} className="text-gray-500" /></div>
          )}
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-gray-950 text-white text-xs px-2.5 py-1 rounded-lg border border-gray-800 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-55">{entrenador?.nombre}</div>
        </div>
        {onCambiarFormacion ? (
          <select
            value={formacion}
            onChange={(e) => onCambiarFormacion(esLocal ? "local" : "visitante", e.target.value)}
            className={`text-xs font-bold ${esLocal ? "bg-blue-950/80 text-blue-300 border-blue-500/20" : "bg-red-950/80 text-red-300 border-red-500/20"} px-2 py-0.5 rounded-full border outline-none cursor-pointer text-center`}
          >
            {TACTICAS.map(t => <option key={t} value={t} className="bg-gray-950 text-white">{t}</option>)}
            {!TACTICAS.includes(formacion) && <option value={formacion} className="bg-gray-950 text-white">{formacion}</option>}
          </select>
        ) : (
          <span className={`text-[11px] font-bold ${esLocal ? "bg-blue-950/80 text-blue-300 border-blue-500/20" : "bg-red-950/80 text-red-300 border-red-500/20"} px-2 py-0.5 rounded-full border`}>{formacion}</span>
        )}
        <div className="text-[9px] text-gray-400 bg-gray-900/90 border border-gray-800/80 py-1 rounded-lg w-full text-center px-1 font-semibold">
          Edad XI: <span className="text-yellow-500 font-bold">{esLocal ? edadMediaLocalXI : edadMediaVisitanteXI}</span>
        </div>
        <div className="text-[9px] text-gray-400 bg-gray-900/90 border border-gray-800/80 py-1 rounded-lg w-full text-center px-1 font-semibold">
          XI: <span className={esLocal ? "text-blue-400 font-bold" : "text-red-400 font-bold"}>{esLocal ? pctForaneosLocal : pctForaneosVisitante}%</span> Ext.
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex bg-gray-900/90 rounded-xl overflow-hidden shadow-2xl border border-gray-800">
      <PanelEquipo nombre={localNombre} escudo={localEscudo} bandera={localBandera} entrenador={entrenadorLocal} formacion={formacionLocal} colorBorder="r" esLocal={true} />

      {/* PISTA DE FUTSAL */}
      <div className="flex-1 relative bg-gradient-to-b from-amber-700 to-amber-800 overflow-hidden shadow-2xl m-2 rounded-2xl border border-white/10">
        {/* Parquet */}
        <div className="absolute inset-0 w-full h-full flex opacity-30">
          {[...Array(10)].map((_, i) => (
            <div key={i} className={`h-full flex-1 ${i % 2 === 0 ? "bg-black/10" : "bg-transparent"}`}></div>
          ))}
        </div>

        {/* Líneas de la pista */}
        <div className="absolute inset-3 border-2 border-white/70 pointer-events-none"></div>
        {/* Medio campo */}
        <div className="absolute top-3 bottom-3 left-1/2 w-0.5 bg-white/70 -translate-x-1/2"></div>
        <div className="absolute top-1/2 left-1/2 w-20 h-20 border-2 border-white/70 rounded-full -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute top-1/2 left-1/2 w-2 h-2 bg-white rounded-full -translate-x-1/2 -translate-y-1/2"></div>

        {/* Áreas - en futsal son semicírculos de 6m y marca de 10m */}
        {/* Área local */}
        <div className="absolute top-1/2 left-3 w-12 h-24 border-2 border-white/70 -translate-y-1/2 bg-transparent rounded-r-lg"></div>
        <div className="absolute top-1/2 left-3 w-8 h-16 border-2 border-white/70 -translate-y-1/2 bg-transparent rounded-r-md"></div>
        {/* Marca de 10m local */}
        <div className="absolute top-1/2 left-3 translate-x-[calc(100%+24px)] -translate-y-1/2 w-1 h-1 bg-white rounded-full"></div>

        {/* Área visitante */}
        <div className="absolute top-1/2 right-3 w-12 h-24 border-2 border-white/70 -translate-y-1/2 bg-transparent rounded-l-lg"></div>
        <div className="absolute top-1/2 right-3 w-8 h-16 border-2 border-white/70 -translate-y-1/2 bg-transparent rounded-l-md"></div>

        {/* Jugadores */}
        {renderLocal.map(j => <PlayerToken key={j.persona_id} jug={j} color="bg-yellow-400 border-yellow-200" />)}
        {renderVisitante.map(j => <PlayerToken key={j.persona_id} jug={j} color="bg-cyan-400 border-cyan-200" />)}

        {/* Árbitro */}
        {arbitroNombre && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 px-3 py-1.5 rounded-full backdrop-blur-md border border-white/10 z-30">
            {arbitroFoto ? (
              <img src={resolveSrc(arbitroFoto)} className="w-6 h-6 rounded-full object-cover border border-white/20" />
            ) : (
              <div className="w-6 h-6 rounded-full bg-yellow-500 flex items-center justify-center text-[10px]">⚽</div>
            )}
            <span className="text-white text-[10px] font-bold tracking-wider">{arbitroNombre}</span>
            {arbitroBandera && <img src={resolveSrc(arbitroBandera)} className="w-5 h-3.5 object-cover rounded-[2px] border border-white/20" />}
          </div>
        )}
      </div>

      <PanelEquipo nombre={visitanteNombre} escudo={visitanteEscudo} bandera={visitanteBandera} entrenador={entrenadorVisitante} formacion={formacionVisitante} colorBorder="l" esLocal={false} />
    </div>
  );
}

function PlayerToken({ jug, color }: { jug: any; color: string }) {
  return (
    <div className="absolute flex flex-col items-center group cursor-pointer hover:z-50 transition-all hover:scale-110" style={jug.style}>
      <div className={`w-10 h-10 rounded-full border-2 border-white shadow-lg overflow-hidden relative ${color} z-10`}>
        {jug.foto_path ? (
          <img src={resolveSrc(jug.foto_path)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-black/50 font-bold text-xs">{jug.dorsal}</div>
        )}
      </div>
      {jug.bandera1 && (
        <div className="absolute -top-1 -right-1 z-20 bg-white rounded-full p-0.5 shadow-sm w-4 h-4 flex items-center justify-center overflow-hidden">
          <img src={resolveSrc(jug.bandera1)} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="mt-1 bg-black/60 text-white text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm whitespace-nowrap border border-white/10 z-10">
        {jug.nombre?.split(" ").pop()}
      </div>
      <div className="hidden group-hover:block absolute bottom-12 bg-white text-gray-900 p-2 rounded-lg shadow-xl w-36 z-50 text-xs text-left border border-gray-200">
        <div className="font-bold border-b border-gray-200 mb-1 pb-1 flex justify-between">
          <span>{jug.nombre}</span><span className="text-gray-400">#{jug.dorsal}</span>
        </div>
        <div className="text-[10px] text-gray-500">{jug.posicion_partido}</div>
        {jug.rating && <div className="mt-1 font-bold text-blue-600 text-right">Rating: {jug.rating}</div>}
      </div>
    </div>
  );
}
