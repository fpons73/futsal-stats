// Importa un CSV de competiciones llamando al importador REAL dentro de la
// app (import dinámico vía vite), sin diálogo nativo.
// Uso: node scripts/importar-competiciones-directo.mjs <ruta-csv>
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV = process.argv[2] || "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Competicoes_Masculino1.csv";

await conectar();
await evaluar(`(function(){
  window.__impC = { listo: false, resultado: null, error: null };
  (async function(){
    try {
      const mod = await import('/src/utils/importadorMasivo.ts');
      window.__impC.resultado = await mod.importarCompeticionesCSV(${JSON.stringify(CSV)});
    } catch (e) {
      window.__impC.error = String(e && e.message || e);
    }
    window.__impC.listo = true;
  })();
  return 'lanzada';
})()`);

const inicio = Date.now();
let res = null;
while (Date.now() - inicio < 180000) {
  await new Promise((r) => setTimeout(r, 3000));
  const st = JSON.parse(await evaluar(`JSON.stringify(window.__impC)`));
  if (st.listo) { res = st; break; }
}
cerrar();
if (!res) { console.log("FAIL | timeout"); process.exit(2); }
if (res.error) { console.log("FAIL | error:", res.error); process.exit(1); }
console.log("RESULTADO:", res.resultado);
