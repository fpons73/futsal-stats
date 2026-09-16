// Verificación de rendimiento de la página Jugadores en la app real:
// mide carga inicial (fetch + primer render), búsqueda con y sin resultados
// (incluye el debounce de 200ms por diseño) y el clic de paginación.
// Uso: node scripts/verificar-rendimiento-jugadores.mjs  (primera conexión CDP)
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

// Recarga completa y espera del shell
await evaluar(`location.reload(); 1`);
let arranco = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: document.querySelectorAll('a').length})`));
    if (st.enlaces > 5) { arranco = true; break; }
  } catch { /* recargando */ }
}
paso(arranco, "ui.app_arrancada", arranco ? "shell montado tras recarga" : "timeout esperando shell");
if (!arranco) { cerrar(); process.exit(1); }

// 1. Carga de la página Jugadores: navegar y esperar el contador "Mostrando..."
const carga = JSON.parse(await evaluar(`(async function(){
  const t0 = performance.now();
  location.hash = "#/jugadores";
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 50));
    const m = document.body.innerText.match(/Mostrando [^\\n]*/);
    if (m) return JSON.stringify({ ms: Math.round(performance.now() - t0), mostrando: m[0] });
  }
  return JSON.stringify({ ms: -1, mostrando: null });
})()`));
paso(carga.ms > 0 && carga.ms < 3000, "perf.carga_pagina", `${carga.ms}ms | ${carga.mostrando}`);

// 2. Búsqueda frecuente ("silva"): esperar a que el total cambie (debounce + filtro)
const buscar = (termino) => evaluar(`(async function(){
  const input = document.querySelector('input[placeholder="Buscar por nombre..."]');
  if (!input) return JSON.stringify({ err: 'input no encontrado' });
  const contador = () => (document.body.innerText.match(/de ([0-9.,]+) jugadores/) || [])[1];
  const antes = contador();
  const t0 = performance.now();
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(input, ${JSON.stringify(termino)});
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 100; i++) {
    await new Promise(r => setTimeout(r, 50));
    const ahora = contador();
    if (ahora && ahora !== antes) return JSON.stringify({ ms: Math.round(performance.now() - t0), antes, ahora });
  }
  return JSON.stringify({ ms: -1, antes, ahora: contador() });
})()`);

const b1 = JSON.parse(await buscar("silva"));
paso(b1.ms > 0 && b1.ms < 2000, "perf.busqueda_frecuente", `"silva": ${b1.antes} → ${b1.ahora} resultados en ${b1.ms}ms (incluye debounce 200ms)`);

// 3. Búsqueda sin resultados: el contador debe llegar a 0 sin colgarse
const b2 = JSON.parse(await buscar("zzzqqxxxnn"));
paso(b2.ahora === "0", "perf.busqueda_sin_resultados", `${b2.antes} → ${b2.ahora} en ${b2.ms}ms`);

// 4. Limpiar y esperar restauración del total completo
const b3 = JSON.parse(await buscar(""));
paso(b3.ahora === b1.antes || Number((b3.ahora || "0").replace(/\./g, "")) > 60000, "perf.limpieza_busqueda", `restaurado a ${b3.ahora} en ${b3.ms}ms`);

// 5. Paginación: clic "Siguiente" y esperar el indicador "página / total"
const pag = JSON.parse(await evaluar(`(async function(){
  const btn = [...document.querySelectorAll('button')].find(b => /Siguiente/i.test(b.textContent));
  if (!btn) return JSON.stringify({ err: 'botón Siguiente no encontrado' });
  const indicador = () => {
    const m = document.body.innerText.match(/(\\d+)\\s*\\/\\s*(\\d+[.]\\d+|\\d+)/);
    return m ? m[0] : null;
  };
  const antes = indicador();
  const t0 = performance.now();
  btn.click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 50));
    const ahora = indicador();
    if (ahora && ahora !== antes) return JSON.stringify({ ms: Math.round(performance.now() - t0), antes, ahora });
  }
  return JSON.stringify({ ms: -1, antes, ahora: indicador() });
})()`));
paso(pag.ms > 0 && pag.ms < 1000, "perf.paginacion", `${pag.antes} → ${pag.ahora} en ${pag.ms}ms`);

// 6. Salud del DOM: nodos totales y filas visibles
const salud = JSON.parse(await evaluar(`JSON.stringify({
  nodos: document.getElementsByTagName('*').length,
  filasVisibles: document.querySelectorAll('tbody tr').length
})`));
paso(salud.filasVisibles <= 100 && salud.nodos < 20000, "ui.dom_saludable",
  `filas visibles=${salud.filasVisibles} (paginación activa), nodos DOM=${salud.nodos}`);

cerrar();
