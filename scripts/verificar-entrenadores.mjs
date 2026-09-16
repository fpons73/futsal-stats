// Verifica en vivo la página Entrenadores: carga con paginación, badge y
// filtro "sin nacionalidad", búsqueda y cambio de página.
// Uso: node scripts/verificar-entrenadores.mjs  (primera conexión CDP)
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

let arranco = false;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({enlaces: document.querySelectorAll('a').length})`));
    if (st.enlaces > 5) { arranco = true; break; }
  } catch { /* cargando */ }
}
paso(arranco, "ui.app_arrancada", arranco ? "shell montado" : "timeout");
if (!arranco) { cerrar(); process.exit(1); }

// Carga de la página: esperar "Mostrando 1" (datos reales, no el estado vacío)
await evaluar(`location.hash = "#/entrenadores"; 1`);
const carga = JSON.parse(await evaluar(`(async function(){
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.includes('Mostrando 1')) return JSON.stringify({ ok: true, mostrando: (document.body.innerText.match(/Mostrando [^\\n]*/) || [])[0] });
  }
  return JSON.stringify({ ok: false, mostrando: (document.body.innerText.match(/t[eé]cnicos registrados/) || [])[0] ?? null });
})()`));
paso(carga.ok, "ui.pagina_entrenadores", carga.mostrando ?? "sin datos (timeout)");

// 1) Badge "sin nacionalidad"
const badge = JSON.parse(await evaluar(`(function(){
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('sin nacionalidad — revisar'));
  return JSON.stringify({ existe: !!b, texto: b ? b.textContent.trim() : null });
})()`));
paso(badge.existe, "ui.badge_sin_nacionalidad", badge.texto ?? "no encontrado");

// 2) Opción en el select de países
const opcion = JSON.parse(await evaluar(`(function(){
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('Todos los Países')));
  const opt = sel ? [...sel.options].find(o => o.value === 'sin') : null;
  return JSON.stringify({ existe: !!opt, texto: opt ? opt.textContent.trim() : null });
})()`));
paso(opcion.existe, "ui.opcion_select", opcion.texto ?? "no encontrada");

// 3) Filtro "sin": aviso + filas marcadas
const filtro = JSON.parse(await evaluar(`(async function(){
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'sin'));
  if (!sel) return JSON.stringify({ err: 'select' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, 'sin');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 50));
    const aviso = document.body.innerText.match(/Mostrando los ([0-9.,]+) entrenadores sin nacionalidad/);
    if (aviso) {
      const sinNac = [...document.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes('Sin nac.')).length;
      return JSON.stringify({ total: aviso[1], sinNac, visibles: document.querySelectorAll('tbody tr').length });
    }
  }
  return JSON.stringify({ total: null });
})()`));
paso(filtro.total !== null, "ui.filtro_sin_activo",
  `aviso: ${filtro.total ?? "no apareció"} | filas con "Sin nac.": ${filtro.sinNac ?? "?"}/${filtro.visibles ?? "?"}`);

// 4) Quitar filtro y verificar restauración
const quitar = JSON.parse(await evaluar(`(async function(){
  const b = [...document.querySelectorAll('button')].find(x => /Quitar filtro/i.test(x.textContent));
  if (!b) return JSON.stringify({ err: 'botón' });
  b.click();
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.includes('Mostrando 1')) return JSON.stringify({ ok: true });
  }
  return JSON.stringify({ ok: false });
})()`));
paso(quitar.ok, "ui.quitar_filtro", "restaurada la vista completa");

// 5) Búsqueda con debounce: el footer desaparece si hay ≤100 resultados (por diseño),
// así que la señal correcta es el estado de la tabla (filas / estado vacío).
const buscar = JSON.parse(await evaluar(`(async function(){
  const input = document.querySelector('input[placeholder="Buscar entrenador..."]');
  if (!input) return JSON.stringify({ err: 'input' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  const filas = () => document.querySelectorAll('tbody tr').length;
  const antes = filas();
  setter.call(input, 'velasco');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 50));
    const ahora = filas();
    if (ahora !== antes || document.body.innerText.includes('No se encontraron entrenadores'))
      return JSON.stringify({ antes, ahora, vacio: document.body.innerText.includes('No se encontraron entrenadores') });
  }
  return JSON.stringify({ antes, ahora: filas(), vacio: document.body.innerText.includes('No se encontraron entrenadores') });
})()`));
paso(buscar.ahora !== undefined && buscar.ahora !== buscar.antes && (buscar.ahora > 0 || buscar.vacio),
  "perf.busqueda", `"velasco": ${buscar.antes} filas → ${buscar.ahora} (vacío=${buscar.vacio})`);

// 6) Paginación: limpiar la búsqueda primero y pulsar Siguiente
const pag = JSON.parse(await evaluar(`(async function(){
  const input = document.querySelector('input[placeholder="Buscar entrenador..."]');
  if (input && input.value) {
    const st = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    st.call(input, '');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise(r => setTimeout(r, 600));
  }
  const btn = [...document.querySelectorAll('button')].find(x => /Siguiente/i.test(x.textContent));
  if (!btn) return JSON.stringify({ err: 'botón Siguiente' });
  const celda = () => (document.querySelector('tbody tr td:nth-child(2)')?.textContent ?? '').trim();
  const antes = celda();
  btn.click();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 50));
    const ahora = celda();
    if (ahora && ahora !== antes) return JSON.stringify({ ok: true, antes: antes.slice(0, 25), ahora: ahora.slice(0, 25) });
  }
  return JSON.stringify({ ok: false });
})()`));
paso(pag.ok, "perf.paginacion", `primera fila "${pag.antes ?? pag.err}" → "${pag.ahora ?? ""}"`);

cerrar();
