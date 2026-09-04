import { convertFileSrc } from "@tauri-apps/api/core";

/**
 * Resuelve una ruta de imagen a una URL cargable por el navegador.
 * Maneja rutas HTTP, rutas relativas a /public, y rutas absolutas del sistema.
 */
export function getImgSrc(path: string | undefined | null): string {
  if (!path || path === "null" || path === "undefined") return "";
  if (path.startsWith("http") || path.startsWith("blob") || path.startsWith("data:")) return path;
  if (path.startsWith("/")) return path;
  if (path.startsWith("banderas") || path.startsWith("escudos") || path.startsWith("fotos")) return "/" + path;
  return convertFileSrc(path);
}
