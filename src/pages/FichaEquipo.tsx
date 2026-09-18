// Ficha enriquecida de equipo (B1 del roadmap): resultados recientes, posición
// en la clasificación de la edición activa y plantilla activa. Los enlaces de
// rival y jugador llevan a las otras fichas — desde un equipo se llega a su
// clasificación y jugadores sin escribir SQL (criterio de salida de B1).
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Shield, MapPin, Plane, Trophy, Users, ChevronRight } from "lucide-react";
import { Escudo, Bandera } from "../components/ImagenSegura";
import SpinnerCarga from "../components/SpinnerCarga";
import { EstadoVacio } from "../components/EstadoVacio";
import { useEdicion } from "../context/EdicionContext";
import { obtenerFichaEquipo, type FichaEquipo as Ficha } from "../utils/fichaServicios";

const TONOS_RESULTADO: Record<"V" | "E" | "D", string> = {
    V: "bg-success/15 text-success border-success/30",
    E: "bg-warning/15 text-warning border-warning/30",
    D: "bg-red/15 text-red border-red/30",
};

export default function FichaEquipo() {
    const { id } = useParams();
    const equipoId = Number(id);
    const { edicionActiva } = useEdicion();
    const [ficha, setFicha] = useState<Ficha | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        let cancelado = false;
        setCargando(true);
        obtenerFichaEquipo(equipoId, edicionActiva?.id ?? null).then(f => {
            if (!cancelado) { setFicha(f); setCargando(false); }
        });
        return () => { cancelado = true; };
    }, [equipoId, edicionActiva?.id]);

    if (cargando) {
        return <div className="p-8"><SpinnerCarga /></div>;
    }

    if (!ficha) {
        return (
            <div className="p-8">
                <EstadoVacio icono={Shield} titulo="Equipo no encontrado" descripcion="Puede que haya sido eliminado." />
            </div>
        );
    }

    const { equipo, partidos, resumen, clasificacion, plantilla } = ficha;

    return (
        <div className="p-8 min-h-screen bg-transparent text-white flex flex-col">
            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div className="flex items-center gap-4">
                    <Link to="/equipos" className="text-silver/40 hover:text-white transition-colors" title="Volver a Equipos">
                        <ArrowLeft size={20} />
                    </Link>
                    <div className="w-14 h-14 flex items-center justify-center bg-white p-1 rounded-2xl shadow-sm border border-white/10 overflow-hidden">
                        <Escudo ruta={equipo.escudo} nombre={equipo.nombre} className="w-full h-full" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                            {equipo.nombre}
                            {equipo.pais_bandera && <Bandera ruta={equipo.pais_bandera} nombre={equipo.pais_nombre} className="w-8 h-5 rounded-sm shadow" />}
                        </h1>
                        <p className="text-silver/50 text-sm mt-0.5">
                            {[equipo.categoria, equipo.pais_nombre].filter(Boolean).join(" · ") || "Equipo"}
                        </p>
                    </div>
                </div>
                {clasificacion && (
                    <div className="text-right">
                        <div className="font-display font-black text-4xl text-orange text-glow-orange">{clasificacion.posicion}º</div>
                        <div className="text-xs text-silver/40 uppercase tracking-wider font-bold">de {clasificacion.total} · {clasificacion.puntos} pts</div>
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1">
                {/* RESULTADOS RECIENTES */}
                <div className="lg:col-span-2 glass-panel rounded-2xl border border-white/5 p-5">
                    <h2 className="flex items-center gap-2 font-display font-black uppercase tracking-wider text-sm text-silver/60 mb-4">
                        <Trophy size={15} className="text-orange" /> Últimos resultados
                        {edicionActiva && <span className="text-silver/30 normal-case font-medium">· {edicionActiva.nombre}</span>}
                    </h2>
                    {partidos.length === 0 ? (
                        <p className="text-silver/40 text-sm py-6 text-center">
                            {edicionActiva
                                ? "Sin partidos finalizados en esta edición."
                                : "Sin partidos finalizados. Selecciona una edición activa para ver los suyos."}
                        </p>
                    ) : (
                        <>
                            {/* Resumen de los últimos 10 */}
                            <div className="flex flex-wrap items-center gap-4 mb-4 text-sm">
                                <span className="text-silver/50">
                                    <strong className="text-white">{resumen.pj}</strong> PJ
                                </span>
                                <span className="text-success font-bold">{resumen.v}V</span>
                                <span className="text-warning font-bold">{resumen.e}E</span>
                                <span className="text-red font-bold">{resumen.d}D</span>
                                <span className="text-silver/50">{resumen.gf} GF · {resumen.gc} GC</span>
                                <span className="ml-auto flex gap-1">
                                    {ficha.forma.map((r, i) => (
                                        <span key={i} className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-black border ${TONOS_RESULTADO[r]}`}>{r}</span>
                                    ))}
                                </span>
                            </div>
                            <table className="w-full text-sm">
                                <tbody>
                                    {partidos.map(p => (
                                        <tr key={p.id} className="border-t border-white/5 hover:bg-white/5 transition-colors">
                                            <td className="py-2 pr-3 text-silver/40 text-xs whitespace-nowrap">
                                                {p.fecha?.slice(0, 10) ?? "—"}
                                            </td>
                                            <td className="py-2 pr-3 text-silver/60 text-xs whitespace-nowrap">{p.jornada ? `J${p.jornada}` : ""}</td>
                                            <td className="py-2 pr-2 text-silver/30 w-5" title={p.en_casa ? "En casa" : "Fuera"}>{p.en_casa ? <MapPin size={12} /> : <Plane size={12} />}</td>
                                            <td className="py-2">
                                                <Link to={`/equipo/${equipoId}`} className="text-white hover:text-orange transition-colors font-medium">{p.rival}</Link>
                                            </td>
                                            <td className="py-2 pl-3 text-right font-display font-black whitespace-nowrap">
                                                <span className={p.resultado === "V" ? "text-success" : p.resultado === "D" ? "text-red" : "text-warning"}>
                                                    {p.gf} – {p.gc}
                                                </span>
                                            </td>
                                            <td className="py-2 pl-2 text-right">
                                                <Link to={`/partido/${p.id}`} className="inline-flex items-center gap-0.5 text-xs text-silver/40 hover:text-orange transition-colors font-bold uppercase tracking-wider">
                                                    Acta <ChevronRight size={12} />
                                                </Link>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </>
                    )}
                </div>

                {/* COLUMNA DERECHA: CLASIFICACIÓN + PLANTILLA */}
                <div className="space-y-4">
                    {clasificacion && (
                        <div className="glass-panel rounded-2xl border border-white/5 p-5">
                            <h2 className="flex items-center gap-2 font-display font-black uppercase tracking-wider text-sm text-silver/60 mb-3">
                                <Trophy size={15} className="text-orange" /> Clasificación
                            </h2>
                            <div className="grid grid-cols-3 gap-2 text-center text-sm">
                                {[
                                    ["PJ", clasificacion.pj], ["V", clasificacion.pg], ["E", clasificacion.pe],
                                    ["D", clasificacion.pp], ["GF", clasificacion.gf], ["GC", clasificacion.gc],
                                    ["DG", clasificacion.dg], ["Pts", clasificacion.puntos],
                                ].map(([k, v]) => (
                                    <div key={k as string} className="bg-white/5 rounded-lg py-2">
                                        <div className="font-display font-black text-white">{v as number}</div>
                                        <div className="text-[10px] text-silver/40 uppercase tracking-wider font-bold">{k as string}</div>
                                    </div>
                                    ))}
                                <div className="col-span-3 flex justify-center gap-1 mt-1">
                                    {clasificacion.forma.map((r, i) => (
                                        <span key={i} className={`w-5 h-5 flex items-center justify-center rounded text-[10px] font-black border ${TONOS_RESULTADO[r as "V" | "E" | "D"] ?? ""}`}>{r}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {plantilla.length > 0 && (
                        <div className="glass-panel rounded-2xl border border-white/5 p-5">
                            <h2 className="flex items-center gap-2 font-display font-black uppercase tracking-wider text-sm text-silver/60 mb-3">
                                <Users size={15} className="text-orange" /> Plantilla
                                <span className="text-silver/30 normal-case font-medium">({plantilla.length} primeras)</span>
                            </h2>
                            <ul className="space-y-1 max-h-72 overflow-y-auto pr-1">
                                {plantilla.map(j => (
                                    <li key={j.id}>
                                        <Link to={`/jugador/${j.id}`} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group">
                                            <span className="flex-1 text-sm text-white group-hover:text-orange transition-colors truncate">{j.nombre}</span>
                                            {j.posicion && <span className="text-[10px] font-black uppercase tracking-wider bg-orange/10 text-orange border border-orange/20 px-1.5 py-0.5 rounded">{j.posicion}</span>}
                                            <ChevronRight size={13} className="text-silver/20" />
                                        </Link>
                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
