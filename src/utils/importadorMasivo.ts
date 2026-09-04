import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import Papa from "papaparse";

/**
 * Importa equipos masivamente desde un CSV
 * Formato: nombre, abreviatura, categoria, pais_nombre, color1, color2
 */
export async function importarEquiposCSV(): Promise<string> {
  const selected = await open({
    filters: [{ name: "CSV", extensions: ["csv"] }],
    multiple: false,
  });
  if (!selected || typeof selected !== "string") return "Cancelado";

  const content = await readTextFile(selected);
  const parsed = Papa.parse<any>(content, { header: true, skipEmptyLines: true });
  const db = await Database.load("sqlite:globalfutsal.db");

  const paises = await db.select<any[]>("SELECT id, nombre FROM Pais");
  const paisesMap = new Map(paises.map(p => [p.nombre.toLowerCase().trim(), p.id]));

  let importados = 0, errores = 0;

  for (const row of parsed.data) {
    try {
      const paisId = paisesMap.get((row.pais || row.pais_nombre || "").toLowerCase().trim()) || 1;
      await db.execute(`
        INSERT INTO Equipo (nombre, abreviatura, pais_id, categoria, color1, color2, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `, [row.nombre, row.abreviatura || row.nombre.substring(0, 3).toUpperCase(), paisId,
          row.categoria || "Club", row.color1 || null, row.color2 || null]);
      importados++;
    } catch (e) {
      console.error("Error importando equipo:", e);
      errores++;
    }
  }

  return `${importados} equipos importados, ${errores} errores.`;
}

/**
 * Importa jugadores masivamente desde un CSV
 * Formato: nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad, posicion_principal, posiciones_secundarias, foto_path
 */
export async function importarJugadoresCSV(): Promise<string> {
  const selected = await open({
    filters: [{ name: "CSV", extensions: ["csv"] }],
    multiple: false,
  });
  if (!selected || typeof selected !== "string") return "Cancelado";

  const content = await readTextFile(selected);
  const parsed = Papa.parse<any>(content, { header: true, skipEmptyLines: true });
  const db = await Database.load("sqlite:globalfutsal.db");

  const paises = await db.select<any[]>("SELECT id, nombre FROM Pais");
  const paisesMap = new Map(paises.map(p => [p.nombre.toLowerCase().trim(), p.id]));

  let importados = 0, errores = 0;

  for (const row of parsed.data) {
    try {
      const paisId = paisesMap.get((row.nacionalidad || row.pais || "").toLowerCase().trim()) || null;
      await db.execute(`
        INSERT INTO Persona (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, posicion_principal, posiciones_secundarias, foto_path, roles)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Jugador')
      `, [
        row.nombre || "", row.apellidos || "", row.nombre_deportivo || row.nombre || "",
        row.fecha_nacimiento || null, paisId,
        row.posicion_principal || "Ala", row.posiciones_secundarias || "",
        row.foto_path || null
      ]);
      importados++;
    } catch (e) {
      console.error("Error importando jugador:", e);
      errores++;
    }
  }

  return `${importados} jugadores importados, ${errores} errores.`;
}
