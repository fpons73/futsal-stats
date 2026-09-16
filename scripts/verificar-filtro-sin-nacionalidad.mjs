// Verifica en vivo el filtro "sin nacionalidad" de la página Jugadores:
// badge con el total, opción del select, aviso al activar y conteo correcto.
// Uso: node scripts/verificar-filtro-sin-nacionalidad.mjs  (primera conexión CDP)
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const paso = (ok, nombre, detalle) => console.log(`${ok ? "PASS" : "FAIL"} | ${nombre} | ${detalle}`);

await conectar();

// Shell
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

// Navegar a Jugadores y esperar la CARGA REAL ("Mostrando..." solo aparece con datos)
await evaluar(`location.hash = "#/jugadores"; 1`);
const lista = JSON.parse(await evaluar(`(async function(){
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.includes('Mostrando 1')) return JSON.stringify({ ok: true, total: (document.body.innerText.match(/de ([0-9.,]+) jugadores/) || [])[1] });
  }
  return JSON.stringify({ ok: false, total: null });
})()`));
paso(lista.ok, "ui.pagina_jugadores", `cargada con datos: ${lista.total ?? "sin contador"}`);

// 1) Badge presente con el total
const badge = JSON.parse(await evaluar(`(function(){
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('sin nacionalidad — revisar'));
  return JSON.stringify({ existe: !!b, texto: b ? b.textContent.trim() : null });
})()`));
paso(badge.existe, "ui.badge_sin_nacionalidad", badge.texto ?? "no encontrado");

// 2) Opción en el select de países (el que contiene 'Todos los Países')
const opcion = JSON.parse(await evaluar(`(function(){
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent.includes('Todos los Países')));
  const opt = sel ? [...sel.options].find(o => o.value === 'sin') : null;
  return JSON.stringify({ existe: !!opt, texto: opt ? opt.textContent.trim() : null });
})()`));
paso(opcion.existe, "ui.opcion_select", opcion.texto ?? "no encontrada");

// 3) Activar el filtro en el select CORRECTO y esperar el aviso + conteo
const filtro = JSON.parse(await evaluar(`(async function(){
  const sel = [...document.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === 'sin'));
  if (!sel) return JSON.stringify({ total: null, quitar: false, err: 'select no encontrado' });
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(sel, 'sin');
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 50));
    const aviso = document.body.innerText.match(/Mostrando las ([0-9.,]+) personas sin nacionalidad/);
    if (aviso) return JSON.stringify({ total: aviso[1],
      quitar: !!([...document.querySelectorAll('button')].find(b => /Quitar filtro/i.test(b.textContent))) });
  }
  return JSON.stringify({ total: null, quitar: false });
})()`));
paso(filtro.total !== null, "ui.filtro_activo",
  `aviso: ${filtro.total ?? "no apareció"} personas | botón Quitar filtro=${filtro.quitar}`);

// 4) Filas visibles con el icono "Sin nac."
const filas = JSON.parse(await evaluar(`(function(){
  const sin = [...document.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes('Sin nac.')).length;
  return JSON.stringify({ visibles: document.querySelectorAll('tbody tr').length, conSinNac: sin });
})()`));
paso(filas.conSinNac > 0 && filas.visibles <= 100, "ui.filas_marcadas",
  `${filas.conSinNac}/${filas.visibles} filas visibles con el icono "Sin nac."`);

cerrar();
