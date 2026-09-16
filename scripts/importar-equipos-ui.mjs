// Importa el CSV de equipos PULSANDO EL BOTÓN REAL de la UI (vía CDP).
// El parche de plugin:dialog|open y el clic se hacen en UNA eval atómica:
// un full-reload de HMR entre evals borraba el parche y abría el diálogo nativo real.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const CSV = "C:\\Proyectos\\futsal-stats\\Futsal_Data\\Enciclopedia_Futsal_Equipas_Masculino1.csv";
const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

// ── 0. Sanidad + navegación a la página Importar (HashRouter) ────────────────
const s0 = JSON.parse(await evaluar(`JSON.stringify({puente: !!window.__TAURI_INTERNALS__, enlaces: [...document.querySelectorAll('a')].length})`));
paso(s0.puente && s0.enlaces > 5, "sanidad.app_real", `enlaces=${s0.enlaces}`);

await evaluar(`(function(){ const a = document.querySelector('a[href="#/importar"]'); if (a) a.click(); else location.hash = "#/importar"; return 1; })()`);
await new Promise(r => setTimeout(r, 1000));
const s1 = JSON.parse(await evaluar(`JSON.stringify({hash: location.hash, boton: !!([...document.querySelectorAll('button')].find(b => b.textContent.includes('Importar equipos')))})`));
paso(s1.boton, "ui.navegacion_importar", `hash=${s1.hash}`);

// ── 1. Eval ATÓMICA: parchear invoke + clic + confirmación ───────────────────
// Reintentos: si un reload de HMR borra el parche (dialogCalls queda a 0 con el
// handler colgado en el diálogo nativo), recargamos y reintentamos.
let exito = false;
for (let intento = 1; intento <= 3 && !exito; intento++) {
  console.log(`INFO | intento ${intento}: parche+clic atómicos`);
  const r = JSON.parse(await evaluar(`(async function(){
    const inv = window.__TAURI_INTERNALS__;
    if (!inv) return JSON.stringify({ok:false, motivo:"sin puente"});
    const original = inv.invoke.bind(inv);
    window.__dialogCalls = 0;
    inv.invoke = function(cmd, args, ...resto) {
      if (cmd === "plugin:dialog|open") {
        window.__dialogCalls++;
        return Promise.resolve(${JSON.stringify(CSV)});
      }
      return original(cmd, args, ...resto);
    };
    const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar equipos'));
    if (!b) return JSON.stringify({ok:false, motivo:"botón no encontrado"});
    b.click();
    await new Promise(r2 => setTimeout(r2, 300));
    return JSON.stringify({ok:true, dialogCalls: window.__dialogCalls, deshabilitado: b.disabled});
  })()`));
  if (!r.ok) { console.log("INFO |", r.motivo); break; }
  console.log(`INFO | clic dado, dialogCalls=${r.dialogCalls}, botón deshabilitado=${r.deshabilitado}`);

  // Si el interceptor ya capturó el diálogo, el flujo es nuestro.
  if (!r.dialogCalls) {
    // Parche borrado por un reload: recargar y reintentar.
    console.log("INFO | parche perdido (reload de HMR); recargando página…");
    await evaluar(`(function(){ location.reload(); return 1; })()`);
    let appLista = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r2 => setTimeout(r2, 2000));
      try {
        const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: [...document.querySelectorAll('a')].length})`));
        if (st.enlaces > 5) { appLista = true; break; }
      } catch { /* recargando */ }
    }
    if (!appLista) { console.log("INFO | la app no volvió a montarse"); break; }
    await evaluar(`(function(){ const a = document.querySelector('a[href="#/importar"]'); if (a) a.click(); else location.hash = "#/importar"; return 1; })()`);
    await new Promise(r2 => setTimeout(r2, 1000));
    continue;
  }

  // ── 2. Esperar el final: botón vuelve a habilitado + toasts/resultado ─────
  const inicio = Date.now();
  let listo = false;
  while (Date.now() - inicio < 240000) {
    await new Promise(r2 => setTimeout(r2, 3000));
    const seg = ((Date.now() - inicio) / 1000).toFixed(1);
    const st = JSON.parse(await evaluar(`JSON.stringify({
      d: ([...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar equipos')))?.disabled ?? null,
      llamadas: window.__dialogCalls ?? 0,
    })`));
    if (st.d === false) { listo = true; console.log(`INFO | terminó en ${seg}s`); break; }
    if (st.d === null) { console.log(`INFO | botón desapareció en ${seg}s`); break; }
  }
  if (!listo) { console.log("INFO | timeout esperando el fin de la importación"); break; }

  const ui = JSON.parse(await evaluar(`(function(){
    const toasts = [...document.querySelectorAll('div')].filter(e => String(e.className).includes('border-l-')).map(e => e.textContent.trim().slice(0, 160));
    const m = document.body.innerText.match(/\\d+ equipos importados[^\\n]*/);
    return JSON.stringify({toasts, resultado: m ? m[0] : null, dialogCalls: window.__dialogCalls});
  })()`));
  console.log("INFO | toasts_ui |", JSON.stringify(ui.toasts));
  console.log("INFO | resultado_ui |", ui.resultado ?? "(no visible)");
  console.log("INFO | dialogos_interceptados |", ui.dialogCalls);
  exito = !!ui.resultado || ui.toasts.length > 0;
  if (exito) paso(true, "ui.importacion_flujo_completo", "botón real ejecutado con diálogo interceptado");
  else paso(false, "ui.importacion_flujo_completo", "sin resultado visible");
}

cerrar();
process.exit(exito ? 0 : 1);
