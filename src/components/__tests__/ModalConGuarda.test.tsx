import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";
import Modal from "../Modal";
import { useFormGuard } from "../../hooks/useFormGuard";

/** Réplica del patrón real de las páginas: Modal cuyo onClose pasa por la guarda
    (useFormGuard) y ConfirmDialog renderizado por el propio hook. El contador
    `intentos` cuenta cuántas veces se invoca la guarda: si Escape con el diálogo
    abierto re-disparara la guarda del modal de fondo, subiría de más. */
function Anfitrion() {
    const [form, setForm] = useState({ nombre: "" });
    const [abierto, setAbierto] = useState(false);
    const [intentosGuarda, setIntentosGuarda] = useState(0);
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();

    const cerrarDesdeModal = async () => {
        setIntentosGuarda(c => c + 1);
        const ok = await cerrarSeguro(form, async () => true);
        if (ok) setAbierto(false);
    };

    return (
        <div>
            <button onClick={() => { setForm({ nombre: "" }); iniciar({ nombre: "" }); setAbierto(true); setIntentosGuarda(0); }}>abrir</button>
            <button onClick={() => setForm({ nombre: "editado" })}>ensuciar</button>
            <div data-testid="intentos">{intentosGuarda}</div>
            <div>{abierto ? "modal-abierto" : "modal-cerrado"}</div>
            {abierto && (
                <Modal isOpen onClose={cerrarDesdeModal} title="Editor">
                    <button>campo</button>
                </Modal>
            )}
            {dialogo}
        </div>
    );
}

afterEach(() => cleanup());

describe("Modal con guarda de cambios (ConfirmDialog encima)", () => {
    it("Escape con el diálogo de guarda abierto cierra SOLO el diálogo y no re-dispara la guarda", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("ensuciar"));

        // 1er Escape: modal sucio → aparece la guarda (1 intento de cierre).
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        expect(screen.getByTestId("intentos").textContent).toBe("1");
        expect(screen.getByText("modal-abierto")).toBeTruthy();

        // 2º Escape con la guarda abierta: el diálogo acapara Escape (= seguir
        // editando); el modal de fondo NO debe reaccionar (0 re-disparos).
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => expect(screen.queryByText("Cambios sin guardar")).toBeNull());
        expect(screen.getByText("modal-abierto")).toBeTruthy(); // sigue abierto
        expect(screen.getByTestId("intentos").textContent).toBe("1"); // sin re-disparo

        // 3er Escape: la guarda se rearma exactamente una vez.
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        expect(screen.getByTestId("intentos").textContent).toBe("2");

        // Descartar cambios → se cierra el diálogo y el modal.
        fireEvent.click(screen.getByText("Descartar cambios"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
    });

    it("Escape en un modal limpio cierra directamente, sin mostrar la guarda", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.keyDown(window, { key: "Escape" });
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        expect(screen.queryByText("Cambios sin guardar")).toBeNull();
        expect(screen.getByTestId("intentos").textContent).toBe("1");
    });
});
