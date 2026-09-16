import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ModalEvento } from "../ModalEvento";

// El plugin sql de Tauri no existe en jsdom; se simula con una BD en memoria.
const ejecutar = vi.fn(async () => {});
const seleccionar = vi.fn(async () => []);

vi.mock("@tauri-apps/plugin-sql", () => ({
    default: {
        load: vi.fn(async () => ({ select: seleccionar, execute: ejecutar })),
    },
}));

const PARTIDO = { id: 1, local_id: 1, visitante_id: 2 };

function montar(extra: Record<string, unknown> = {}) {
    const onClose = vi.fn();
    const onSave = vi.fn();
    render(
        <ModalEvento
            isOpen
            onClose={onClose}
            onSave={onSave}
            partido={PARTIDO}
            localId={1}
            visitanteId={2}
            {...extra}
        />
    );
    return { onClose, onSave };
}

afterEach(cleanup);

describe("ModalEvento compuesto sobre el Modal base", () => {
    it("se abre como dialog modal del ancho compacto (max-w-lg)", () => {
        montar();
        const panel = screen.getByRole("dialog");
        expect(panel.className).toContain("max-w-lg");
    });

    it("Enter guarda y cierra (onSave + onClose)", async () => {
        const { onClose, onSave } = montar();
        fireEvent.keyDown(window, { key: "Enter" });
        await vi.waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("Escape limpio cierra directo sin pasar por la guarda", async () => {
        const { onClose } = montar();
        fireEvent.keyDown(window, { key: "Escape" });
        await vi.waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(screen.queryByRole("alertdialog")).toBeNull();
    });

    it("Escape con cambios abre la guarda y no cierra", async () => {
        const { onClose } = montar();
        fireEvent.change(screen.getByPlaceholderText("Notas adicionales..."), {
            target: { value: "editado" },
        });
        fireEvent.keyDown(window, { key: "Escape" });
        await vi.waitFor(() => expect(screen.getByRole("alertdialog")).toBeTruthy());
        expect(onClose).not.toHaveBeenCalled();
    });

    it("clic en el fondo NO cierra por defecto (cerrarAlClicarFuera=false)", () => {
        const { onClose } = montar();
        fireEvent.click(document.querySelector(".fixed.inset-0") as HTMLElement);
        expect(onClose).not.toHaveBeenCalled();
    });
});