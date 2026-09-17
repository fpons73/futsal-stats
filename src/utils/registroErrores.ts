// Registro global de errores (tarea 2.3 del hito 1.0).
//
// Por qué localStorage y no la tabla Log de SQLite: el caso de uso principal
// es "algo se rompió y el usuario quiere contarlo" — justo cuando la BD puede
// ser la rota (corrupción, disco lleno, migración fallida). localStorage vive
// en el perfil de WebView2, sobrevive a recargas y a una BD corrupta, y su
// origen no-SQL evita que el captor dispare el mismo error que registra.
//
// Captura: console.error (los catches ya reportan ahí por la política 2.1),
// window.onerror y unhandledrejection. Con deduplicación por mensaje en una
// ventana corta: un bucle de 18.000 errores no puede explotar el registro.

const CLAVE = "registro_errores_v1";
const CLAVE_VISTOS = "registro_errores_vistos";
const MAX_ENTRADAS = 500;
const VENTANA_DEDUPE_MS = 2000;

export type NivelRegistro = "error" | "warning";

export interface EntradaRegistro {
    fecha: string; // ISO
    nivel: NivelRegistro;
    /** De dónde viene: "consola", "global", "promesa", "importacion"… */
    origen: string;
    /** Primera línea, pensada para escaneo rápido en la lista. */
    mensaje: string;
    /** Detalle opcional (stack, ruta de fichero, línea del CSV…). */
    detalle: string;
}

function cargar(): EntradaRegistro[] {
    try {
        const crudo = localStorage.getItem(CLAVE);
        if (!crudo) return [];
        const parseado = JSON.parse(crudo);
        return Array.isArray(parseado) ? (parseado as EntradaRegistro[]) : [];
    } catch {
        return [];
    }
}

let entradas: EntradaRegistro[] = cargar();
/** Nº de entradas ya vistas por el usuario (corte por longitud, las nuevas entran por delante). */
let vistas = Number(localStorage.getItem(CLAVE_VISTOS) ?? "0");
const listeners = new Set<() => void>();

function notificar() {
    listeners.forEach((l) => l());
}

function persistir() {
    try {
        localStorage.setItem(CLAVE, JSON.stringify(entradas));
        localStorage.setItem(CLAVE_VISTOS, String(vistas));
    } catch {
        // localStorage lleno/indisponible: el registro vive en memoria de todos modos.
    }
}

function acortar(texto: string, max = 300): string {
    const limpio = String(texto ?? "").replace(/\s+/g, " ").trim();
    return limpio.length > max ? `${limpio.slice(0, max)}…` : limpio;
}

export const registroErrores = {
    /** Registra una entrada (más reciente primero) y notifica a los suscriptores. */
    añadir(nivel: NivelRegistro, origen: string, mensaje: string, detalle = "") {
        const primera = entradas[0];
        if (
            primera &&
            primera.origen === origen &&
            primera.mensaje === mensaje &&
            Date.now() - new Date(primera.fecha).getTime() < VENTANA_DEDUPE_MS
        ) {
            return; // Mismo error repetido en ráfaga: una sola entrada, no una avalancha.
        }
        entradas = [
            { fecha: new Date().toISOString(), nivel, origen, mensaje: acortar(mensaje), detalle: acortar(detalle, 800) },
            ...entradas,
        ].slice(0, MAX_ENTRADAS);
        persistir();
        notificar();
    },

    listar(): EntradaRegistro[] {
        return [...entradas];
    },

    /** Entradas aún no vistas por el usuario (para el badge de la sidebar). */
    noVistos(): number {
        return Math.max(0, entradas.length - vistas);
    },

    /** El usuario abrió el registro: todo lo acumulado deja de ser "nuevo". */
    marcarVistos() {
        vistas = entradas.length;
        persistir();
        notificar();
    },

    limpiar() {
        entradas = [];
        vistas = 0;
        persistir();
        notificar();
    },

    suscribir(l: () => void): () => void {
        listeners.add(l);
        return () => listeners.delete(l);
    },

    /** CSV plano para adjuntar a un reporte de bug o guardar como evidencia. */
    aCSV(): string {
        const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
        const lineas = ["fecha,nivel,origen,mensaje,detalle"];
        for (const e of this.listar()) {
            lineas.push([e.fecha, e.nivel, e.origen, e.mensaje, e.detalle].map(esc).join(","));
        }
        return lineas.join("\n");
    },
};

function registrarDesdeError(origen: string, e: unknown, nivel: NivelRegistro = "error") {
    if (e instanceof Error) {
        registroErrores.añadir(nivel, origen, e.message, e.stack ?? "");
    } else {
        registroErrores.añadir(nivel, origen, acortar(String(e)), "");
    }
}

let instalado = false;

/** Instala la captura global. Idempotente; se llama una vez desde main.tsx. */
export function registrarManejadoresGlobales() {
    if (instalado) return;
    instalado = true;

    // console.error: los catch de la app ya lo usan (política 2.1), así que
    // este puente convierte TODO el reporte de errores existente en registro.
    const previo = console.error.bind(console);
    console.error = (...args: unknown[]) => {
        previo(...args);
        try {
            // Stack de cualquier Error entre los argumentos (suele ser el 2º:
            // console.error("Contexto:", err)) → columna detalle del registro.
            const conStack = args.find((a) => a instanceof Error) as Error | undefined;
            const texto = args
                .map((a) => {
                    if (typeof a === "string") return a;
                    if (a instanceof Error) return a.message;
                    try {
                        return JSON.stringify(a);
                    } catch {
                        return String(a);
                    }
                })
                .join(" ");
            registroErrores.añadir(
                "error",
                "consola",
                acortar(texto, 200),
                conStack?.stack ?? "",
            );
        } catch {
            // Nunca: el captor no puede ser él mismo el fallo.
        }
    };

    // Errores no capturados en código síncrono.
    window.addEventListener("error", (e) => {
        const err = (e as ErrorEvent).error;
        if (err) registrarDesdeError("global", err);
        else registroErrores.añadir("error", "global", e.message || "Error desconocido");
    });

    // Promesas rechazadas sin catch (await olvidado, async en un onChange…).
    window.addEventListener("unhandledrejection", (e) => {
        registrarDesdeError("promesa", (e as PromiseRejectionEvent).reason);
    });
}
