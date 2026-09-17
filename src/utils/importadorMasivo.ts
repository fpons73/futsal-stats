import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import Papa from "papaparse";
import { normalizeString } from "./stringUtils";
import type { InformeImportacion, FilaConError } from "./informeImportacion";

/** Estado compartido de los importadores masivos: el último informe por tipo.
 *  La página Importar lo lee para ofrecer "Exportar informe". Clave = tipo. */
export const ULTIMOS_INFORMES: Record<string, InformeImportacion> = {};

/** Finaliza un importador: compone el informe estructurado, lo registra y
 *  devuelve el string de resumen para el toast (mismo formato que siempre). */
function cerrarInforme(
  base: Omit<InformeImportacion, "fecha" | "paisesNoEncontrados" | "filasConError">,
  paisesNoEncontrados: Map<string, number>,
  filasConError: FilaConError[],
): string {
  const informe: InformeImportacion = {
    ...base,
    fecha: new Date().toISOString(),
    paisesNoEncontrados: [...paisesNoEncontrados.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([pais, filas]) => ({ pais, filas })),
    filasConError,
  };
  ULTIMOS_INFORMES[base.tipo] = informe;

  let detalle = `${base.importados} ${base.tipo} importados, ${base.omitidos} omitidos (ya existían), ${base.errores} errores.`;
  if (base.sinPais > 0) detalle += ` ${base.sinPais} sin país en el CSV (quedaron sin nacionalidad).`;
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
  "bissau": "Guinea Bissau",
  "bosnia e herzegovina": "Bosnia y Herzegovina",
  "camaroes": "Camerún",
  "cazaquistao": "Kazajistán",
  "chequia": "República Checa",
  "costa do marfim": "Costa de Marfil",
  "curacau": "Curaçao",
  "egito": "Egipto",
  "emirados arabes unidos": "Emiratos Árabes Unidos",
  "equador": "Ecuador",
  "eritreia": "Eritrea",
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
  "quenia": "Kenia",
  "quirguistao": "Kirguistán",
  "rd congo": "R.D. Congo",
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
export async function importarEquiposCSV(rutaPredefinida?: string): Promise<string> {
  const selected = rutaPredefinida ?? await open({
    filters: [{ name: "CSV", extensions: ["csv"] }],
    multiple: false,
  });
  if (!selected || typeof selected !== "string") return "Cancelado";

  const content = await readTextFile(selected);
  const parsed = Papa.parse<any>(content, { header: true, skipEmptyLines: true });
  const db = await Database.load("sqlite:globalfutsal.db");

  let paises = await db.select<any[]>("SELECT id, nombre FROM Pais");
  const paisesMap = new Map(
    paises.map((p) => [normalizeString(p.nombre), p.id]),
  );
  // El país "Desconocido" es el destino seguro de filas sin país o con un país
  // fuera del catálogo. En una BD virgen no existe y Equipo.pais_id es NOT NULL,
  // así que sin él TODO el CSV moriría (bug de primera instalación).
  // Lo creamos aquí, idempotente, y refrescamos el catálogo tras insertarlo.
  let desc = paises.find((p) => normalizeString(p.nombre) === "desconocido");
  if (!desc) {
    try {
      await db.execute("INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('Desconocido', 'ZZ', 'ZZZ')");
      paises = await db.select<any[]>("SELECT id, nombre FROM Pais");
      desc = paises.find((p) => normalizeString(p.nombre) === "desconocido");
    } catch (e) {
      // Concurrency o permisos: seguimos con el comportamiento anterior (null).
      console.error(e, "No se pudo crear el país Desconocido. Visible: el informe contará las filas afectadas.");
    }
  }
  const idDesconocido = desc?.id ?? null;

  // Idempotencia: no reimportar equipos cuyo nombre ya existe (evita duplicar
  // todo el CSV si el fichero se importa dos veces)
  const existentes = await db.select<any[]>("SELECT nombre FROM Equipo");
  const nombresExistentes = new Set(existentes.map(e => String(e.nombre ?? "").toLowerCase().trim()));

  let importados = 0, omitidos = 0, errores = 0, sinPais = 0;
  const paisesNoEncontrados = new Map<string, number>();
  const filasConError: FilaConError[] = [];
  const numeroFila = (idx: number) => idx + 2; // +1 cabecera, +1 base 1

  for (const [idx, row] of parsed.data.entries()) {
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
        sinPais++;
        if (idDesconocido === null) {
          errores++;
          filasConError.push({
            fila: numeroFila(idx),
            identificador: nombre || "(sin nombre)",
            error: 'Sin país en el CSV y no existe el país "Desconocido" (créalo en Países).',
          });
          continue;
        }
        paisId = idDesconocido;
      } else {
        const hallado = paisesMap.get(clavePais);
        if (hallado !== undefined) {
          paisId = hallado;
        } else {
          // País del CSV fuera del catálogo → "Desconocido" (nueva BD) o NULL
          // con aviso (BD sin Desconocido y el INSERT falló). Nunca muere en NOT NULL.
          const etiqueta = (row.pais || row.pais_nombre || "").trim();
          paisesNoEncontrados.set(etiqueta, (paisesNoEncontrados.get(etiqueta) ?? 0) + 1);
          paisId = idDesconocido;
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
      filasConError.push({
        fila: numeroFila(idx),
        identificador: String(row.nombre ?? "(sin nombre)").trim(),
        error: String(e).slice(0, 300),
      });
    }
  }

  return cerrarInforme(
    { tipo: "equipos", fichero: selected, importados, omitidos, errores, sinPais },
    paisesNoEncontrados,
    filasConError,
  );
}

/**
 * Deriva los apellidos quitando del nombre completo los tokens iniciales que
 * forman el nombre deportivo ("Rui Tiago Dantas da Silva" + "Rui Silva" →
 * "Dantas da Silva"). Si no hay prefijo que casar, devuelve el completo.
 */
function derivarApellidos(nombreCompleto: string, deportivo: string): string {
  const nc = (nombreCompleto ?? "").trim();
  const dep = (deportivo ?? "").trim();
  if (!nc) return "";
  if (!dep) return nc;
  const depTokens = normalizeString(dep).split(/\s+/).filter(Boolean);
  const ncTokens = nc.split(/\s+/).filter(Boolean);
  let i = 0;
  for (const t of depTokens) {
    if (i < ncTokens.length && normalizeString(ncTokens[i]) === t) i++;
    else break;
  }
  const resto = ncTokens.slice(i).join(" ").trim();
  return resto || nc;
}

/** Posiciones abreviadas del CSV (PT) → catálogo de la app. */
const MAP_POSICION_CSV: Record<string, string> = {
  "a": "Ala",
  "med": "Ala", // medio/medio-campista: sin equivalente fino, Ala genérica
  "def": "Cierre",
  "gr": "Portero", // guarda-redes
};

/**
 * Importa jugadores masivamente desde un CSV.
 * Columnas esperadas (Futsal_Data): id, nombre (deportivo), nombre_completo,
 * posicion (A|Med|Def|Gr), dorsal, pais (en PT), fecha_nacimiento, edad,
 * equipo_actual, titulos, url, foto_url, genero.
 * - Apellidos derivados de nombre_completo menos el nombre deportivo.
 * - País: match sin acentos + ALIAS_PAIS (PT→ES); sin país → NULL (columna
 *   nullable, no se inventa nacionalidad); no encontrado → NULL + aviso.
 * - Idempotente: omite (nombre_deportivo + fecha_nacimiento) ya presentes.
 * - foto_url del CSV es ruta web del site de origen, no fichero local: no se guarda.
 */
export async function importarJugadoresCSV(rutaPredefinida?: string): Promise<string> {
  const selected = rutaPredefinida ?? await open({
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

  // Idempotencia: (nombre_deportivo normalizado + fecha_nacimiento) como clave.
  const existentes = await db.select<any[]>(
    "SELECT nombre_deportivo, fecha_nacimiento FROM Persona",
  );
  const clavesExistentes = new Set(
    existentes.map((p) =>
      normalizeString(String(p.nombre_deportivo ?? "").trim()) +
      "|" + String(p.fecha_nacimiento ?? "").trim(),
    ),
  );

  let importados = 0, omitidos = 0, errores = 0, sinPais = 0;
  const paisesNoEncontrados = new Map<string, number>();
  const filasConError: FilaConError[] = [];
  const numeroFila = (idx: number) => idx + 2;

  for (const [idx, row] of parsed.data.entries()) {
    try {
      const deportivo = String(row.nombre_deportivo ?? row.nombre ?? "").trim();
      const claveJug =
        normalizeString(deportivo) + "|" + String(row.fecha_nacimiento ?? "").trim();
      if (!deportivo || clavesExistentes.has(claveJug)) {
        omitidos++;
        continue;
      }

      // País: normalizado → alias PT→ES → NULL contado (nunca país inventado)
      const etiquetaPais = String(row.pais ?? row.nacionalidad ?? "").trim();
      const clavePais = normalizeString(etiquetaPais);
      let paisId: number | null = null;
      if (!clavePais) {
        sinPais++;
      } else {
        paisId = paisesMap.get(clavePais) ?? null;
        if (paisId === null) {
          const destino = ALIAS_PAIS[clavePais];
          if (destino) paisId = paisesMap.get(normalizeString(destino)) ?? null;
        }
        if (paisId === null) {
          paisesNoEncontrados.set(etiquetaPais, (paisesNoEncontrados.get(etiquetaPais) ?? 0) + 1);
        }
      }

      const posicion =
        MAP_POSICION_CSV[normalizeString(String(row.posicion ?? "").trim())] ?? "Ala";

      await db.execute(`
        INSERT INTO Persona (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, posicion_principal, posiciones_secundarias, foto_path, roles)
        VALUES (?, ?, ?, ?, ?, ?, ?, NULL, 'Jugador')
      `, [
        deportivo,
        derivarApellidos(row.nombre_completo, deportivo),
        deportivo,
        row.fecha_nacimiento || null,
        paisId,
        posicion,
        row.posiciones_secundarias || "",
      ]);
      clavesExistentes.add(claveJug);
      importados++;
    } catch (e) {
      console.error("Error importando jugador:", e);
      errores++;
      filasConError.push({
        fila: numeroFila(idx),
        identificador: String(row.nombre_deportivo ?? row.nombre ?? "(sin nombre)").trim(),
        error: String(e).slice(0, 300),
      });
    }
  }

  return cerrarInforme(
    { tipo: "jugadores", fichero: selected, importados, omitidos, errores, sinPais },
    paisesNoEncontrados,
    filasConError,
  );
}

/**
 * Importador de ENTRENADORES (Enciclopedia_Futsal_Entrenadores_Masculino*.csv).
 * Columnas reales del CSV: id, nombre, nombre_completo, pais, fecha_nacimiento,
 * edad, equipo_actual, titulos, url, foto_url, genero.
 * - roles = 'Entrenador' (plano): las queries de la app filtran con
 *   LIKE '%Entrenador%' y los editores ya persisten el valor plano.
 * - País: match sin acentos + ALIAS_PAIS (PT→ES); sin país → NULL contado;
 *   no encontrado → NULL + aviso (nunca país inventado).
 * - Idempotente: omite (nombre_deportivo normalizado + fecha_nacimiento) ya
 *   presentes, el mismo criterio que importarJugadoresCSV — así un entrenador
 *   que también aparece en los CSV de jugadores no se inserta dos veces.
 * - foto_url es ruta web del site de origen: no se guarda.
 */
export async function importarEntrenadoresCSV(rutaPredefinida?: string): Promise<string> {
  const selected = rutaPredefinida ?? await open({
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

  // Idempotencia con la MISMA clave que jugadores: (deportivo + fecha).
  const existentes = await db.select<any[]>(
    "SELECT nombre_deportivo, fecha_nacimiento FROM Persona",
  );
  const clavesExistentes = new Set(
    existentes.map((p) =>
      normalizeString(String(p.nombre_deportivo ?? "").trim()) +
      "|" + String(p.fecha_nacimiento ?? "").trim(),
    ),
  );

  let importados = 0, omitidos = 0, errores = 0, sinPais = 0;
  const paisesNoEncontrados = new Map<string, number>();
  const filasConError: FilaConError[] = [];
  const numeroFilaEnt = (idx: number) => idx + 2;

  for (const [idx, row] of parsed.data.entries()) {
    try {
      const deportivo = String(row.nombre ?? "").trim();
      const claveEnt =
        normalizeString(deportivo) + "|" + String(row.fecha_nacimiento ?? "").trim();
      if (!deportivo || clavesExistentes.has(claveEnt)) {
        omitidos++;
        continue;
      }

      const etiquetaPais = String(row.pais ?? "").trim();
      const clavePais = normalizeString(etiquetaPais);
      let paisId: number | null = null;
      if (!clavePais) {
        sinPais++;
      } else {
        paisId = paisesMap.get(clavePais) ?? null;
        if (paisId === null) {
          const destino = ALIAS_PAIS[clavePais];
          if (destino) paisId = paisesMap.get(normalizeString(destino)) ?? null;
        }
        if (paisId === null) {
          paisesNoEncontrados.set(etiquetaPais, (paisesNoEncontrados.get(etiquetaPais) ?? 0) + 1);
        }
      }

      const equipoActual = String(row.equipo_actual ?? "").trim();
      const meta: Record<string, unknown> = {};
      if (equipoActual) meta.equipo_actual = equipoActual;
      const titulos = Number(String(row.titulos ?? "").trim());
      if (Number.isFinite(titulos) && titulos > 0) meta.titulos = titulos;

      await db.execute(`
        INSERT INTO Persona (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, posiciones_secundarias, foto_path, roles, meta)
        VALUES (?, ?, ?, ?, ?, '', NULL, 'Entrenador', ?)
      `, [
        deportivo,
        derivarApellidos(row.nombre_completo, deportivo),
        deportivo,
        row.fecha_nacimiento || null,
        paisId,
        Object.keys(meta).length ? JSON.stringify(meta) : null,
      ]);
      clavesExistentes.add(claveEnt);
      importados++;
    } catch (e) {
      console.error("Error importando entrenador:", e);
      errores++;
      filasConError.push({
        fila: numeroFilaEnt(idx),
        identificador: String(row.nombre ?? "(sin nombre)").trim(),
        error: String(e).slice(0, 300),
      });
    }
  }

  return cerrarInforme(
    { tipo: "entrenadores", fichero: selected, importados, omitidos, errores, sinPais },
    paisesNoEncontrados,
    filasConError,
  );
}

/**
 * Deriva el tipo normalizado de una competición a partir del texto del CSV
 * ("Campeonato Regional (Clubes) - Anual", "Taça Nacional (Clubes)"...).
 * Devuelve los valores que ya usa la app: Liga | Copa | Torneo | Playoff.
 */
export function derivarTipoCompeticion(tipoCsv: string): "Liga" | "Copa" | "Torneo" | "Playoff" {
  const t = normalizeString(tipoCsv);
  if (t.includes("campeonato") || t.includes("liga")) return "Liga";
  if (t.includes("copa") || t.includes("taca")) return "Copa";
  return "Torneo";
}

/**
 * Deriva el ámbito (Clubes | Selecciones) de un tipo del CSV. Los CSV traen
 * "(Clubes)", "(Seleções)" o "()"; sin paréntesis válido se asume Clubes.
 */
export function derivarAmbitoCompeticion(tipoCsv: string): "Clubes" | "Selecciones" {
  return normalizeString(tipoCsv).includes("selecoes") ? "Selecciones" : "Clubes";
}

/**
 * Importador de COMPETICIONES (Enciclopedia_Futsal_Competicoes_Masculino*.csv).
 * Columnas reales del CSV: id, nombre, pais, tipo, url, logo_url, genero.
 * - Idempotente por (nombre normalizado + pais_id): reimportar el mismo CSV
 *   no duplica nada.
 * - País: match sin acentos + ALIAS_PAIS (PT→ES). Las filas continentales/
 *   mundiales del CSV traen el nombre de la competición en la columna país
 *   (basura) → pais_id NULL, contado aparte.
 * - tipo se normaliza al vocabulario de la app (Liga | Copa | Torneo);
 *   ambito distingue Clubes | Selecciones (con el paréntesis del CSV).
 * - logo_url es ruta web del site de origen: no se guarda.
 */
export async function importarCompeticionesCSV(rutaPredefinida?: string): Promise<string> {
  const selected = rutaPredefinida ?? await open({
    filters: [{ name: "CSV", extensions: ["csv"] }],
    multiple: false,
  });
  if (!selected || typeof selected !== "string") return "Cancelado";

  const content = await readTextFile(selected);
  const parsed = Papa.parse<any>(content, { header: true, skipEmptyLines: true });
  const db = await Database.load("sqlite:globalfutsal.db");

  const paises = await db.select<any[]>("SELECT id, nombre, confederacion_id FROM Pais");
  const paisesMap = new Map(paises.map((p) => [normalizeString(p.nombre), p]));

  // Idempotencia: (nombre normalizado + pais_id) como clave.
  const existentes = await db.select<any[]>("SELECT nombre, pais_id FROM Competicion");
  const clavesExistentes = new Set(
    existentes.map((c) =>
      normalizeString(String(c.nombre ?? "")) +
      "|" + (c.pais_id === null || c.pais_id === undefined ? "" : String(c.pais_id)),
    ),
  );

  let importadas = 0, omitidas = 0, errores = 0, sinPais = 0;
  const paisesNoEncontrados = new Map<string, number>();
  const filasConError: FilaConError[] = [];
  const numeroFilaComp = (idx: number) => idx + 2;

  for (const [idx, row] of parsed.data.entries()) {
    try {
      const nombre = String(row.nombre ?? "").trim();
      if (!nombre) { omitidas++; continue; }

      // País: normalizado → alias PT→ES → NULL contado (nunca país inventado).
      // Una celda de país que en realidad es texto de competición ("UEFA
      // Futsal Euro") no casará con ningún país y quedará como NULL.
      const etiquetaPais = String(row.pais ?? "").trim();
      const clavePais = normalizeString(etiquetaPais);
      let paisId: number | null = null;
      if (!clavePais) {
        sinPais++;
      } else {
        const hallado = paisesMap.get(clavePais);
        if (hallado) {
          paisId = hallado.id;
        } else {
          const destino = ALIAS_PAIS[clavePais];
          if (destino) {
            const porAlias = paisesMap.get(normalizeString(destino));
            if (porAlias) paisId = porAlias.id;
          }
        }
        if (paisId === null) {
          paisesNoEncontrados.set(etiquetaPais, (paisesNoEncontrados.get(etiquetaPais) ?? 0) + 1);
        }
      }

      const clave = normalizeString(nombre) + "|" + (paisId === null ? "" : String(paisId));
      if (clavesExistentes.has(clave)) { omitidas++; continue; }

      const tipoCsv = String(row.tipo ?? "");
      const tipo = derivarTipoCompeticion(tipoCsv);
      const ambito = derivarAmbitoCompeticion(tipoCsv);

      // Confederación: la del país (Pais.confederacion_id); las competiciones
      // de selecciones continentales/mundiales quedan para la fase 2.
      let confederacionId: number | null = null;
      if (paisId !== null) {
        const filaPais = paisesMap.get(clavePais) ?? paisesMap.get(normalizeString(ALIAS_PAIS[clavePais] ?? ""));
        confederacionId = filaPais?.confederacion_id ? Number(filaPais.confederacion_id) : null;
      }

      await db.execute(`
        INSERT INTO Competicion (nombre, tipo, pais_id, confederacion_id, ambito)
        VALUES (?, ?, ?, ?, ?)
      `, [nombre, tipo, paisId, confederacionId, ambito]);
      clavesExistentes.add(clave);
      importadas++;
    } catch (e) {
      console.error("Error importando competición:", e);
      errores++;
      filasConError.push({
        fila: numeroFilaComp(idx),
        identificador: String(row.nombre ?? "(sin nombre)").trim(),
        error: String(e).slice(0, 300),
      });
    }
  }

  return cerrarInforme(
    { tipo: "competiciones", fichero: selected, importados: importadas, omitidos: omitidas, errores, sinPais },
    paisesNoEncontrados,
    filasConError,
  );
}
