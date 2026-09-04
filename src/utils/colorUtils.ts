/**
 * Calcula la luminosidad de un color hex para determinar contraste de texto.
 */
export function getLuminance(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length !== 6) return 0.5;
  const r = parseInt(c.substring(0, 2), 16) / 255;
  const g = parseInt(c.substring(2, 4), 16) / 255;
  const b = parseInt(c.substring(4, 6), 16) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/**
 * Devuelve un color de texto legible (negro o blanco) según el fondo.
 */
export function getReadableTextColor(bgColor: string): string {
  return getLuminance(bgColor) > 0.55 ? "#1a1a1a" : "#ffffff";
}

/**
 * Devuelve un color de equipo legible, usando color1 si existe, si no color2, si no un default.
 */
export function getReadableTeamColor(color1?: string, color2?: string): string {
  if (color1 && color1.trim()) return color1;
  if (color2 && color2.trim()) return color2;
  return "#3b82f6"; // azul por defecto
}

/**
 * Resuelve los colores de un equipo para un partido, con fallbacks.
 */
export function resolveTeamMatchColors(
  teamColor1?: string,
  teamColor2?: string,
  compColor1?: string,
  compColor2?: string
): { primary: string; secondary: string } {
  const primary = teamColor1?.trim() || compColor1?.trim() || "#3b82f6";
  const secondary = teamColor2?.trim() || compColor2?.trim() || "#1e40af";
  return { primary, secondary };
}
