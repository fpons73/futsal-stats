import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import { useBorradorPartidoConDeshacer } from "../useBorradorPartidoConDeshacer";

// Mock del plugin sql: select despacha por tabla, execute registra las llamadas.
const ejecutar = vi.fn(async (_sql: string, _params?: any[]) => {});
const seleccionar = vi.fn(async (sql: string) => {
    if (sql.includes("FROM Partido")) return filasPartido;
    if (sql.includes("FROM Alineacion")) return filasAlineacion;
    if (sql.includes("FROM Evento")) return filasEvento;
    if (sql.includes("FROM EstadisticaPartidoEquipo")) return filasEstEquipo;
    if (sql.includes("FROM EstadisticaPartidoJugador")) return filasEstJugador;
    return [];
});

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({ select: seleccionar, execute: ejecutar })),
    },
}));

let filasPartido: any[] = [];
let filasAlineacion: any[] = [];
let filasEvento: any[] = [];
let filasEstEquipo: any[] = [];
let filasEstJugador: any[] = [];

beforeEach(() => {
    vi.clearAllMocks();
    filasPartido = [];
    filasAlineacion = [];
    filasEvento = [];
    filasEstEquipo = [];
    filasEstJugador = [];
});

afterEach(cleanup);

describe("useBorradorPartidoConDeshacer", () => {
    it("borrar captura partido + 4 hijas, borra todo y deja el pendiente", async () => {
        filasPartido = [{ id: 5, local_id: 1, visitante_id: 2, jornada: "1", estado: "programado" }];
        filasAlineacion = [{ id: 10, partido_id: 5, persona_id: 7 }];
        filasEvento = [{ id: 20, partido_id: 5, tipo: "GOL" }];
        filasEstEquipo = [{ id: 30, partido_id: 5, equipo_id: 1 }];
        filasEstJugador = [{ id: 40, partido_id: 5, persona_id: 7 }];
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorPartidoConDeshacer(recargar));

        const ok = await result.current.borrar(5, "O Parrulo vs Alzira");

        expect(ok).toBe(true);
        // Borra las 4 hijas y luego el partido.
        const deletes = ejecutar.mock.calls.map((c) => c[0]);
        expect(deletes).toEqual([
            "DELETE FROM Alineacion WHERE partido_id = $1",
            "DELETE FROM Evento WHERE partido_id = $1",
            "DELETE FROM EstadisticaPartidoEquipo WHERE partido_id = $1",
            "DELETE FROM EstadisticaPartidoJugador WHERE partido_id = $1",
            "DELETE FROM Partido WHERE id = $1",
        ]);
        expect(recargar).toHaveBeenCalledTimes(1);
        await waitFor(() =>
            expect(result.current.pendiente?.data).toEqual({
                etiqueta: "O Parrulo vs Alzira",
                partido: { id: 5, local_id: 1, visitante_id: 2, jornada: "1", estado: "programado" },
                hijas: {
                    Alineacion: [{ id: 10, partido_id: 5, persona_id: 7 }],
                    Evento: [{ id: 20, partido_id: 5, tipo: "GOL" }],
                    EstadisticaPartidoEquipo: [{ id: 30, partido_id: 5, equipo_id: 1 }],
                    EstadisticaPartidoJugador: [{ id: 40, partido_id: 5, persona_id: 7 }],
                },
            })
        );
    });

    it("deshacer re-inserta el partido y luego cada hija con sus ids originales", async () => {
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorPartidoConDeshacer(recargar));

        await result.current.deshacer({
            etiqueta: "X",
            partido: { id: 5, local_id: 1, visitante_id: 2, estado: "finalizado" },
            hijas: {
                Alineacion: [{ id: 10, partido_id: 5, persona_id: 7 }],
                Evento: [{ id: 20, partido_id: 5, tipo: "GOL" }],
                EstadisticaPartidoEquipo: [],
                EstadisticaPartidoJugador: [{ id: 40, partido_id: 5, persona_id: 7 }],
            },
        });

        const inserts = ejecutar.mock.calls.map((c) => ({ sql: c[0], params: c[1] }));
        expect(inserts).toEqual([
            { sql: "INSERT INTO Partido (id, local_id, visitante_id, estado) VALUES (?, ?, ?, ?)", params: [5, 1, 2, "finalizado"] },
            { sql: "INSERT INTO Alineacion (id, partido_id, persona_id) VALUES (?, ?, ?)", params: [10, 5, 7] },
            { sql: "INSERT INTO Evento (id, partido_id, tipo) VALUES (?, ?, ?)", params: [20, 5, "GOL"] },
            { sql: "INSERT INTO EstadisticaPartidoJugador (id, partido_id, persona_id) VALUES (?, ?, ?)", params: [40, 5, 7] },
        ]);
        expect(recargar).toHaveBeenCalledTimes(1);
    });

    it("si el partido no existe, avisa y no borra nada", async () => {
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorPartidoConDeshacer(recargar));

        const ok = await result.current.borrar(99);

        expect(ok).toBe(false);
        expect(ejecutar).not.toHaveBeenCalled();
        expect(result.current.pendiente).toBeNull();
    });

    it("si un DELETE falla, avisa con toast y no ofrece deshacer", async () => {
        filasPartido = [{ id: 5 }];
        ejecutar.mockRejectedValueOnce(new Error("FK"));
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorPartidoConDeshacer(recargar));

        const ok = await result.current.borrar(5);

        expect(ok).toBe(false);
        expect(result.current.pendiente).toBeNull();
        expect(recargar).not.toHaveBeenCalled();
    });
});