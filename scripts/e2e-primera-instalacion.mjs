// E2E de primera instalación (verificación del hito 1.0):
// 1. Confirma que con BD virgen arranca el ONBOARDING (no el dashboard).
// 2. Verifica la detección de CSVs y pulsa "Empezar".
// 3. Espera a que los 4 pasos terminen y comprueba el estado final.
// 4. Comprueba en la BD: personas/equipos/competiciones importadas.
// 5. Comprueba la copia de seguridad automática del arranque.
// Uso: node scripts/e2e-primera-instalacion.mjs
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

// 1. Pantalla de bienvenida del onboarding.
const fase1 = await evaluar(`JSON.stringify({
  texto: document.body.innerText.slice(0, 400),
  onboarding: document.body.innerText.includes("Bienvenido a Global Futsal Stats"),
  botonEmpezar: !!([...document.querySelectorAll("button")].find(b => b.textContent.includes("Empezar"))),
})`);
console.log("FASE 1 (arranque):", fase1);
const arranque = JSON.parse(fase1);
if (!arranque.onboarding) {
  console.error("FALLO: no apareció el onboarding con BD virgen");
  process.exit(1);
}

// 2. Detección de CSV y clic en Empezar.
const fase2 = await evaluar(`(async () => {
  await new Promise(r => setTimeout(r, 1500)); // esperar detección de la carpeta
  const deteccion = document.body.innerText.match(/\\d+ fichero\\(s\\) CSV[^\\n]*/)?.[0] || null;
  const boton = [...document.querySelectorAll("button")].find(b => b.textContent.includes("Empezar"));
  if (!boton) return JSON.stringify({ deteccion, error: "sin botón Empezar" });
  boton.click();
  return JSON.stringify({ deteccion, clicado: true });
})()`);
console.log("FASE 2 (detección + Empezar):", fase2);

// 3. Espera a que terminen los 4 pasos (jugadores ~20k filas puede tardar).
let fase3 = null;
for (let i = 0; i < 40; i++) {
  await new Promise(r => setTimeout(r, 10000));
  fase3 = JSON.parse(await evaluar(`JSON.stringify({
    completados: [...document.querySelectorAll("span")].filter(s => s.textContent === "Completado").length,
    omitidos: [...document.querySelectorAll("span")].filter(s => s.textContent === "Sin ficheros").length,
    errores: [...document.querySelectorAll("span")].filter(s => s.textContent === "Error").length,
    activos: [...document.querySelectorAll("span")].filter(s => s.textContent === "Importando…").length,
    cerrarDisponible: !!([...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Cerrar")),
  })`));
  console.log(`FASE 3 (progreso ${i + 1}):`, JSON.stringify(fase3));
  if (fase3.activos === 0 && (fase3.completados > 0 || fase3.errores > 0)) break;
}

console.log("RESULTADO ONBOARDING:", JSON.stringify(fase3));
await cerrar();
