import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import Onboarding from "../Onboarding";

// ── Mocks de plugins Tauri ──────────────────────────────────────────────
// invoke: leer_carpeta_datos → null (no hay carpeta guardada).
vi.mock("@tauri-apps/api/core", () => ({
    invoke: vi.fn(async () => null),
}));

// plugin-fs: readDir configurable por test.
const leerDir = vi.fn(async (_ruta: string): Promise<{ isFile: boolean; name: string }[]> => []);
vi.mock("@tauri-apps/plugin-fs", () => ({
    readDir: (ruta: string) => leerDir(ruta),
}));

// plugin-dialog: nunca se usa en estos tests (carpeta ya sugerida).
vi.mock("@tauri-apps/plugin-dialog", () => ({
    open: vi.fn(async () => null),
}));

// plugin-sql: BD en memoria para la db.ts real (getPreferencia/setPreferencia).
let conteos = { p: 0, e: 0 };
vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({
            select: vi.fn(async (sql: string) =>
                sql.includes("FROM Persona") ? [conteos] : []
            ),
            execute: vi.fn(async () => ({ rowsAffected: 1 })),
        })),
    },
}));

// Importadores: espías puros (el asistente nunca debe tocarlos con diálogo).
const equipos = vi.fn(async (_r?: string) => "2 equipos importados");
const competiciones = vi.fn(async (_r?: string) => "5 competiciones importadas");
const jugadores = vi.fn(async (_r?: string) => "10 jugadores importados");
const entrenadores = vi.fn(async (_r?: string) => "1 entrenador importado");
vi.mock("../../utils/importadorMasivo", () => ({
    importarEquiposCSV: (...a: unknown[]) => equipos(...(a as [string?])),
    importarCompeticionesCSV: (...a: unknown[]) => competiciones(...(a as [string?])),
    importarJugadoresCSV: (...a: unknown[]) => jugadores(...(a as [string?])),
    importarEntrenadoresCSV: (...a: unknown[]) => entrenadores(...(a as [string?])),
    // Registro de informes (tarea 1.2): vacío en tests — sin avisos que exportar.
    ULTIMOS_INFORMES: {},
}));

const CSVs = [
    { isFile: true, name: "Enciclopedia_Futsal_Equipas_Masculino1.csv" },
    { isFile: true, name: "Enciclopedia_Futsal_Jogadores_Activos_Masculino1.csv" },
    { isFile: true, name: "Enciclopedia_Futsal_Jogadores_Activos_Masculino2.csv" },
    { isFile: true, name: "Enciclopedia_Futsal_Competicoes_Masculino.csv" },
    { isFile: true, name: "Enciclopedia_Futsal_Entrenadores_Masculino1.csv" },
];

beforeEach(() => {
    vi.clearAllMocks();
    conteos = { p: 0, e: 0 };
    leerDir.mockResolvedValue(CSVs);
});

describe("Onboarding", () => {
    it("detecta los CSV de la carpeta y muestra los cuatro pasos", async () => {
        render(<Onboarding onSaltar={() => {}} />);
        expect(screen.getByText(/Bienvenido a Global Futsal Stats/i)).toBeTruthy();
        await waitFor(() =>
            expect(screen.getByText(/5 fichero\(s\) CSV de la Enciclopedia detectados/i)).toBeTruthy(),
        );
        for (const paso of ["Equipos", "Competiciones", "Jugadores", "Entrenadores"]) {
            expect(screen.getByText(paso)).toBeTruthy();
        }
    });

    it("Empezar importa en orden con rutas predefinidas y marca completado", async () => {
        render(<Onboarding onSaltar={() => {}} />);
        const boton = await screen.findByRole("button", { name: /Empezar/i });
        expect(boton.hasAttribute("disabled")).toBe(false);
        fireEvent.click(boton);

        await waitFor(() => expect(equipos).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(competiciones).toHaveBeenCalledTimes(1));
        // Jugadores: dos ficheros CSV → una llamada por fichero, con ruta unida.
        await waitFor(() => expect(jugadores).toHaveBeenCalledTimes(2));
        expect(jugadores.mock.calls[0][0]).toMatch(/Enciclopedia_Futsal_Jogadores_Activos_Masculino1\.csv$/);
        expect(jugadores.mock.calls[1][0]).toMatch(/Enciclopedia_Futsal_Jogadores_Activos_Masculino2\.csv$/);
        await waitFor(() => expect(entrenadores).toHaveBeenCalledTimes(1));
        // Los cuatro reciben ruta predefinida (nunca abren diálogo).
        expect(equipos.mock.calls[0][0]).toBeTruthy();
        await waitFor(() => expect(screen.getAllByText("Completado")).toHaveLength(4));
    });

    it("un paso sin ficheros queda omitido y los demás continúan", async () => {
        leerDir.mockResolvedValue([
            { isFile: true, name: "Enciclopedia_Futsal_Equipas_Masculino1.csv" },
        ]);
        render(<Onboarding onSaltar={() => {}} />);
        fireEvent.click(await screen.findByRole("button", { name: /Empezar/i }));
        await waitFor(() => expect(equipos).toHaveBeenCalledTimes(1));
        // Competiciones, jugadores y entrenadores quedan sin ficheros (3 omitidos).
        await waitFor(() => expect(screen.getAllByText("Sin ficheros")).toHaveLength(3));
        await waitFor(() => expect(screen.getAllByText("Completado")).toHaveLength(1));
        // Jugadores/Entrenadores no se llamaron: no hay ficheros que casen.
        expect(jugadores).not.toHaveBeenCalled();
        expect(entrenadores).not.toHaveBeenCalled();
    });

    it("Saltar cierra el asistente sin importar nada", async () => {
        const onSaltar = vi.fn();
        render(<Onboarding onSaltar={onSaltar} />);
        fireEvent.click(screen.getByRole("button", { name: /Saltar/i }));
        expect(onSaltar).toHaveBeenCalledTimes(1);
        expect(equipos).not.toHaveBeenCalled();
        expect(competiciones).not.toHaveBeenCalled();
        expect(jugadores).not.toHaveBeenCalled();
        expect(entrenadores).not.toHaveBeenCalled();
    });
});

afterEach(cleanup);
