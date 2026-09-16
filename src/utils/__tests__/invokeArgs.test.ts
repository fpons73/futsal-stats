import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Regresión del guardado del acta: los ids que vienen de la ruta
 * (#/partido/266) son STRINGS y los comandos Tauri exigen i64 estrictos.
 * Tauri 2 rechaza `invalid type: string "266", expected i64`, así que todo
 * id de ruta pasado a un command debe envolverse en Number(...).
 *
 * Test estático (sin BD): en DetallePartido, el único command de la app con
 * args numéricos, no puede aparecer un argumento de invoke en crudo.
 */

const RAIZ = process.cwd();

function ficherosFuente(dir: string): string[] {
    const out: string[] = [];
    for (const nombre of readdirSync(dir, { withFileTypes: true })) {
        const ruta = join(dir, nombre.name);
        if (nombre.isDirectory()) {
            if (nombre.name === "__tests__") continue;
            out.push(...ficherosFuente(ruta));
        } else if (/\.(ts|tsx)$/.test(nombre.name) && !nombre.name.endsWith(".d.ts")) {
            out.push(ruta);
        }
    }
    return out;
}

describe("args de comandos Tauri (regresión i64 vs string de ruta)", () => {
    it("ningún invoke pasa partidoId en crudo (debe ser Number(id))", () => {
        const problemas: string[] = [];
        for (const ruta of ficherosFuente(join(RAIZ, "src"))) {
            const relativo = ruta.slice(RAIZ.length);
            readFileSync(ruta, "utf-8").split("\n").forEach((linea, i) => {
                if (/partidoId\s*:\s*id\b/.test(linea) && !/Number\(\s*id\s*\)/.test(linea)) {
                    problemas.push(`${relativo}:${i + 1} — ${linea.trim()}`);
                }
            });
        }
        expect(problemas, "invoke con id de ruta sin Number() — Tauri lo rechaza").toEqual([]);
    });

    it("el guardado del acta usa el comando transaccional con Number(id)", () => {
        const fuente = readFileSync(join(RAIZ, "src/pages/DetallePartido.tsx"), "utf-8");
        expect(fuente).toContain('invoke("guardar_acta_transaccion"');
        expect(fuente).toContain("partidoId: Number(id)");
    });
});
