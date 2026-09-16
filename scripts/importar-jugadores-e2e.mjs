// E2E del importador de JUGADORES: botón real de la UI + diálogo nativo real
// manejado con UI Automation. Flujo: recarga → navegar (#/importar) → lanzar
// UIA en background → clic en "Importar jugadores" → esperar → reportar.
import { spawn } from "node:child_process";
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV = process.argv[2] || "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Jogadores_Activos_Masculino1.csv";
const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

// ── Recarga completa para garantizar módulos actualizados (HMR incluido) ────
await evaluar(`location.reload(); 1`);
let arranco = false;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: document.querySelectorAll('a').length})`));
    if (st.enlaces > 5) { arranco = true; break; }
  } catch { /* página recargándose */ }
}
paso(arranco, "ui.app_arrancada", arranco ? "shell montado tras recarga" : "timeout esperando shell");

// ── Navegar a Importar (HashRouter) ──────────────────────────────────────────
await evaluar(`(function(){ const a = document.querySelector('a[href="#/importar"]'); if (a) a.click(); else location.hash = "#/importar"; return 1; })()`);
await new Promise(r => setTimeout(r, 1000));
const s1 = JSON.parse(await evaluar(`JSON.stringify({hash: location.hash, boton: !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar jugadores')))})`));
paso(s1.boton, "ui.navegacion_importar", `hash=${s1.hash}, botón jugadores=${s1.boton}`);

// ── UIA en background (esperará hasta 20s a que el diálogo exista) ───────────
const uia = spawn("powershell", [
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", "scripts/abrir-dialogo-uia.ps1",
  "-Ruta", CSV,
], { cwd: "C:\\Proyectos\\futsal-stats", windowsHide: true });
let uiaSalida = "";
uia.stdout.on("data", (d) => { uiaSalida += d.toString(); });
uia.stderr.on("data", (d) => { uiaSalida += d.toString(); });

// ── Pulsar el botón REAL ─────────────────────────────────────────────────────
const clic = JSON.parse(await evaluar(`(function(){
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar jugadores'));
  if (!b) return JSON.stringify({ok:false});
  b.click();
  return JSON.stringify({ok:true, deshabilitado: b.disabled});
})()`));
paso(clic.ok, "ui.clic_boton_importar", `botón pulsado, deshabilitado=${clic.deshabilitado}`);

// ── Esperar el final (botón re-habilitado) ───────────────────────────────────
const inicio = Date.now();
let listo = false, ultimoEstado = null;
while (Date.now() - inicio < 600000) {
  await new Promise(r => setTimeout(r, 3000));
  const seg = ((Date.now() - inicio) / 1000).toFixed(1);
  const st = JSON.parse(await evaluar(`JSON.stringify({
    d: ([...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar jugadores')))?.disabled ?? null,
  })`));
  ultimoEstado = st.d;
  if (st.d === false) { listo = true; console.log(`INFO | importación terminada en ${seg}s`); break; }
  if (st.d === null) { console.log(`INFO | botón desapareció en ${seg}s`); break; }
}

// ── Reporte de la UI ─────────────────────────────────────────────────────────
const ui = JSON.parse(await evaluar(`(function(){
  const toasts = [...document.querySelectorAll('div')].filter(e => String(e.className).includes('border-l-')).map(e => e.textContent.trim().slice(0, 220));
  const m = document.body.innerText.match(/\\d+ jugadores importados[^\\n]*/);
  return JSON.stringify({toasts, resultado: m ? m[0] : null});
})()`));
console.log("INFO | uia |", uiaSalida.trim().replace(/\r?\n/g, " · ").slice(0, 300));
console.log("INFO | toasts_ui |", JSON.stringify(ui.toasts));
console.log("INFO | resultado_ui |", ui.resultado ?? "(no visible)");

cerrar();
paso(listo && !!ui.resultado, "ui.flujo_completo", `terminado=${listo}, estadoFinalBoton=${ultimoEstado}`);
process.exit(listo && !!ui.resultado ? 0 : 1);
