import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Recorrido recursivo de src buscando archivos .ts/.tsx. */
function archivosSrc(dir: string): string[] {
    const salida: string[] = [];
    for (const entrada of readdirSync(dir)) {
        const ruta = join(dir, entrada);
        if (statSync(ruta).isDirectory()) {
            salida.push(...archivosSrc(ruta));
        } else if (entrada.endsWith(".ts") || entrada.endsWith(".tsx")) {
            salida.push(ruta);
        }
    }
    return salida;
}

const dirSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
// Se excluyen los propios tests: este archivo (y otros) contienen los literales
// "confirm(" / "alert(" en sus aserciones de sanity, y los tests no son código
// de producción que pueda abrir diálogos nativos.
const archivos = archivosSrc(dirSrc).filter(
    (a) => !a.includes("__tests__") && !/\.test\.tsx?$/.test(a)
);

/** Quita los comentarios multilínea de JS para no confundir menciones
    documentales ("sustituye a confirm() nativo") con llamadas reales. */
function sinComentarios(codigo: string): string {
    return codigo.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Llamadas a diálogos nativos del navegador: window.confirm, window.alert,
    globalThis.confirm/alert y las formas desnudas confirm(...) / alert(...). */
const patron = /\b(?:window\.|globalThis\.)?(?:confirm|alert)\s*\(/;

describe("Sin diálogos nativos del navegador", () => {
    it("el patrón detecta confirm/alert nativos (sanity del propio test)", () => {
        expect("window.confirm('x')").toMatch(patron);
        expect("window.alert('x')").toMatch(patron);
        expect("globalThis.confirm('x')").toMatch(patron);
        expect("confirm('x')").toMatch(patron);
        expect("alert('x')").toMatch(patron);
    });

    it("el patrón NO da falsos positivos con el vocabulario de la app", () => {
        expect("confirmar({ mensaje: 'x' })").not.toMatch(patron);
        expect("onConfirmar()").not.toMatch(patron);
        expect("useConfirm()").not.toMatch(patron);
        expect("<AlertTriangle size={18} />").not.toMatch(patron);
        expect("console.error('alerta')").not.toMatch(patron);
    });

    it("hay archivos que cubrir (sanity del propio test)", () => {
        expect(archivos.length).toBeGreaterThan(0);
    });

    it.each(archivos)("%s no usa confirm()/alert() nativos", (archivo) => {
        const codigo = sinComentarios(readFileSync(archivo, "utf-8"));
        expect(codigo, `${archivo} usa un diálogo nativo del navegador (confirm/alert)`).not.toMatch(patron);
    });
});