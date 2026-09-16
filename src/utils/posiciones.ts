// Catálogo compartido de posiciones de futsal y utilidades de posición.
// Usado por el acta (posición inicial real), la pista, importaciones y PDF.

/** Catálogo para la posición de inicio real de un partido. */
export const POSICIONES_INICIALES = [
    "Portero",
    "Cierre",
    "Ala derecha",
    "Ala izquierda",
    "Ala",
    "Pívot",
    "Universal",
] as const;

export type PosicionInicial = (typeof POSICIONES_INICIALES)[number];

/** Posiciones registradas en el perfil del jugador (compatibilidad con Jugadores.tsx). */
export const POSICIONES_REGISTRADAS = ["Portero", "Cierre", "Ala", "Pívot", "Universal"];

/** Normaliza texto igual que el resto de la app: minúsculas y sin tildes. */
function quitarTildes(texto: string): string {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}

/**
 * Mapea cualquier variante (con/sin tilde, "Ala Izquierdo", "pivot", etc.)
 * a una posición válida del catálogo de posiciones iniciales.
 */
export function normalizarPosicion(valor: string | null | undefined): PosicionInicial {
    const v = quitarTildes(valor || "");
    if (!v) return "Universal";
    if (v.includes("portero")) return "Portero";
    if (v.includes("cierre")) return "Cierre";
    if (v.includes("ala")) {
        if (v.includes("izq")) return "Ala izquierda";
        if (v.includes("der")) return "Ala derecha";
        return "Ala";
    }
    if (v.includes("pivot")) return "Pívot";
    if (v.includes("universal")) return "Universal";
    return "Universal";
}

/**
 * Posición inicial por defecto para un titular a partir de su posición registrada.
 * "Ala" sin lado se mantiene como "Ala" (sin inventar el lado).
 */
export function inferirPosicionInicial(posicionRegistrada: string | null | undefined): PosicionInicial {
    return normalizarPosicion(posicionRegistrada);
}

/** Coordenadas en pista (orientación del equipo local): X 0→100 portería propia→rival, Y 0→100 banda superior→inferior. */
export const COORDENADAS_POSICION_INICIAL: Record<PosicionInicial, { x: number; y: number }> = {
    "Portero": { x: 5, y: 50 },
    "Cierre": { x: 25, y: 50 },
    "Ala izquierda": { x: 35, y: 15 },
    "Ala derecha": { x: 35, y: 85 },
    "Ala": { x: 35, y: 50 },
    "Pívot": { x: 45, y: 50 },
    "Universal": { x: 30, y: 50 },
};
