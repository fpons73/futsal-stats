// Búsqueda global (B4 del roadmap): índice en memoria de las tres entidades
// principales (Personas, Equipos, Partidos) con filtrado acento-insensible y
// ranking simple (coincidencia por prefijo antes que subcadena).
//
// ¿Índice en memoria y no LIKE en SQL? Porque las páginas de listado ya usan
// ese patrón (cargan todo y filtran con normalizeString): es el comportamiento
// que el usuario ya ve — "Garcia" encuentra "García" — y no introduce una
// segunda semántica de búsqueda distinta por tecla contra la BD.
//
// Degradación elegante: fuera de Tauri (tests) o sin BD devuelve [] en vez de
// lanzar; los fallos reales van al registro de errores.

import { normalizeString } from "../utils/stringUtils";
import { registroErrores } from "../utils/registroErrores";

export interface ResultadoBusqueda {
    tipo: "equipo" | "persona" | "partido";
    id: number;
    titulo: string;
    subtitulo: string;
    /** Destino al seleccionar: detalle directo o listado con el filtro aplicado. */
    ruta: string;
    /** Texto crudo sobre el que se calculó el ranking (para tests y orden estable). */
    fuente: string;
}

/** Tipos a incluir; vacío o undefined = los tres. */
export type FiltroTipos = Array<ResultadoBusqueda["tipo"]>;

export interface EntradaIndice {
    tipo: ResultadoBusqueda["tipo"];
    id: number;
    titulo: string;
    subtitulo: string;
    ruta: string;
    fuente: string;
}

let cache: EntradaIndice[] | null = null;
let construidoEn = 0;
let cargando: Promise<EntradaIndice[]> | null = null;

const MIN_CARACTERES = 2;
const LIMITE_TOTAL = 20;
/** Edad máxima del índice: pasado este tiempo se reconstruye al usarlo, así
 *  las ediciones e importaciones recientes aparecen sin tocar cada punto de
 *  mutación. La construcción son 3 SELECT y tarda centenas de ms como mucho. */
const TTL_MS = 30_000;

/** Invalida el índice: tras importaciones masivas o cambios de nombres. */
export function invalidarIndiceBusqueda(): void {
    cache = null;
    cargando = null;
    construidoEn = 0;
}

async function construirIndice(): Promise<EntradaIndice[]> {
    const Database = (await import("@tauri-apps/plugin-sql")).default;
    const db = await Database.load("sqlite:globalfutsal.db");

    const personas = await db.select<Array<{
        id: number; nombre_deportivo: string; nombre: string; apellidos: string;
        posicion_principal: string | null; roles: string | null;
    }>>(
        `SELECT id, nombre_deportivo, nombre, apellidos, posicion_principal, roles
         FROM Persona`,
    );

    const equipos = await db.select<Array<{
        id: number; nombre: string; categoria: string | null;
    }>>(
        `SELECT id, nombre, categoria FROM Equipo`,
    );

    const partidos = await db.select<Array<{
        id: number; local: string; visitante: string; fecha_hora: string | null; jornada: string | null;
    }>>(
        `SELECT p.id, el.nombre AS local, ev.nombre AS visitante,
                p.fecha_hora, p.jornada
         FROM Partido p
         JOIN Equipo el ON el.id = p.local_id
         JOIN Equipo ev ON ev.id = p.visitante_id`,
    );

    const entradas: EntradaIndice[] = [];

    for (const e of equipos) {
        entradas.push({
            tipo: "equipo",
            id: e.id,
            titulo: e.nombre,
            subtitulo: e.categoria || "",
            ruta: `/equipo/${e.id}`,
            fuente: e.nombre,
        });
    }

    for (const p of personas) {
        const titulo = (p.nombre_deportivo || [p.nombre, p.apellidos].filter(Boolean).join(" ") || `#${p.id}`).trim();
        entradas.push({
            tipo: "persona",
            id: p.id,
            titulo,
            subtitulo: p.posicion_principal || (p.roles || "").split(",").map(s => s.trim().replace(/[[\]"]/g, "")).join(", "),
            // Ficha directa (B1): vale para jugadores y entrenadores (la ficha
            // muestra trayectoria y estadísticas de la edición activa).
            ruta: `/jugador/${p.id}`,
            fuente: `${p.nombre_deportivo || ""} ${p.nombre || ""} ${p.apellidos || ""}`.trim(),
        });
    }

    for (const p of partidos) {
        const titulo = `${p.local} vs ${p.visitante}`;
        const sub = [p.fecha_hora ? p.fecha_hora.slice(0, 10) : null, p.jornada ? `J${p.jornada}` : null]
            .filter(Boolean).join(" · ");
        entradas.push({
            tipo: "partido",
            id: p.id,
            titulo,
            subtitulo: sub,
            ruta: `/partido/${p.id}`,
            fuente: `${p.local} vs ${p.visitante}`,
        });
    }

    return entradas;
}

/** Obtiene el índice (cacheado; se reconstruye si supera el TTL). Nunca lanza. */
export async function obtenerIndice(): Promise<EntradaIndice[]> {
    if (cache && Date.now() - construidoEn < TTL_MS) return cache;
    if (cache) invalidarIndiceBusqueda();
    if (!cargando) {
        cargando = construirIndice()
            .then((r) => { cache = r; construidoEn = Date.now(); return r; })
            .catch((e) => {
                cargando = null; // permite reintento en la próxima llamada
                registroErrores.añadir(
                    "warning",
                    "buscador",
                    "La búsqueda global no pudo cargar el índice de datos",
                    e instanceof Error ? e.message : String(e),
                );
                return [] as EntradaIndice[];
            });
    }
    return cargando;
}

/** Puntuación: prefijo > palabra-inicial > subcadena; 0 = sin coincidencia. */
function puntuar(fuenteNormalizada: string, qNorm: string): number {
    if (fuenteNormalizada.includes(qNorm)) {
        if (fuenteNormalizada.startsWith(qNorm)) return 3;
        // Empieza en frontera de palabra (tras espacio, guion o paréntesis).
        if (/[\s\-({]/.test(fuenteNormalizada[fuenteNormalizada.indexOf(qNorm) - 1] ?? "")) return 2;
        return 1;
    }
    return 0;
}

/**
 * Busca en el índice cacheado. Nunca lanza; mínimo 2 caracteres;
 * ordena prefijo > palabra > subcadena y desempata alfabéticamente.
 */
export async function buscarGlobal(
    termino: string,
    tipos?: FiltroTipos,
): Promise<ResultadoBusqueda[]> {
    const q = termino.trim();
    if (q.length < MIN_CARACTERES) return [];

    const indice = await obtenerIndice();
    if (indice.length === 0) return [];

    const qNorm = normalizeString(q);
    const incluir = (t: ResultadoBusqueda["tipo"]) => !tipos || tipos.length === 0 || tipos.includes(t);

    const coincidencias: Array<{ entrada: EntradaIndice; puntos: number }> = [];
    for (const entrada of indice) {
        if (!incluir(entrada.tipo)) continue;
        const puntos = puntuar(normalizeString(entrada.fuente), qNorm);
        if (puntos > 0) coincidencias.push({ entrada, puntos });
    }

    coincidencias.sort((a, b) =>
        b.puntos - a.puntos ||
        a.entrada.fuente.localeCompare(b.entrada.fuente, "es"),
    );

    return coincidencias.slice(0, LIMITE_TOTAL).map(({ entrada }) => ({
        tipo: entrada.tipo,
        id: entrada.id,
        titulo: entrada.titulo,
        subtitulo: entrada.subtitulo,
        ruta: entrada.ruta,
        fuente: entrada.fuente,
    }));
}
