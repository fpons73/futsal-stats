// Verificación de arranque en frío: el alcance fs debe estar aplicado por la
// preferencia persistida (aplicarCarpetaDatosAlArranque), sin configurar nada aquí.
// Uso: node scripts/verificar-arranque-carpeta.mjs [ruta-sonda-opcional]
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const B = String.fromCharCode(92);
const CSV = ["C:", "Proyectos", "futsal-stats", "Futsal_Data", "Enciclopedia_Futsal_Equipas_Masculino1.csv"].join(B);
const DENEGADA = ["C:", "Windows", "win.ini"].join(B);
const SONDA = process.argv[2] ?? null;

await conectar();

const expr = `(async () => {
  const inv = window.__TAURI_INTERNALS__.invoke;
  const res = {};
  try {
    res.preferencia = await inv("leer_carpeta_datos");
    res.csv_alcanzable = await inv("es_carpeta_alcanzable", { ruta: ${JSON.stringify(CSV)} });
    res.win_ini_denegada = !(await inv("es_carpeta_alcanzable", { ruta: ${JSON.stringify(DENEGADA)} }));
    ${SONDA ? `res.sonda = await inv("es_carpeta_alcanzable", { ruta: ${JSON.stringify(SONDA)} });` : ""}
  } catch (e) { res.error = String((e && e.message) || e); }
  return JSON.stringify(res);
})()`;

const out = await evaluar(expr);
console.log("ARRANQUE_FRIO:", out);
cerrar();
process.exit(0);
