import { useEffect, useState } from "react";
import { readDir } from "@tauri-apps/plugin-fs";
import { open as abrirDialogo } from "@tauri-apps/plugin-dialog";
import {
    Sparkles, FolderOpen, CheckCircle2, AlertTriangle, Loader2,
    ArrowRight, FileText, X, Database,
} from "lucide-react";
import { setPreferencia } from "../db";
import {
    carpetaSugerida, guardarCarpetaDatos, leerCarpetaDatos,
} from "../utils/carpetaDatos";
import {
    importarEquiposCSV, importarCompeticionesCSV,
    importarJugadoresCSV, importarEntrenadoresCSV,
} from "../utils/importadorMasivo";

type EstadoPaso = "pendiente" | "activo" | "ok" | "error" | "omitido";

interface Paso {
    clave: string;
    titulo: string;
    descripcion: string;
    ejecutar: (ruta: string) => Promise<string>;
}

/** Orden sugerido por dependencias: equipos → competiciones → jugadores → entrenadores.
 *  Todos localizan su(s) fichero(s) por patrón dentro de la carpeta: los
 *  importadores esperan rutas de FICHERO, nunca la carpeta. */
const PASOS: Paso[] = [
    {
        clave: "equipos",
        titulo: "Equipos",
        descripcion: "Enciclopedia_Futsal_Equipas_Masculino1.csv",
        ejecutar: (r) => importarVarios(r, /^Enciclopedia_Futsal_Equipas_Masculino\d*\.csv$/i, importarEquiposCSV),
    },
    {
        clave: "competiciones",
        titulo: "Competiciones",
        descripcion: "Enciclopedia_Futsal_Competicoes_Masculino.csv",
        ejecutar: (r) => importarVarios(r, /^Enciclopedia_Futsal_Competicoes_Masculino\d*\.csv$/i, importarCompeticionesCSV),
    },
    {
        clave: "jugadores",
        titulo: "Jugadores",
        descripcion: "Enciclopedia_Futsal_Jogadores_Activos_Masculino*.csv (1-5)",
        ejecutar: (r) => importarVarios(r, /^Enciclopedia_Futsal_Jogadores_Activos_Masculino\d*\.csv$/i, importarJugadoresCSV),
    },
    {
        clave: "entrenadores",
        titulo: "Entrenadores",
        descripcion: "Enciclopedia_Futsal_Entrenadores_Masculino1.csv",
        ejecutar: (r) => importarVarios(r, /^Enciclopedia_Futsal_Entrenadores_Masculino\d*\.csv$/i, importarEntrenadoresCSV),
    },
];

/** Ejecuta un importador sobre cada fichero que casque el patrón (ordenado). */
async function importarVarios(
    carpeta: string,
    patron: RegExp,
    importador: (ruta?: string) => Promise<string>,
): Promise<string> {
    const entradas = await readDir(carpeta);
    const ficheros = entradas
        .filter((e) => e.isFile && patron.test(e.name))
        .map((e) => e.name)
        .sort();
    if (ficheros.length === 0) return "Sin ficheros: omitido";
    const resumen: string[] = [];
    for (const nombre of ficheros) {
        resumen.push(`${nombre}: ${await importador(`${carpeta}${carpeta.includes("\\") ? "\\" : "/"}${nombre}`)}`);
    }
    return resumen.join(" · ");
}

/** Asistente de primera ejecución: importa los CSV de Futsal_Data sin tocar
 *  la página Importar. Solo se monta cuando la BD está vacía (ver App.tsx). */
export default function Onboarding({ onSaltar }: { onSaltar: () => void }) {
    const [carpeta, setCarpeta] = useState<string>("");
    const [sugerida, setSugerida] = useState<string>("");
    const [detectados, setDetectados] = useState<number | null>(null);
    const [estado, setEstado] = useState<Record<string, EstadoPaso>>({});
    const [detalle, setDetalle] = useState<Record<string, string>>({});
    const [ejecutando, setEjecutando] = useState(false);
    const [errorCarpeta, setErrorCarpeta] = useState<string | null>(null);

    // Carpeta inicial: la guardada (usuario que borró datos) o la sugerida.
    useEffect(() => {
        (async () => {
            const guardada = await leerCarpetaDatos();
            if (guardada) {
                setCarpeta(guardada);
            } else {
                const sug = await carpetaSugerida();
                setSugerida(sug);
                setCarpeta(sug);
            }
        })();
    }, []);

    // Al tener carpeta, cuántos CSV reconocibles contiene (solo lectura).
    useEffect(() => {
        if (!carpeta) return;
        setDetectados(null);
        (async () => {
            try {
                const entradas = await readDir(carpeta);
                const csvs = entradas.filter(
                    (e) => e.isFile && /Enciclopedia_Futsal_.*\.csv$/i.test(e.name),
                );
                setDetectados(csvs.length);
                setErrorCarpeta(null);
            } catch {
                setDetectados(null);
                setErrorCarpeta("No se puede leer la carpeta (¿existe? ¿es accesible?).");
            }
        })();
    }, [carpeta]);

    const elegirOtra = async () => {
        const sel = await abrirDialogo({ directory: true, multiple: false });
        if (sel && typeof sel === "string") setCarpeta(sel);
    };

    /** Importa todo en orden. Idempotente: los importadores omiten duplicados,
     *  así que repetir el asistente nunca duplica filas. */
    const empezar = async () => {
        setEjecutando(true);
        try {
            await guardarCarpetaDatos(carpeta);
        } catch (e) {
            setErrorCarpeta(`No se pudo configurar la carpeta: ${e}`);
            setEjecutando(false);
            return;
        }
        for (const paso of PASOS) {
            setEstado((s) => ({ ...s, [paso.clave]: "activo" }));
            try {
                const res = await paso.ejecutar(carpeta);
                setDetalle((d) => ({ ...d, [paso.clave]: res }));
                setEstado((s) => ({
                    ...s,
                    [paso.clave]: res.startsWith("Sin ficheros") ? "omitido" : "ok",
                }));
            } catch (e) {
                setDetalle((d) => ({ ...d, [paso.clave]: String(e) }));
                setEstado((s) => ({ ...s, [paso.clave]: "error" }));
            }
        }
        await setPreferencia("onboarding_completado", new Date().toISOString());
        setEjecutando(false);
    };

    const rueda = (e: EstadoPaso) =>
        e === "activo" ? <Loader2 size={16} className="animate-spin text-orange" />
        : e === "ok" ? <CheckCircle2 size={16} className="text-success" />
        : e === "error" ? <AlertTriangle size={16} className="text-red" />
        : e === "omitido" ? <span className="text-silver/30 text-xs font-bold">—</span>
        : <span className="w-4 h-4 rounded-full border border-white/20 inline-block" />;

    const etiqueta = (e: EstadoPaso) =>
        e === "activo" ? "Importando…"
        : e === "ok" ? "Completado"
        : e === "error" ? "Error"
        : e === "omitido" ? "Sin ficheros"
        : "Pendiente";

    return (
        <div className="min-h-screen bg-navy flex items-center justify-center p-6">
            <div className="max-w-2xl w-full bg-navy-light border border-white/10 rounded-2xl shadow-neon-orange/10 p-8 space-y-6">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-orange/15 flex items-center justify-center">
                            <Sparkles size={24} className="text-orange" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black text-white font-display">Bienvenido a Global Futsal Stats</h1>
                            <p className="text-silver/50 text-sm mt-1">
                                Base de datos vacía — importa tus datos de Futsal_Data en un minuto.
                            </p>
                        </div>
                    </div>
                    <button onClick={onSaltar} title="Explorar la app sin importar nada"
                        className="text-silver/40 hover:text-white transition-colors p-1">
                        <X size={18} />
                    </button>
                </div>

                {/* Paso 1: carpeta de datos */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wider">
                        <FolderOpen size={16} className="text-emerald-400" /> 1 · Carpeta de datos
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        <code className="text-xs text-silver bg-navy/60 border border-white/10 rounded px-2 py-1.5 flex-1 min-w-0 truncate">
                            {carpeta || "…"}
                        </code>
                        <button onClick={elegirOtra}
                            className="px-3 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
                            <FolderOpen size={14} /> Elegir otra…
                        </button>
                    </div>
                    {errorCarpeta && (
                        <p className="text-xs text-red flex items-center gap-1.5">
                            <AlertTriangle size={12} /> {errorCarpeta}
                        </p>
                    )}
                    {detectados !== null && !errorCarpeta && (
                        <p className="text-xs text-silver/60 flex items-center gap-1.5">
                            <FileText size={12} />
                            {detectados === 0
                                ? "No hay CSV de la Enciclopedia en esta carpeta — puedes elegir otra o saltar."
                                : `${detectados} fichero(s) CSV de la Enciclopedia detectados.`}
                        </p>
                    )}
                    {!carpeta && sugerida && (
                        <p className="text-xs text-silver/40">Sugerida: <code>{sugerida}</code></p>
                    )}
                </div>

                {/* Paso 2: importación */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-bold text-white uppercase tracking-wider">
                        <Database size={16} className="text-blue-400" /> 2 · Importación (en orden de dependencias)
                    </div>
                    <div className="space-y-2">
                        {PASOS.map((paso) => {
                            const e = estado[paso.clave] ?? "pendiente";
                            return (
                                <div key={paso.clave}
                                    className="flex items-center gap-3 bg-navy/40 rounded-lg px-3 py-2">
                                    {rueda(e)}
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-white">{paso.titulo}</p>
                                        <p className="text-[11px] text-silver/40 truncate">{paso.descripcion}</p>
                                    </div>
                                    <span className={`text-xs font-bold ${e === "ok" ? "text-success" : e === "error" ? "text-red" : "text-silver/40"}`}>
                                        {etiqueta(e)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                    {Object.keys(detalle).length > 0 && (
                        <details className="text-[11px] text-silver/50">
                            <summary className="cursor-pointer hover:text-silver transition-colors">Detalle de resultados</summary>
                            <div className="mt-2 space-y-1 max-h-40 overflow-auto">
                                {Object.entries(detalle).map(([k, v]) => (
                                    <p key={k}><b className="capitalize">{k}</b>: {v}</p>
                                ))}
                            </div>
                        </details>
                    )}
                </div>

                <div className="flex items-center justify-between gap-3">
                    <p className="text-[11px] text-silver/30 flex-1">
                        La importación es idempotente: si algo falla a medias, volver a ejecutar no duplica filas.
                    </p>
                    <button onClick={onSaltar} disabled={ejecutando}
                        className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold disabled:opacity-40">
                        {Object.keys(estado).length > 0 ? "Cerrar" : "Saltar"}
                    </button>
                    <button onClick={empezar} disabled={ejecutando || !carpeta || !!errorCarpeta}
                        className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                        {ejecutando ? <><Loader2 size={16} className="animate-spin" /> Importando…</> : <>Empezar <ArrowRight size={16} /></>}
                    </button>
                </div>
            </div>
        </div>
    );
}
