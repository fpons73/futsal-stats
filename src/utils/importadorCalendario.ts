import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import Papa from "papaparse";

interface PartidoImportado {
  fecha: string;
  local_nombre: string;
  visitante_nombre: string;
  jornada: string;
  pabellon_nombre?: string;
}

/**
 * Importa un calendario desde un archivo CSV
 * Formato esperado: fecha, local, visitante, jornada, pabellon
 */
export async function importarCalendarioCSV(edicionId: number, faseId?: number): Promise<string> {
  const selected = await open({
    filters: [{ name: "CSV", extensions: ["csv"] }],
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return "No se selecciono archivo";
  }

  const content = await readTextFile(selected);
  const parsed = Papa.parse<PartidoImportado>(content, { header: true, skipEmptyLines: true });

  if (parsed.errors.length > 0) {
    console.warn("Errores de parseo:", parsed.errors);
  }

  const db = await Database.load("sqlite:globalfutsal.db");

  // Obtener todos los equipos de la edicion para mapear nombres a IDs
  const equipos = await db.select<any[]>(`
    SELECT e.id, e.nombre, e.abreviatura FROM Equipo e
    JOIN Inscripcion i ON i.equipo_id = e.id
    WHERE i.edicion_id = ? AND i.activo = 1
  `, [edicionId]);

  const equiposMap = new Map<string, number>();
  equipos.forEach(e => {
    equiposMap.set(e.nombre.toLowerCase().trim(), e.id);
    equiposMap.set(e.abreviatura.toLowerCase().trim(), e.id);
  });

  let importados = 0;
  let errores = 0;

  for (const row of parsed.data) {
    const localId = equiposMap.get(row.local_nombre?.toLowerCase().trim() || "");
    const visitanteId = equiposMap.get(row.visitante_nombre?.toLowerCase().trim() || "");

    if (!localId || !visitanteId) {
      console.warn(`Equipos no encontrados: ${row.local_nombre} vs ${row.visitante_nombre}`);
      errores++;
      continue;
    }

    try {
      await db.execute(`
        INSERT INTO Partido (edicion_id, fase_id, jornada, fecha_hora, local_id, visitante_id, estado)
        VALUES (?, ?, ?, ?, ?, ?, 'programado')
      `, [edicionId, faseId || null, row.jornada, row.fecha, localId, visitanteId]);
      importados++;
    } catch (e) {
      console.error("Error insertando partido:", e);
      errores++;
    }
  }

  return `Importacion completada: ${importados} partidos importados, ${errores} errores.`;
}

/**
 * Importa partidos desde el archivo calendario_texto.txt ya extraido
 */
export async function importarCalendarioTexto(edicionId: number, faseId?: number): Promise<string> {
  const selected = await open({
    filters: [{ name: "Texto", extensions: ["txt", "csv"] }],
    multiple: false,
  });

  if (!selected || typeof selected !== "string") {
    return "No se selecciono archivo";
  }

  const content = await readTextFile(selected);
  const lines = content.split("\n").filter(l => l.trim());

  const db = await Database.load("sqlite:globalfutsal.db");
  const equipos = await db.select<any[]>(`
    SELECT e.id, e.nombre, e.abreviatura FROM Equipo e
    JOIN Inscripcion i ON i.equipo_id = e.id
    WHERE i.edicion_id = ? AND i.activo = 1
  `, [edicionId]);

  const equiposMap = new Map<string, number>();
  equipos.forEach(e => {
    equiposMap.set(e.nombre.toLowerCase().trim(), e.id);
    equiposMap.set(e.abreviatura.toLowerCase().trim(), e.id);
  });

  let importados = 0;
  let jornadaActual = "1";

  for (const line of lines) {
    const trimmed = line.trim();

    // Detectar jornada
    if (trimmed.toLowerCase().startsWith("jornada")) {
      const match = trimmed.match(/jornada\s+(\d+)/i);
      if (match) jornadaActual = match[1];
      continue;
    }

    // Parsear linea de partido: "Fecha - Local vs Visitante" o similar
    const vsMatch = trimmed.match(/(.+?)\s+vs\.?\s+(.+)/i);
    if (!vsMatch) continue;

    const localNombre = vsMatch[1].trim().replace(/^\d+\/\d+\s+/, "");
    const visitanteNombre = vsMatch[2].trim();

    const localId = equiposMap.get(localNombre.toLowerCase().trim());
    const visitanteId = equiposMap.get(visitanteNombre.toLowerCase().trim());

    if (!localId || !visitanteId) {
      continue;
    }

    try {
      await db.execute(`
        INSERT INTO Partido (edicion_id, fase_id, jornada, local_id, visitante_id, estado)
        VALUES (?, ?, ?, ?, ?, 'programado')
      `, [edicionId, faseId || null, jornadaActual, localId, visitanteId]);
      importados++;
    } catch (e) {
      console.error("Error:", e);
    }
  }

  return `Importados ${importados} partidos desde texto.`;
}
