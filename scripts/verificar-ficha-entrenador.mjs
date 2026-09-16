// Verifica en vivo la trayectoria de la ficha de Entrenadores:
// 1) entrenador con equipo_actual+títulos (Javi Rodríguez → FC Barcelona, 8)
// 2) entrenador sin meta → placeholder honesto (no "próximamente")
// Uso: node scripts/verificar-ficha-entrenador.mjs  (primera conexión CDP)
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

// Cargar la página y esperar datos
await evaluar(`location.hash = "#/entrenadores"; 1`);
const carga = JSON.parse(await evaluar(`(async function(){
  for (let i = 0; i < 200; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.includes('Mostrando 1')) return JSON.stringify({ ok: true });
  }
  return JSON.stringify({ ok: false });
})()`));
paso(carga.ok, "ui.pagina_entrenadores", "cargada");

// Abrir la ficha de un entrenador por su nombre deportivo y leer la trayectoria
const abrirFicha = (nombre) => evaluar(`(async function(){
  const filas = [...document.querySelectorAll('tbody tr')];
  let fila = filas.find(tr => tr.textContent.includes(${JSON.stringify(nombre)}));
  let paginaActual = 1;
  while (!fila) {
    const sig = [...document.querySelectorAll('button')].find(b => /Siguiente/i.test(b.textContent) && !b.disabled);
    if (!sig || paginaActual >= 60) return JSON.stringify({ err: 'fila no encontrada en 60 páginas' });
    sig.click();
    paginaActual++;
    await new Promise(r => setTimeout(r, 120));
    fila = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(${JSON.stringify(nombre)}));
  }
  const ojo = fila.querySelector('button');
  ojo.click();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 50));
    const tray = document.body.innerText.toLowerCase().includes('trayectoria');
    if (tray) {
      const texto = document.body.innerText;
      const eqActual = texto.toLowerCase().includes('equipo actual');
      return JSON.stringify({
        ok: true,
        tieneEquipo: eqActual,
        mencion: texto.includes(${JSON.stringify(nombre)}),
        contenido: (texto.match(/trayectoria[\\s\\S]{0,220}/i) || [''])[0].replace(/\\s+/g, ' ').slice(0, 200),
      });
    }
  }
  return JSON.stringify({ err: 'ficha no abrió' });
})()`);

// 1) Javi Rodríguez: FC Barcelona + 8 títulos
const javi = JSON.parse(await abrirFicha("Javi Rodríguez"));
paso(javi.ok === true && javi.tieneEquipo === true && /FC Barcelona/.test(javi.contenido ?? ""),
  "ficha.con_equipo", (javi.contenido ?? javi.err ?? "").slice(0, 150));

// Cerrar la ficha (Escape) y abrir la de un entrenador sin meta (primera fila)
await evaluar(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); 1`);
await new Promise(r => setTimeout(r, 600));

const sinMeta = JSON.parse(await evaluar(`(async function(){
  const fila = document.querySelector('tbody tr');
  if (!fila) return JSON.stringify({ err: 'sin filas' });
  const nombre = fila.querySelector('td:nth-child(2)')?.textContent.trim().slice(0, 20) ?? '?';
  fila.querySelector('button').click();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.toLowerCase().includes('trayectoria')) {
      const texto = document.body.innerText;
      return JSON.stringify({ ok: true, nombre, tieneEquipo: texto.toLowerCase().includes('equipo actual'),
        placeholder: texto.includes('Equipo actual no disponible') });
    }
  }
  return JSON.stringify({ err: 'ficha no abrió' });
})()`));
paso(sinMeta.ok === true && sinMeta.placeholder === true,
  "ficha.sin_meta_placeholder", `${sinMeta.nombre ?? "?"}: placeholder honesto=${sinMeta.placeholder}`);

// 2º check de Javi: el contador de títulos
const titulos = JSON.parse(await evaluar(`(async function(){
  const filas = [...document.querySelectorAll('tbody tr')];
  let fila = filas.find(tr => tr.textContent.includes('Javi Rodríguez'));
  let paginaActual = 1;
  while (!fila) {
    const sig = [...document.querySelectorAll('button')].find(b => /Siguiente/i.test(b.textContent) && !b.disabled);
    if (!sig || paginaActual >= 60) return JSON.stringify({ err: 'no encontrado' });
    sig.click(); paginaActual++;
    await new Promise(r => setTimeout(r, 120));
    fila = [...document.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes('Javi Rodríguez'));
  }
  fila.querySelector('button').click();
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 50));
    if (document.body.innerText.toLowerCase().includes('equipo actual')) {
      const m = document.body.innerText.match(/(\\d+) t[ií]tulos?/);
      return JSON.stringify({ titulos: m ? m[1] : null });
    }
  }
  return JSON.stringify({ titulos: null });
})()`));
paso(titulos.titulos === "8", "ficha.titulos", `Javi Rodríguez: ${titulos.titulos ?? "?"} títulos (esperado 8)`);

cerrar();
