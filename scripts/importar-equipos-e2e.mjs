// E2E completo del importador de equipos: botón REAL de la UI + diálogo nativo
// REAL manejado con UI Automation (como haría un usuario). Sin parches: el
// puente de Tauri es inalterable (invoke no-writable), así que el diálogo se
// rellena de verdad con la ruta del CSV de Futsal_Data.
// Flujo: navegar (#/importar) → lanzar UIA en background → clic → esperar → reportar.
import { spawn } from "node:child_process";
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV = process.argv[2] || "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Equipas_Masculino1.csv";
const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

// ── Recarga completa para garantizar módulos actualizados (HMR incluido) ────
await evaluar(`location.reload(); 1`);
// Poll: esperar a que el shell monte (sidebar con >5 enlaces), hasta 30s
let arranco = false;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: document.querySelectorAll('a').length})`));
    if (st.enlaces > 5) { arranco = true; break; }
  } catch { /* página recargándose */ }
}
paso(arranco, "ui.app_arrancada", arranco ? "shell montado tras recarga" : "timeout esperando shell");

// ── 0. Sanidad ───────────────────────────────────────────────────────────────
const s0 = JSON.parse(await evaluar(`JSON.stringify({puente: !!window.__TAURI_INTERNALS__, enlaces: [...document.querySelectorAll('a')].length})`));
paso(s0.puente && s0.enlaces > 5, "sanidad.app_real", `enlaces=${s0.enlaces}`);

// ── 1. Navegar a Importar (HashRouter) ───────────────────────────────────────
await evaluar(`(function(){ const a = document.querySelector('a[href="#/importar"]'); if (a) a.click(); else location.hash = "#/importar"; return 1; })()`);
await new Promise(r => setTimeout(r, 1000));
const s1 = JSON.parse(await evaluar(`JSON.stringify({hash: location.hash, boton: !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar equipos')))})`));
paso(s1.boton, "ui.navegacion_importar", `hash=${s1.hash}`);

// ── 2. UIA en background (esperará hasta 20s a que el diálogo exista) ────────
const uia = spawn("powershell", [
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", "scripts/abrir-dialogo-uia.ps1",
  "-Ruta", CSV,
], { cwd: "C:\\Proyectos\\futsal-stats", windowsHide: true });
let uiaSalida = "";
uia.stdout.on("data", (d) => { uiaSalida += d.toString(); });
uia.stderr.on("data", (d) => { uiaSalida += d.toString(); });

// ── 3. Pulsar el botón REAL (abre el diálogo nativo) ─────────────────────────
const clic = JSON.parse(await evaluar(`(function(){
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar equipos'));
  if (!b) return JSON.stringify({ok:false});
  b.click();
  return JSON.stringify({ok:true, deshabilitado: b.disabled});
})()`));
paso(clic.ok, "ui.clic_boton_importar", `botón pulsado, deshabilitado=${clic.deshabilitado}`);

// ── 4. Esperar el final de la importación (botón re-habilitado) ─────────────
const inicio = Date.now();
let listo = false, ultimoEstado = null;
while (Date.now() - inicio < 300000) {
  await new Promise(r => setTimeout(r, 3000));
  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  const st = JSON.parse(await evaluar(`JSON.stringify({
    d: ([...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar equipos')))?.disabled ?? null,
  })`));
  ultimoEstado = st.d;
  if (st.d === false) { listo = true; console.log(`INFO | importación terminada en ${seg}s`); break; }
  if (st.d === null) { console.log(`INFO | botón desapareció en ${seg}s`); break; }
}

// ── 5. Reporte de la UI ──────────────────────────────────────────────────────
const ui = JSON.parse(await evaluar(`(function(){
  const toasts = [...document.querySelectorAll('div')].filter(e => String(e.className).includes('border-l-')).map(e => e.textContent.trim().slice(0, 160));
  const m = document.body.innerText.match(/\\d+ equipos importados[^\\n]*/);
  return JSON.stringify({toasts, resultado: m ? m[0] : null});
})()`));
console.log("INFO | uia |", uiaSalida.trim().replace(/\r?\n/g, " · "));
console.log("INFO | toasts_ui |", JSON.stringify(ui.toasts));
console.log("INFO | resultado_ui |", ui.resultado ?? "(no visible)");

cerrar();
paso(listo && !!ui.resultado, "ui.flujo_completo", `terminado=${listo}, estadoFinalBoton=${ultimoEstado}`);
process.exit(listo && !!ui.resultado ? 0 : 1);
