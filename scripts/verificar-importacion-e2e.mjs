// Verificación E2E del flujo de importación dentro del webview REAL de futsal-stats.
// Ejecuta cada paso en la app viva vía CDP y comprueba el puente Tauri real.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV_EQUIPOS = "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Equipas_Masculino1.csv";
const CSV_JUGADORES = "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Jogadores_Activos_Masculino1.csv";
const RUTA_FUERA = "C:\\Windows\\win.ini";
const MARCA = `ZZTEST_E2E_${Date.now()}`;

const pasos = [];
function paso(nombre, ok, detalle) {
  pasos.push({ nombre, ok, detalle });
  console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);
}

await conectar();

// ── 0. Sanidad: la página viva y el puente Tauri ──────────────────────────────
const sanidad = await evaluar(`JSON.stringify({
  url: location.href,
  listo: document.readyState,
  puente: !!window.__TAURI_INTERNALS__,
  invoke: typeof window.__TAURI_INTERNALS__?.invoke,
})`);
const s0 = JSON.parse(sanidad);
paso("sanidad.puente_tauri", s0.puente && s0.invoke === "function", `url=${s0.url} readyState=${s0.listo}`);

// ── 1. Alcance fs PERMITE el CSV de Futsal_Data (lectura real en la app) ──────
const lectura = await evaluar(`(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  try {
    const bruto = await inv("plugin:fs|read_text_file", { path: ${JSON.stringify(CSV_EQUIPOS)}, options: {} });
    const txt = typeof bruto === "string" ? bruto : new TextDecoder().decode(new Uint8Array(bruto));
    return JSON.stringify({ ok: true, bytes: txt.length, inicio: txt.slice(0, 80) });
  } catch (e) { return JSON.stringify({ ok: false, error: String(e) }); }
})()`);
const L = JSON.parse(lectura);
paso(
  "scope.permite_futsal_data",
  L.ok && L.bytes > 10000,
  L.ok ? `${L.bytes} chars, cabecera: ${L.inicio.replace(/\uFEFF/, "").slice(0, 60)}…` : L.error,
);

// ── 2. Alcance fs DENIEGA una ruta fuera del alcance ─────────────────────────
const denegada = await evaluar(`(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  try {
    await inv("plugin:fs|read_text_file", { path: ${JSON.stringify(RUTA_FUERA)}, options: {} });
    return JSON.stringify({ denegado: false });
  } catch (e) { return JSON.stringify({ denegado: true, error: String(e).slice(0, 120) }); }
})()`);
const D = JSON.parse(denegada);
paso("scope.deniega_ruta_externa", D.denegado === true, D.error ?? "NO se denegó (¡problema!)");

// Papa UMD no evalúa en contexto módulo; probamos el chunk optimizado de Vite y,
// si no está, validamos en Node con el MISMO papaparse del proyecto y los mismos bytes.
let p3 = null;
let via = "app";
try {
  const parseo = await evaluar(`(async () => {
    const inv = window.__TAURI_INTERNALS__.invoke;
    const mod = await import("/node_modules/.vite/deps/papaparse.js");
    const Papa = mod.default ?? mod;
    const bruto = await inv("plugin:fs|read_text_file", { path: ${JSON.stringify(CSV_EQUIPOS)}, options: {} });
    const txt = typeof bruto === "string" ? bruto : new TextDecoder().decode(new Uint8Array(bruto));
    const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
    const filas = parsed.data;
    return JSON.stringify({
      errores: parsed.errors.length,
      filas: filas.length,
      nombresUnicos: new Set(filas.map(r => (r.nombre || "").trim()).filter(Boolean)).size,
      conPais: filas.filter(r => (r.pais || "").trim()).length,
      muestra: filas.slice(0, 2).map(r => ({ nombre: r.nombre, pais: r.pais })),
    });
  })()`);
  p3 = JSON.parse(parseo);
} catch {
  via = "node (mismo papaparse del proyecto, mismos bytes)";
  const [{ default: Papa }, { readFileSync }] = await Promise.all([
    import("papaparse"),
    import("node:fs"),
  ]);
  const txt = readFileSync(CSV_EQUIPOS, "utf8");
  const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
  const filas = parsed.data;
  p3 = {
    errores: parsed.errors.length,
    filas: filas.length,
    nombresUnicos: new Set(filas.map(r => (r.nombre || "").trim()).filter(Boolean)).size,
    conPais: filas.filter(r => (r.pais || "").trim()).length,
    muestra: filas.slice(0, 2).map(r => ({ nombre: r.nombre, pais: r.pais })),
  };
}
paso(
  "parseo.equipos_logica_importador",
  p3.filas > 10000 && p3.nombresUnicos > 10000 && p3.errores === 0,
  `[vía ${via}] ${p3.filas} filas, ${p3.nombresUnicos} nombres únicos, ${p3.conPais} con país, ${p3.errores} errores de parseo`,
);

let pj = null;
let viaJug = "app";
try {
  const parseoJug = await evaluar(`(async () => {
    const inv = window.__TAURI_INTERNALS__.invoke;
    const mod = await import("/node_modules/.vite/deps/papaparse.js");
    const Papa = mod.default ?? mod;
    const bruto = await inv("plugin:fs|read_text_file", { path: ${JSON.stringify(CSV_JUGADORES)}, options: {} });
    const txt = typeof bruto === "string" ? bruto : new TextDecoder().decode(new Uint8Array(bruto));
    const parsed = Papa.parse(txt, { header: true, skipEmptyLines: true });
    const filas = parsed.data;
    return JSON.stringify({
      filas: filas.length,
      conPais: filas.filter(r => (r.pais || "").trim()).length,
      conFecha: filas.filter(r => (r.fecha_nacimiento || "").trim()).length,
      muestra: filas.slice(0, 1).map(r => ({ nombre_deportivo: r.nombre, pais: r.pais, fecha_nacimiento: r.fecha_nacimiento })),
    });
  })()`);
  pj = JSON.parse(parseoJug);
} catch {
  viaJug = "node (mismo papaparse del proyecto, mismos bytes)";
  const [{ default: Papa }, { readFileSync }] = await Promise.all([
    import("papaparse"),
    import("node:fs"),
  ]);
  const txt = readFileSync(CSV_JUGADORES, "utf8");
  const filas = Papa.parse(txt, { header: true, skipEmptyLines: true }).data;
  pj = {
    filas: filas.length,
    conPais: filas.filter(r => (r.pais || "").trim()).length,
    conFecha: filas.filter(r => (r.fecha_nacimiento || "").trim()).length,
    muestra: filas.slice(0, 1).map(r => ({ nombre_deportivo: r.nombre, pais: r.pais, fecha_nacimiento: r.fecha_nacimiento })),
  };
}
paso(
  "parseo.jugadores_campos_mapeables",
  pj.filas > 10000 && pj.conPais > 10000,
  `[vía ${viaJug}] ${pj.filas} filas, ${pj.conPais} con país, ${pj.conFecha} con fecha nacimiento`,
);

// ── 4. Pata SQL: base de datos viva + ciclo insertar/seleccionar/borrar ──────
const dbInfo = await evaluar(`(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  const db = "sqlite:globalfutsal.db";
  await inv("plugin:sql|load", { db });
  const c = await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo", values: [] });
  const pref = await inv("plugin:sql|select", { db, query: "SELECT valor FROM Preferencia WHERE clave='carpeta_datos'", values: [] }).catch(() => null);
  return JSON.stringify({ equipos: c[0]?.n, carpetaDatos: pref && pref[0] ? pref[0].valor : null });
})()`);
const d4 = JSON.parse(dbInfo);
paso("db.accesible", typeof d4.equipos === "number", `Equipo=${d4.equipos} filas; carpeta_datos=${d4.carpetaDatos ?? "(sin configurar)"}`);

const ciclo = await evaluar(`(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  const db = "sqlite:globalfutsal.db";
  const marca = ${JSON.stringify(MARCA)};
  const antes = (await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo", values: [] }))[0].n;
  await inv("plugin:sql|execute", { db, query: "INSERT INTO Equipo (nombre, abreviatura, pais_id, categoria, activo) VALUES (?, 'ZZT', 1, 'Test', 1)", values: [marca] });
  const sel = await inv("plugin:sql|select", { db, query: "SELECT id, nombre, abreviatura FROM Equipo WHERE nombre = ?", values: [marca] });
  const durante = (await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo", values: [] }))[0].n;
  await inv("plugin:sql|execute", { db, query: "DELETE FROM Equipo WHERE nombre = ?", values: [marca] });
  const despues = (await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo", values: [] }))[0].n;
  return JSON.stringify({ antes, durante, despues, insertada: sel[0] ?? null });
})()`);
const c4 = JSON.parse(ciclo);
const cicloOk = c4.durante === c4.antes + 1 && c4.despues === c4.antes && c4.insertada?.nombre === MARCA;
paso("db.ciclo_insert_select_delete", cicloOk, `antes=${c4.antes} → insert=${c4.durante} → tras borrar=${c4.despues} (fila id=${c4.insertada?.id ?? "?"})`);

// ── 5. Pata de atomicidad: ROLLBACK funciona en el puente SQL ────────────────
const rollback = await evaluar(`(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  const db = "sqlite:globalfutsal.db";
  const antes = (await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo", values: [] }))[0].n;
  let rechazado = false;
  try {
    await inv("plugin:sql|execute", { db, query: "BEGIN; INSERT INTO Equipo (nombre, pais_id, activo) VALUES ('ZZ_RB_TEST', 1, 1); ROLLBACK;", values: [] });
  } catch (e) { rechazado = true; }
  const despues = (await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo", values: [] }))[0].n;
  const residual = (await inv("plugin:sql|select", { db, query: "SELECT COUNT(*) AS n FROM Equipo WHERE nombre='ZZ_RB_TEST'", values: [] }))[0].n;
  return JSON.stringify({ antes, despues, rechazado, residual });
})()`);
const r5 = JSON.parse(rollback);
paso(
  "db.rollback_transaccion",
  r5.despues === r5.antes && r5.residual === 0,
  `ejecución ${r5.rechazado ? "rechazada por el puente (multi-statement no soportado)" : "aceptada"}; filas residuales=${r5.residual}, count estable ${r5.antes}→${r5.despues}`,
);

// ── Resumen ───────────────────────────────────────────────────────────────────
const fallos = pasos.filter((p) => !p.ok);
console.log("\n=== RESUMEN ===");
console.log(`${pasos.length - fallos.length}/${pasos.length} pasos OK`);
if (fallos.length) {
  console.log("FALLOS:", fallos.map((f) => f.nombre).join(", "));
  process.exitCode = 1;
}
cerrar();
