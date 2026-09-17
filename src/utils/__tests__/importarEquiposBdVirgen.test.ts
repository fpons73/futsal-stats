// Bug de primera instalación destapado por el E2E: con la BD virgen la tabla
// Pais está vacía y Equipo.pais_id es NOT NULL → el 100% del CSV moría con
// "NOT NULL constraint failed". Estos tests fijan el contrato: el importador
// crea el país "Desconocido" (idempotente) y las filas no encontradas caen
// en él, contadas en el informe, en vez de morir.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { importarEquiposCSV, ULTIMOS_INFORMES } from "../importadorMasivo";

/** BD falsa con las reglas reales que importan al importador:
 *  - Pais con UNIQUE(nombre) (como en migración 1).
 *  - Equipo.pais_id NOT NULL: un INSERT con null lanza el error SQLite real. */
function crearBdFalsa() {
  const paises: Array<{ id: number; nombre: string }> = [];
  const equipos: Array<{ nombre: string; pais_id: number | null }> = [];
  const db = {
    select: vi.fn(async (sql: string) => {
      if (sql.includes("FROM Pais")) return structuredClone(paises);
      if (sql.includes("FROM Equipo")) return equipos.map((e) => ({ nombre: e.nombre }));
      throw new Error("SELECT no previsto en el mock: " + sql);
    }),
    execute: vi.fn(async (sql: string, params: any[] = []) => {
      if (sql.includes("INSERT INTO Pais")) {
        // El importador inserta 'Desconocido' como literal SQL (sin params);
        // otros posibles inserts van con ? → params[0].
        const nombre = params.length > 0
          ? String(params[0])
          : (sql.match(/VALUES\s*\('([^']*)'/)?.[1] ?? "");
        if (paises.some((p) => p.nombre === nombre))
          throw new Error("UNIQUE constraint failed: Pais.nombre");
        paises.push({ id: paises.length + 1, nombre });
        return;
      }
      if (sql.includes("INSERT INTO Equipo")) {
        const paisId = params[2] as number | null;
        if (paisId === null || paisId === undefined)
          throw new Error("(code: 1299) NOT NULL constraint failed: Equipo.pais_id");
        equipos.push({ nombre: String(params[0]), pais_id: paisId });
        return;
      }
      throw new Error("INSERT no previsto en el mock: " + sql);
    }),
  };
  return { db, paises, equipos };
}

const bd = vi.hoisted(() => crearBdFalsa());

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: { load: vi.fn(async () => bd.db) },
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ readTextFile: vi.fn() }));

import { readTextFile } from "@tauri-apps/plugin-fs";

const RUTA = "C:/falsa/equipos.csv";

beforeEach(() => {
  bd.paises.length = 0;
  bd.equipos.length = 0;
  delete ULTIMOS_INFORMES["equipos"];
  vi.mocked(readTextFile).mockReset();
});

describe("importarEquiposCSV sobre BD virgen (sin países)", () => {
  it("crea 'Desconocido', importa los equipos y ningún país del CSV muere en NOT NULL", async () => {
    (readTextFile as Mock).mockResolvedValue(
      "nombre,pais\nCP Ferro,Portugal\nUSC Paredes,Benín\n",
    );

    const resumen = await importarEquiposCSV(RUTA);

    expect(bd.paises.map((p) => p.nombre)).toContain("Desconocido");
    expect(bd.equipos).toHaveLength(2);
    // Portugal tampoco existe en la BD virgen → ambos caen en Desconocido,
    // contados como países no encontrados del informe (no como errores SQL).
    const idDesc = bd.paises.find((p) => p.nombre === "Desconocido")!.id;
    expect(bd.equipos.every((e) => e.pais_id === idDesc)).toBe(true);
    expect(resumen).toContain("2 equipos importados");
    expect(resumen).toContain("0 errores");
  });

  it("registra los países no encontrados en el informe exportable", async () => {
    (readTextFile as Mock).mockResolvedValue("nombre,pais\nCP Ferro,Portugal\n");

    await importarEquiposCSV(RUTA);

    const informe = ULTIMOS_INFORMES["equipos"];
    expect(informe.paisesNoEncontrados).toEqual([{ pais: "Portugal", filas: 1 }]);
    expect(informe.errores).toBe(0);
  });

  it("filas sin país en el CSV → Desconocido, contadas como sinPais", async () => {
    (readTextFile as Mock).mockResolvedValue("nombre\nEquipo Sin Pais\n");

    const resumen = await importarEquiposCSV(RUTA);

    expect(resumen).toContain("1 sin país en el CSV");
    expect(bd.equipos).toHaveLength(1);
    expect(bd.equipos[0].pais_id).not.toBeNull();
  });

  it("es idempotente: reimportar no duplica equipos ni crea otro Desconocido", async () => {
    (readTextFile as Mock)
      .mockResolvedValueOnce("nombre,pais\nCP Ferro,Portugal\n")
      .mockResolvedValueOnce("nombre,pais\nCP Ferro,Portugal\n");

    await importarEquiposCSV(RUTA);
    const resumen2 = await importarEquiposCSV(RUTA);

    expect(bd.paises.filter((p) => p.nombre === "Desconocido")).toHaveLength(1);
    expect(bd.equipos).toHaveLength(1);
    expect(resumen2).toContain("0 equipos importados, 1 omitidos");
  });
});
