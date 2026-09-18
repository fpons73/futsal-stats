// Panel de directo (B2): cronómetro de partido con periodos de 20 min,
// selector de jugador y botones grandes tocables que registran +1/−1 sobre
// EstadisticaPartidoJugador y crean los Eventos narrativos (gol, falta,
// tarjetas) con el minuto actual. Pensado para tablet: botones >= 56 px,
// deshacer inmediato con el UndoToast del proyecto y recarga de datos de
// DetallePartido vía onDatosActualizados.
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, Flag, Target, Zap, AlertTriangle, Crosshair, CircleDot, Square, Ban } from "lucide-react";
import {
    obtenerCrono, cambiarEstado, consolidarSiExcedePeriodo, registrarAccion, deshacerAccion,
    segundosActuales, formatearCrono, minutoActual,
    type EstadoCrono, type CampoDirecto, type AccionRegistrada,
} from "../services/directoService";
import { useUndoToast, UndoToast } from "./UndoToast";

interface JugadorDirecto {
    persona_id: number;
    dorsal: number | null;
    nombre: string;
    posicion: string | null;
}

interface PanelDirectoProps {
    partidoId: number;
    localEquipoId: number;
    visitanteEquipoId: number;
    /** Partido finalizado: el registro en directo queda cerrado. */
    estadoPartido: string;
    jugadoresLocal: JugadorDirecto[];
    jugadoresVisitante: JugadorDirecto[];
    /** Recarga eventos/estadísticas/partido en DetallePartido tras cada acción. */
    onDatosActualizados: () => void;
}

const BOTONES: Array<{ campo: CampoDirecto; label: string; icono: typeof Target; tono: string }> = [
    { campo: "goles", label: "Gol", icono: Target, tono: "bg-success/20 border-success/40 hover:bg-success/30 text-success" },
    { campo: "asistencias", label: "Asis", icono: Zap, tono: "bg-accent-blue/20 border-accent-blue/40 hover:bg-accent-blue/30 text-accent-blue" },
    { campo: "tiros", label: "Tiro", icono: Crosshair, tono: "bg-white/10 border-white/20 hover:bg-white/20 text-white" },
    { campo: "tiros_puerta", label: "TP", icono: CircleDot, tono: "bg-white/10 border-white/20 hover:bg-white/20 text-white" },
    { campo: "faltas_cometidas", label: "Falta", icono: AlertTriangle, tono: "bg-warning/20 border-warning/40 hover:bg-warning/30 text-warning" },
    { campo: "tarjetas_amarillas", label: "Amarilla", icono: Square, tono: "bg-yellow-300/20 border-yellow-300/40 hover:bg-yellow-300/30 text-yellow-300" },
    { campo: "tarjetas_rojas", label: "Roja", icono: Ban, tono: "bg-red/20 border-red/40 hover:bg-red/30 text-red" },
];

export default function PanelDirecto({
    partidoId, localEquipoId, visitanteEquipoId, estadoPartido,
    jugadoresLocal, jugadoresVisitante, onDatosActualizados,
}: PanelDirectoProps) {
    const [crono, setCrono] = useState<EstadoCrono>({ estado: "parado", segundos: 0, reanudado_en: null });
    const [segundos, setSegundos] = useState(0);
    const [equipo, setEquipo] = useState<"local" | "visitante">("local");
    const [seleccionado, setSeleccionado] = useState<number | null>(null);
    const [ocupado, setOcupado] = useState(false);
    const cronoRef = useRef(crono);
    useEffect(() => { cronoRef.current = crono; }, [crono]);
    const { pendiente: pendienteDeshacer, push: pushDeshacer, clear: clearDeshacer } = useUndoToast<AccionRegistrada>();

    // Ticker de UI (1/s): solo recalcula segundos derivados; la consolidación
    // del tope de periodo es escritura excepcional, nunca 1/s.
    useEffect(() => {
        const t = setInterval(() => {
            setSegundos(segundosActuales(cronoRef.current));
            consolidarSiExcedePeriodo(partidoId, cronoRef.current).then(setCrono);
        }, 1000);
        return () => clearInterval(t);
    }, [partidoId]);

    useEffect(() => {
        obtenerCrono(partidoId).then(c => { setCrono(c); setSegundos(segundosActuales(c)); });
    }, [partidoId]);

    const enJuego = crono.estado === "primer_tiempo" || crono.estado === "segundo_tiempo" || crono.estado === "prorroga";
    const finalizado = estadoPartido === "finalizado";
    const jugadores = equipo === "local" ? jugadoresLocal : jugadoresVisitante;
    const eqId = equipo === "local" ? localEquipoId : visitanteEquipoId;

    const transicion = useCallback(async (nuevo: EstadoCrono["estado"]) => {
        setOcupado(true);
        const c = await cambiarEstado(partidoId, nuevo);
        setCrono(c);
        setSegundos(segundosActuales(c));
        setOcupado(false);
    }, [partidoId]);

    const registrar = async (campo: CampoDirecto, delta: 1 | -1) => {
        if (seleccionado == null || ocupado) return;
        setOcupado(true);
        const accion = await registrarAccion(partidoId, seleccionado, eqId, campo, delta, cronoRef.current);
        setOcupado(false);
        if (!accion) return;
        onDatosActualizados();
        pushDeshacer(accion);
    };

    const deshacer = async (accion: AccionRegistrada) => {
        await deshacerAccion(accion);
        clearDeshacer();
        onDatosActualizados();
    };

    return (
        <div className="glass-panel rounded-2xl border border-white/5 p-4 space-y-4" data-testid="panel-directo">
            {/* CRONÓMETRO + PERIODO + CONTROLES */}
            <div className="flex items-center gap-4 flex-wrap">
                <div className={`font-display font-black text-4xl tabular-nums tracking-wider ${enJuego ? "text-success" : "text-white"}`} data-testid="crono">
                    {formatearCrono(segundos)}
                </div>
                <div className="text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full border bg-white/5 border-white/10 text-silver/60" data-testid="periodo">
                    {crono.estado.replace(/_/g, " ")}
                </div>
                <div className="ml-auto flex flex-wrap gap-2">
                    {enJuego ? (
                        <button onClick={() => transicion(crono.estado === "primer_tiempo" ? "descanso" : "parado")} disabled={ocupado}
                            className="px-4 h-14 rounded-xl bg-white/10 border border-white/20 hover:bg-white/20 text-white font-bold flex items-center gap-2 disabled:opacity-40">
                            <Pause size={18} /> {crono.estado === "primer_tiempo" ? "Descanso" : "Pausa"}
                        </button>
                    ) : (
                        <button onClick={() => transicion(crono.estado === "descanso" ? "segundo_tiempo" : "primer_tiempo")} disabled={ocupado || finalizado}
                            className="px-6 h-14 rounded-xl bg-success/20 border border-success/40 hover:bg-success/30 text-success font-bold flex items-center gap-2 disabled:opacity-40">
                            <Play size={18} /> {crono.estado === "descanso" ? "2º Tiempo" : "Comenzar"}
                        </button>
                    )}
                    {crono.estado === "segundo_tiempo" && segundos >= 20 * 60 && (
                        <button onClick={() => transicion("finalizado")} disabled={ocupado}
                            className="px-4 h-14 rounded-xl bg-red/20 border border-red/40 hover:bg-red/30 text-red font-bold flex items-center gap-2">
                            <Flag size={18} /> Final
                        </button>
                    )}
                </div>
            </div>

            <UndoToast
                pendiente={pendienteDeshacer}
                onUndo={deshacer}
                mensaje={(a) => `+${a.delta} ${a.campo.replace(/_/g, " ")} (min ${a.minuto})`}
            />

            {finalizado ? (
                <p className="text-center text-sm text-silver/40 py-4">Partido finalizado: el registro en directo está cerrado.</p>
            ) : (
                <>
                    {/* EQUIPO + MINUTO DE REGISTRO */}
                    <div className="flex gap-2 items-center">
                        {(["local", "visitante"] as const).map(e => (
                            <button key={e} onClick={() => { setEquipo(e); setSeleccionado(null); }}
                                className={`px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider border transition-all ${equipo === e ? "bg-orange/20 border-orange/40 text-orange" : "bg-white/5 border-white/10 text-silver/50 hover:text-white"}`}>
                                {e === "local" ? "Local" : "Visitante"}
                            </button>
                        ))}
                        {seleccionado != null && (
                            <span className="ml-auto text-xs text-silver/40">
                                Minuto de registro: <strong className="text-silver/60">{minutoActual(crono)}</strong>
                            </span>
                        )}
                    </div>

                    {/* JUGADORES (chapas grandes tocables) */}
                    <div className="flex gap-2 overflow-x-auto pb-1" role="listbox" aria-label="Jugadores del equipo">
                        {jugadores.map(j => (
                            <button key={j.persona_id} onClick={() => setSeleccionado(j.persona_id === seleccionado ? null : j.persona_id)}
                                data-testid={`jugador-${j.persona_id}`}
                                className={`shrink-0 w-20 rounded-xl border p-2 text-center transition-all ${seleccionado === j.persona_id ? "bg-orange/20 border-orange shadow-neon-orange" : "bg-white/5 border-white/10 hover:bg-white/10"}`}>
                                <div className="font-display font-black text-lg text-white">{j.dorsal ?? "-"}</div>
                                <div className="text-[10px] font-bold text-silver/60 truncate">{j.nombre}</div>
                                {j.posicion && <div className="text-[9px] text-silver/30 uppercase">{j.posicion}</div>}
                            </button>
                        ))}
                        {jugadores.length === 0 && <p className="text-xs text-silver/40 py-2">Sin convocados: completa la alineación en su pestaña.</p>}
                    </div>

                    {/* BOTONES DE ACCIÓN: +1 grande y −1 fino debajo */}
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {BOTONES.map(({ campo, label, icono: Icono, tono }) => (
                            <div key={campo} className="flex flex-col items-center gap-1">
                                <button onClick={() => registrar(campo, 1)} disabled={seleccionado == null || ocupado}
                                    title={`+1 ${label}`}
                                    className={`h-16 w-full rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 font-black transition-all active:scale-95 disabled:opacity-30 ${tono}`}>
                                    <Icono size={20} />
                                    <span className="text-[10px] uppercase tracking-wider">{label}</span>
                                </button>
                                <button onClick={() => registrar(campo, -1)} disabled={seleccionado == null || ocupado}
                                    title={`−1 ${label}`} aria-label={`Quitar ${label}`}
                                    className="text-[10px] font-black text-silver/30 hover:text-red transition-colors disabled:opacity-20">−1</button>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
