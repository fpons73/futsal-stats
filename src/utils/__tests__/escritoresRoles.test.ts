import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Test de regresión de la migración 13 (normalizar_roles_persona).
 *
 * Historia: las seeds y pantallas antiguas escribían Persona.roles como array
 * JSON (["Jugador"], 565 filas en producción) y alguna ruta en minúscula
 * ('jugador'). La migración 13 normalizó la BD y los escritores se corrigieron;
 * este test evita que una pantalla futura vuelva a introducir esos formatos.
 *
 * Es una auditoría estática del código fuente (no necesita BD): recorre los
 * .ts/.tsx de src/ y comprueba dos cosas:
 *   1. Que no exista ningún patrón escritor legacy (JSON de roles, minúsculas).
 *   2. Que todo INSERT INTO Persona declare explícitamente la columna roles
 *      (un INSERT sin roles moriría por NOT NULL — y de hecho ya destapó un
 *      bug real: el árbol rápido de árbitros insertaba en 'cargo', columna
 *      que no existe).
 */

// vitest ejecuta desde la raíz del proyecto (npm test / CI).
const RAIZ = process.cwd();

/** Ficheros fuente auditados: todo src/ menos los propios tests. */
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

/** Patrones prohibidos: cómo NO se debe escribir un rol. */
const PATRONES_PROHIBIDOS: Array<[RegExp, string]> = [
    // JSON.stringify(["Jugador"]) y variantes (con o sin espacios, cualquier caso)
    [
        /JSON\.stringify\(\s*\[\s*["'](?:jugador|entrenador|arbitro)["']\s*\]\s*\)/i,
        "rol serializado como array JSON (formato legacy de las seeds)",
    ],
    // Literales en minúscula entre comillas: 'jugador', "entrenador"…
    // (no pilla identificadores como form.arbitro ni claves sin comillas)
    [/["']jugador["']/, "rol 'jugador' en minúscula (debe ser 'Jugador')"],
    [/["']entrenador["']/, "rol 'entrenador' en minúscula (debe ser 'Entrenador')"],
    [/["']arbitro["']/, "rol 'arbitro' en minúscula (debe ser 'Arbitro')"],
];

describe("escritores de Persona.roles (regresión migración 13)", () => {
    it("ningún fichero fuente escribe roles en formato legacy", () => {
        const violaciones: string[] = [];

        for (const ruta of ficherosFuente(join(RAIZ, "src"))) {
            const contenido = readFileSync(ruta, "utf-8");
            const relativo = ruta.slice(RAIZ.length);

            contenido.split("\n").forEach((linea, i) => {
                for (const [patron, motivo] of PATRONES_PROHIBIDOS) {
                    if (patron.test(linea)) {
                        violaciones.push(`${relativo}:${i + 1} — ${motivo}: ${linea.trim().slice(0, 120)}`);
                    }
                }
            });
        }

        expect(violaciones, "escritores con formato legacy detectados").toEqual([]);
    });

    it("todo INSERT INTO Persona declara explícitamente la columna roles", () => {
        const problemas: string[] = [];

        for (const ruta of ficherosFuente(join(RAIZ, "src"))) {
            const contenido = readFileSync(ruta, "utf-8");
            const relativo = ruta.slice(RAIZ.length);

            // Columnas del INSERT: primer paréntesis tras la tabla (sin anidar).
            for (const m of contenido.matchAll(/INSERT\s+INTO\s+Persona\s*\(([^)]*)\)/gis)) {
                const columnas = m[1].toLowerCase();
                if (!columnas.split(",").some((c) => c.trim() === "roles")) {
                    problemas.push(
                        `${relativo}: INSERT INTO Persona sin columna 'roles' (columnas: ${m[1].replace(/\s+/g, " ").trim()})`,
                    );
                }
            }
        }

        expect(problemas, "INSERT INTO Persona que omiten roles").toEqual([]);
    });

    it("los importadores masivos escriben los roles canónicos planos", () => {
        const importador = readFileSync(join(RAIZ, "src/utils/importadorMasivo.ts"), "utf-8");
        expect(importador).toContain("'Jugador'");
        expect(importador).toContain("'Entrenador'");
        // Sin JSON de roles ni minúsculas (refuerzo local del test global).
        expect(importador).not.toMatch(/JSON\.stringify\(\s*\[\s*["'](?:jugador|entrenador|arbitro)["']/i);
    });
});
