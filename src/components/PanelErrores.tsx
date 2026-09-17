import { useEffect, useMemo, useState } from "react";
import {
    X, Trash2, Download, ChevronDown, ChevronUp, AlertOctagon,
    AlertTriangle, Search,
} from "lucide-react";
import { registroErrores, type EntradaRegistro } from "../utils/registroErrores";
import { useConfirm } from "./ConfirmDialog";
import { useDialogFocus } from "../hooks/useDialogFocus";
import { toast } from "./Toast";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { LucideIcon } from "lucide-react";

/* Panel del registro global de errores (tarea 2.3 del hito 1.0).
   Se monta una vez en App; la sidebar lo abre. Al abrirse marca todo
   como visto: el badge de "no vistos" cuenta lo ocurrido desde la última vez. */

const MAX_MOSTRADOS = 100;

const ESTILO_NIVEL: Record<string, { icono: LucideIcon; badge: string }> = {
    error: { icono: AlertOctagon, badge: "text-red border-red/40 bg-red/10" },
    warning: { icono: AlertTriangle, badge: "text-warning border-warning/40 bg-warning/10" },
};

interface PanelErroresProps {
    abierto: boolean;
    onCerrar: () => void;
}

export default function PanelErrores({ abierto, onCerrar }: PanelErroresProps) {
    const [entradas, setEntradas] = useState<EntradaRegistro[]>([]);
    const [filtroNivel, setFiltroNivel] = useState<"todos" | "error" | "warning">("todos");
    const [busqueda, setBusqueda] = useState("");
    const [expandida, setExpandida] = useState<number | null>(null);
    const { confirmar, dialogo } = useConfirm();

    // Solo suscrito mientras está abierto; al abrir, lo acumulado pasa a visto.
    useEffect(() => {
        if (!abierto) return;
        registroErrores.marcarVistos();
        setEntradas(registroErrores.listar());
        return registroErrores.suscribir(() => setEntradas(registroErrores.listar()));
    }, [abierto]);

    const filtradas = useMemo(() => {
        const q = busqueda.trim().toLowerCase();
        return entradas.filter(
            (e) =>
                (filtroNivel === "todos" || e.nivel === filtroNivel) &&
                (!q ||
                    e.mensaje.toLowerCase().includes(q) ||
                    e.detalle.toLowerCase().includes(q) ||
                    e.origen.toLowerCase().includes(q)),
        );
    }, [entradas, filtroNivel, busqueda]);

    const exportar = async () => {
        try {
            const ruta = await save({
                defaultPath: `registro_errores_${new Date().toISOString().slice(0, 10)}.csv`,
                filters: [{ name: "CSV", extensions: ["csv"] }],
            });
            if (!ruta) return;
            await writeTextFile(ruta, registroErrores.aCSV());
            toast.success("Registro exportado");
        } catch (e) {
            console.error(e, "Error exportando el registro de errores. Visible: toast de error.");
            toast.error("No se pudo exportar el registro");
        }
    };

    const limpiar = async () => {
        const ok = await confirmar({
            titulo: "Limpiar registro de errores",
            mensaje: "Se borrarán todas las entradas del registro. Esta acción no se puede deshacer.",
            textoConfirmar: "Limpiar",
            peligroso: true,
        });
        if (ok) {
            registroErrores.limpiar();
            toast.info("Registro limpiado");
        }
    };

    const refPanel = useDialogFocus({
        activo: abierto,
        onKeyDown: (e) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onCerrar();
            }
        },
    });

    if (!abierto) return <>{dialogo}</>;

    return (
        <div
            className="fixed inset-0 z-[60] flex justify-end"
            ref={refPanel as React.RefObject<HTMLDivElement>}
            onClick={onCerrar}
        >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div
                className="relative w-full max-w-xl h-full bg-navy-dark border-l border-white/10 shadow-2xl flex flex-col"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Cabecera */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                    <div className="flex items-center gap-2">
                        <AlertOctagon size={18} className="text-orange" />
                        <h2 className="font-display font-black text-white text-sm tracking-wide">
                            Registro de errores
                        </h2>
                        <span className="text-[11px] text-silver/40 font-bold">
                            {entradas.length} entrada{entradas.length === 1 ? "" : "s"}
                        </span>
                    </div>
                    <button onClick={onCerrar} title="Cerrar (Esc)"
                        className="text-silver/50 hover:text-white transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Filtros */}
                <div className="px-5 py-3 border-b border-white/10 flex items-center gap-2 shrink-0 flex-wrap">
                    <div className="flex items-center gap-1 flex-1 min-w-[180px] bg-navy-light/60 border border-white/10 rounded-lg px-2.5 py-1.5">
                        <Search size={14} className="text-silver/40 shrink-0" />
                        <input
                            value={busqueda}
                            onChange={(e) => setBusqueda(e.target.value)}
                            placeholder="Buscar en mensajes y detalles…"
                            className="bg-transparent outline-none text-xs text-white placeholder:text-silver/30 w-full"
                        />
                    </div>
                    {(["todos", "error", "warning"] as const).map((n) => (
                        <button
                            key={n}
                            onClick={() => setFiltroNivel(n)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wide transition-colors ${
                                filtroNivel === n
                                    ? "bg-orange text-white"
                                    : "bg-white/5 text-silver/60 hover:text-white"
                            }`}
                        >
                            {n === "todos" ? "Todos" : n === "error" ? "Errores" : "Avisos"}
                        </button>
                    ))}
                </div>

                {/* Lista */}
                <div className="flex-1 overflow-y-auto px-3 py-2">
                    {filtradas.length === 0 ? (
                        <p className="text-center text-silver/40 text-sm py-12">
                            {entradas.length === 0
                                ? "Sin errores registrados. Cuando algo falle, aparecerá aquí."
                                : "Ninguna entrada coincide con el filtro."}
                        </p>
                    ) : (
                        <ul className="space-y-1">
                            {filtradas.slice(0, MAX_MOSTRADOS).map((e, i) => {
                                const { icono: Icono, badge } = ESTILO_NIVEL[e.nivel] ?? ESTILO_NIVEL.error;
                                const abierta = expandida === i;
                                return (
                                    <li key={`${e.fecha}-${i}`}>
                                        <button
                                            onClick={() => setExpandida(abierta ? null : i)}
                                            className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition-colors"
                                        >
                                            <div className="flex items-start gap-2.5">
                                                <span className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-black uppercase ${badge}`}>
                                                    <Icono size={11} />
                                                    {e.nivel === "error" ? "Error" : "Aviso"}
                                                </span>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs text-white/90 leading-snug break-words">
                                                        {e.mensaje}
                                                    </p>
                                                    <p className="text-[10px] text-silver/40 mt-0.5">
                                                        {new Date(e.fecha).toLocaleString()} · {e.origen}
                                                    </p>
                                                    {abierta && e.detalle && (
                                                        <pre className="mt-2 text-[10px] leading-relaxed text-silver/70 bg-black/40 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                                                            {e.detalle}
                                                        </pre>
                                                    )}
                                                </div>
                                                {abierta ? (
                                                    <ChevronUp size={14} className="text-silver/40 shrink-0 mt-0.5" />
                                                ) : (
                                                    <ChevronDown size={14} className="text-silver/40 shrink-0 mt-0.5" />
                                                )}
                                            </div>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    {filtradas.length > MAX_MOSTRADOS && (
                        <p className="text-center text-[11px] text-silver/40 py-3">
                            Mostrando {MAX_MOSTRADOS} de {filtradas.length} — afina el filtro o exporta el CSV.
                        </p>
                    )}
                </div>

                {/* Acciones */}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/10 shrink-0">
                    <p className="text-[11px] text-silver/30 flex-1">
                        El registro se guarda en este equipo y sobrevive a cierres de la app.
                    </p>
                    <button onClick={exportar}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 text-silver/80 hover:text-white hover:bg-white/10 transition-colors">
                        <Download size={13} /> Exportar CSV
                    </button>
                    <button onClick={limpiar}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red/10 text-red hover:bg-red/20 transition-colors">
                        <Trash2 size={13} /> Limpiar
                    </button>
                </div>
            </div>
            {dialogo}
        </div>
    );
}
