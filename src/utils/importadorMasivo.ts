import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import Papa from "papaparse";
import { normalizeString } from "./stringUtils";

/**
 * Aliases de países en otras lenguas → nombre en español de la tabla Pais.
 * Los CSV de origen (Futsal_Data) vienen en PORTUGUÉS ("Espanha", "Itália",
 * "Cazaquistão"...). Se consultan cuando el match directo normalizado falla.
 * Claves ya normalizadas (minúsculas, sin acentos).
 */
export const ALIAS_PAIS: Record<string, string> = {
  "afeganistao": "Afganistán",
  "alemanha": "Alemania",
  "antigua e barbuda": "Antigua y Barbuda",
  "azerbaijao": "Azerbaiyán",
  "barem": "Baréin",
  "bielorrussia": "Bielorrusia",
  "bosnia e herzegovina": "Bosnia y Herzegovina",
  "camaroes": "Camerún",
  "cazaquistao": "Kazajistán",
  "chequia": "República Checa",
  "costa do marfim": "Costa de Marfil",
  "curacau": "Curaçao",
  "egito": "Egipto",
  "emirados arabes unidos": "Emiratos Árabes Unidos",
  "equador": "Ecuador",
  "espanha": "España",
  "franca": "Francia",
  "gana": "Ghana",
  "fiji": "Fiyi",
  "gronelandia": "Groenlandia",
  "guadalupe": "Guadalupe",
  "guiana": "Guyana",
  "guine": "Guinea",
  "guine equatorial": "Guinea Ecuatorial",
  "ilhas comores": "Comoras",
  "ilhas salomao": "Islas Salomón",
  "iraque": "Irak",
  "irlanda do norte": "Irlanda del Norte",
  "irao": "Irán",
  "japao": "Japón",
  "koweit": "Kuwait",
  "macau": "Macao",
  "macedonia do norte": "Macedonia del Norte",
  "marrocos": "Marruecos",
  "martinica": "Martinica",
  "mocambique": "Mozambique",
  "nova caledonia": "Nueva Caledonia",
  "nova zelandia": "Nueva Zelanda",
  "oma": "Omán",
  "paraguai": "Paraguay",
  "pais de gales": "Gales",
  "paises baixos": "Países Bajos",
  "porto rico": "Puerto Rico",
  "quirguistao": "Kirguistán",
  "republica da coreia": "Corea del Sur",
  "republica da irlanda": "Irlanda",
  "romenia": "Rumanía",
  "russia": "Rusia",
  "sudao": "Sudán",
  "suica": "Suiza",
  "sao marino": "San Marino",
  "sao martinho (paises baixos)": "Sint Maarten",
  "sao tome e principe": "Santo Tomé y Príncipe",
  "sao vicente e granadinas": "San Vicente y las Granadinas",
  "servia": "Serbia",
  "tajiquistao": "Tayikistán",
  "timor leste": "Timor Oriental",
  "trindade e tobago": "Trinidad y Tobago",
  "tunisia": "Túnez",
  "uruguai": "Uruguay",
  "uzbequistao": "Uzbekistán",
  "vietname": "Vietnam",
  "africa do sul": "Sudáfrica",
  "belize": "Belice",
};

/**
 * Resuelve el país de una fila del CSV contra la tabla Pais.
 * - Comparación sin acentos ni mayúsculas ("Espanha" no casaba con "España"
 *   y el fallback silencioso los mandaba todos a Afganistán).
 * - FILA SIN PAÍS → id del país "Desconocido" (nunca un país real elegido al azar).
 * - País NO ENCONTRADO → null + aviso: el llamador decide (no fallback silencioso).
 */
export async function resolverPais(
  paises: Array<{ id: number; nombre: string }>,
  nombreCsv: string | undefined | null,
): Promise<{ id: number | null; aviso?: string }> {
  const nombre = (nombreCsv ?? "").trim();
  if (!nombre) {
    const desc = paises.find((p) => normalizeString(p.nombre) === "desconocido");
    if (!desc)
      return {
        id: null,
        aviso:
          'No existe el país "Desconocido" en la base de datos; créalo en la pestaña Países para importar filas sin país.',
      };
    return { id: desc.id };
  }
  const objetivo = normalizeString(nombre);
  const hallado = paises.find((p) => normalizeString(p.nombre) === objetivo);
  if (hallado) return { id: hallado.id };
  // Alias en otras lenguas (los CSV vienen en portugués): "Espanha" → España
  const destino = ALIAS_PAIS[objetivo];
  if (destino) {
    const porAlias = paises.find((p) => normalizeString(p.nombre) === normalizeString(destino));
    if (porAlias) return { id: porAlias.id };
  }
  return { id: null, aviso: `País "${nombre}" no encontrado en la base de datos.` };
}

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
  const paisesMap = new Map(
    paises.map((p) => [normalizeString(p.nombre), p.id]),
  );
  const desc = paises.find((p) => normalizeString(p.nombre) === "desconocido");
  const idDesconocido = desc?.id ?? null;

  // Idempotencia: no reimportar equipos cuyo nombre ya existe (evita duplicar
  // todo el CSV si el fichero se importa dos veces)
  const existentes = await db.select<any[]>("SELECT nombre FROM Equipo");
  const nombresExistentes = new Set(existentes.map(e => String(e.nombre ?? "").toLowerCase().trim()));

  let importados = 0, omitidos = 0, errores = 0;
  const paisesNoEncontrados = new Map<string, number>();

  for (const row of parsed.data) {
    try {
      const nombre = String(row.nombre ?? "").trim();
      if (!nombre || nombresExistentes.has(nombre.toLowerCase())) {
        omitidos++;
        continue;
      }
      // País por nombre normalizado; sin país → "Desconocido"; no encontrado →
      // NULL contado y avisado al final (NUNCA un fallback a un país real).
      const clavePais = normalizeString((row.pais || row.pais_nombre || "").trim());
      let paisId: number | null;
      if (!clavePais) {
        if (idDesconocido === null) {
          errores++;
          continue;
        }
        paisId = idDesconocido;
      } else {
        paisId = paisesMap.get(clavePais) ?? null;
        if (paisId === null) {
          const etiqueta = (row.pais || row.pais_nombre || "").trim();
          paisesNoEncontrados.set(etiqueta, (paisesNoEncontrados.get(etiqueta) ?? 0) + 1);
        }
      }
      await db.execute(`
        INSERT INTO Equipo (nombre, abreviatura, pais_id, categoria, color1, color2, activo)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `, [nombre, row.abreviatura || nombre.substring(0, 3).toUpperCase(), paisId,
          row.categoria || "Club", row.color1 || null, row.color2 || null]);
      nombresExistentes.add(nombre.toLowerCase());
      importados++;
    } catch (e) {
      console.error("Error importando equipo:", e);
      errores++;
    }
  }

  let detalle = `${importados} equipos importados, ${omitidos} omitidos (ya existían), ${errores} errores.`;
  if (paisesNoEncontrados.size > 0) {
    const resumen = [...paisesNoEncontrados.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => `${p} ×${n}`)
      .join(", ");
    detalle += ` PAÍSES NO ENCONTRADOS (quedaron sin país): ${resumen}`;
  }
  return detalle;
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
  const paisesMap = new Map(
    paises.map((p) => [normalizeString(p.nombre), p.id]),
  );

  let importados = 0, errores = 0;
  const paisesNoEncontrados = new Map<string, number>();

  for (const row of parsed.data) {
    try {
      const clavePais = normalizeString((row.nacionalidad || row.pais || "").trim());
      const paisId = clavePais ? paisesMap.get(clavePais) ?? null : null;
      if (clavePais && paisId === null) {
        const etiqueta = (row.nacionalidad || row.pais || "").trim();
        paisesNoEncontrados.set(etiqueta, (paisesNoEncontrados.get(etiqueta) ?? 0) + 1);
      }
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

  let detalle = `${importados} jugadores importados, ${errores} errores.`;
  if (paisesNoEncontrados.size > 0) {
    const resumen = [...paisesNoEncontrados.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => `${p} ×${n}`)
      .join(", ");
    detalle += ` PAÍSES NO ENCONTRADOS (quedaron sin nacionalidad): ${resumen}`;
  }
  return detalle;
}
