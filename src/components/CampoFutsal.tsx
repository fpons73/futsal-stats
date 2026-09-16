import { useState } from "react";
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
  // Posición inicial real del acta (migración 12)
  "Ala izquierda": { x: 35, y: 15 },
  "Ala derecha": { x: 35, y: 85 },
  "Ala": { x: 35, y: 50 },
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
  /** País del club (id en tabla Pais): permite calcular % de extranjeros por nacionalidad.
   * `paises` (opcional) habilita el tooltip con nombre de la nacionalidad. */
  localPaisId?: number;
  visitantePaisId?: number;
  paises?: { id: number; nombre: string }[];
  /** Convocatoria completa (jugadores, sin entrenadores) para el % de extranjeros global. */
  convocatoriaLocal?: any[];
  convocatoriaVisitante?: any[];
  alineacionLocal: any[];
  alineacionVisitante: any[];
  /** Entrenador explícito (con foto); si no, se busca en la alineación como fallback. */
  entrenadorLocal?: any;
  entrenadorVisitante?: any;
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
  localPaisId, visitantePaisId, paises, convocatoriaLocal, convocatoriaVisitante,
  alineacionLocal, alineacionVisitante, entrenadorLocal: entrenadorLocalProp, entrenadorVisitante: entrenadorVisitanteProp,
  formacionLocalGuardada, formacionVisitanteGuardada, onCambiarFormacion, fechaPartido,
  arbitroNombre, arbitroFoto, arbitroBandera
}: Props) {
  const titularesLocal = alineacionLocal.filter(j => j.estado === "titular" && !j.es_entrenador);
  const titularesVisitante = alineacionVisitante.filter(j => j.estado === "titular" && !j.es_entrenador);
  // Prioridad: entrenador pasado explícitamente; fallback a buscarlo en la alineación.
  const entrenadorLocal = entrenadorLocalProp || alineacionLocal.find(j => j.es_entrenador && j.estado !== "no_convocado");
  const entrenadorVisitante = entrenadorVisitanteProp || alineacionVisitante.find(j => j.es_entrenador && j.estado !== "no_convocado");

  const getFormacionCalculada = (jugadores: any[]) => {
    if (jugadores.length === 0) return "1-3-1";
    const defs = jugadores.filter(j => (j.posicion_partido || "").includes("Cierre")).length;
    const als = jugadores.filter(j => (j.posicion_partido || "").includes("Ala")).length;
    const pivs = jugadores.filter(j => (j.posicion_partido || "").includes("Pivot") || (j.posicion_partido || "").includes("Pívot")).length;
    return `1-${defs || als}-${pivs || 0}`;
  };

  const formacionLocal = formacionLocalGuardada || getFormacionCalculada(titularesLocal);
  const formacionVisitante = formacionVisitanteGuardada || getFormacionCalculada(titularesVisitante);

  // Un jugador es extranjero si su nacionalidad principal no coincide con el país del equipo.
  // Prioridad: comparación por id de país (fiable); fallback a comparar la ruta de la bandera.
  const esForaneo = (j: any, paisEquipo?: number, banderaEquipo?: string) => {
    if (paisEquipo != null && j.nacionalidad_id != null) {
      return Number(j.nacionalidad_id) !== Number(paisEquipo);
    }
    if (!banderaEquipo || !j.bandera1) return false;
    return j.bandera1.toLowerCase().trim() !== banderaEquipo.toLowerCase().trim();
  };

  const pctExtranjeros = (jugadores: any[], paisEquipo?: number, banderaEquipo?: string) => {
    if (!jugadores.length || (paisEquipo == null && !banderaEquipo)) return { pct: "0.0", foraneos: [] as any[] };
    const foraneos = jugadores.filter(j => esForaneo(j, paisEquipo, banderaEquipo));
    return { pct: ((foraneos.length / jugadores.length) * 100).toFixed(1), foraneos };
  };

  const { pct: pctForaneosLocal, foraneos: foraneosLocal } = pctExtranjeros(titularesLocal, localPaisId, localBandera);
  const { pct: pctForaneosVisitante, foraneos: foraneosVisitante } = pctExtranjeros(titularesVisitante, visitantePaisId, visitanteBandera);

  // % de extranjeros sobre la convocatoria completa (todos los convocados del acta).
  const convocadosLocal = convocatoriaLocal?.length ? convocatoriaLocal : titularesLocal;
  const convocadosVisitante = convocatoriaVisitante?.length ? convocatoriaVisitante : titularesVisitante;
  const { pct: pctConvocatoriaLocal, foraneos: foraneosConvLocal } = pctExtranjeros(convocadosLocal, localPaisId, localBandera);
  const { pct: pctConvocatoriaVisitante, foraneos: foraneosConvVisitante } = pctExtranjeros(convocadosVisitante, visitantePaisId, visitanteBandera);

  /** Nombre del país para el tooltip (requiere la lista `paises`). */
  const nombrePais = (id?: number) => paises?.find(p => p.id === Number(id))?.nombre;

  /** Agrupa jugadores por nacionalidad para los tooltips: [{ país, bandera, jugadores }]. */
  const agruparPorNacionalidad = (jugadores: any[]) => {
    const grupos: { pais: string; bandera?: string; jugadores: any[] }[] = [];
    jugadores.forEach(j => {
      const pais = nombrePais(j.nacionalidad_id) || "Sin nacionalidad";
      let g = grupos.find(gr => gr.pais === pais);
      if (!g) {
        g = { pais, bandera: j.bandera1, jugadores: [] };
        grupos.push(g);
      }
      g.jugadores.push(j);
    });
    // Más numerosos primero; a igualdad, alfabético por país.
    return grupos.sort((a, b) => b.jugadores.length - a.jugadores.length || a.pais.localeCompare(b.pais));
  };

  const edadMediaLocalXI = calcularMediaEdad(titularesLocal, fechaPartido);
  const edadMediaVisitanteXI = calcularMediaEdad(titularesVisitante, fechaPartido);

  // Edad media de la convocatoria completa + desglose por jugador para los tooltips.
  const edadMediaConvLocal = calcularMediaEdad(convocadosLocal, fechaPartido);
  const edadMediaConvVisitante = calcularMediaEdad(convocadosVisitante, fechaPartido);

  /** Edad de cada jugador (los que tienen fecha de nacimiento), ordenados de menor a mayor. */
  const desgloseEdades = (jugadores: any[]) => jugadores
    .map(j => ({ ...j, edad: calcularEdad(j.fecha_nacimiento, fechaPartido) }))
    .filter((j): j is any & { edad: number } => j.edad !== null)
    .sort((a, b) => a.edad - b.edad);

  const edadesXILocal = desgloseEdades(titularesLocal);
  const edadesXIVisitante = desgloseEdades(titularesVisitante);
  const edadesConvLocal = desgloseEdades(convocadosLocal);
  const edadesConvVisitante = desgloseEdades(convocadosVisitante);

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

  // Fijado de tooltips por clic/tap (para pantallas táctiles). El hover sigue funcionando;
  // el clic fija el desplegable y otro clic (en la chapa o fuera) lo cierra.
  const [tooltipPin, setTooltipPin] = useState<string | null>(null);
  const togglePin = (key: string) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setTooltipPin(prev => (prev === key ? null : key));
  };
  // Estilos inline al fijar: garantizan que ganen a las clases base (invisible/opacity-0/pointer-events-none),
  // cuyo orden en el CSS generado no controlamos.
  const pinStyle = (key: string): React.CSSProperties | undefined =>
    tooltipPin === key ? { opacity: 1, visibility: "visible", pointerEvents: "auto" } : undefined;

  // Resaltado en la pista de los jugadores del grupo de nacionalidad apuntado en los tooltips.
  const [nacResaltada, setNacResaltada] = useState<number[] | null>(null);
  const esResaltado = (id: any) => !!nacResaltada?.includes(Number(id));
  const limpiarResaltado = () => setNacResaltada(null);

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
      </div>
      <div className="w-full px-2 text-center my-4 flex flex-col items-center gap-1.5">
        <span className="text-xs font-black tracking-wider text-gray-200 uppercase truncate max-w-full block">{nombre}</span>
        {/* Bandera del país del equipo, bajo el nombre */}
        {bandera && (
          <div className="rounded overflow-hidden shadow-md border border-white/15" title="País del equipo">
            <img src={resolveSrc(bandera)} className="w-9 h-auto" />
          </div>
        )}
      </div>
      <div className="flex flex-col items-center gap-2 w-full px-2 mt-auto">
        <span className="text-[9px] uppercase font-black text-gray-500 tracking-wider">Entrenador</span>
        <div className="relative group cursor-help">
          {entrenador?.foto_path ? (
            <img src={resolveSrc(entrenador.foto_path)} className={`w-14 h-14 rounded-full border-2 ${esLocal ? "border-blue-500" : "border-red-500"} object-cover shadow-lg`} />
          ) : (
            <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 border-gray-700 bg-gray-900`}><FaUserTie size={22} className="text-gray-500" /></div>
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
        {/* Edad media del XI, con desglose por jugador al pasar el ratón */}
        <div className="relative w-full group/edad cursor-help" onClick={togglePin((esLocal ? "l" : "v") + "-edad-xi")}>
          <div className="text-[9px] text-gray-400 bg-gray-900/90 border border-gray-800/80 py-1 rounded-lg w-full text-center px-1 font-semibold">
            Edad XI: <span className="text-yellow-500 font-bold">{esLocal ? edadMediaLocalXI : edadMediaVisitanteXI}</span>
          </div>
          {(() => {
            const lista = esLocal ? edadesXILocal : edadesXIVisitante;
            if (!lista.length) return null;
            return (
              <div onClick={(e) => e.stopPropagation()} className={`absolute bottom-full mb-2 w-48 bg-gray-950/95
               backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-2xl p-2.5 opacity-0 invisible group-hover/edad:opacity-100 group-hover/edad:visible transition-all duration-150 z-[60] ${esLocal ? "left-0" : "right-0"}`} style={pinStyle((esLocal ? "l" : "v") + "-edad-xi")}>
                <div className="text-[9px] uppercase font-black tracking-wider text-gray-500 mb-1.5">Edades XI</div>
                {lista.map((j: any) => (
                  <div key={j.persona_id} className="flex items-center gap-2 py-0.5">
                    <span className="text-[9px] text-gray-600 w-5 text-right flex-shrink-0 font-bold">{j.edad}a</span>
                    <span className="text-[10px] font-bold truncate">{j.nombre}</span>
                    <span className="text-[9px] text-gray-600 flex-shrink-0 ml-auto">#{j.dorsal}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {/* Edad media de la convocatoria completa */}
        <div className="relative w-full group/edadconv cursor-help" onClick={togglePin((esLocal ? "l" : "v") + "-edad-conv")}>
          <div className="text-[9px] text-gray-500 bg-gray-900/60 border border-gray-800/50 py-0.5 rounded-lg w-full text-center px-1 font-semibold">
            Conv: <span className="text-yellow-500/70 font-bold">{esLocal ? edadMediaConvLocal : edadMediaConvVisitante}</span>
          </div>
          {(() => {
            const lista = esLocal ? edadesConvLocal : edadesConvVisitante;
            if (!lista.length) return null;
            return (
              <div onClick={(e) => e.stopPropagation()} className={`absolute bottom-full mb-2 w-48 bg-gray-950/95
               backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-2xl p-2.5 opacity-0 invisible group-hover/edadconv:opacity-100 group-hover/edadconv:visible transition-all duration-150 z-[60] max-h-56 overflow-y-auto ${esLocal ? "left-0" : "right-0"}`} style={pinStyle((esLocal ? "l" : "v") + "-edad-conv")}>
                <div className="text-[9px] uppercase font-black tracking-wider text-gray-500 mb-1.5">Edades convocatoria</div>
                {lista.map((j: any) => (
                  <div key={j.persona_id} className="flex items-center gap-2 py-0.5">
                    <span className="text-[9px] text-gray-600 w-5 text-right flex-shrink-0 font-bold">{j.edad}a</span>
                    <span className="text-[10px] font-bold truncate">{j.nombre}</span>
                    <span className="text-[9px] text-gray-600 flex-shrink-0 ml-auto">#{j.dorsal}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {/* % de extranjeros del XI, con tooltip que desglosa quién cuenta como foráneo */}
        <div className="relative w-full group/pct cursor-help" onClick={togglePin((esLocal ? "l" : "v") + "ext-xi")}>
          <div className="text-[9px] text-gray-400 bg-gray-900/90 border border-gray-800/80 py-1 rounded-lg w-full text-center px-1 font-semibold">
            XI: <span className={esLocal ? "text-blue-400 font-bold" : "text-red-400 font-bold"}>{esLocal ? pctForaneosLocal : pctForaneosVisitante}%</span> Ext.
          </div>
          {(() => {
            const foraneos = esLocal ? foraneosLocal : foraneosVisitante;
            if (!foraneos.length) return null;
            return (
              <div onClick={(e) => e.stopPropagation()} className={`absolute bottom-full mb-2 w-48 bg-gray-950/95
               backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-2xl p-2.5 opacity-0 invisible group-hover/pct:opacity-100 group-hover/pct:visible group-hover/pct:pointer-events-auto before:content-[''] before:absolute before:top-full before:left-0 before:right-0 before:h-2 transition-all duration-150 z-[60] ${esLocal ? "left-0" : "right-0"}`} style={pinStyle((esLocal ? "l" : "v") + "ext-xi")} onMouseLeave={limpiarResaltado}>
                <div className="text-[9px] uppercase font-black tracking-wider text-gray-500 mb-1.5">Extranjeros XI</div>
                {agruparPorNacionalidad(foraneos).map(g => (
                  <div key={g.pais} className="mb-1.5 last:mb-0">
                    <div
                      className="flex items-center gap-1.5 py-0.5 rounded cursor-default hover:bg-white/10"
                      onMouseEnter={() => setNacResaltada(g.jugadores.map((j: any) => Number(j.persona_id)))}
                    >
                      {g.bandera ? (
                        <img src={resolveSrc(g.bandera)} className="w-4 h-3 rounded-[2px] border border-white/10 object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-3 rounded-[2px] bg-gray-800 flex-shrink-0" />
                      )}
                      <span className="text-[10px] font-black">{g.jugadores.length}× {g.pais}</span>
                    </div>
                    <div className="pl-5 text-[9px] text-gray-400 leading-snug">
                      {g.jugadores.map((j: any) => `${j.nombre}${j.dorsal ? ` (#${j.dorsal})` : ""}`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
        {/* % de extranjeros sobre la convocatoria completa */}
        <div className="relative w-full group/conv cursor-help" onClick={togglePin((esLocal ? "l" : "v") + "ext-conv")}>
          <div className="text-[9px] text-gray-500 bg-gray-900/60 border border-gray-800/50 py-0.5 rounded-lg w-full text-center px-1 font-semibold">
            Conv: <span className={esLocal ? "text-blue-300/80 font-bold" : "text-red-300/80 font-bold"}>{esLocal ? pctConvocatoriaLocal : pctConvocatoriaVisitante}%</span> Ext.
          </div>
          {(() => {
            const foraneos = esLocal ? foraneosConvLocal : foraneosConvVisitante;
            if (!foraneos.length) return null;
            return (
              <div onClick={(e) => e.stopPropagation()} className={`absolute bottom-full mb-2 w-48 bg-gray-950/95
               backdrop-blur-sm text-white rounded-lg border border-white/10 shadow-2xl p-2.5 opacity-0 invisible group-hover/conv:opacity-100 group-hover/conv:visible group-hover/conv:pointer-events-auto before:content-[''] before:absolute before:top-full before:left-0 before:right-0 before:h-2 transition-all duration-150 z-[60] ${esLocal ? "left-0" : "right-0"}`} style={pinStyle((esLocal ? "l" : "v") + "ext-conv")} onMouseLeave={limpiarResaltado}>
                <div className="text-[9px] uppercase font-black tracking-wider text-gray-500 mb-1.5">Extranjeros convocatoria</div>
                {agruparPorNacionalidad(foraneos).map(g => (
                  <div key={g.pais} className="mb-1.5 last:mb-0">
                    <div
                      className="flex items-center gap-1.5 py-0.5 rounded cursor-default hover:bg-white/10"
                      onMouseEnter={() => setNacResaltada(g.jugadores.map((j: any) => Number(j.persona_id)))}
                    >
                      {g.bandera ? (
                        <img src={resolveSrc(g.bandera)} className="w-4 h-3 rounded-[2px] border border-white/10 object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-3 rounded-[2px] bg-gray-800 flex-shrink-0" />
                      )}
                      <span className="text-[10px] font-black">{g.jugadores.length}× {g.pais}</span>
                    </div>
                    <div className="pl-5 text-[9px] text-gray-400 leading-snug">
                      {g.jugadores.map((j: any) => `${j.nombre}${j.dorsal ? ` (#${j.dorsal})` : ""}`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full h-full flex bg-gray-900/90 rounded-xl overflow-hidden shadow-2xl border border-gray-800" onClick={() => { setTooltipPin(null); limpiarResaltado(); }}>
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
        {renderLocal.map(j => <PlayerToken key={j.persona_id} jug={j} color="bg-yellow-400 border-yellow-200" resaltado={esResaltado(j.persona_id)} />)}
        {renderVisitante.map(j => <PlayerToken key={j.persona_id} jug={j} color="bg-cyan-400 border-cyan-200" resaltado={esResaltado(j.persona_id)} />)}

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

function PlayerToken({ jug, color, resaltado }: { jug: any; color: string; resaltado?: boolean }) {
  return (
    <div className={`absolute flex flex-col items-center group cursor-pointer transition-all hover:scale-110 ${resaltado ? "z-40 scale-110" : "hover:z-50"}`} style={jug.style}>
      <div className={`w-14 h-14 rounded-full border-[3px] border-white overflow-hidden relative ${color} z-10 ${resaltado ? "shadow-[0_0_18px_6px_rgba(255,255,255,0.7)] ring-4 ring-white/90" : "shadow-lg"}`}>
        {jug.foto_path ? (
          <img src={resolveSrc(jug.foto_path)} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-black/50 font-bold text-base">{jug.dorsal}</div>
        )}
      </div>
      {jug.bandera1 && (
        <div className="absolute -top-1 -right-1 z-20 bg-white rounded-full p-0.5 shadow-sm w-5 h-5 flex items-center justify-center overflow-hidden">
          <img src={resolveSrc(jug.bandera1)} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="mt-1 bg-black/60 text-white text-xs font-bold px-2 py-0.5 rounded backdrop-blur-sm whitespace-nowrap border border-white/10 z-10">
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
