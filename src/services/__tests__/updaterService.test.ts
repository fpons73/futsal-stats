// Tests del servicio de auto-actualización (A2): degradación elegante fuera de
// Tauri, detección de actualización con el update retenido entre llamadas y
// flujo de instalación con progreso + relaunch. Mocks explícitos con vi.mock
// (las factories solo referencian variables con prefijo "mock") para no cargar
// binarios de Tauri.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    comprobarActualizacion,
    instalarActualizacion,
    obtenerVersionActual,
} from "../updaterService";
import { registroErrores } from "../../utils/registroErrores";

type EventoDescarga = {
    event: string;
    data?: { chunkLength?: number; contentLength?: number };
};

const mockEstado = {
    pluginDisponible: false,
    version: "1.0.0",
    update: null as null | {
        version: string;
        body?: string;
        downloadAndInstall: (cb?: (e: EventoDescarga) => void) => Promise<void>;
    },
    relanzado: false,
};

vi.mock("@tauri-apps/api/app", () => ({
    getVersion: () => Promise.resolve(mockEstado.version),
}));

vi.mock("@tauri-apps/plugin-updater", () => ({
    check: async () => {
        if (!mockEstado.pluginDisponible) throw new Error("Plugin no registrado");
        return mockEstado.update;
    },
}));

vi.mock("@tauri-apps/plugin-process", () => ({
    relaunch: async () => {
        mockEstado.relanzado = true;
    },
}));

/** Simula (o retira) el entorno Tauri: __TAURI_INTERNALS__ en window. */
function setEsTauri(v: boolean) {
    if (v) {
        Object.defineProperty(window, "__TAURI_INTERNALS__", {
            configurable: true,
            value: { invoke: vi.fn() },
        });
    } else {
        Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
    }
    mockEstado.pluginDisponible = v;
}

describe("updaterService", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        setEsTauri(false);
        mockEstado.update = null;
        mockEstado.version = "1.0.0";
        mockEstado.relanzado = false;
    });

    afterEach(() => setEsTauri(false));

    it("degrada fuera de Tauri: disponible=false con razon sin-tauri", async () => {
        await expect(comprobarActualizacion()).resolves.toEqual({
            disponible: false,
            razon: "sin-tauri",
        });
        await expect(obtenerVersionActual()).resolves.toBeNull();
    });

    it("dentro de Tauri sin actualización: razon sin-actualizacion", async () => {
        setEsTauri(true);
        await expect(comprobarActualizacion()).resolves.toEqual({
            disponible: false,
            razon: "sin-actualizacion",
        });
        await expect(obtenerVersionActual()).resolves.toBe("1.0.0");
    });

    it("fallo del plugin (no registrado/red): warning en el registro y razon amable", async () => {
        setEsTauri(true);
        mockEstado.pluginDisponible = false; // check() lanzará
        const espía = vi.spyOn(registroErrores, "añadir");
        const estado = await comprobarActualizacion();
        expect(estado.disponible).toBe(false);
        expect(estado.razon).toBe("plugin-no-disponible");
        expect(espía).toHaveBeenCalledWith(
            "warning",
            "updater",
            expect.stringContaining("actualizaciones"),
            expect.any(String),
        );
    });

    it("con actualización disponible: retiene versión y notas para instalar después", async () => {
        setEsTauri(true);
        mockEstado.update = {
            version: "1.1.0",
            body: "Novedades de la 1.1.0",
            downloadAndInstall: vi.fn(async () => {}),
        };
        const estado = await comprobarActualizacion();
        expect(estado).toEqual({
            disponible: true,
            version: "1.1.0",
            notas: "Novedades de la 1.1.0",
        });
    });

    it("instalarActualizacion sin comprobación previa lanza error claro", async () => {
        setEsTauri(true);
        mockEstado.update = null; // comprobar() dejará pendiente = null
        await comprobarActualizacion();
        await expect(instalarActualizacion()).rejects.toThrow(
            "No hay actualización pendiente",
        );
    });

    it("flujo completo: progreso de descarga en porcentaje y relaunch al terminar", async () => {
        setEsTauri(true);
        mockEstado.update = {
            version: "1.1.0",
            downloadAndInstall: async (cb) => {
                cb?.({ event: "Started", data: { contentLength: 100 } });
                cb?.({ event: "Progress", data: { chunkLength: 60 } });
                cb?.({ event: "Progress", data: { chunkLength: 60 } });
                cb?.({ event: "Finished" });
            },
        };
        await comprobarActualizacion();

        const progresos: Array<{ porcentaje?: number; recibidos: number; total?: number }> = [];
        await instalarActualizacion((p) => progresos.push(p));

        expect(progresos.length).toBe(4);
        expect(progresos[0]).toMatchObject({ recibidos: 0, total: 100, porcentaje: 0 });
        expect(progresos[2]).toMatchObject({ recibidos: 120, total: 100, porcentaje: 100 });
        expect(progresos[3]).toMatchObject({ recibidos: 100, total: 100, porcentaje: 100 });
        // El reinicio ocurre tras la instalación (mock del plugin process).
        expect(mockEstado.relanzado).toBe(true);
    });
});
