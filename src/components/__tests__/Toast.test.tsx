import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import { ToastContainer, toast } from "../Toast";

describe("Sistema de toasts", () => {
    beforeEach(() => {
        // El store es un singleton a nivel de módulo: sin esta limpieza, los
        // toasts de un test anterior (con fake timers, nunca expiran) contaminan el siguiente.
        toast.clear();
        vi.useFakeTimers();
    });

    afterEach(() => {
        cleanup();
        vi.useRealTimers();
    });

    it("muestra un toast de éxito con su mensaje", () => {
        act(() => {
            toast.success("Partido guardado");
            render(<ToastContainer />);
        });
        expect(screen.getByText("Partido guardado")).toBeTruthy();
    });

    it("apila varios toasts de distinto tipo simultáneamente", () => {
        act(() => {
            toast.success("Guardado");
            toast.error("Fallo de red");
            toast.warning("Datos incompletos");
            toast.info("Sincronizando");
            render(<ToastContainer />);
        });
        expect(screen.getByText("Guardado")).toBeTruthy();
        expect(screen.getByText("Fallo de red")).toBeTruthy();
        expect(screen.getByText("Datos incompletos")).toBeTruthy();
        expect(screen.getByText("Sincronizando")).toBeTruthy();
        // 4 toasts visibles a la vez
        const botonesCerrar = screen.getAllByTitle("Cerrar");
        expect(botonesCerrar.length).toBe(4);
    });

    it("descarta automáticamente los toasts al expirar la duración", () => {
        act(() => {
            toast.success("Se va solo");
            render(<ToastContainer />);
        });
        expect(screen.getByText("Se va solo")).toBeTruthy();
        // Avanza el reloj más allá de la duración (4200ms) + margen
        act(() => {
            vi.advanceTimersByTime(4500);
        });
        expect(screen.queryByText("Se va solo")).toBeNull();
    });

    it("respeta el máximo de 5 toasts visibles (el más antiguo se descarta)", () => {
        act(() => {
            for (let i = 1; i <= 7; i++) toast.info(`Toast ${i}`);
            render(<ToastContainer />);
        });
        // Con máximo 5, los dos primeros (1 y 2) ya no deben estar
        expect(screen.queryByText("Toast 1")).toBeNull();
        expect(screen.queryByText("Toast 2")).toBeNull();
        expect(screen.getByText("Toast 7")).toBeTruthy();
        const botonesCerrar = screen.getAllByTitle("Cerrar");
        expect(botonesCerrar.length).toBe(5);
    });

    it("no apila duplicados consecutivos (doble clic en guardar)", () => {
        act(() => {
            toast.success("Acta guardada");
            toast.success("Acta guardada");
            toast.success("Acta guardada");
            render(<ToastContainer />);
        });
        // Los 3 avisos idénticos consecutivos colapsan en uno solo
        expect(screen.getAllByText("Acta guardada").length).toBe(1);
        // Pero uno distinto sí se apila
        act(() => {
            toast.success("Acta guardada"); // aún consecutivo: colapsa
            toast.error("Acta guardada");   // cambia el tipo: sí aparece
        });
        expect(screen.getAllByText("Acta guardada").length).toBe(2);
    });

    it("cierra manualmente un toast con su botón de cerrar", () => {
        act(() => {
            toast.error("Error manual");
            render(<ToastContainer />);
        });
        const cerrar = screen.getByTitle("Cerrar");
        act(() => {
            fireEvent.click(cerrar);
        });
        expect(screen.queryByText("Error manual")).toBeNull();
    });

    it("cada toast expira de forma independiente", () => {
        act(() => {
            toast.success("Primero");
            render(<ToastContainer />);
        });
        act(() => {
            vi.advanceTimersByTime(2000);
            toast.error("Segundo");
        });
        // A los 2s de vida, el primero sigue visible
        expect(screen.getByText("Primero")).toBeTruthy();
        act(() => {
            vi.advanceTimersByTime(2500); // total 4.5s desde el primero, 2.5s desde el segundo
        });
        expect(screen.queryByText("Primero")).toBeNull();
        expect(screen.getByText("Segundo")).toBeTruthy();
    });
});
