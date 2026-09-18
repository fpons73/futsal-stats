// Paleta de búsqueda global (B4 del roadmap). Montada siempre dentro del
// Router: ella misma registra el atajo global Ctrl+K (⌘K en macOS) y renderiza
// el diálogo sobre el Modal base — hereda trampa de foco, pila de overlays,
// Escape y cierre por clic fuera sin duplicar nada.
//
// Teclado: ↑/↓ mueve la selección, ↵ navega al resultado, Escape cierra (lo
// gestiona el Modal base). Los resultados van agrupados por tipo.
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Shield, User, CalendarDays, CornerDownLeft } from "lucide-react";
import Modal from "./Modal";
import {
    buscarGlobal,
    type ResultadoBusqueda,
} from "../services/buscadorService";

interface BuscadorGlobalProps {
    abierto: boolean;
    alAbrir: () => void;
    alCerrar: () => void;
}

const ETIQUETAS: Record<ResultadoBusqueda["tipo"], string> = {
    equipo: "Equipos",
    persona: "Personas",
    partido: "Partidos",
};

const ICONOS: Record<ResultadoBusqueda["tipo"], typeof Shield> = {
    equipo: Shield,
    persona: User,
    partido: CalendarDays,
};

const ORDEN: Array<ResultadoBusqueda["tipo"]> = ["persona", "equipo", "partido"];

export default function BuscadorGlobal({ abierto, alAbrir, alCerrar }: BuscadorGlobalProps) {
    const navigate = useNavigate();

    // Atajo global Ctrl+K / ⌘K. Si el diálogo ya está abierto, reenfoca el
    // campo para empezar una búsqueda nueva. Si el foco está en un input de
    // una página, el atajo sigue funcionando (es lo esperado en una paleta).
    useEffect(() => {
        const alPulsar = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
                e.preventDefault();
                if (abierto) inputRef.current?.select();
                else alAbrir();
            }
        };
        window.addEventListener("keydown", alPulsar);
        return () => window.removeEventListener("keydown", alPulsar);
    }, [abierto, alAbrir]);

    const [termino, setTermino] = useState("");
    const [resultados, setResultados] = useState<ResultadoBusqueda[]>([]);
    const [buscando, setBuscando] = useState(false);
    const [seleccion, setSeleccion] = useState(0);
    const inputRef = useRef<HTMLInputElement>(null);
    const listaRef = useRef<HTMLDivElement>(null);

    // Reset al abrir: campo vacío y foco en él (el Modal base enfoca el panel;
    // un frame después el campo toma el foco).
    useEffect(() => {
        if (abierto) {
            setTermino("");
            setResultados([]);
            setSeleccion(0);
            setBuscando(false);
            requestAnimationFrame(() => inputRef.current?.focus());
        }
    }, [abierto]);

    // Búsqueda con debounce (150 ms) — el índice está en memoria, es barato.
    useEffect(() => {
        if (!abierto) return;
        const q = termino.trim();
        if (q.length < 2) { setResultados([]); setBuscando(false); return; }
        setBuscando(true);
        const t = setTimeout(async () => {
            const r = await buscarGlobal(q);
            setResultados(r);
            setSeleccion(0);
            setBuscando(false);
        }, 150);
        return () => clearTimeout(t);
    }, [termino, abierto]);

    const irA = useCallback((ruta: string) => {
        alCerrar();
        navigate(ruta);
    }, [alCerrar, navigate]);

    // Teclado del campo: flechas y Enter (Escape lo resuelve el Modal base).
    const alTecla = (e: KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            setSeleccion((s) => Math.min(s + 1, resultados.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSeleccion((s) => Math.max(s - 1, 0));
        } else if (e.key === "Enter") {
            e.preventDefault();
            const r = resultados[seleccion];
            if (r) irA(r.ruta);
        }
    };

    // Mantener visible el elemento seleccionado al moverse con flechas.
    // (Guard con ?.: jsdom no implementa scrollIntoView y los tests no lo
    // necesitan; en el navegador siempre existe.)
    useEffect(() => {
        const el = listaRef.current?.querySelector("[data-seleccionado='true']");
        el?.scrollIntoView?.({ block: "nearest" });
    }, [seleccion, resultados]);

    // Agrupación por tipo en orden fijo, con cabeceras solo si hay elementos.
    const grupos = ORDEN
        .map((tipo) => ({ tipo, items: resultados.filter((r) => r.tipo === tipo) }))
        .filter((g) => g.items.length > 0);

    let indicePlano = -1;

    return (
        <Modal
            isOpen={abierto}
            onClose={alCerrar}
            title="Búsqueda global"
            ancho="max-w-xl"
            onKeyDown={alTecla}
            footer={
                <div className="w-full flex items-center gap-4 text-[11px] text-silver/40 font-semibold">
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10">↑↓</kbd> navegar</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10"><CornerDownLeft size={10} className="inline" /></kbd> abrir</span>
                    <span className="flex items-center gap-1"><kbd className="px-1.5 py-0.5 rounded bg-white/10 border border-white/10">esc</kbd> cerrar</span>
                    <span className="ml-auto">Ctrl+K para volver aquí</span>
                </div>
            }
        >
            <div className="space-y-3">
                <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-silver/40" />
                    <input
                        ref={inputRef}
                        value={termino}
                        onChange={(e) => setTermino(e.target.value)}
                        placeholder="Buscar jugadores, equipos y partidos…"
                        className="w-full pl-9 pr-3 py-2.5 bg-navy-light/60 border border-white/10 rounded-lg text-sm text-white placeholder:text-silver/30 outline-none focus:border-orange focus:ring-1 focus:ring-orange/40 transition-all"
                        aria-label="Término de búsqueda"
                    />
                </div>

                <div ref={listaRef} className="max-h-80 overflow-y-auto -mx-1 px-1" role="listbox" aria-label="Resultados de búsqueda">
                    {termino.trim().length >= 2 && !buscando && resultados.length === 0 && (
                        <p className="py-8 text-center text-sm text-silver/40">
                            Sin resultados para «{termino.trim()}»
                        </p>
                    )}
                    {buscando && resultados.length === 0 && (
                        <p className="py-8 text-center text-sm text-silver/40">Buscando…</p>
                    )}
                    {grupos.map((g) => {
                        const Icono = ICONOS[g.tipo];
                        return (
                            <div key={g.tipo} className="mb-2">
                                <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-silver/30">
                                    <Icono size={11} /> {ETIQUETAS[g.tipo]}
                                    <span className="ml-auto text-silver/20">{g.items.length}</span>
                                </div>
                                <ul>
                                    {g.items.map((r) => {
                                        indicePlano += 1;
                                        const sel = indicePlano === seleccion;
                                        return (
                                            <li key={`${r.tipo}-${r.id}`}>
                                                <button
                                                    data-seleccionado={sel}
                                                    onClick={() => irA(r.ruta)}
                                                    onMouseEnter={() => setSeleccion(resultados.indexOf(r))}
                                                    className={`w-full text-left px-3 py-2 rounded-lg flex items-center gap-3 transition-colors ${
                                                        sel ? "bg-orange/15 border border-orange/30" : "border border-transparent hover:bg-white/5"
                                                    }`}
                                                >
                                                    <span className="flex-1 min-w-0">
                                                        <span className="block text-sm font-semibold text-white truncate">{r.titulo}</span>
                                                        {r.subtitulo && (
                                                            <span className="block text-xs text-silver/40 truncate">{r.subtitulo}</span>
                                                        )}
                                                    </span>
                                                    {sel && <CornerDownLeft size={13} className="text-orange shrink-0" />}
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        );
                    })}
                </div>
            </div>
        </Modal>
    );
}
