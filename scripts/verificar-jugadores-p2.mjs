// Segunda medición de Jugadores: estado vacío, restauración y paginación
// (detectando el cambio por el contenido del tbody, no por textos ambiguos).
// Uso: node scripts/verificar-jugadores-p2.mjs  (primera conexión CDP)
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

// Recarga + shell + navegación explícita a Jugadores
await evaluar(`location.reload(); 1`);
let arranco = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: document.querySelectorAll('a').length})`));
    if (st.enlaces > 5) { arranco = true; break; }
  } catch { /* recargando */ }
}
paso(arranco, "ui.app_arrancada", arranco ? "shell montado" : "timeout");
if (!arranco) { cerrar(); process.exit(1); }

await evaluar(`location.hash = "#/jugadores"; 1`);
const lista = JSON.parse(await evaluar(`(async function(){
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 50));
    const m = document.body.innerText.match(/Mostrando [^\\n]*/);
    if (m) return JSON.stringify({ mostrando: m[0] });
  }
  return JSON.stringify({ mostrando: null });
})()`));
paso(!!lista.mostrando, "ui.pagina_jugadores", lista.mostrando ?? "sin contador");

// 1) Estado vacío con búsqueda sin resultados
const vacio = JSON.parse(await evaluar(`(async function(){
  const input = document.querySelector('input[placeholder="Buscar por nombre..."]');
  if (!input) return JSON.stringify({ err: 'input' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const t0 = performance.now();
  setter.call(input, 'zzzqqxxxnn');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.includes('No se encontraron jugadores'))
      return JSON.stringify({ ms: Math.round(performance.now() - t0), ok: true });
  }
  return JSON.stringify({ ms: -1, ok: false });
})()`));
paso(vacio.ok && vacio.ms >= 0 && vacio.ms < 2000, "perf.busqueda_sin_resultados",
  `mensaje de estado vacío en ${vacio.ms}ms`);

// 2) Restauración al limpiar
const restaurar = JSON.parse(await evaluar(`(async function(){
  const input = document.querySelector('input[placeholder="Buscar por nombre..."]');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const t0 = performance.now();
  setter.call(input, '');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 50));
    const m = document.body.innerText.match(/de ([0-9.,]+) jugadores/);
    if (m && Number(m[1].replace(/[.,]/g, '')) > 60000)
      return JSON.stringify({ ms: Math.round(performance.now() - t0), total: m[1] });
  }
  return JSON.stringify({ ms: -1, total: null });
})()`));
paso(restaurar.ms >= 0 && restaurar.ms < 2000, "perf.limpieza_busqueda",
  `restaurado a ${restaurar.total} en ${restaurar.ms}ms`);

// 3) Paginación: el contenido del tbody debe cambiar al pulsar "Siguiente"
const pag = JSON.parse(await evaluar(`(async function(){
  const btn = [...document.querySelectorAll('button')].find(b => /Siguiente/i.test(b.textContent));
  if (!btn) return JSON.stringify({ err: 'botón Siguiente' });
  const celda = () => (document.querySelector('tbody tr td:nth-child(2)')?.textContent ?? '').trim();
  const antes = celda();
  const t0 = performance.now();
  btn.click();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 50));
    const ahora = celda();
    if (ahora && ahora !== antes)
      return JSON.stringify({ ms: Math.round(performance.now() - t0), antes, ahora,
        mostrando: (document.body.innerText.match(/Mostrando [^\\n]*/) || [])[0] });
  }
  return JSON.stringify({ ms: -1, antes, ahora: celda() });
})()`));
paso(pag.ms >= 0 && pag.ms < 1000, "perf.paginacion",
  `primera fila "${pag.antes}" → "${pag.ahora}" en ${pag.ms}ms | ${pag.mostrando ?? ""}`);

cerrar();
