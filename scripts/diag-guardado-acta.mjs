// Reproduce el guardado del acta del partido 266 en la app viva y captura el
// error real del console.error (hoy el toast solo dice "Error al guardar...").
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

// 1) Instala el interceptor de errores ANTES de nada y navega al partido.
await evaluar(`
  window.__errs = [];
  console.error = (...a) => { window.__errs.push(a.map(x => typeof x === "string" ? x : JSON.stringify(x)).join(" ")); };
  location.hash = "#/partido/266"; true
`);
await new Promise((r) => setTimeout(r, 4000));

const estado = await evaluar(`JSON.stringify({
  enActa: /O Parrulo/i.test(document.body.innerText),
  botones: [...document.querySelectorAll("button")].filter(b => /guardar/i.test(b.textContent)).map(b => b.textContent.trim()),
  errs: window.__errs,
})`);
console.log("ESTADO:", estado);

// 2) Pulsa Guardar Acta y espera el resultado.
await evaluar(`
  (() => { const b = [...document.querySelectorAll("button")].find(b => /guardar acta/i.test(b.textContent)); if (b) b.click(); return !!b; })()
`);
await new Promise((r) => setTimeout(r, 5000));

const resultado = await evaluar(`JSON.stringify({
  errs: window.__errs,
  toasts: [...document.querySelectorAll("body *")].filter(e => e.children.length === 0 && /error|guardad/i.test(e.textContent)).map(e => e.textContent.trim().slice(0, 120)),
})`);
console.log("RESULTADO:", resultado);

cerrar();
