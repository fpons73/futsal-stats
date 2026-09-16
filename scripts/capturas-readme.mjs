// Capturas de pantalla para el README: Dashboard, Partidos y Pizarra del
// partido con más alineaciones. Requiere la app lanzada con CDP:
//   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" npm run tauri dev
// Uso: node scripts/capturas-readme.mjs
import { conectar, evaluar, cerrar, send } from "./cdp-eval.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const DIR = "docs/screenshots";
mkdirSync(DIR, { recursive: true });

/** Sondea una condición JS hasta que sea verdadera o agote el timeout. */
async function esperar(condicion, etiqueta, timeoutMs = 25000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
        if (await evaluar(condicion)) return;
        await new Promise((r) => setTimeout(r, 400));
    }
    throw new Error(`TIMEOUT esperando: ${etiqueta}`);
}

/** Captura el viewport actual a docs/screenshots/<nombre>.png */
async function captura(nombre) {
    const r = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(`${DIR}/${nombre}.png`, Buffer.from(r.data, "base64"));
    console.log("captura:", nombre);
}

await conectar();

// 1) Dashboard (la ruta inicial)
await esperar(
    `document.getElementById("root")?.children.length > 0 && document.body.innerText.length > 200`,
    "dashboard cargado",
);
await new Promise((r) => setTimeout(r, 2500)); // gráficos y cargas tardías
await captura("dashboard");

// 2) Partidos (tarjetas/paneles, no tabla: esperamos por nombre de equipo)
await evaluar(`location.hash = "#/partidos"; true`);
await esperar(
    `/Alzira|Cartagena|Manzanares/i.test(document.body.innerText)`,
    "tarjetas de partidos",
);
await new Promise((r) => setTimeout(r, 1200));
await captura("partidos");

// 3) Pizarra del partido con más alineaciones (266: O Parrulo vs Family Cash Alzira)
await evaluar(`location.hash = "#/partido/266"; true`);
await esperar(`/O Parrulo/i.test(document.body.innerText)`, "acta del partido 266");
await new Promise((r) => setTimeout(r, 1500));
const abierta = await evaluar(
    `(() => { const b = [...document.querySelectorAll("button")].find(b => /pizarra/i.test(b.textContent)); if (b) { b.click(); return true; } return false; })()`,
);
if (!abierta) throw new Error("pestaña Pizarra no encontrada en el acta");
await new Promise((r) => setTimeout(r, 2500)); // render del campo y chapas
await captura("pizarra");

cerrar();
console.log("OK capturas");
