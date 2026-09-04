/**
 * Normaliza un string eliminando tildes y convirtiéndolo a minúsculas
 */
export function normalizeString(str: string): string {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}
