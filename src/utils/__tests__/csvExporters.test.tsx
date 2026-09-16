import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import {
    exportarPersonasCSV,
    exportarEquiposCSV,
    exportarClasificacionCSV,
    exportarEstadisticasJugadorCSV,
} from "../csvExporters";
import { ToastContainer, toast } from "../../components/Toast";

// Mocks de los plugins Tauri: guardarCSV usa save (diálogo) y writeTextFile (fs);
// los exportadores de personas/equipos usan además Database.load → select.
const guardar = vi.fn(async (_opts?: { defaultPath?: string }) => "C:/salida/test.csv");
const escribir = vi.fn(async (_ruta?: string, _datos?: string) => {});
const seleccionar = vi.fn(async (_q?: string, _params?: unknown[]) => [] as any[]);

vi.mock("@tauri-apps/plugin-dialog", () => ({
    save: (opts: { defaultPath?: string }) => guardar(opts),
}));

vi.mock("@tauri-apps/plugin-fs", () => ({
    writeTextFile: (ruta: string, datos: string) => escribir(ruta, datos),
}));

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({ select: seleccionar, execute: vi.fn(async () => {}) })),
    },
}));

let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    vi.clearAllMocks();
    toast.clear();
    guardar.mockResolvedValue("C:/salida/test.csv");
    escribir.mockResolvedValue(undefined);
    seleccionar.mockResolvedValue([]);
    // Los fallos esperados hacen console.error: lo silenciamos en los tests.
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<ToastContainer />);
});

afterEach(() => {
    errorSpy.mockRestore();
    cleanup();
});

describe("guardarCSV (toasts de exportación)", () => {
    it("exportación correcta: escribe el CSV y muestra toast de éxito", async () => {
        seleccionar.mockResolvedValueOnce([
            { nombre: "Alex", apellidos: "García", nombre_deportivo: "Alex", fecha_nacimiento: "1990-01-01", primera_nacionalidad: "España" },
        ]);

        await exportarPersonasCSV("Arbitro");

        expect(guardar).toHaveBeenCalledTimes(1);
        expect(guardar.mock.calls[0]![0]!.defaultPath).toBe("arbitros_export.csv");
        const csv = escribir.mock.calls[0]![1] as string;
        expect(csv.startsWith("\ufeff")).toBe(true);
        expect(csv).toContain("Alex");
        expect(await screen.findByText("CSV exportado: arbitros_export.csv")).toBeTruthy();
    });

    it("diálogo cancelado: toast informativo y no se escribe nada", async () => {
        guardar.mockResolvedValueOnce(null as unknown as string);

        await exportarEquiposCSV();

        expect(escribir).not.toHaveBeenCalled();
        expect(await screen.findByText("Exportación cancelada.")).toBeTruthy();
    });

    it("fallo de escritura: toast de error", async () => {
        escribir.mockRejectedValueOnce(new Error("disco lleno"));

        await exportarClasificacionCSV(
            [{ posicion: 1, nombre: "O Parrulo", puntos: 3, pj: 1, pg: 1, pe: 0, pp: 0, gf: 5, gc: 1, dg: 4 }],
            "Test"
        );

        expect(await screen.findByText("No se pudo exportar el CSV. Revisa la carpeta destino y los permisos.")).toBeTruthy();
    });

    it("fallo del diálogo: toast de error", async () => {
        guardar.mockRejectedValueOnce(new Error("diálogo bloqueado"));

        await exportarEstadisticasJugadorCSV([{ jugador: "X", goles: 2 }], "Test");

        expect(await screen.findByText("No se pudo exportar el CSV. Revisa la carpeta destino y los permisos.")).toBeTruthy();
    });

    it("fallo de consulta (personas): toast de error de base de datos", async () => {
        seleccionar.mockRejectedValueOnce(new Error("boom"));

        await exportarPersonasCSV("Jugador");

        expect(guardar).not.toHaveBeenCalled();
        expect(await screen.findByText("No se pudo generar el CSV de jugadores (error de base de datos).")).toBeTruthy();
    });

    it("fallo de consulta (equipos): toast de error de base de datos", async () => {
        seleccionar.mockRejectedValueOnce(new Error("boom"));

        await exportarEquiposCSV();

        expect(await screen.findByText("No se pudo generar el CSV de equipos (error de base de datos).")).toBeTruthy();
    });

    it("estadísticas vacías: no abre diálogo ni muestra toasts", async () => {
        await exportarEstadisticasJugadorCSV([], "Test");

        expect(guardar).not.toHaveBeenCalled();
        expect(escribir).not.toHaveBeenCalled();
        expect(screen.queryByText(/CSV exportado/)).toBeNull();
    });

    it("clasificación: el nombre del archivo incluye la edición", async () => {
        await exportarClasificacionCSV([], "Primera 2025-2026");

        expect(guardar.mock.calls[0]![0]!.defaultPath).toBe("clasificacion_Primera 2025-2026.csv");
        expect(await screen.findByText("CSV exportado: clasificacion_Primera 2025-2026.csv")).toBeTruthy();
    });
});
