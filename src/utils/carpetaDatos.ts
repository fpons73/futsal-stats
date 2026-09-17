import { invoke } from "@tauri-apps/api/core";
import { getPreferencia, setPreferencia } from "../db";
import { toast } from "../components/Toast";

/** Clave de preferencia donde vive la carpeta de datos (misma en Rust). */
export const CLAVE_CARPETA_DATOS = "carpeta_datos";

/** Raíz del proyecto, inyectada por Vite (`define`). Solo tiene valor en dev. */
declare const __RAIZ_PROYECTO__: string;

/** Carpeta de datos sugerida en la UI de Configuración.
 *
 *  En desarrollo apunta a la raíz real del proyecto (donde vive Futsal_Data/),
 *  resuelta en build — funciona en cualquier máquina, no solo en la que creó
 *  el proyecto. En producción (instalador) no hay proyecto: se sugiere una
 *  carpeta `Global Futsal Stats` dentro de Documentos del usuario, que
 *  siempre existe y es escribible.
 */
export async function carpetaSugerida(): Promise<string> {
  if (import.meta.env.DEV) return __RAIZ_PROYECTO__;
  const { documentDir, join } = await import("@tauri-apps/api/path");
  return join(await documentDir(), "Global Futsal Stats");
}

/** Lee la carpeta de datos configurada (null si no hay ninguna). */
export async function leerCarpetaDatos(): Promise<string | null> {
  try {
    const remota = await invoke<string | null>("leer_carpeta_datos");
    if (remota) return remota;
  } catch (e) {
    console.error("leer_carpeta_datos falló, usando preferencia local:", e);
  }
  const local = await getPreferencia(CLAVE_CARPETA_DATOS, "");
  return local || null;
}

/** Guarda la carpeta y amplía los alcances fs/assets al momento (vía Rust). */
export async function guardarCarpetaDatos(carpeta: string): Promise<void> {
  await invoke("guardar_carpeta_datos", { carpeta });
  // Copia local como respaldo (getPreferencia ya la usa como fallback).
  await setPreferencia(CLAVE_CARPETA_DATOS, carpeta);
}

/** Aplica la carpeta guardada al arranque (solo lectura; no revalida si falla). */
export async function aplicarCarpetaDatosAlArranque(): Promise<void> {
  const carpeta = await leerCarpetaDatos();
  if (!carpeta) return;
  try {
    await invoke("extender_alcance_fs", { carpeta });
  } catch (e) {
    // La carpeta pudo haberse movido o borrado: no bloqueamos el arranque.
    console.error("No se pudo aplicar la carpeta de datos guardada:", e);
  }
}

/** ¿Permite el scope actual leer esta ruta? (diagnóstico desde la UI) */
export async function esRutaAlcanzable(ruta: string): Promise<boolean> {
  try {
    return await invoke<boolean>("es_carpeta_alcanzable", { ruta });
  } catch {
    return false;
  }
}

/** El plugin-fs de Tauri rechaza rutas fuera del alcance con este mensaje. */
const PREFIJO_ERROR_ALCANCE = "forbidden path";

/** Detecta un error de ruta denegada por el alcance fs y avisa con un toast
 *  que guía al usuario a configurar la carpeta en Configuración.
 *  Devuelve true si el error era de alcance (el llamador puede saltarse su
 *  mensaje genérico); false en cualquier otro caso. */
export function avisarSiRutaDenegada(e: unknown): boolean {
  const mensaje = String(e ?? "").toLowerCase();
  if (!mensaje.includes(PREFIJO_ERROR_ALCANCE)) return false;
  toast.warning(
    "La ruta está fuera del alcance permitido por seguridad. " +
    "Añade su carpeta en Configuración → Carpeta de datos."
  );
  return true;
}
