import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import PanelErrores from "../PanelErrores";
import { registroErrores } from "../../utils/registroErrores";

vi.mock("@tauri-apps/plugin-dialog", () => ({ save: vi.fn() }));
vi.mock("@tauri-apps/plugin-fs", () => ({ writeTextFile: vi.fn() }));
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

afterEach(cleanup);

beforeEach(() => {
    registroErrores.limpiar();
    registroErrores.añadir("error", "consola", "constraint failed: Equipo.pais_id", "stack de insert");
    registroErrores.añadir("warning", "importacion", "país Portugal no encontrado", "filas afectadas");
    registroErrores.añadir("error", "promesa", "TypeError inesperado", "");
});

describe("PanelErrores", () => {
    it("cerrado no renderiza nada (solo diálogos)", () => {
        const { container } = render(<PanelErrores abierto={false} onCerrar={() => {}} />);
        expect(container.querySelector(".fixed")).toBeNull();
    });

    it("abierto muestra las entradas y las marca como vistas", () => {
        render(<PanelErrores abierto onCerrar={() => {}} />);
        expect(screen.getByText("constraint failed: Equipo.pais_id")).toBeTruthy();
        expect(screen.getByText("país Portugal no encontrado")).toBeTruthy();
        expect(screen.getByText("TypeError inesperado")).toBeTruthy();
        expect(registroErrores.noVistos()).toBe(0);
    });

    it("la búsqueda estrecha la lista (mensaje, detalle u origen)", () => {
        render(<PanelErrores abierto onCerrar={() => {}} />);
        fireEvent.change(screen.getByPlaceholderText(/Buscar en mensajes/), {
            target: { value: "pais_id" },
        });
        expect(screen.getByText("constraint failed: Equipo.pais_id")).toBeTruthy();
        expect(screen.queryByText("país Portugal no encontrado")).toBeNull();
        expect(screen.queryByText("TypeError inesperado")).toBeNull();
    });

    it("el filtro por nivel deja solo los avisos", () => {
        render(<PanelErrores abierto onCerrar={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: "Avisos" }));
        expect(screen.getByText("país Portugal no encontrado")).toBeTruthy();
        expect(screen.queryByText("constraint failed: Equipo.pais_id")).toBeNull();
    });

    it("expandir una fila muestra su detalle", () => {
        render(<PanelErrores abierto onCerrar={() => {}} />);
        fireEvent.click(screen.getByText("constraint failed: Equipo.pais_id"));
        expect(screen.getByText(/stack de insert/)).toBeTruthy();
    });

    it("limpiar exige confirmación y cancelar conserva las entradas", async () => {
        render(<PanelErrores abierto onCerrar={() => {}} />);
        fireEvent.click(screen.getByRole("button", { name: /Limpiar/ }));
        // ConfirmDialog destructivo aparece; cancelamos.
        const cancelar = await screen.findByRole("button", { name: "Cancelar" });
        expect(screen.getByText(/Se borrarán todas las entradas/)).toBeTruthy();
        fireEvent.click(cancelar);
        await waitFor(() =>
            expect(screen.getByText("constraint failed: Equipo.pais_id")).toBeTruthy(),
        );
        expect(registroErrores.listar()).toHaveLength(3);
    });

    it("Escape avisa a onCerrar", () => {
        const onCerrar = vi.fn();
        const { container } = render(<PanelErrores abierto onCerrar={onCerrar} />);
        fireEvent.keyDown(container.querySelector(".fixed")!, { key: "Escape" });
        expect(onCerrar).toHaveBeenCalled();
    });
});
