import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import { useDialogFocus } from "../useDialogFocus";

/** Diálogo mínimo con disparador, replicando el patrón de los componentes reales. */
function Anfitrion({ onEscape }: { onEscape?: () => void }) {
    const [abierto, setAbierto] = useState(false);
    const panelRef = useDialogFocus({
        activo: abierto,
        onKeyDown: (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onEscape?.();
                setAbierto(false);
            }
        },
    });
    return (
        <div>
            <button onClick={() => setAbierto(true)}>abrir</button>
            {abierto && (
                <div ref={panelRef} tabIndex={-1} data-testid="panel">
                    <button onClick={() => setAbierto(false)}>cerrar</button>
                    <button>medio</button>
                    <button data-testid="ultimo">ultimo</button>
                </div>
            )}
        </div>
    );
}

/** Diálogo con un botón autoFocus interno (como el botón principal de ConfirmDialog). */
function AnfitrionAutoFocus() {
    const [abierto, setAbierto] = useState(false);
    const panelRef = useDialogFocus({ activo: abierto });
    return (
        <div>
            <button onClick={() => setAbierto(true)}>abrir</button>
            {abierto && (
                <div ref={panelRef} tabIndex={-1} data-testid="panel">
                    <button>otro</button>
                    <button autoFocus data-testid="principal">principal</button>
                </div>
            )}
        </div>
    );
}

/** Diálogo externo con confirmación anidada: dos useDialogFocus apilados. */
function AnfitrionApilado({ onEscapeExterno }: { onEscapeExterno: () => void }) {
    const [abierto, setAbierto] = useState(false);
    const [confirmacion, setConfirmacion] = useState(false);
    const [escapesExternos, setEscapesExternos] = useState(0);
    const panelRef = useDialogFocus({
        activo: abierto,
        onKeyDown: (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onEscapeExterno();
                setEscapesExternos(c => c + 1);
            }
        },
    });
    const panelInternoRef = useDialogFocus({
        activo: confirmacion,
        onKeyDown: (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                setConfirmacion(false);
            }
        },
    });
    return (
        <div>
            <button onClick={() => setAbierto(true)}>abrir-externo</button>
            {abierto && (
                <div ref={panelRef} tabIndex={-1} data-testid="panel-externo">
                    <button onClick={() => setConfirmacion(true)}>abrir-interno</button>
                    <span data-testid="contador">{escapesExternos}</span>
                    {confirmacion && (
                        <div ref={panelInternoRef} tabIndex={-1} data-testid="panel-interno">
                            <button onClick={() => setConfirmacion(false)}>cancelar-interno</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

const activo = () => document.activeElement as HTMLElement;

describe("useDialogFocus", () => {
    it("al abrir mueve el foco al panel", () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        expect(activo()).toBe(screen.getByTestId("panel"));
        cleanup();
    });

    it("respeta el autoFocus interno (no lo pisa con el foco del panel)", () => {
        render(<AnfitrionAutoFocus />);
        fireEvent.click(screen.getByText("abrir"));
        expect(activo()).toBe(screen.getByTestId("principal"));
        cleanup();
    });

    it("Tab en el último focable vuelve al primero", () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        screen.getByTestId("ultimo").focus();
        fireEvent.keyDown(window, { key: "Tab" });
        expect(activo()).toBe(screen.getByText("cerrar")); // primero del panel
        cleanup();
    });

    it("Shift+Tab en el primer focable va al último", () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        screen.getByText("cerrar").focus(); // primero del panel
        fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
        expect(activo()).toBe(screen.getByTestId("ultimo"));
        cleanup();
    });

    it("Tab reincorpora el foco si se coló fuera del panel", () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        screen.getByText("abrir").focus(); // fuera del panel
        fireEvent.keyDown(window, { key: "Tab" });
        expect(screen.getByTestId("panel").contains(activo())).toBe(true);
        cleanup();
    });

    it("al cerrar devuelve el foco al disparador", () => {
        render(<Anfitrion />);
        const disparador = screen.getByText("abrir");
        disparador.focus();
        fireEvent.click(disparador);
        expect(activo()).toBe(screen.getByTestId("panel")); // el foco entró
        fireEvent.click(screen.getByText("cerrar"));
        expect(activo()).toBe(disparador); // y vuelve al salir
        cleanup();
    });

    it("Escape solo lo atiende el diálogo: cerrado no dispara nada", () => {
        let escapes = 0;
        render(<Anfitrion onEscape={() => { escapes++; }} />);
        fireEvent.keyDown(window, { key: "Escape" });
        expect(escapes).toBe(0);
        cleanup();
    });
});

describe("useDialogFocus apilado (confirmación sobre diálogo)", () => {
    it("con confirmación encima, Escape la cierra a ella y no al diálogo de fondo", () => {
        let escapeExterno = 0;
        render(<AnfitrionApilado onEscapeExterno={() => { escapeExterno++; }} />);
        fireEvent.click(screen.getByText("abrir-externo"));
        fireEvent.click(screen.getByText("abrir-interno"));
        expect(screen.getByTestId("panel-interno")).toBeTruthy();

        fireEvent.keyDown(window, { key: "Escape" });
        expect(screen.queryByTestId("panel-interno")).toBeNull(); // se cerró el interno
        expect(screen.getByTestId("panel-externo")).toBeTruthy(); // el externo sigue
        expect(screen.getByTestId("contador").textContent).toBe("0");
        expect(escapeExterno).toBe(0);
        cleanup();
    });

    it("al cerrarse la confirmación, el foco vuelve al diálogo de fondo", () => {
        render(<AnfitrionApilado onEscapeExterno={() => { }} />);
        fireEvent.click(screen.getByText("abrir-externo"));
        fireEvent.click(screen.getByText("abrir-interno"));
        fireEvent.keyDown(window, { key: "Escape" });
        expect(activo()).toBe(screen.getByTestId("panel-externo"));
        cleanup();
    });

    it("cerrada la confirmación, el diálogo de fondo vuelve a atender Escape", () => {
        let escapeExterno = 0;
        render(<AnfitrionApilado onEscapeExterno={() => { escapeExterno++; }} />);
        fireEvent.click(screen.getByText("abrir-externo"));
        fireEvent.click(screen.getByText("abrir-interno"));
        fireEvent.keyDown(window, { key: "Escape" }); // cierra el interno
        fireEvent.keyDown(window, { key: "Escape" }); // ahora el externo
        expect(escapeExterno).toBe(1);
        expect(screen.getByTestId("contador").textContent).toBe("1");
        cleanup();
    });

    it("Tab queda atrapado en el diálogo superior mientras la confirmación esté abierta", () => {
        render(<AnfitrionApilado onEscapeExterno={() => { }} />);
        fireEvent.click(screen.getByText("abrir-externo"));
        fireEvent.click(screen.getByText("abrir-interno"));
        // El foco está en el panel interno; Tab debe ciclar dentro del interno,
        // sin sacar el foco al panel externo.
        fireEvent.keyDown(window, { key: "Tab" });
        expect(screen.getByTestId("panel-interno").contains(activo())).toBe(true);
        cleanup();
    });
});
