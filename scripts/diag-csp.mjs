// Diagnóstico de la CSP dentro del webview real de futsal-stats (CDP).
// Uso: node scripts/diag-csp.mjs  (requiere la app lanzada con CDP 9333)
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

const meta = await evaluar(
  `document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || 'SIN META CSP'`
);
console.log("META CSP:", meta, "\n");

const resultado = await evaluar(`(async () => {
  window.__viol = [];
  window.addEventListener('securitypolicyviolation', e =>
    window.__viol.push(e.violatedDirective + ' → ' + e.blockedURL));
  let fetchEstado = 'sin probar';
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/');
    fetchEstado = 'PERMITIDO (HTTP ' + r.status + ')';
  } catch (err) {
    fetchEstado = 'BLOQUEADO: ' + err.message;
  }
  await new Promise(r => setTimeout(r, 1500));
  return JSON.stringify({
    fetchGemini: fetchEstado,
    violaciones: window.__viol,
    fuenteInter: document.fonts.check('16px Inter') ? 'cargada' : 'NO cargada',
    hojasEstilo: document.styleSheets.length,
    appRenderizada: (document.getElementById('root')?.innerHTML ?? '').length > 100,
  }, null, 2);
})()`);

console.log(resultado);
await cerrar();
