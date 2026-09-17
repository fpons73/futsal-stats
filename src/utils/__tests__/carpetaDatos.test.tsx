import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import {
    leerCarpetaDatos, guardarCarpetaDatos, aplicarCarpetaDatosAlArranque,
    esRutaAlcanzable, avisarSiRutaDenegada, carpetaSugerida, CLAVE_CARPETA_DATOS,
} from "../carpetaDatos";
import { ToastContainer, toast } from "../../components/Toast";

// Mock de invoke: registra llamadas y devuelve según la cola del test.
const invocar = vi.fn(async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => null);

vi.mock("@tauri-apps/api/core", () => ({
    invoke: (cmd: string, args?: Record<string, unknown>) => invocar(cmd, args),
}));

// Mock de db.ts: preferencias en un Map en memoria (getPreferencia/setPreferencia).
const prefs = new Map<string, string>();
vi.mock("../../db", () => ({
    getPreferencia: vi.fn(async (clave: string, defecto = "") => prefs.get(clave) ?? defecto),
    setPreferencia: vi.fn(async (clave: string, valor: string) => { prefs.set(clave, valor); }),
}));

beforeEach(() => {
    vi.clearAllMocks();
    prefs.clear();
    invocar.mockImplementation(async (_cmd: string, _args?: Record<string, unknown>): Promise<unknown> => null);
    toast.clear();
    render(<ToastContainer />);
});

afterEach(cleanup);

describe("carpetaDatos", () => {
    it("carpetaSugerida devuelve una ruta real (define __RAIZ_PROYECTO__ inyectada)", async () => {
        const sugerida = await carpetaSugerida();
        expect(typeof sugerida).toBe("string");
        expect(sugerida.length).toBeGreaterThan(3);
        expect(sugerida.toLowerCase()).not.toContain("undefined");
    });

    it("leerCarpetaDatos devuelve la preferencia guardada por Rust", async () => {
        invocar.mockResolvedValueOnce("C:\\Datos\\Futsal");
        expect(await leerCarpetaDatos()).toBe("C:\\Datos\\Futsal");
        expect(invocar).toHaveBeenCalledWith("leer_carpeta_datos", undefined);
    });

    it("leerCarpetaDatos cae al fallback local si Rust no responde", async () => {
        invocar.mockRejectedValueOnce(new Error("comando no disponible"));
        prefs.set(CLAVE_CARPETA_DATOS, "C:\\Respaldo");
        expect(await leerCarpetaDatos()).toBe("C:\\Respaldo");
    });

    it("leerCarpetaDatos devuelve null sin configuración", async () => {
        expect(await leerCarpetaDatos()).toBeNull();
    });

    it("guardarCarpetaDatos persiste vía Rust y en el fallback local", async () => {
        await guardarCarpetaDatos("C:\\Datos");
        expect(invocar).toHaveBeenCalledWith("guardar_carpeta_datos", { carpeta: "C:\\Datos" });
        expect(prefs.get(CLAVE_CARPETA_DATOS)).toBe("C:\\Datos");
    });

    it("aplicarCarpetaDatosAlArranque extiende el alcance con la carpeta guardada", async () => {
        invocar.mockImplementation(async (cmd: string) =>
            cmd === "leer_carpeta_datos" ? "C:\\Datos" : null
        );

        await aplicarCarpetaDatosAlArranque();

        expect(invocar).toHaveBeenCalledWith("extender_alcance_fs", { carpeta: "C:\\Datos" });
    });

    it("aplicarCarpetaDatosAlArranque no hace nada sin carpeta guardada", async () => {
        await aplicarCarpetaDatosAlArranque();
        expect(invocar).toHaveBeenCalledTimes(1); // solo la lectura
        expect(invocar).toHaveBeenCalledWith("leer_carpeta_datos", undefined);
    });

    it("aplicarCarpetaDatosAlArranque no rompe el arranque si la extensión falla", async () => {
        invocar.mockImplementation(async (cmd: string) => {
            if (cmd === "leer_carpeta_datos") return "C:\\Carpeta\\Borrada";
            throw new Error("la carpeta no existe");
        });
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(aplicarCarpetaDatosAlArranque()).resolves.toBeUndefined();

        errorSpy.mockRestore();
    });

    it("esRutaAlcanzable devuelve el booleano de Rust y false si el comando falla", async () => {
        invocar.mockResolvedValueOnce(true);
        expect(await esRutaAlcanzable("C:\\Datos")).toBe(true);

        invocar.mockRejectedValueOnce(new Error("boom"));
        expect(await esRutaAlcanzable("C:\\Datos")).toBe(false);
    });
});

describe("avisarSiRutaDenegada", () => {
    it("los errores de alcance (forbidden path) muestran el toast de guía", async () => {
        const consumido = avisarSiRutaDenegada(
            new Error("forbidden path: C:/USB/datos.csv")
        );
        expect(consumido).toBe(true);
        expect(
            await screen.findByText(/fuera del alcance permitido/i)
        ).toBeTruthy();
    });

    it("otros errores no disparan el toast y devuelven false", () => {
        expect(avisarSiRutaDenegada(new Error("no such file"))).toBe(false);
        expect(avisarSiRutaDenegada("forbidden somethings".replace("forbidden somethings", "otro error"))).toBe(false);
        expect(avisarSiRutaDenegada(null)).toBe(false);
        expect(screen.queryByText(/fuera del alcance permitido/i)).toBeNull();
    });

    it("la detección no depende de mayúsculas", () => {
        expect(avisarSiRutaDenegada(new Error("Forbidden path: X"))).toBe(true);
    });
});
