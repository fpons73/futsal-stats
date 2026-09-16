// Borrador del acta: serialización, persistencia en localStorage y fusión.
// Funciones puras (sin React) para poder probar el round-trip con Vitest.
// Se usa localStorage (no sessionStorage) para que el borrador sobreviva reinicios
// de la app; barrerBorradoresAntiguos evita que se acumulen eternamente.

export type EstadoBorrador = "titular" | "suplente" | "convocado" | "no_convocado";

/** Campos por jugador que se conservan en el borrador. */
export interface FilaBorrador {
    persona_id: number;
    dorsal: string | number | null;
    estado: EstadoBorrador;
    es_capitan: boolean;
    posicion_inicial: string | null;
    fuente_posicion_inicial: string | null;
}

export interface BorradorActa {
    ts: number;
    formacionLocal: string;
    formacionVisitante: string;
    local: FilaBorrador[];
    visitante: FilaBorrador[];
}

/** Subconjunto de PersonaAlineada que la serialización necesita.
    posicion_inicial/fuente admiten undefined (campos opcionales de la interfaz real). */
export interface FilaConvocada {
    persona_id: number;
    dorsal: string | number | null;
    estado: EstadoBorrador;
    es_capitan: boolean;
    es_entrenador: boolean;
    posicion_inicial?: string | null;
    fuente_posicion_inicial?: string | null;
}

const aFilaBorrador = (p: FilaConvocada): FilaBorrador => ({
    persona_id: p.persona_id,
    dorsal: p.dorsal,
    estado: p.estado,
    es_capitan: p.es_capitan,
    posicion_inicial: p.posicion_inicial ?? null,
    fuente_posicion_inicial: p.fuente_posicion_inicial ?? null,
});

/** Construye el objeto borrador a partir del estado en pantalla.
    Los entrenadores no forman parte del borrador (no se editan en el acta). */
export function serializarBorrador(
    local: FilaConvocada[],
    visitante: FilaConvocada[],
    formacionLocal: string,
    formacionVisitante: string,
    ts: number = Date.now(),
): BorradorActa {
    return {
        ts,
        formacionLocal,
        formacionVisitante,
        local: local.filter(p => !p.es_entrenador).map(aFilaBorrador),
        visitante: visitante.filter(p => !p.es_entrenador).map(aFilaBorrador),
    };
}

/** Guarda el borrador de forma best-effort (nunca lanza). */
export function guardarBorrador(clave: string, borrador: BorradorActa): void {
    try {
        localStorage.setItem(clave, JSON.stringify(borrador));
    } catch { /* almacenamiento lleno/indisponible */ }
}

/** Elimina el borrador (nunca lanza). */
export function borrarBorrador(clave: string): void {
    try {
        localStorage.removeItem(clave);
    } catch { /* ignorado */ }
}

/** Lee y valida el borrador. Si existe pero está corrupto, lo elimina y devuelve
    null para que la próxima lectura no vuelva a tropezar con él. */
export function leerBorrador(clave: string): BorradorActa | null {
    try {
        const raw = localStorage.getItem(clave);
        if (!raw) return null;
        const d = JSON.parse(raw);
        if (!esBorradorValido(d)) {
            localStorage.removeItem(clave);
            return null;
        }
        return d as BorradorActa;
    } catch {
        borrarBorrador(clave);
        return null;
    }
}

/** Validación estructural mínima: claves y tipos correctos. */
export function esBorradorValido(d: unknown): d is BorradorActa {
    if (typeof d !== "object" || d === null) return false;
    const b = d as any;
    return (
        typeof b.ts === "number" &&
        typeof b.formacionLocal === "string" &&
        typeof b.formacionVisitante === "string" &&
        Array.isArray(b.local) &&
        Array.isArray(b.visitante) &&
        b.local.every(esFilaValida) &&
        b.visitante.every(esFilaValida)
    );
}

function esFilaValida(f: any): boolean {
    return (
        typeof f === "object" && f !== null && typeof f.persona_id === "number" &&
        typeof f.estado === "string" && typeof f.es_capitan === "boolean"
    );
}

export const MS_POR_DIA = 24 * 60 * 60 * 1000;

export const PREFIJO_BORRADOR = "acta_draft_";

/** Extrae el id de partido de una clave `acta_draft_<id>`; null si no encaja. */
export function idDePartidoDeClave(clave: string): number | null {
    if (!clave.startsWith(PREFIJO_BORRADOR)) return null;
    const id = Number(clave.slice(PREFIJO_BORRADOR.length));
    return Number.isInteger(id) && id > 0 ? id : null;
}

/** Un borrador pendiente listo para mostrar en la UI (el nombre del partido se
    resuelve en la BD por parte del llamador). */
export interface BorradorPendiente {
    clave: string;
    partidoId: number;
    ts: number;
    jugConvocados: number;
}

/** Lista todos los borradores pendientes en localStorage, ordenados por fecha
    descendente. Valida cada entrada; las corruptas se eliminan y se omiten.
    Nunca lanza. */
export function listarBorradores(): BorradorPendiente[] {
    const lista: BorradorPendiente[] = [];
    try {
        // Recolecta las claves ANTES de leer: leerBorrador puede eliminar una clave
        // corrupta y desplazar los índices, saltándose la siguiente si se itera en vivo.
        const claves: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && idDePartidoDeClave(k) !== null) claves.push(k);
        }
        for (const clave of claves) {
            const d = leerBorrador(clave);
            if (!d) continue;
            lista.push({
                clave,
                partidoId: idDePartidoDeClave(clave)!,
                ts: d.ts,
                jugConvocados: d.local.length + d.visitante.length,
            });
        }
    } catch { /* almacenamiento indisponible */ }
    return lista.sort((a, b) => b.ts - a.ts);
}

// --- PREFERENCIA DE RETENCIÓN ---
// La clave NO usa el prefijo acta_draft_: así el barrido jamás puede eliminar la
// propia configuración.
export const CLAVE_DIAS_RETENCION = "acta_dias_retencion";
export const DIAS_RETENCION_DEFECTO = 7;
const DIAS_MINIMOS = 1;
const DIAS_MAXIMOS = 365;

const sujetarDias = (n: number): number =>
    Math.min(DIAS_MAXIMOS, Math.max(DIAS_MINIMOS, Math.round(n)));

/** Lee la preferencia de días de retención de borradores; devuelve el defecto (7)
    si no existe o es inválida. Nunca lanza. */
export function leerDiasRetencion(): number {
    try {
        const raw = localStorage.getItem(CLAVE_DIAS_RETENCION);
        if (raw === null) return DIAS_RETENCION_DEFECTO;
        const n = Number(raw);
        return Number.isFinite(n) ? sujetarDias(n) : DIAS_RETENCION_DEFECTO;
    } catch {
        return DIAS_RETENCION_DEFECTO;
    }
}

/** Guarda la preferencia (sujeta a 1–365 y redondea). Devuelve el valor efectivo
    guardado, para que la UI muestre lo que realmente se aplicó. Nunca lanza. */
export function guardarDiasRetencion(dias: number): number {
    const efectivo = Number.isFinite(dias) ? sujetarDias(dias) : DIAS_RETENCION_DEFECTO;
    try {
        localStorage.setItem(CLAVE_DIAS_RETENCION, String(efectivo));
    } catch { /* almacenamiento indisponible */ }
    return efectivo;
}

/** Restablece la preferencia al valor por defecto (elimina la clave). */
export function restablecerDiasRetencion(): void {
    try {
        localStorage.removeItem(CLAVE_DIAS_RETENCION);
    } catch { /* ignorado */ }
}

/** Barrido de arranque: elimina los borradores `acta_draft_*` con más de
    `diasMaximos` días de antigüedad (y los corruptos), para que no se acumulen
    eternamente ahora que viven en localStorage. Sin argumento usa la preferencia
    guardada (ver guardarDiasRetencion). Devuelve cuántos se borraron.
    Nunca lanza. */
export function barrerBorradoresAntiguos(diasMaximos: number = leerDiasRetencion(), ahora: number = Date.now()): number {
    let eliminados = 0;
    try {
        const corte = ahora - diasMaximos * MS_POR_DIA;
        const claves: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith("acta_draft_")) claves.push(k);
        }
        for (const k of claves) {
            let eliminar = true;
            try {
                const raw = localStorage.getItem(k);
                if (raw) {
                    const d = JSON.parse(raw);
                    if (esBorradorValido(d) && d.ts >= corte) eliminar = false;
                }
            } catch { /* corrupto: eliminar */ }
            if (eliminar) {
                localStorage.removeItem(k);
                eliminados++;
            }
        }
    } catch { /* almacenamiento indisponible */ }
    return eliminados;
}

/** Fusiona el borrador sobre las plantillas recién cargadas de la BD, por persona_id.
    Puro: devuelve listas nuevas sin tocar los argumentos. Los jugadores presentes en
    pantalla pero ausentes del borrador se mantienen; las filas del borrador sin
    jugador en pantalla se ignoran. */
export function fusionarBorrador<P extends { persona_id: number }>(
    borrador: BorradorActa,
    local: P[],
    visitante: P[],
): { local: P[]; visitante: P[] } {
    const merge = (lista: P[], filas: FilaBorrador[]) =>
        lista.map(p => {
            const f = filas.find(x => x.persona_id === p.persona_id);
            return f
                ? {
                      ...p,
                      dorsal: f.dorsal,
                      estado: f.estado,
                      es_capitan: !!f.es_capitan,
                      posicion_inicial: f.posicion_inicial,
                      fuente_posicion_inicial: f.fuente_posicion_inicial,
                  }
                : p;
        });
    return {
        local: merge(local, borrador.local),
        visitante: merge(visitante, borrador.visitante),
    };
}
