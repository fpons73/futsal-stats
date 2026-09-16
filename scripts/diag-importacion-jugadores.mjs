// Diagnóstico E2E de importación de jugadores — UNA sola conexión CDP.
// Igual que importar-jugadores-e2e.mjs pero: UIA espera 120s al diálogo,
// cada sondeo se imprime al momento, y la salida del UIA va a fichero.
import { spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV = process.argv[2] || "C:\\Proyectos\\futsal-stats\\Futsal_Data\\ZZE2E_jugadores_test.csv";
// Texto del botón a pulsar ("Importar jugadores", "Importar entrenadores"...)
const BOTON = process.argv[3] || "Importar jugadores";
const LOG = "logs_diag_jug.txt";
const log = (m) => { const linea = `[${new Date().toLocaleTimeString()}] ${m}`; console.log(linea); appendFileSync(LOG, linea + "\n"); };
writeFileSync(LOG, "");

await conectar();
log("CDP conectado");

// Recarga y espera de shell
await evaluar(`location.reload(); 1`);
let arranco = false;
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: document.querySelectorAll('a').length})`));
    if (st.enlaces > 5) { arranco = true; break; }
  } catch { /* recargando */ }
}
log(`shell montado: ${arranco}`);

// Navegar a Importar
await evaluar(`(function(){ const a = document.querySelector('a[href="#/importar"]'); if (a) a.click(); else location.hash = "#/importar"; return 1; })()`);
await new Promise(r => setTimeout(r, 1200));
const s1 = JSON.parse(await evaluar(`JSON.stringify({hash: location.hash, boton: !!([...document.querySelectorAll('button')].find(b => b.textContent.includes(${JSON.stringify(BOTON)})))})`));
log(`navegación: hash=${s1.hash} botonJugadores=${s1.boton}`);

// UIA en background con 120s de espera, salida a fichero
const uiaOut = "logs_uia_jug.txt";
writeFileSync(uiaOut, "");
const uia = spawn("powershell", [
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", "scripts/abrir-dialogo-uia.ps1",
  "-Ruta", CSV,
  "-Segundos", "120",
], { cwd: "C:\\Proyectos\\futsal-stats", windowsHide: true });
uia.stdout.on("data", d => appendFileSync(uiaOut, d.toString()));
uia.stderr.on("data", d => appendFileSync(uiaOut, "ERR: " + d.toString()));
uia.on("exit", c => appendFileSync(uiaOut, `\n[UIA exit code=${c}]\n`));
log("UIA lanzado (espera diálogo hasta 120s)");

// Clic en el botón real
const clic = JSON.parse(await evaluar(`(function(){
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(BOTON)}));
  if (!b) return JSON.stringify({ok:false});
  b.click();
  return JSON.stringify({ok:true, deshabilitado: b.disabled});
})()`));
log(`clic botón: ok=${clic.ok} deshabilitadoTrasClic=${clic.deshabilitado}`);

// Sondeo cada 4s hasta 8 min, imprimiendo estado + toasts
const inicio = Date.now();
let listo = false;
while (Date.now() - inicio < 480000) {
  await new Promise(r => setTimeout(r, 4000));
  const seg = ((Date.now() - inicio) / 1000).toFixed(0);
  let st;
  try {
    st = JSON.parse(await evaluar(`(function(){
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(${JSON.stringify(BOTON)}));
      const toasts = [...document.querySelectorAll('div')].filter(e => String(e.className).includes('border-l-')).map(e => e.textContent.trim().slice(0,120));
      return JSON.stringify({d: b ? b.disabled : null, toasts});
    })()`));
  } catch (e) { log(`t=${seg}s eval falló: ${e.message}`); continue; }
  log(`t=${seg}s boton.disabled=${st.d} toasts=${JSON.stringify(st.toasts)}`);
  if (st.d === false) { listo = true; break; }
  if (st.d === null) { log("botón desapareció"); break; }
}

// Reporte final
try {
  const ui = JSON.parse(await evaluar(`(function(){
    const m = document.body.innerText.match(/\\d+ (?:jugadores|entrenadores) importados[^\\n]*/);
    return JSON.stringify({resultado: m ? m[0] : null});
  })()`));
  log(`resultado UI: ${ui.resultado ?? "(no visible)"}`);
} catch (e) { log(`reporte final falló: ${e.message}`); }

cerrar();
log(`FIN listo=${listo}`);
process.exit(listo ? 0 : 1);
