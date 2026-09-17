// Tests del catálogo de países (seed): idempotencia, no-sobreescritura de
// países existentes, vinculación de confederaciones y Desconocido siempre
// presente. La BD falsa replica las reglas reales que importan al seed:
// UNIQUE(nombre) en Pais y la existencia de Confederacion con codigo único.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { seedPaises, PAIS_DESCONOCIDO } from "../seedPaises";

function crearBdFalsa() {
    const paises: Array<{ id: number; nombre: string; iso2: string; iso3: string; confederacion_id: number | null }> = [];
    const confederaciones: Array<{ id: number; codigo: string; nombre?: string }> = [];
    let siguienteId = 1;
    let siguienteConf = 1;
    const db = {
        select: vi.fn(async (sql: string, params: any[] = []) => {
            if (sql.includes("confederacion_id FROM Pais")) {
                return structuredClone(
                    paises.map((p) => ({ id: p.id, nombre: p.nombre, confederacion_id: p.confederacion_id })),
                );
            }
            if (sql.includes("FROM Pais")) return structuredClone(paises);
            if (sql.includes("FROM Confederacion")) {
                // seedConfederacionesFutsal filtra por codigo: respetar el WHERE.
                if (sql.includes("WHERE codigo")) {
                    return confederaciones.filter((c) => c.codigo === params[0]);
                }
                return structuredClone(confederaciones);
            }
            throw new Error("SELECT no previsto: " + sql);
        }),
        execute: vi.fn(async (sql: string, params: any[] = []) => {
            if (sql.includes("UPDATE Pais SET confederacion_id")) {
                const [confId, id] = params;
                const p = paises.find((x) => x.id === id);
                if (p) p.confederacion_id = confId;
                return;
            }
            if (sql.includes("INSERT INTO Pais")) {
                const [nombre, iso2, iso3, confId] = params;
                if (paises.some((p) => p.nombre === nombre))
                    throw new Error("UNIQUE constraint failed: Pais.nombre");
                paises.push({ id: siguienteId++, nombre, iso2, iso3, confederacion_id: confId ?? null });
                return;
            }
            if (sql.includes("INSERT INTO Confederacion")) {
                const [nombre, codigo] = params;
                // Regla real: UNIQUE(codigo). Reinsertar el mismo código es un
                // no-op idempotente (ignora el nombre distinto, como SQLite).
                if (confederaciones.some((c) => c.codigo === codigo)) return;
                confederaciones.push({ id: siguienteConf++, codigo, nombre });
                return;
            }
            throw new Error("INSERT no previsto: " + sql);
        }),
    };
    return { db, paises, confederaciones };
}

const bd = vi.hoisted(() => crearBdFalsa());

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: { load: vi.fn(async () => bd.db) },
}));

beforeEach(() => {
    bd.paises.length = 0;
    bd.confederaciones.length = 0;
});

describe("seedPaises", () => {
    it("siembra el catálogo completo más Desconocido en BD virgen", async () => {
        const r = await seedPaises();

        expect(r.añadidos).toBeGreaterThan(200);
        expect(r.yaExistentes).toBe(0);
        const nombres = bd.paises.map((p) => p.nombre);
        expect(nombres).toContain("España");
        expect(nombres).toContain("Portugal");
        expect(nombres).toContain("Brasil");
        expect(nombres).toContain("RD Congo");
        expect(nombres).toContain("Kenia");
        expect(nombres).toContain(PAIS_DESCONOCIDO[0]);
        // Los ISO son correctos en casos clave:
        const esp = bd.paises.find((p) => p.nombre === "España")!;
        expect([esp.iso2, esp.iso3]).toEqual(["ES", "ESP"]);
        const braz = bd.paises.find((p) => p.nombre === "Brasil")!;
        expect([braz.iso2, braz.iso3]).toEqual(["BR", "BRA"]);
    });

    it("vincula confederaciones de países existentes que estaban sin ella (enriquecimiento)", async () => {
        // El usuario creó España/Brasil a mano sin confederación: el seed los vincula.
        bd.paises.push({ id: 1, nombre: "España", iso2: "ES", iso3: "ESP", confederacion_id: null });
        bd.paises.push({ id: 2, nombre: "Brasil", iso2: "BR", iso3: "BRA", confederacion_id: null });
        const r = await seedPaises();

        expect(r.vinculados).toBeGreaterThanOrEqual(2);
        const uefa = bd.confederaciones.find((c) => c.codigo === "UEFA")!.id;
        const conmebol = bd.confederaciones.find((c) => c.codigo === "CONMEBOL")!.id;
        expect(bd.paises.find((p) => p.nombre === "España")!.confederacion_id).toBe(uefa);
        expect(bd.paises.find((p) => p.nombre === "Brasil")!.confederacion_id).toBe(conmebol);
    });

    it("no toca un vínculo de confederación decidido por el usuario", async () => {
        bd.paises.push({ id: 5, nombre: "Catar", iso2: "QA", iso3: "QAT", confederacion_id: 99 });
        await seedPaises();
        expect(bd.paises.find((p) => p.nombre === "Catar")!.confederacion_id).toBe(99);
    });

    it("vincula las confederaciones FIFA (creándolas si faltan)", async () => {
        await seedPaises();

        const uefa = bd.confederaciones.find((c) => c.codigo === "UEFA");
        expect(uefa).toBeTruthy();
        const espana = bd.paises.find((p) => p.nombre === "España")!;
        expect(espana.confederacion_id).toBe(uefa!.id);
        const argentina = bd.paises.find((p) => p.nombre === "Argentina")!;
        expect(argentina.confederacion_id).toBe(
            bd.confederaciones.find((c) => c.codigo === "CONMEBOL")!.id,
        );
        // Desconocido y Groenlandia no tienen confederación:
        const desc = bd.paises.find((p) => p.nombre === "Desconocido")!;
        expect(desc.confederacion_id).toBeNull();
        const groen = bd.paises.find((p) => p.nombre === "Groenlandia")!;
        expect(groen.confederacion_id).toBeNull();
    });

    it("es idempotente: segunda pasada añade cero y no duplica", async () => {
        await seedPaises();
        const r2 = await seedPaises();

        expect(r2.añadidos).toBe(0);
        expect(r2.yaExistentes).toBeGreaterThan(200);
        expect(bd.paises.length).toBe(r2.yaExistentes);
        // Y las confederaciones tampoco se duplican (idempotencia del seed base):
        expect(bd.confederaciones).toHaveLength(6);
    });

    it("nunca sobreescribe países existentes (aunque difieran sus ISO)", async () =>
    {
        // El usuario creó España a mano con otros ISO: el seed NO debe tocarla.
        bd.paises.push({ id: 1, nombre: "España", iso2: "XX", iso3: "XXX", confederacion_id: null });
        const r = await seedPaises();

        const espana = bd.paises.filter((p) => p.nombre === "España");
        expect(espana).toHaveLength(1);
        expect(espana[0].iso2).toBe("XX"); // se respeta el dato del usuario
        expect(r.yaExistentes).toBeGreaterThanOrEqual(1);
    });

    it("respeta variantes con acentos/case como existentes (normalización)", async () => {
        bd.paises.push({ id: 1, nombre: "espana", iso2: "X", iso3: "XX", confederacion_id: null });
        const r = await seedPaises();

        // "espana" cubre "España" (normalizado); no debe haber duplicado.
        expect(bd.paises.filter((p) => p.iso2 === "ES")).toHaveLength(0);
        expect(r.yaExistentes).toBeGreaterThanOrEqual(1);
    });
});
