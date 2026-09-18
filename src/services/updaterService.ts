// Servicio de auto-actualización (A2 del roadmap): comprueba el endpoint
// (latest.json en GitHub Releases), informa de disponibilidad y aplica la
// actualización (instalador pasivo + reinicio) usando tauri-plugin-updater
// y tauri-plugin-process.
//
// Degradación elegante: fuera de Tauri (tests/jsdom) o si el plugin no está
// registrado (instalaciones muy antiguas) devuelve { disponible: false, razon }
// en vez de lanzar; los fallos reales van al registro de errores (panel 2.3).
// Todo el acceso a plugins es con import dinámico para que el bundle de tests
// no cargue binarios de Tauri y para poder degradar por llamada.
import { registroErrores } from "../utils/registroErrores";

/** Cómo terminó una comprobación de actualizaciones. */
export interface EstadoActualizacion {
    disponible: boolean;
    /** Versión nueva, si hay actualización. */
    version?: string;
    /** Notas de la release (cuerpo del release de GitHub), si las hay. */
    notas?: string;
    /** Por qué no hay actualización (diagnóstico silencioso). */
    razon?: "sin-tauri" | "plugin-no-disponible" | "sin-actualizacion" | "error";
}

/** Progreso de descarga, en porcentaje (0-100) o indefinido si el tamaño es desconocido. */
export interface ProgresoDescarga {
    porcentaje?: number;
    recibidos: number;
    total?: number;
}

/** El objeto Update del plugin, retenido entre la comprobación y la instalación. */
let actualizacionPendiente: unknown = null;

/** ¿Corremos dentro de una ventana Tauri real? (en jsdom/tests no). */
function esTauri(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Versión instalada de la app (para mostrarla en Configuración). */
export async function obtenerVersionActual(): Promise<string | null> {
    if (!esTauri()) return null;
    try {
        const app = await import("@tauri-apps/api/app");
        return await app.getVersion();
    } catch {
        return null;
    }
}

/**
 * Opciones de comprobación.
 * `silencioso`: en el chequeo automático de arranque/24 h no apunta fallos al
 * registro de errores (offline no debería ensuciar el panel); la comprobación
 * manual desde Configuración sí reporta.
 */
export interface OpcionesComprobacion {
    silencioso?: boolean;
}

/** Comprueba si hay actualización. Nunca lanza: degrada con `razon`. */
export async function comprobarActualizacion(
    opciones: OpcionesComprobacion = {},
): Promise<EstadoActualizacion> {
    if (!esTauri()) {
        return { disponible: false, razon: "sin-tauri" };
    }
    try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const actualizacion = await check();
        if (!actualizacion) {
            actualizacionPendiente = null;
            return { disponible: false, razon: "sin-actualizacion" };
        }
        actualizacionPendiente = actualizacion;
        return {
            disponible: true,
            version: actualizacion.version,
            notas: actualizacion.body || undefined,
        };
    } catch (e) {
        // Plugin sin registrar (app vieja sin este módulo) o red caída: avisable,
        // pero no un error duro — la app funciona igual sin actualizarse.
        if (!opciones.silencioso) {
            registroErrores.añadir(
                "warning",
                "updater",
                "No se pudo comprobar actualizaciones",
                e instanceof Error ? e.message : String(e),
            );
        }
        return { disponible: false, razon: "plugin-no-disponible" };
    }
}

/**
 * Descarga e instala la actualización pendiente y reinicia la app.
 * `enProgreso` recibe el avance de la descarga. Tras `downloadAndInstall` el
 * proceso se relanza automáticamente (instalador pasivo, sin asistente).
 */
export async function instalarActualizacion(
    enProgreso?: (p: ProgresoDescarga) => void,
): Promise<void> {
    if (!actualizacionPendiente) {
        throw new Error("No hay actualización pendiente: llama antes a comprobarActualizacion().");
    }
    const actualizacion = actualizacionPendiente as {
        downloadAndInstall: (cb?: (event: { event: string; data?: { chunkLength?: number; contentLength?: number } }) => void) => Promise<void>;
    };
    let recibidos = 0;
    let total: number | undefined;
    await actualizacion.downloadAndInstall((event) => {
        if (event.event === "Started" && event.data?.contentLength) {
            total = event.data.contentLength;
        } else if (event.event === "Progress" && event.data?.chunkLength) {
            recibidos += event.data.chunkLength;
        } else if (event.event === "Finished") {
            recibidos = total ?? recibidos;
        }
        enProgreso?.({
            recibidos,
            total,
            porcentaje: total ? Math.min(100, Math.round((recibidos / total) * 100)) : undefined,
        });
    });
    // Reinicio de la app para arrancar la versión nueva (plugin process).
    const { relaunch } = await import("@tauri-apps/plugin-process");
    await relaunch();
}
