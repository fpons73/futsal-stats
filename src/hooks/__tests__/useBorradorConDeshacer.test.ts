import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, cleanup, waitFor } from "@testing-library/react";
import { useBorradorConDeshacer } from "../useBorradorConDeshacer";

// Mock del plugin sql: el hook solo usa load/select/execute.
const ejecutar = vi.fn(async () => {});
let filasDevueltas: any[] = [];
const seleccionar = vi.fn(async () => filasDevueltas);

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({ select: seleccionar, execute: ejecutar })),
    },
}));

beforeEach(() => {
    vi.clearAllMocks();
    filasDevueltas = [];
});

afterEach(cleanup);

describe("useBorradorConDeshacer", () => {
    it("borrar captura la fila, la borra y deja el pendiente para deshacer", async () => {
        filasDevueltas = [{ id: 7, nombre: "O Parrulo", pais_id: 1 }];
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorConDeshacer("Equipo", recargar));

        const ok = await result.current.borrar(7);

        expect(ok).toBe(true);
        expect(seleccionar).toHaveBeenCalledWith("SELECT * FROM Equipo WHERE id = $1", [7]);
        expect(ejecutar).toHaveBeenCalledWith("DELETE FROM Equipo WHERE id = $1", [7]);
        expect(recargar).toHaveBeenCalledTimes(1);
        await waitFor(() =>
            expect(result.current.pendiente?.data).toEqual({ id: 7, nombre: "O Parrulo", pais_id: 1 })
        );
    });

    it("deshacer re-inserta la fila con su id original y recarga", async () => {
        filasDevueltas = [{ id: 7, nombre: "O Parrulo", pais_id: 1 }];
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorConDeshacer("Equipo", recargar));
        await result.current.borrar(7);
        ejecutar.mockClear();
        recargar.mockClear();

        await result.current.deshacer({ id: 7, nombre: "O Parrulo", pais_id: 1 });

        expect(ejecutar).toHaveBeenCalledWith(
            "INSERT INTO Equipo (id, nombre, pais_id) VALUES (?, ?, ?)",
            [7, "O Parrulo", 1]
        );
        expect(recargar).toHaveBeenCalledTimes(1);
    });

    it("sin fila coincidente borra igual pero no ofrece deshacer", async () => {
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorConDeshacer("Equipo", recargar));

        const ok = await result.current.borrar(99);

        expect(ok).toBe(true);
        expect(ejecutar).toHaveBeenCalledWith("DELETE FROM Equipo WHERE id = $1", [99]);
        expect(result.current.pendiente).toBeNull();
    });

    it("si el DELETE falla, avisa con toast y no ofrece deshacer", async () => {
        filasDevueltas = [{ id: 7, nombre: "X" }];
        ejecutar.mockRejectedValueOnce(new Error("FK"));
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorConDeshacer("Equipo", recargar));

        const ok = await result.current.borrar(7);

        expect(ok).toBe(false);
        expect(result.current.pendiente).toBeNull();
        expect(recargar).not.toHaveBeenCalled();
    });

    it("si el re-INSERT falla, avisa con toast y la vista no se recarga", async () => {
        filasDevueltas = [{ id: 7, nombre: "X" }];
        const recargar = vi.fn();
        const { result } = renderHook(() => useBorradorConDeshacer("Equipo", recargar));
        await result.current.borrar(7);
        ejecutar.mockRejectedValueOnce(new Error("UNIQUE"));
        recargar.mockClear();

        await result.current.deshacer({ id: 7, nombre: "X" });

        expect(recargar).not.toHaveBeenCalled();
    });
});