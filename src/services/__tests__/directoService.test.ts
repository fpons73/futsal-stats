// Tests del servicio de directo (B2). La BD se mockea por import dinámico:
// cada consulta fake responde según la tabla/detección en la SQL.
import { describe, it, expect, beforeEach, vi } from "vitest";

const ejecutadas: Array<{ sql: string; params: unknown[] }> = [];
const consultasFake = vi.fn();

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({
            select: (sql: string, params?: unknown[]) => consultasFake(sql, params),
            execute: (sql: string, params?: unknown[]) => {
                ejecutadas.push({ sql, params: params ?? [] });
                return Promise.resolve({ rowsAffected: 1 });
            },
        })),
    },
}));

import {
    segundosActuales, minutoActual, formatearCrono,
    obtenerCrono, cambiarEstado, registrarAccion, deshacerAccion, finalizarPartido,
    type EstadoCrono,
} from "../directoService";

/** Cronómetro congelado (sin tramo en marcha) para pruebas deterministas. */
const parado = (segundos: number, estado: EstadoCrono["estado"] = "parado"): EstadoCrono =>
    ({ estado, segundos, reanudado_en: null });

/** Configura las respuestas fake según la SQL. */
function configurarDb(opts: { crono?: EstadoCrono; epj?: Record<string, number | null>; goles?: Array<{ equipo_id: number; tipo: string; n: number }> } = {}) {
    consultasFake.mockImplementation((sql: string) => {
        if (sql.includes("crono_estado")) {
            const c = opts.crono ?? parado(0);
            const estadoDb = c.estado === "parado" ? null : c.estado;
            return Promise.resolve([{ crono_estado: estadoDb, crono_segundos: c.segundos, crono_actualizado_en: c.reanudado_en }]);
        }
        if (sql.includes("SELECT * FROM EstadisticaPartidoJugador")) {
            return Promise.resolve(opts.epj ? [{ id: 55, ...opts.epj }] : []);
        }
        if (sql.includes("SELECT id FROM EstadisticaPartidoJugador")) {
            return Promise.resolve([{ id: 55 }]);
        }
        if (sql.includes("SELECT id FROM Evento")) {
            return Promise.resolve([{ id: 777 }]);
        }
        if (sql.includes("SELECT local_id")) {
            return Promise.resolve([{ local_id: 10, goles_local: 0, goles_visitante: 0 }]);
        }
        if (sql.includes("GROUP BY equipo_id, tipo")) {
            return Promise.resolve(opts.goles ?? []);
        }
        return Promise.resolve([]);
    });
}

describe("cronómetro (derivación pura)", () => {
    it("segundosActuales sin tramo en marcha devuelve solo lo consolidado", () => {
        expect(segundosActuales(parado(755))).toBe(755);
    });

    it("segundosActuales suma el tramo en marcha desde la reanudación", () => {
        const c: EstadoCrono = { estado: "primer_tiempo", segundos: 600, reanudado_en: new Date(Date.now() - 30_000).toISOString() };
        const s = segundosActuales(c);
        expect(s).toBeGreaterThanOrEqual(629);
        expect(s).toBeLessThanOrEqual(632);
    });

    it("minutoActual convierte a minutos (0-based) y formatearCrono a MM:SS", () => {
        expect(minutoActual(parado(1259))).toBe(20);
        expect(formatearCrono(65)).toBe("1:05");
        expect(formatearCrono(600)).toBe("10:00");
    });
});

describe("persistencia del cronómetro", () => {
    beforeEach(() => { ejecutadas.length = 0; });

    it("obtenerCrono mapea el estado guardado", async () => {
        configurarDb({ crono: parado(930, "descanso") });
        const c = await obtenerCrono(1);
        expect(c).toEqual({ estado: "descanso", segundos: 930, reanudado_en: null });
    });

    it("cambiarEstado a pausa consolida y limpia la marca de reanudación", async () => {
        configurarDb({ crono: parado(0) });
        const c = await cambiarEstado(1, "primer_tiempo");
        expect(c.estado).toBe("primer_tiempo");
        expect(c.reanudado_en).not.toBeNull();

        ejecutadas.length = 0;
        await cambiarEstado(1, "descanso");
        const write = ejecutadas.find(e => e.sql.includes("UPDATE Partido SET crono_estado"));
        expect(write).toBeTruthy();
        expect(write!.params).toEqual(["descanso", 0, null, 1]);
    });

    it("sin BD devuelve estado neutro y no lanza", async () => {
        consultasFake.mockRejectedValue(new Error("sin BD"));
        const c = await obtenerCrono(1);
        expect(c.estado).toBe("parado");
        expect(c.segundos).toBe(0);
    });
});

describe("acciones por jugador", () => {
    beforeEach(() => { ejecutadas.length = 0; });

    it("registrarAccion crea la fila EPJ si no existe y devuelve ids para deshacer", async () => {
        configurarDb({ crono: parado(420, "primer_tiempo") });
        const a = await registrarAccion(1, 9, 10, "goles", 1, parado(420, "primer_tiempo"));
        expect(a).toMatchObject({ personaId: 9, epjId: 55, campo: "goles", delta: 1, eventoId: 777, minuto: 7 });
        const insert = ejecutadas.find(e => e.sql.includes("INSERT INTO EstadisticaPartidoJugador"));
        expect(insert!.params).toEqual([1, 9, 10, 1]);
        const evento = ejecutadas.find(e => e.sql.includes("INSERT INTO Evento"));
        expect(evento).toBeTruthy();
        expect(evento!.params[1]).toBe("GOL");
    });

    it("registrarAccion incrementa el valor previo en un acumulador existente", async () => {
        configurarDb({ crono: parado(0), epj: { goles: 2 } });
        const a = await registrarAccion(1, 9, 10, "goles", 1, parado(0));
        const update = ejecutadas.find(e => e.sql.includes("UPDATE EstadisticaPartidoJugador SET goles"));
        expect(update!.params[0]).toBe(3);
        expect(a!.epjId).toBe(55);
    });

    it("−1 sobre una métrica a 0 es no-op (sin insertar ni actualizar)", async () => {
        configurarDb({ crono: parado(0) });
        const a = await registrarAccion(1, 9, 10, "goles", -1, parado(0));
        expect(a).toBeNull();
        expect(ejecutadas.filter(e => e.sql.includes("EstadisticaPartidoJugador"))).toHaveLength(0);
    });

    it("asistencias y tiros no crean Evento (solo acumulador)", async () => {
        configurarDb({ crono: parado(0) });
        const a = await registrarAccion(1, 9, 10, "asistencias", 1, parado(0));
        expect(a!.eventoId).toBeNull();
        expect(ejecutadas.some(e => e.sql.includes("INSERT INTO Evento"))).toBe(false);
    });

    it("deshacerAccion aplica el delta inverso y borra el evento", async () => {
        const ok = await deshacerAccion({ personaId: 9, epjId: 55, campo: "goles", delta: 1, eventoId: 777, minuto: 7 });
        expect(ok).toBe(true);
        const upd = ejecutadas.find(e => e.sql.includes("MAX(0, COALESCE(goles"));
        expect(upd).toBeTruthy();
        const del = ejecutadas.find(e => e.sql.includes("DELETE FROM Evento"));
        expect(del!.params).toEqual([777]);
    });

    it("finalizarPartido rellena el marcador desde eventos con PROPIA_PUERTA en contra", async () => {
        configurarDb({
            crono: parado(2400, "segundo_tiempo"),
            goles: [
                { equipo_id: 10, tipo: "GOL", n: 2 },
                { equipo_id: 11, tipo: "GOL", n: 1 },
                { equipo_id: 10, tipo: "PROPIA_PUERTA", n: 1 }, // en contra del local
            ],
        });
        await finalizarPartido(1, parado(2400, "segundo_tiempo"));
        const marcador = ejecutadas.find(e => e.sql.includes("SET goles_local"));
        expect(marcador!.params).toEqual([2, 2, 1]); // 2-1 a favor + propia puerta resta al local
    });

    it("finalizarPartido no toca el marcador si ya hay goles anotados", async () => {
        configurarDb({ crono: parado(0) });
        consultasFake.mockImplementation((sql: string) => {
            if (sql.includes("SELECT local_id")) return Promise.resolve([{ local_id: 10, goles_local: 3, goles_visitante: 1 }]);
            return Promise.resolve([]);
        });
        await finalizarPartido(1, parado(0));
        expect(ejecutadas.some(e => e.sql.includes("SET goles_local"))).toBe(false);
    });
});
