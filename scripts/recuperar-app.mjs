// Recupera la app si quedó atascada en la splash: recarga completa y diagnostica.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

console.log("antes:", await evaluar(`JSON.stringify({path: location.pathname, splash: !!document.getElementById('splash-estatica'), rootHijos: document.getElementById('root')?.childElementCount ?? -1, puente: !!window.__TAURI_INTERNALS__})`));

// Recarga completa: re-ejecuta main.tsx desde cero
await evaluar(`(function(){ location.reload(); return "recargando"; })()`);
await new Promise(r => setTimeout(r, 4000));

// Sondear hasta 25s a ver si React monta (la splash desaparece / root gana hijos)
let estado = null;
for (let i = 0; i < 10; i++) {
  await new Promise(r => setTimeout(r, 2500));
  try {
    estado = JSON.parse(await evaluar(`JSON.stringify({
      splash: !!document.getElementById('splash-estatica'),
      rootHijos: document.getElementById('root')?.childElementCount ?? -1,
      enlaces: [...document.querySelectorAll('a')].length,
      overlayVite: !!document.querySelector('vite-error-overlay'),
    })`));
    console.log(`sondeo ${i + 1}:`, JSON.stringify(estado));
    if (!estado.splash && estado.rootHijos > 2) break;
  } catch (e) {
    console.log(`sondeo ${i + 1}: conexión perdida (${e.message.slice(0, 60)})`);
    break;
  }
}

cerrar();
if (estado && !estado.splash && estado.rootHijos > 2) {
  console.log("APP_RECUPERADA");
} else {
  console.log("APP_ATASCADA_EN_SPLASH");
  process.exitCode = 1;
}
