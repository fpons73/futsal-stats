// Tests del servicio de búsqueda global (B4). El índice se construye con un
// import dinámico de @tauri-apps/plugin-sql: se mockea con vi.mock y un
// Database.load() que devuelve "consultas" fake según la SQL recibida.
import { describe, it, expect, beforeEach, vi } from "vitest";

const consultasFake = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({
            select: (sql: string) => consultasFake(sql),
        })),
    },
}));

import {
    buscarGlobal,
    obtenerIndice,
    invalidarIndiceBusqueda,
} from "../buscadorService";

/** Respuestas fake: la SQL determina qué tabla devuelve. */
function configurarDb() {
    consultasFake.mockImplementation((sql: string) => {
        if (sql.includes("FROM Persona")) {
            return Promise.resolve([
                { id: 1, nombre_deportivo: "Rafa", nombre: "Rafael", apellidos: "García Pérez", posicion_principal: "Cierre", roles: "Jugador" },
                { id: 2, nombre_deportivo: "", nombre: "Ana", apellidos: "López", posicion_principal: null, roles: "[\"Entrenador\"]" },
                { id: 3, nombre_deportivo: "Kike", nombre: "Enrique", apellidos: "Soler", posicion_principal: "Pívot", roles: "Jugador, Entrenador" },
            ]);
        }
        if (sql.includes("FROM Equipo")) {
            return Promise.resolve([
                { id: 10, nombre: "ElPozo Murcia", categoria: "Primera División" },
                { id: 11, nombre: "FC Barcelona", categoria: null },
            ]);
        }
        if (sql.includes("FROM Partido")) {
            return Promise.resolve([
                { id: 100, local: "ElPozo Murcia", visitante: "FC Barcelona", fecha_hora: "2026-09-17T20:00:00", jornada: "5" },
            ]);
        }
        return Promise.resolve([]);
    });
}

describe("buscadorService", () => {
    beforeEach(() => {
        consultasFake.mockReset();
        invalidarIndiceBusqueda();
    });

    it("construye el índice con las tres entidades y campos derivados", async () => {
        configurarDb();
        const indice = await obtenerIndice();
        // 3 personas + 2 equipos + 1 partido
        expect(indice).toHaveLength(6);
        const partido = indice.find((e) => e.tipo === "partido")!;
        expect(partido.titulo).toBe("ElPozo Murcia vs FC Barcelona");
        expect(partido.subtitulo).toBe("2026-09-17 · J5");
        expect(partido.ruta).toBe("/partido/100");
    });

    it("encuentra por nombre deportivo y respeta el mínimo de 2 caracteres", async () => {
        configurarDb();
        expect(await buscarGlobal("R")).toEqual([]);
        const r = await buscarGlobal("Rafa");
        expect(r).toHaveLength(1);
        expect(r[0]).toMatchObject({ tipo: "persona", id: 1, titulo: "Rafa", ruta: "/jugador/1" });
    });

    it("es acento-insensible: 'Garcia' encuentra 'García'", async () => {
        configurarDb();
        const r = await buscarGlobal("garcia");
        expect(r.some((x) => x.tipo === "persona" && x.id === 1)).toBe(true);
    });

    it("busca en el nombre completo (nombre + apellidos), no solo en el deportivo", async () => {
        configurarDb();
        const r = await buscarGlobal("Rafael");
        expect(r.some((x) => x.tipo === "persona" && x.id === 1)).toBe(true);
    });

    it("prefiere coincidencias por prefijo antes que subcadena", async () => {
        configurarDb();
        const r = await buscarGlobal("el");
        // "ElPozo Murcia" empieza por "el"; "Rafael" lo contiene: el equipo va antes.
        const tiposEquipo = r.filter((x) => x.tipo === "equipo");
        const primerEquipo = r.findIndex((x) => x === tiposEquipo[0]);
        const rafael = r.findIndex((x) => x.tipo === "persona" && x.id === 1);
        expect(primerEquipo).toBeGreaterThanOrEqual(0);
        expect(primerEquipo).toBeLessThan(rafael);
    });

    it("filtra por tipo cuando se le pide", async () => {
        configurarDb();
        const soloEquipos = await buscarGlobal("barcelona", ["equipo"]);
        expect(soloEquipos.every((x) => x.tipo === "equipo")).toBe(true);
        expect(soloEquipos.map((x) => x.titulo)).toContain("FC Barcelona");
    });

    it("personas y equipos navegan a sus fichas directas (B1)", async () => {
        configurarDb();
        const ana = (await buscarGlobal("lopez")).find((x) => x.id === 2)!;
        expect(ana.ruta).toBe("/jugador/2");
        const kike = (await buscarGlobal("kike")).find((x) => x.id === 3)!;
        expect(kike.ruta).toBe("/jugador/3");
        const equipo = (await buscarGlobal("barcelona", ["equipo"]))[0]!;
        expect(equipo.ruta).toBe("/equipo/11");
    });

    it("construye subtítulo de persona desde roles cuando no hay posición", async () => {
        configurarDb();
        const r = await buscarGlobal("Ana López");
        expect(r[0]?.subtitulo).toBe("Entrenador");
    });

    it("degrada a [] si la BD falla (sin lanzar) y permite reintento después", async () => {
        consultasFake.mockRejectedValue(new Error("BD no iniciada"));
        expect(await buscarGlobal("rafa")).toEqual([]);

        configurarDb(); // reintento tras el fallo
        const r = await buscarGlobal("rafa");
        expect(r).toHaveLength(1);
    });

    it("sin término no toca la BD", async () => {
        expect(await buscarGlobal("   ")).toEqual([]);
        expect(consultasFake).not.toHaveBeenCalled();
    });
});
