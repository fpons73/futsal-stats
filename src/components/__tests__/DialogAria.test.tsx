import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import Modal from "../Modal";
import { ModalEvento } from "../ModalEvento";
import ConfirmDialog from "../ConfirmDialog";

// ModalEvento importa el plugin sql de Tauri; en jsdom no hay Database real,
// pero ningún flujo de estos tests llega a usarla.
vi.mock("@tauri-apps/plugin-sql", () => ({ default: { load: vi.fn() } }));

afterEach(cleanup);

describe("Semántica ARIA de los diálogos", () => {
    it("Modal se anuncia como dialog modal etiquetado por su título", () => {
        render(
            <Modal isOpen onClose={() => {}} title="Datos del Partido">
                <button>contenido</button>
            </Modal>
        );

        const panel = screen.getByRole("dialog");
        expect(panel.getAttribute("aria-modal")).toBe("true");

        const labelledby = panel.getAttribute("aria-labelledby");
        expect(labelledby).toBeTruthy();
        expect(document.getElementById(labelledby!)?.textContent).toBe("Datos del Partido");
    });

    it("ModalEvento se anuncia como dialog modal etiquetado por su título", () => {
        render(
            <ModalEvento
                isOpen
                onClose={() => {}}
                onSave={() => {}}
                partido={null}
                localId={1}
                visitanteId={2}
            />
        );

        const panel = screen.getByRole("dialog");
        expect(panel.getAttribute("aria-modal")).toBe("true");

        const labelledby = panel.getAttribute("aria-labelledby");
        expect(labelledby).toBeTruthy();
        expect(document.getElementById(labelledby!)?.textContent).toBe("Nuevo Evento");
    });

    it("ConfirmDialog se anuncia como alertdialog etiquetado por su título", () => {
        render(
            <ConfirmDialog isOpen mensaje="¿Seguro?" titulo="Eliminar partido" onConfirmar={() => {}} onCancelar={() => {}} />
        );

        const panel = screen.getByRole("alertdialog");
        expect(panel.getAttribute("aria-modal")).toBe("true");

        const labelledby = panel.getAttribute("aria-labelledby");
        expect(labelledby).toBeTruthy();
        expect(document.getElementById(labelledby!)?.textContent).toBe("Eliminar partido");
    });

    it("Modal cerrado no anuncia ningún dialog", () => {
        render(
            <Modal isOpen={false} onClose={() => {}} title="X">
                <p>y</p>
            </Modal>
        );
        expect(screen.queryByRole("dialog")).toBeNull();
    });

    it("dos modales apilados no comparten etiqueta (useId único por instancia)", () => {
        render(
            <>
                <Modal isOpen onClose={() => {}} title="Fondo"><p>a</p></Modal>
                <Modal isOpen onClose={() => {}} title="Encima"><p>b</p></Modal>
            </>
        );

        const ids = screen.getAllByRole("dialog").map((d) => d.getAttribute("aria-labelledby"));
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
    });
});