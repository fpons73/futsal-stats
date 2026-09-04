/**
 * Normaliza un string eliminando tildes y convirtiéndolo a minúsculas
 */
export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Normaliza un nombre de equipo para comparaciones
 */
export function normalizeTeamName(str: string): string {
  return normalizeString(str)
    .replace(/\b(cd|cf|fc|club|deportivo|de|la|el|los|las|the)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Genera un slug a partir de un string
 */
export function slugify(str: string): string {
  return normalizeString(str)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
