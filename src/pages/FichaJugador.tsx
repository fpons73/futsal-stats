// Ficha enriquecida de jugador (B1 del roadmap): trayectoria completa
// (Afiliacion), estadísticas acumuladas de la edición activa y últimos
// partidos con comparativa goles/minutos por barras.
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, User, CalendarDays, Activity, ArrowRightLeft, ChevronRight, Target, Timer } from "lucide-react";
import { Bandera } from "../components/ImagenSegura";
import ImagenLocal from "../components/ImagenLocal";
import SpinnerCarga from "../components/SpinnerCarga";
import { EstadoVacio } from "../components/EstadoVacio";
import { useEdicion } from "../context/EdicionContext";
import { obtenerFichaJugador, type FichaJugador as Ficha } from "../utils/fichaServicios";

function edadDe(fechaNac: string | null): number | null {
    if (!fechaNac) return null;
    const nac = new Date(fechaNac);
    if (isNaN(nac.getTime())) return null;
    const hoy = new Date();
    let edad = hoy.getFullYear() - nac.getFullYear();
    const m = hoy.getMonth() - nac.getMonth();
    if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
    return edad;
}

/** Barra comparativa relativa al máximo de la lista. */
function Barra({ valor, max, tono }: { valor: number; max: number; tono: string }) {
    const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
    return (
        <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${tono}`} style={{ width: `${pct}%` }} />
        </div>
    );
}

export default function FichaJugador() {
    const { id } = useParams();
    const personaId = Number(id);
    const { edicionActiva } = useEdicion();
    const [ficha, setFicha] = useState<Ficha | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let cancelado = false;
        setCargando(true);
        obtenerFichaJugador(personaId, edicionActiva?.id ?? null).then(f => {
            if (!cancelado) { setFicha(f); setCargando(false); }
        });
        return () => { cancelado = true; };
    }, [personaId, edicionActiva?.id]);

    if (cargando) {
        return <div className="p-8"><SpinnerCarga /></div>;
    }

    if (!ficha) {
        return (
            <div className="p-8">
                <EstadoVacio icono={User} titulo="Jugador no encontrado" descripcion="Puede que haya sido eliminado." />
            </div>
        );
    }

    const { persona, trayectoria, acumulado, ultimos } = ficha;
    const edad = edadDe(persona.fecha_nacimiento);
    const maxGoles = Math.max(1, ...ultimos.map(u => u.goles));
    const maxMinutos = Math.max(1, ...ultimos.map(u => u.minutos));

    return (
        <div className="p-8 min-h-screen bg-transparent text-white flex flex-col">
            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div className="flex items-center gap-4">
                    <Link to="/jugadores" className="text-silver/40 hover:text-white transition-colors" title="Volver a Jugadores">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="w-14 h-14 rounded-full bg-navy border border-white/10 overflow-hidden flex items-center justify-center">
                        <ImagenLocal path={persona.foto} alt={persona.nombre_deportivo} className="w-full h-full object-cover" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                            {persona.nombre_deportivo || `${persona.nombre} ${persona.apellidos}`}
                            {persona.pais_bandera && <Bandera ruta={persona.pais_bandera} nombre={persona.pais_nombre} className="w-8 h-5 rounded-sm shadow" />}
                        </h1>
                        <p className="text-silver/50 text-sm mt-0.5 flex items-center gap-2">
                            {persona.posicion && (
                                <span className="bg-orange/10 text-orange border border-orange/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{persona.posicion}</span>
                            )}
                            <span>{persona.nombre} {persona.apellidos}</span>
                            {edad !== null && <span>· {edad} años</span>}
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
                {/* COLUMNA IZQUIERDA: acumulado + últimos partidos */}
                <div className="lg:col-span-2 space-y-4">
                    {/* ACUMULADO EDICIÓN ACTIVA */}
                    <div className="glass-panel rounded-2xl border border-white/5 p-5">
                        <h2 className="flex items-center gap-2 font-display font-black uppercase tracking-wider text-sm text-silver/60 mb-4">
                            <Activity size={15} className="text-orange" /> Estadísticas
                            {edicionActiva && <span className="text-silver/30 normal-case font-medium">· {edicionActiva.nombre}</span>}
                        </h2>
                        {!acumulado ? (
                            <p className="text-silver/40 text-sm py-4 text-center">
                                {edicionActiva
                                    ? "Sin estadísticas registradas en esta edición."
                                    : "Selecciona una edición activa para ver sus estadísticas."}
                            </p>
                        ) : (
                            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 text-center">
                                {[
                                    ["PJ", acumulado.partidos],
                                    ["Tit.", acumulado.titular],
                                    ["Gol", acumulado.goles],
                                    ["Asis", acumulado.asistencias],
                                    ["Min", acumulado.minutos],
                                    ["T", acumulado.tiros],
                                    ["TP", acumulado.tiros_puerta],
                                    ["Rating", acumulado.rating_medio ? acumulado.rating_medio.toFixed(2) : "—"],
                                ].map(([k, v]) => (
                                    <div key={k as string} className="bg-white/5 rounded-lg py-3">
                                        <div className="font-display font-black text-white text-lg">{v as string | number}</div>
                                        <div className="text-[10px] text-silver/40 uppercase tracking-wider font-bold">{k as string}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ÚLTIMOS PARTIDOS CON COMPARATIVA */}
                    {ultimos.length > 0 && (
                        <div className="glass-panel rounded-2xl border border-white/5 p-5">
                            <h2 className="flex items-center gap-2 font-display font-black uppercase tracking-wider text-sm text-silver/60 mb-4">
                                <CalendarDays size={15} className="text-orange" /> Últimos partidos
                            </h2>
                            <table className="w-full text-sm">
                                <tbody>
                                    {ultimos.map(u => (
                                        <tr key={u.partido_id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-2 pr-3 text-silver/40 text-xs whitespace-nowrap">{u.fecha?.slice(0, 10) ?? "—"}</td>
                                            <td className="py-2 pr-3 text-white font-medium">
                                                <Link to={`/partido/${u.partido_id}`} className="hover:text-orange transition-colors">{u.rival}</Link>
                                            </td>
                                            <td className="py-2 pr-4 text-right font-display font-black whitespace-nowrap text-silver/60 text-xs">{u.gf}–{u.gc}</td>
                                            <td className="py-2 pr-2 w-24" title={`${u.goles} goles`}>
                                                <div className="flex items-center gap-1.5">
                                                    <Target size={11} className={u.goles > 0 ? "text-success" : "text-silver/20"} />
                                                    <Barra valor={u.goles} max={maxGoles} tono="bg-success" />
                                                    <span className="text-xs text-silver/50 w-3">{u.goles || ""}</span>
                                                </div>
                                            </td>
                                            <td className="py-2 w-24" title={`${u.minutos} minutos`}>
                                                <div className="flex items-center gap-1.5">
                                                    <Timer size={11} className="text-silver/40" />
                                                    <Barra valor={u.minutos} max={maxMinutos} tono="bg-orange" />
                                                    <span className="text-xs text-silver/50 w-6">{u.minutos || ""}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>

                {/* TRAYECTORIA */}
                <div className="glass-panel rounded-2xl border border-white/5 p-5 self-start">
                    <h2 className="flex items-center gap-2 font-display font-black uppercase tracking-wider text-sm text-silver/60 mb-4">
                        <ArrowRightLeft size={15} className="text-orange" /> Trayectoria
                    </h2>
                    {trayectoria.length === 0 ? (
                        <p className="text-silver/40 text-sm py-4 text-center">Sin etapas registradas (Afiliación).</p>
                    ) : (
                        <ol className="relative border-l border-white/10 ml-3 space-y-4">
                            {trayectoria.map(t => (
                                <li key={t.equipo_id + (t.inicio ?? "")} className="ml-4">
                                    <span className={`absolute -left-[5px] w-2.5 h-2.5 rounded-full border-2 border-navy-dark ${t.activo ? "bg-success" : "bg-silver/30"}`} />
                                    <Link to={`/equipo/${t.equipo_id}`} className="font-bold text-white hover:text-orange transition-colors flex items-center gap-1">
                                        {t.equipo_nombre} <ChevronRight size={12} className="text-silver/20" />
                                    </Link>
                                    <p className="text-xs text-silver/40 mt-0.5">
                                        {[t.inicio?.slice(0, 4) ?? "?", t.activo ? "actualidad" : t.fin?.slice(0, 4) ?? "?"].join(" – ")}
                                        {t.dorsal != null && <span className="ml-2 text-silver/30">dorsal {t.dorsal}</span>}
                                        {t.activo && <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-success">activo</span>}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    )}
                </div>
            </div>
        </div>
    );
}
