// Importa varios CSV llamando a los importadores REALES dentro de la app
// (import dinámico vía vite), sin diálogo nativo: las rutas llegan como
// parámetros. Ejecución desacoplada: lanza el lote y sondea window.__imp
// por la misma conexión CDP (las conexiones nuevas se cuelgan; una sola vive).
// Uso: node scripts/importar-lote-directo.mjs
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const BASE = "C:\\Proyectos\\futsal-stats\\Futsal_Data\\";
const LOTE = [
  { nombre: "Jugadores2", url: BASE + "Enciclopedia_Futsal_Jogadores_Activos_Masculino2.csv", fn: "importarJugadoresCSV" },
  { nombre: "Jugadores3", url: BASE + "Enciclopedia_Futsal_Jogadores_Activos_Masculino3.csv", fn: "importarJugadoresCSV" },
  { nombre: "Jugadores4", url: BASE + "Enciclopedia_Futsal_Jogadores_Activos_Masculino4.csv", fn: "importarJugadoresCSV" },
  { nombre: "Jugadores5", url: BASE + "Enciclopedia_Futsal_Jogadores_Activos_Masculino5.csv", fn: "importarJugadoresCSV" },
];

await conectar();

// Preparar el lote en la página: cada importador real recibe la ruta fija.
const plan = LOTE.map((p) => ({ nombre: p.nombre, fn: p.fn, url: p.url }));
await evaluar(`(function(){
  window.__imp = { encolado: false, actual: null, terminados: [], error: null };
  window.__lanzarLote = async function(plan){
    for (const paso of plan) {
      window.__imp.actual = paso.nombre;
      try {
        const mod = await import('/src/utils/importadorMasivo.ts');
        const res = await mod[paso.fn](paso.url);
        window.__imp.terminados.push({ nombre: paso.nombre, resultado: res });
      } catch (e) {
        window.__imp.error = paso.nombre + ': ' + String(e && e.message || e);
        return;
      }
    }
    window.__imp.actual = null;
  };
  window.__lanzarLote(${JSON.stringify(plan)});
  return 'lote lanzado: ${plan.length} pasos';
})()`);

// Sondeo: hasta 20 min, cada 10s, por la MISMA conexión.
const inicio = Date.now();
let ultimos = "";
while (Date.now() - inicio < 1200000) {
  await new Promise((r) => setTimeout(r, 10000));
  const seg = ((Date.now() - inicio) / 1000).toFixed(0);
  const st = JSON.parse(await evaluar(`JSON.stringify(window.__imp)`));
  const linea = `t=${seg}s actual=${st.actual} terminados=${st.terminados.length}${st.error ? " ERROR=" + st.error : ""}`;
  if (linea !== ultimos) { console.log(linea); ultimos = linea; }
  for (const t of st.terminados) {
    console.log(`  [${t.nombre}] ${t.resultado}`);
  }
  if (st.terminados.length === plan.length || st.error) break;
}

const final = JSON.parse(await evaluar(`JSON.stringify(window.__imp)`));
for (const t of final.terminados) console.log(`FINAL [${t.nombre}] ${t.resultado}`);
if (final.error) console.log("ERROR FINAL:", final.error);
cerrar();
process.exit(final.error ? 1 : (final.terminados.length === plan.length ? 0 : 2));
