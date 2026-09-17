import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
    ShieldAlert, RotateCcw, Loader2, FileWarning, DatabaseBackup,
} from "lucide-react";

interface Diagnostico {
    existe: boolean;
    integridad: string;
    esquema_ok: boolean;
    ultima_copia: string | null;
}

interface BackupInfo {
    ruta: string;
    nombre: string;
    bytes: number;
    fecha: string;
}

/** Pantalla de recuperación (tarea 1.4 del hito 1.0): se muestra cuando la BD
 *  real falló al abrir en el arranque y el diagnóstico confirma corrupción.
 *  Ofrece restaurar la última copia (verificada por Rust antes de tocar nada)
 *  o continuar en la pantalla de error clásica. */
export function PantallaRecuperacion({
    error,
    onRestaurado,
}: {
    error: string | null;
    onRestaurado: () => void;
}) {
    const [diag, setDiag] = useState<Diagnostico | null>(null);
    const [copia, setCopia] = useState<BackupInfo | null>(null);
    const [restaurando, setRestaurando] = useState(false);
    const [falloRestauracion, setFalloRestauracion] = useState<string | null>(null);

    useEffect(() => {
        (async () => {
            try {
                const d = await invoke<Diagnostico>("diagnosticar_bd");
                setDiag(d);
                if (d.ultima_copia) {
                    const lista = await invoke<BackupInfo[]>("listar_backups_bd");
                    setCopia(lista[0] ?? null);
                }
            } catch (e) {
                setFalloRestauracion(`No se pudo completar el diagnóstico: ${e}`);
            }
        })();
    }, []);

    const restaurar = async () => {
        if (!copia) return;
        setRestaurando(true);
        setFalloRestauracion(null);
        try {
            await invoke("restaurar_backup_bd", { rutaCopia: copia.ruta });
            // Restaurada: recargar reinicia el arranque completo (migraciones, etc.).
            onRestaurado();
        } catch (e) {
            setFalloRestauracion(String(e));
            setRestaurando(false);
        }
    };

    return (
        <div className="min-h-screen bg-navy flex items-center justify-center p-6">
            <div className="max-w-xl w-full bg-navy-light border border-red-500/30 rounded-2xl p-8 space-y-5">
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0">
                        <ShieldAlert size={24} className="text-red" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-white font-display">La base de datos está dañada</h1>
                        <p className="text-silver/50 text-sm mt-1">
                            No se pudo abrir correctamente al arrancar la aplicación.
                        </p>
                    </div>
                </div>

                {diag && (
                    <div className="bg-navy/60 border border-white/10 rounded-xl p-4 space-y-1.5 text-xs">
                        <p className="text-silver/60">
                            <b className="text-silver">Diagnóstico:</b>{" "}
                            {diag.integridad === "ok"
                                ? "el fichero responde, pero falta el esquema de la app"
                                : diag.integridad.slice(0, 160)}
                        </p>
                        {error && (
                            <p className="text-silver/40 break-words">
                                <b className="text-silver/60">Error de arranque:</b> {error.slice(0, 200)}
                            </p>
                        )}
                    </div>
                )}

                {copia ? (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                        <div className="flex items-center gap-2 text-sm font-bold text-white">
                            <DatabaseBackup size={16} className="text-orange" />
                            Última copia disponible: {copia.fecha} ({(copia.bytes / 1048576).toFixed(1)} MB)
                        </div>
                        <p className="text-xs text-silver/50">
                            Restaurar reemplaza el fichero dañado por esta copia verificada.
                            El diagnóstico de integridad se repite antes de tocar nada.
                        </p>
                        {falloRestauracion && (
                            <p className="text-xs text-red flex items-start gap-1.5">
                                <FileWarning size={12} className="mt-0.5 shrink-0" /> {falloRestauracion}
                            </p>
                        )}
                        <button onClick={restaurar} disabled={restaurando}
                            className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:hover:scale-100">
                            {restaurando
                                ? <><Loader2 size={16} className="animate-spin" /> Restaurando…</>
                                : <><RotateCcw size={16} /> Restaurar copia del {copia.fecha}</>}
                        </button>
                    </div>
                ) : (
                    <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-xs text-silver/60 space-y-2">
                        <p>No hay copias de seguridad disponibles para restaurar.</p>
                        <p className="text-silver/40">
                            {diag?.ultima_copia === null
                                ? "La carpeta backups está vacía: la copia diaria no llegó a crearse."
                                : "Las opciones manuales son recuperar el fichero desde la copia del sistema o empezar con una base de datos nueva."}
                        </p>
                    </div>
                )}

                {falloRestauracion && !copia && (
                    <p className="text-xs text-red">{falloRestauracion}</p>
                )}
            </div>
        </div>
    );
}
