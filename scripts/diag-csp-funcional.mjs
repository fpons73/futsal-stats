// Prueba funcional de la CSP: cabecera presente, host permitido vs bloqueado.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

const r = await evaluar(`(async () => {
  const viol = [];
  window.addEventListener('securitypolicyviolation', e => viol.push(e.violatedDirective + ' → ' + e.blockedURL));
  let cspCabecera = null;
  try {
    const resp = await fetch(location.href);
    cspCabecera = resp.headers.get('content-security-policy');
  } catch (e) { cspCabecera = 'no legible: ' + e.message; }
  let bloqueado = 'sin probar';
  try {
    await fetch('https://example.com', { mode: 'no-cors' });
    bloqueado = 'PERMITIDO (¡mal!)';
  } catch (e) {
    bloqueado = 'bloqueado: ' + e.message;
  }
  await new Promise(r => setTimeout(r, 1200));
  return JSON.stringify({
    origen: location.origin,
    cspCabecera: cspCabecera ? cspCabecera.slice(0, 120) + '…' : null,
    fetchHostProhibido: bloqueado,
    violaciones: viol,
  }, null, 2);
})()`);

console.log(r);
await cerrar();
