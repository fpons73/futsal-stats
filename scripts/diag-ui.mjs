// Diagnóstico en UNA sesión CDP persistente: enlaces, botones, estado del router.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

const diag = JSON.parse(await evaluar(`JSON.stringify({
  path: location.pathname,
  listo: document.readyState,
  enlaces: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')).filter(Boolean).slice(0, 20),
  botones: [...document.querySelectorAll('button')].length,
  h1: document.querySelector('h1')?.textContent ?? null,
  raizVacia: (document.getElementById('root')?.childElementCount ?? -1) === 0,
  bodyLen: document.body.innerText.length,
})`, ));
console.log(JSON.stringify(diag, null, 2));

// Intento de navegación + verificación en la misma sesión
const nav = await evaluar(`(function(){
  const a = document.querySelector('a[href="/importar"]');
  if (!a) return JSON.stringify({ok:false, motivo:"no hay <a href='/importar'> en el DOM"});
  a.click();
  return JSON.stringify({ok:true, texto: a.textContent.trim().slice(0,40)});
})()`);
console.log("nav:", nav);
await new Promise(r => setTimeout(r, 1200));
const despues = JSON.parse(await evaluar(`JSON.stringify({path: location.pathname, h1: document.querySelector('h1')?.textContent ?? null})`));
console.log("después:", JSON.stringify(despues));

cerrar();
