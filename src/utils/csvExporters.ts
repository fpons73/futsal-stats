import Database from "@tauri-apps/plugin-sql";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "../components/Toast";

const BOM = "\ufeff";

/** Plural simple para roles ("Jugador" → "Jugadores", "Arbitro" → "Arbitros"). */
const pluralizar = (palabra: string) =>
  /[aeiouáéíóú]$/.test(palabra) ? `${palabra}s` : `${palabra}es`;

const escapeCSV = (v: any) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return s.includes(",") || s.includes('"') || s.includes("\n")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

/** Pide destino con el diálogo nativo, escribe el CSV y avisa por toast.
 *  Devuelve true si se escribió, false si el usuario canceló o falló la escritura
 *  (los fallos de consulta deben gestionarse antes de llamar aquí). */
async function guardarCSV(csv: string, nombreArchivo: string): Promise<boolean> {
  try {
    const ruta = await save({
      filters: [{ name: "CSV", extensions: ["csv"] }],
      defaultPath: nombreArchivo,
    });
    if (!ruta) {
      toast.info("Exportación cancelada.");
      return false;
    }
    await writeTextFile(ruta, csv);
    toast.success(`CSV exportado: ${nombreArchivo}`);
    return true;
  } catch (e) {
    console.error("Error exportando CSV:", e);
    toast.error("No se pudo exportar el CSV. Revisa la carpeta destino y los permisos.");
    return false;
  }
}

export async function exportarPersonasCSV(rol: string) {
  try {
    const db = await Database.load("sqlite:globalfutsal.db");
    const personas = await db.select<any[]>(`
      SELECT
        p.nombre, p.apellidos, p.nombre_deportivo, p.fecha_nacimiento,
        p.posicion_principal, p.posiciones_secundarias, p.foto_path,
        n1.nombre as primera_nacionalidad
      FROM Persona p
      LEFT JOIN Pais n1 ON p.nacionalidad_principal_id = n1.id
      WHERE p.roles LIKE ?
      ORDER BY p.nombre_deportivo ASC
    `, [`%${rol}%`]);

    const cabecera = "nombre,apellidos,nombre_deportivo,fecha_nacimiento,nacionalidad,posicion_principal,posiciones_secundarias,foto_path\n";
    const filas = personas.map(p =>
      `${escapeCSV(p.nombre)},${escapeCSV(p.apellidos)},${escapeCSV(p.nombre_deportivo)},${escapeCSV(p.fecha_nacimiento)},${escapeCSV(p.primera_nacionalidad)},${escapeCSV(p.posicion_principal)},${escapeCSV(p.posiciones_secundarias)},${escapeCSV(p.foto_path)}`
    ).join("\n");

    await guardarCSV(BOM + cabecera + filas, `${pluralizar(rol).toLowerCase()}_export.csv`);
  } catch (e) {
    console.error("Error exportando CSV:", e);
    toast.error(`No se pudo generar el CSV de ${pluralizar(rol).toLowerCase()} (error de base de datos).`);
  }
}

export async function exportarEquiposCSV() {
  try {
    const db = await Database.load("sqlite:globalfutsal.db");
    const equipos = await db.select<any[]>(`
      SELECT e.nombre, e.abreviatura, e.categoria, e.color1, e.color2, p.nombre as pais
      FROM Equipo e
      LEFT JOIN Pais p ON e.pais_id = p.id
      ORDER BY e.nombre ASC
    `);

    const cabecera = "nombre,abreviatura,categoria,color1,color2,pais\n";
    const filas = equipos.map(e =>
      `${escapeCSV(e.nombre)},${escapeCSV(e.abreviatura)},${escapeCSV(e.categoria)},${escapeCSV(e.color1)},${escapeCSV(e.color2)},${escapeCSV(e.pais)}`
    ).join("\n");

    await guardarCSV(BOM + cabecera + filas, "equipos_export.csv");
  } catch (e) {
    console.error("Error exportando equipos CSV:", e);
    toast.error("No se pudo generar el CSV de equipos (error de base de datos).");
  }
}

export async function exportarClasificacionCSV(clasificacion: any[], nombreEdicion: string) {
  const cabecera = "posicion,equipo,puntos,pj,pg,pe,pp,gf,gc,dg\n";
  const filas = clasificacion.map(c =>
    `${c.posicion},${escapeCSV(c.nombre)},${c.puntos},${c.pj},${c.pg},${c.pe},${c.pp},${c.gf},${c.gc},${c.dg}`
  ).join("\n");

  await guardarCSV(BOM + cabecera + filas, `clasificacion_${nombreEdicion}.csv`);
}

export async function exportarEstadisticasJugadorCSV(estadisticas: any[], nombreEdicion: string) {
  if (estadisticas.length === 0) return;
  const keys = Object.keys(estadisticas[0]);
  const cabecera = keys.join(",") + "\n";
  const filas = estadisticas.map(j => keys.map(k => escapeCSV(j[k])).join(",")).join("\n");

  await guardarCSV(BOM + cabecera + filas, `stats_jugadores_${nombreEdicion}.csv`);
}
