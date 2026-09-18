// Tests de los servicios de fichas enriquecidas (B1). La BD se mockea por
// import dinámico, igual que en buscadorService.test.ts: cada consulta fake
// responde según la tabla que detecta en la SQL.
import { describe, it, expect, beforeEach, vi } from "vitest";

const consultasFake = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({
            select: (sql: string, _params?: unknown[]) => consultasFake(sql),
        })),
    },
}));

import {
    obtenerFichaEquipo,
    obtenerFichaJugador,
} from "../fichaServicios";

/** SQL → respuesta. Ordena por marcas inequívocas en el texto de la consulta. */
function configurarDb() {
    consultasFake.mockImplementation((sql: string) => {
        if (sql.includes("FROM Equipo e LEFT JOIN Pais")) {
            return Promise.resolve([{
                id: 10, nombre: "ElPozo Murcia", abreviatura: "ELP", categoria: "Primera División",
                escudo_path: "escudos/elpozo.png", pais_nombre: "España", pais_bandera: "banderas/es.png",
            }]);
        }
        if (sql.includes("GROUP BY p.id") === false && sql.includes("estado = 'finalizado'")) {
            return Promise.resolve([
                { id: 1, fecha_hora: "2026-09-10T20:00:00", jornada: "4", rival: "Barça", en_casa: 1, gf: 4, gc: 2 },
                { id: 2, fecha_hora: "2026-09-03T20:00:00", jornada: "3", rival: "Palma", en_casa: 0, gf: 1, gc: 3 },
                { id: 3, fecha_hora: "2026-08-27T20:00:00", jornada: "2", rival: "Levante", en_casa: 1, gf: 2, gc: 2 },
            ]);
        }
        if (sql.includes("FROM Afiliacion a JOIN Persona")) {
            return Promise.resolve([
                { id: 7, nombre: "Rafa", posicion: "Ala", foto: "fotos/rafa.png", roles: "Jugador" },
            ]);
        }
        if (sql.includes("FROM Afiliacion a") && sql.includes("JOIN Equipo")) {
            return Promise.resolve([
                { equipo_id: 10, equipo_nombre: "ElPozo Murcia", inicio: "2024-07-01", fin: null, activo: 1, dorsal: 10 },
                { equipo_id: 11, equipo_nombre: "Palma Futsal", inicio: "2022-07-01", fin: "2024-06-30", activo: 0, dorsal: 8 },
            ]);
        }
        if (sql.includes("LEFT JOIN Pais pa ON pa.id = pe.nacionalidad")) {
            return Promise.resolve([{
                id: 7, nombre: "Rafael", apellidos: "García", nombre_deportivo: "Rafa",
                foto_path: "fotos/rafa.png", posicion_principal: "Ala", fecha_nacimiento: "1998-03-15",
                pais_nombre: "España", pais_bandera: "banderas/es.png",
            }]);
        }
        if (sql.includes("COUNT(*) AS partidos")) {
            return Promise.resolve([{ partidos: 4, titular: 3, minutos: 220, goles: 5, asistencias: 2, tiros: 12, tiros_puerta: 8, rating: 7.4 }]);
        }
        if (sql.includes("epj.partido_id, pa.fecha_hora")) {
            return Promise.resolve([
                { partido_id: 1, fecha: "2026-09-10T20:00:00", rival: "Barça", gf: 4, gc: 2, goles: 2, asistencias: 1, minutos: 40, rating: 8.1 },
                { partido_id: 2, fecha: "2026-09-03T20:00:00", rival: "Palma", gf: 1, gc: 3, goles: 0, asistencias: 0, minutos: 25, rating: 6.2 },
            ]);
        }
        return Promise.resolve([]);
    });
}

describe("fichaServicios", () => {
    beforeEach(() => {
        consultasFake.mockReset();
    });

    it("ficha de equipo: resultados ordenados, resumen y forma correctos", async () => {
        configurarDb();
        const f = await obtenerFichaEquipo(10, 1);
        expect(f).not.toBeNull();
        expect(f!.equipo.nombre).toBe("ElPozo Murcia");
        expect(f!.partidos).toHaveLength(3);
        expect(f!.resumen).toEqual({ pj: 3, v: 1, e: 1, d: 1, gf: 7, gc: 7 });
        // Orden DESC por fecha; forma cronológica = invertir.
        expect(f!.partidos.map(p => p.id)).toEqual([1, 2, 3]);
        expect(f!.forma).toEqual(["E", "D", "V"]);
        expect(f!.partidos[0].resultado).toBe("V");
    });

    it("ficha de equipo sin partidos devuelve estructura vacía válida", async () => {
        configurarDb();
        consultasFake.mockImplementation((sql: string) => {
            if (sql.includes("FROM Equipo e LEFT JOIN Pais")) {
                return Promise.resolve([{ id: 99, nombre: "Sin partidos", abreviatura: null, categoria: null, escudo_path: null, pais_nombre: null, pais_bandera: null }]);
            }
            return Promise.resolve([]);
        });
        const f = await obtenerFichaEquipo(99, null);
        expect(f).not.toBeNull();
        expect(f!.partidos).toHaveLength(0);
        expect(f!.forma).toEqual([]);
        expect(f!.resumen.pj).toBe(0);
        // Sin edición activa no consulta la calculadora de clasificación.
        expect(f!.clasificacion).toBeNull();
        expect(f!.plantilla).toHaveLength(0);
    });

    it("ficha de equipo: equipo inexistente devuelve null", async () => {
        configurarDb();
        consultasFake.mockImplementation(() => Promise.resolve([]));
        expect(await obtenerFichaEquipo(9999, null)).toBeNull();
    });

    it("ficha de jugador: trayectoria con etapa activa y retirada", async () => {
        configurarDb();
        const f = await obtenerFichaJugador(7, 1);
        expect(f).not.toBeNull();
        expect(f!.persona.nombre_deportivo).toBe("Rafa");
        expect(f!.trayectoria).toHaveLength(2);
        expect(f!.trayectoria[0]).toMatchObject({ equipo_nombre: "ElPozo Murcia", activo: true, dorsal: 10 });
        expect(f!.trayectoria[1]).toMatchObject({ equipo_nombre: "Palma Futsal", activo: false });
    });

    it("ficha de jugador: acumulado y últimos partidos de la edición", async () => {
        configurarDb();
        const f = await obtenerFichaJugador(7, 1);
        expect(f!.acumulado).toEqual({
            partidos: 4, titular: 3, minutos: 220, goles: 5, asistencias: 2,
            tiros: 12, tiros_puerta: 8, rating_medio: 7.4,
        });
        expect(f!.ultimos).toHaveLength(2);
        expect(f!.ultimos[0]).toMatchObject({ rival: "Barça", goles: 2, asistencias: 1 });
    });

    it("ficha de jugador sin edición activa: trayectoria sí, acumulado null", async () => {
        configurarDb();
        const f = await obtenerFichaJugador(7, null);
        expect(f!.trayectoria).toHaveLength(2);
        expect(f!.acumulado).toBeNull();
        expect(f!.ultimos).toEqual([]);
    });

    it("degrada a null si la BD falla (sin lanzar)", async () => {
        consultasFake.mockRejectedValue(new Error("BD no iniciada"));
        expect(await obtenerFichaEquipo(10, 1)).toBeNull();
        expect(await obtenerFichaJugador(7, 1)).toBeNull();
    });
});
