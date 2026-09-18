// Informe estructurado de una importación CSV (tarea 1.2 del hito 1.0).
// Los importadores devuelven hoy un string para el toast; el informe añade el
// detalle por fila/país para poder exportarlo y auditarlo sin abrir consola.

/** Un país que venía en el CSV y no casó con la tabla Pais (ni por alias). */
export interface PaisNoEncontrado {
    pais: string;
    /** Filas del CSV con ese país (afectadas o importadas sin nacionalidad). */
    filas: number;
}

/** Una fila concreta que no se pudo insertar (error SQL/de datos). */
export interface FilaConError {
    /** Número de fila en el CSV (1 = primera fila de datos, sin cabecera). */
    fila: number;
    /** Identificación dentro de la fila (nombre/equipo) para localizarla. */
    identificador: string;
    /** Mensaje del error (sqlite, constraint, etc.). */
    error: string;
}

export interface InformeImportacion {
    /** Tipo de importador ("equipos", "jugadores", "entrenadores", "competiciones"). */
    tipo: string;
    /** Fichero importado (ruta o nombre). */
    fichero: string;
    /** Momento del fin de la importación (ISO). */
    fecha: string;
    importados: number;
    omitidos: number;
    errores: number;
    /** Filas sin país en el CSV (quedaron con nacionalidad NULL a propósito). */
    sinPais: number;
    paisesNoEncontrados: PaisNoEncontrado[];
    filasConError: FilaConError[];
}

/** ¿El informe merece botón de exportación? (algo que revisar) */
export function informeTieneProblemas(i: InformeImportacion): boolean {
    return i.errores > 0 || i.paisesNoEncontrados.length > 0;
}

/** CSV del informe: dos secciones — resumen y detalle de problemas. */
export function informeACSV(i: InformeImportacion): string {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lineas: string[] = [];
    lineas.push("seccion,clave,valor");
    lineas.push(`resumen,${esc("tipo")},${esc(i.tipo)}`);
    lineas.push(`resumen,${esc("fichero")},${esc(i.fichero)}`);
    lineas.push(`resumen,${esc("fecha")},${esc(i.fecha)}`);
    lineas.push(`resumen,${esc("importados")},${i.importados}`);
    lineas.push(`resumen,${esc("omitidos")},${i.omitidos}`);
    lineas.push(`resumen,${esc("errores")},${i.errores}`);
    lineas.push(`resumen,${esc("sin_pais")},${i.sinPais}`);
    for (const p of i.paisesNoEncontrados) {
        lineas.push(`pais_no_encontrado,${esc(p.pais)},${p.filas}`);
    }
    for (const f of i.filasConError) {
        lineas.push(`fila_con_error,${esc(`#${f.fila} ${f.identificador}`)},${esc(f.error)}`);
    }
    return lineas.join("\n");
}

/** JSON completo (mismo contenido, para archivar o tratar por programa). */
export function informeAJSON(i: InformeImportacion): string {
    return JSON.stringify(i, null, 2);
}

/** Descarga el informe con el diálogo nativo de guardar (plugin fs). */
export async function exportarInforme(
    informe: InformeImportacion,
    formato: "csv" | "json",
): Promise<void> {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    // Fecha del informe = momento de la importación documentada (determinista
    // y honesto), no la del día en que se exporta el fichero.
    const base = `informe_importacion_${informe.tipo}_${informe.fecha.slice(0, 10)}`;
    const ruta = await save({
        defaultPath: `${base}.${formato}`,
        filters: [{ name: formato.toUpperCase(), extensions: [formato] }],
    });
    if (!ruta) return;
    await writeTextFile(ruta, formato === "csv" ? informeACSV(informe) : informeAJSON(informe));
}
