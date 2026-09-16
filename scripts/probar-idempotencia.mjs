// Prueba de idempotencia: reimporta un CSV ya presente en BD usando el
// importador real (import dinámico vía vite) y reporta el resultado.
// Uso: node scripts/probar-idempotencia.mjs <ruta-csv>
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV = process.argv[2] || "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Jogadores_Activos_Masculino3.csv";

await conectar();
await evaluar(`(function(){
  window.__idem = { listo: false, resultado: null, error: null };
  (async function(){
    try {
      const mod = await import('/src/utils/importadorMasivo.ts');
      window.__idem.resultado = await mod.importarJugadoresCSV(${JSON.stringify(CSV)});
    } catch (e) {
      window.__idem.error = String(e && e.message || e);
    }
    window.__idem.listo = true;
  })();
  return 'prueba lanzada';
})()`);

const inicio = Date.now();
let res = null;
while (Date.now() - inicio < 180000) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = JSON.parse(await evaluar(`JSON.stringify(window.__idem)`));
  if (st.listo) { res = st; break; }
}
cerrar();
if (!res) { console.log("FAIL | timeout esperando la reimportación"); process.exit(2); }
if (res.error) { console.log("FAIL | error:", res.error); process.exit(1); }
console.log("RESULTADO:", res.resultado);
const m = res.resultado.match(/(\d+) jugadores importados, (\d+) omitidos/);
const ok = m && Number(m[1]) === 0 && Number(m[2]) > 0;
console.log(`${ok ? "PASS" : "FAIL"} | idempotencia | importados=${m ? m[1] : "?"} omitidos=${m ? m[2] : "?"}`);
process.exit(ok ? 0 : 1);
