// Configura carpeta_datos en la app dev viva y verifica el alcance fs.
// Uso: node scripts/configurar-carpeta-e2e.mjs [carpeta]  (por defecto, la raíz del proyecto)
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const B = String.fromCharCode(92); // backslash sin escapes de shell
const CARPETA = process.argv[2] ?? ["C:", "Proyectos", "futsal-stats"].join(B);
const CSV = [CARPETA, "Futsal_Data", "Enciclopedia_Futsal_Equipas_Masculino1.csv"].join(B);
const DENEGADA = ["C:", "Windows", "win.ini"].join(B);

await conectar();

// Todo en una sola eval: las conexiones CDP nuevas tienden a colgar tras la primera.
const expr = `(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  const res = {};
  try {
    // Persiste en Preferencia.carpeta_datos y extiende el alcance fs/assets al momento
    await inv("guardar_carpeta_datos", { carpeta: ${JSON.stringify(CARPETA)} });
    res.guardada = await inv("leer_carpeta_datos");
    res.alcanzable = await inv("es_carpeta_alcanzable", { ruta: ${JSON.stringify(CSV)} });
    try {
      const fs = await import("@tauri-apps/plugin-fs");
      res.bytes_leidos = (await fs.readFile(${JSON.stringify(CSV)})).byteLength;
    } catch (e) { res.error_fs = String((e && e.message) || e); }
    res.denegada_rechazada = !(await inv("es_carpeta_alcanzable", { ruta: ${JSON.stringify(DENEGADA)} }));
  } catch (e) { res.error = String((e && e.message) || e); }
  return JSON.stringify(res);
})()`;

const out = await evaluar(expr);
console.log("RESULTADO:", out);
cerrar();
process.exit(0);
