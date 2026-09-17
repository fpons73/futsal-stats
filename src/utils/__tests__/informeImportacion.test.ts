import { describe, it, expect, vi } from "vitest";
import {
    InformeImportacion, informeACSV, informeAJSON,
    informeTieneProblemas, exportarInforme,
} from "../informeImportacion";

const informeBase: InformeImportacion = {
    tipo: "equipos",
    fichero: "C:\\Datos\\equipos.csv",
    fecha: "2026-09-17T10:00:00.000Z",
    importados: 120,
    omitidos: 3,
    errores: 1,
    sinPais: 7,
    paisesNoEncontrados: [
        { pais: "Quenia", filas: 12 },
        { pais: "Bosnia e Herzegovina", filas: 4 },
    ],
    filasConError: [
        { fila: 45, identificador: 'Club "La Falda"', error: "UNIQUE constraint failed: Equipo.nombre" },
    ],
};

describe("informeImportacion", () => {
    it("el CSV incluye resumen, países y filas con error", () => {
        const csv = informeACSV(informeBase);
        expect(csv.startsWith("seccion,clave,valor")).toBe(true);
        expect(csv).toContain('resumen,"tipo","equipos"');
        expect(csv).toContain('resumen,"importados",120');
        expect(csv).toContain("pais_no_encontrado,\"Quenia\",12");
        expect(csv).toContain("fila_con_error");
        expect(csv).toContain("UNIQUE constraint failed");
    });

    it("escapa comillas dobles en identificadores", () => {
        const csv = informeACSV(informeBase);
        expect(csv).toContain('"#45 Club ""La Falda"""');
    });

    it("el JSON es redondo: parsearlo devuelve el informe idéntico", () => {
        const deNuevo = JSON.parse(informeAJSON(informeBase)) as InformeImportacion;
        expect(deNuevo).toEqual(informeBase);
    });

    it("informeTieneProblemas: sí con errores o países, no con todo limpio", () => {
        expect(informeTieneProblemas(informeBase)).toBe(true);
        const limpio: InformeImportacion = { ...informeBase, errores: 0, paisesNoEncontrados: [] };
        expect(informeTieneProblemas(limpio)).toBe(false);
    });

    it("exportarInforme respeta el formato elegido y escribe el fichero", async () => {
        const escritas: Array<{ ruta: string; datos: string }> = [];
        const dialogoSave = vi.fn(async () => "C:\\Temp\\informe.csv");
        vi.doMock("@tauri-apps/plugin-dialog", () => ({ save: dialogoSave }));
        vi.doMock("@tauri-apps/plugin-fs", () => ({
            writeTextFile: async (ruta: string, datos: string) => { escritas.push({ ruta, datos }); },
        }));
        await exportarInforme(informeBase, "csv");
        expect(dialogoSave).toHaveBeenCalledWith(expect.objectContaining({
            defaultPath: "informe_importacion_equipos_2026-09-17.csv",
        }));
        expect(escritas).toHaveLength(1);
        expect(escritas[0].datos).toContain("pais_no_encontrado");
        vi.doUnmock("@tauri-apps/plugin-dialog");
        vi.doUnmock("@tauri-apps/plugin-fs");
    });
});
