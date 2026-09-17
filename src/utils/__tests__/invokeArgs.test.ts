import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Todos los comandos registrados en el invoke_handler de lib.rs. */
function comandosRust(): string[] {
    const lib = readFileSync(join(RAIZ, "src-tauri/src/lib.rs"), "utf-8");
    const bloque = lib.match(/invoke_handler\(tauri::generate_handler!\[([\s\S]*?)\]\)/);
    if (!bloque) throw new Error("no se encontró invoke_handler en lib.rs");
    return [...bloque[1].matchAll(/([a-z_0-9]+)/g)].map((m) => m[1]);
}

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

    it("todo comando invocado desde el frontend está registrado en lib.rs", () => {
        const registrados = new Set(comandosRust());
        const invocados: Array<{ comando: string; sitio: string }> = [];

        for (const ruta of ficherosFuente(join(RAIZ, "src"))) {
            const relativo = ruta.slice(RAIZ.length);
            readFileSync(ruta, "utf-8").split("\n").forEach((linea, i) => {
                for (const m of linea.matchAll(/invoke(?:<[^>]*>)?\(\s*["']([a-z_0-9]+)["']/g)) {
                    invocados.push({ comando: m[1], sitio: `${relativo}:${i + 1}` });
                }
            });
        }

        expect(invocados.length, "debe haber comandos invocados que auditar").toBeGreaterThan(0);
        const noRegistrados = invocados.filter((i) => !registrados.has(i.comando));
        expect(
            noRegistrados.map((i) => `${i.sitio} → "${i.comando}"`),
            "invokes de comandos no registrados en generate_handler — fallarían en runtime",
        ).toEqual([]);
    });

    it("todo comando registrado salvo los que solo usan scripts E2E se invoca desde src/", () => {
        // Dirección inversa: un comando muerto en lib.rs (registrado y sin uso)
        // es señal de API obsoleta. fetch_html se excluye porque es punto de
        // partida documentado para tooling externo.
        const registrados = comandosRust().filter((c) => c !== "fetch_html");
        const invocados = new Set<string>();
        for (const ruta of ficherosFuente(join(RAIZ, "src"))) {
            const contenido = readFileSync(ruta, "utf-8");
            for (const m of contenido.matchAll(/invoke(?:<[^>]*>)?\(\s*["']([a-z_0-9]+)["']/g)) {
                invocados.add(m[1]);
            }
        }
        const muertos = registrados.filter((c) => !invocados.has(c));
        expect(muertos, "comandos registrados sin uso en el frontend").toEqual([]);
    });
});
