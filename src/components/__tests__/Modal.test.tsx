import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import Modal from "../Modal";

function montar(onClose: () => void, props: Record<string, unknown> = {}) {
    return render(
        <Modal isOpen onClose={onClose} title="Prueba" {...props}>
            <button>contenido</button>
        </Modal>
    );
}

/** El overlay es el único .fixed.inset-0 montado; el panel es abuelo del título. */
const overlay = () => document.querySelector(".fixed.inset-0") as HTMLElement;
const panel = () => screen.getByText("Prueba").parentElement!.parentElement! as HTMLElement;

afterEach(cleanup);

describe("Modal: cierre por clic en el fondo", () => {
    it("un clic en el fondo llama a onClose (ruta de la guarda)", () => {
        const onClose = vi.fn();
        montar(onClose);
        fireEvent.click(overlay());
        expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("un clic dentro del panel NO cierra (stopPropagation)", () => {
        const onClose = vi.fn();
        montar(onClose);
        fireEvent.click(screen.getByText("contenido"));
        fireEvent.click(panel());
        expect(onClose).not.toHaveBeenCalled();
    });

    it("con cerrarAlClicarFuera=false el clic en el fondo no hace nada", () => {
        const onClose = vi.fn();
        montar(onClose, { cerrarAlClicarFuera: false });
        fireEvent.click(overlay());
        expect(onClose).not.toHaveBeenCalled();
    });

    it("el botón de la cabecera (X) sigue cerrando con el fondo desactivado", () => {
        const onClose = vi.fn();
        montar(onClose, { cerrarAlClicarFuera: false });
        fireEvent.click(screen.getByText("Prueba").nextElementSibling as HTMLElement);
        expect(onClose).toHaveBeenCalledTimes(1);
    });
});

describe("Modal: pie, ancho y teclas extra", () => {
    it("el footer se renderiza como pie del modal", () => {
        montar(() => {}, { footer: <button>Pie</button> });
        expect(screen.getByText("Pie")).toBeTruthy();
    });

    it("ancho personalizado reemplaza max-w-4xl en el panel", () => {
        montar(() => {}, { ancho: "max-w-lg" });
        expect(panel().className).toContain("max-w-lg");
        expect(panel().className).not.toContain("max-w-4xl");
    });

    it("onKeyDown recibe las teclas que no son Escape", () => {
        const extra = vi.fn();
        const onClose = vi.fn();
        montar(onClose, { onKeyDown: extra });
        fireEvent.keyDown(window, { key: "Enter" });
        expect(extra).toHaveBeenCalledTimes(1);
        expect(onClose).not.toHaveBeenCalled();
    });

    it("Escape lo gestiona el Modal y no llega a onKeyDown", () => {
        const extra = vi.fn();
        const onClose = vi.fn();
        montar(onClose, { onKeyDown: extra });
        fireEvent.keyDown(window, { key: "Escape" });
        expect(onClose).toHaveBeenCalledTimes(1);
        expect(extra).not.toHaveBeenCalled();
    });
});
