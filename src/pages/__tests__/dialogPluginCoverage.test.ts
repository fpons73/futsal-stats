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
const archivos = archivosSrc(dirSrc);

/** Archivos que usan el plugin de diálogo nativo (open/save). */
const conPlugin = archivos.filter((a) =>
    /import\s*\{[^}]*\}\s*from\s*["']@tauri-apps\/plugin-dialog["']/.test(readFileSync(a, "utf-8"))
);

describe("Uso del plugin de diálogo nativo", () => {
    it("hay archivos que cubrir (sanity del propio test)", () => {
        expect(archivos.length).toBeGreaterThan(0);
    });

    it("al menos un archivo importa el plugin (el regex de la guarda no es un no-op)", () => {
        expect(conPlugin.length).toBeGreaterThan(0);
    });

    it.each(conPlugin)("%s solo importa open o save del plugin de diálogo", (archivo) => {
        const codigo = readFileSync(archivo, "utf-8");
        const importacion = codigo.match(/import\s*\{([^}]*)\}\s*from\s*["']@tauri-apps\/plugin-dialog["']/);
        // El filtro conPlugin ya garantiza que existe; defensa extra por si cambia.
        if (!importacion) return;

        const nombres = importacion[1]
            .split(",")
            .map((n) => n.trim())
            .filter(Boolean)
            // Acepta alias "open as abrirDialogo": el símbolo importado es el de
            // la izquierda; el alias local es un detalle de nombres.
            .map((n) => n.replace(/^\w+\s+as\s+\w+$/, (m) => m.split(/\s+as\s+/)[0]));
        for (const nombre of nombres) {
            expect(["open", "save"], `${archivo} importa "${nombre}" del plugin de diálogo nativo`).toContain(nombre);
        }
    });
});