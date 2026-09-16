import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { useState } from "react";
import { useFormGuard, esFormularioSucio } from "../useFormGuard";

/** Anfitrión mínimo que replica el patrón de las páginas: formulario en estado,
    guardar que reporta éxito, y cierre seguro con el guard. Con conGuardado=false
    ejercita el diálogo de dos botones (sin acción de guardado). */
function Anfitrion({ exitoGuardado = true, conGuardado = true }: { exitoGuardado?: boolean; conGuardado?: boolean }) {
    const [form, setForm] = useState({ nombre: "", pais: "" });
    const [abierto, setAbierto] = useState(false);
    const [mensaje, setMensaje] = useState("");
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();

    const guardar = async () => {
        if (!exitoGuardado) return false;
        setMensaje("guardado");
        return true;
    };

    return (
        <div>
            <button onClick={() => { setForm({ nombre: "", pais: "" }); iniciar({ nombre: "", pais: "" }); setAbierto(true); setMensaje(""); }}>
                abrir
            </button>
            <button onClick={() => { setForm({ nombre: "editado", pais: "" }); }}>editar</button>
            <button onClick={async () => {
                const ok = conGuardado ? await cerrarSeguro(form, guardar) : await cerrarSeguro(form);
                if (ok) setAbierto(false);
            }}>
                cerrar
            </button>
            <div>{abierto ? "modal-abierto" : "modal-cerrado"}</div>
            <div>{form.nombre}</div>
            <div>{mensaje}</div>
            {dialogo}
        </div>
    );
}

describe("esFormularioSucio", () => {
    it("detecta un campo modificado", () => {
        expect(esFormularioSucio({ a: 1, b: "x" }, { a: 1, b: "y" })).toBe(true);
    });
    it("formularios idénticos no están sucios", () => {
        expect(esFormularioSucio({ a: 1, b: "x" }, { a: 1, b: "x" })).toBe(false);
    });
    it("sin baseline (null) nunca está sucio", () => {
        expect(esFormularioSucio({ a: 1 }, null)).toBe(false);
    });
    it("una clave con valor real solo en un lado está sucia (null ≠ ausente)", () => {
        expect(esFormularioSucio({ a: 1, b: null }, { a: 1 })).toBe(true);
        expect(esFormularioSucio({ a: 1 }, { a: 1, b: null })).toBe(true);
    });
    it("undefined y ausente se tratan igual (ambos = sin valor): limpio", () => {
        expect(esFormularioSucio({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    });
    it("no muta ninguno de los dos objetos", () => {
        const a = { x: 1 };
        const b = { x: 2 };
        esFormularioSucio(a, b);
        expect(a).toEqual({ x: 1 });
        expect(b).toEqual({ x: 2 });
    });
});

describe("useFormGuard", () => {
    it("cierra sin preguntar si el formulario está limpio", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        expect(screen.queryByText("Cambios sin guardar")).toBeNull();
        cleanup();
    });

    it("con cambios pendientes pregunta y descartar cierra sin guardar", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar")); // form.nombre = "editado"
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        expect(screen.queryByText("modal-cerrado")).toBeNull(); // aún abierto
        fireEvent.click(screen.getByText("Descartar cambios"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        expect(screen.queryByText("guardado")).toBeNull(); // NO guardó
        cleanup();
    });

    it("Guardar y cerrar guarda y cierra cuando el guardado triunfa", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        fireEvent.click(screen.getByText("Guardar y cerrar"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        expect(screen.getByText("guardado")).toBeTruthy();
        cleanup();
    });

    it("Guardar y cerrar mantiene el modal abierto si el guardado falla", async () => {
        render(<Anfitrion exitoGuardado={false} />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        fireEvent.click(screen.getByText("Guardar y cerrar"));
        await waitFor(() => {
            expect(screen.queryByText("Cambios sin guardar")).toBeNull(); // diálogo cerrado
            expect(screen.getByText("modal-abierto")).toBeTruthy();      // pero modal sigue
        });
        cleanup();
    });

    it("Seguir editando mantiene el modal abierto con los cambios intactos", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        fireEvent.click(screen.getByText("Seguir editando"));
        await waitFor(() => expect(screen.getByText("modal-abierto")).toBeTruthy());
        expect(screen.getByText("editado")).toBeTruthy(); // cambios intactos
        cleanup();
    });

    it("reabrir tras guardar resetea la baseline (segundo ciclo limpio)", async () => {
        render(<Anfitrion />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        fireEvent.click(screen.getByText("Descartar cambios"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        // Segundo ciclo: abrir de nuevo no debe heredar la baseline anterior
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        expect(screen.queryByText("Cambios sin guardar")).toBeNull();
        cleanup();
    });

    it("sin acción de guardado muestra un diálogo de dos botones y descartar cierra", async () => {
        render(<Anfitrion conGuardado={false} />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        expect(screen.queryByText("Guardar y cerrar")).toBeNull(); // sin tercera opción
        fireEvent.click(screen.getByText("Descartar cambios"));
        await waitFor(() => expect(screen.getByText("modal-cerrado")).toBeTruthy());
        cleanup();
    });

    it("sin acción de guardado, 'Seguir editando' mantiene el modal abierto", async () => {
        render(<Anfitrion conGuardado={false} />);
        fireEvent.click(screen.getByText("abrir"));
        fireEvent.click(screen.getByText("editar"));
        fireEvent.click(screen.getByText("cerrar"));
        await waitFor(() => expect(screen.getByText("Cambios sin guardar")).toBeTruthy());
        fireEvent.click(screen.getByText("Seguir editando"));
        await waitFor(() => expect(screen.getByText("modal-abierto")).toBeTruthy());
        expect(screen.getByText("editado")).toBeTruthy(); // cambios intactos
        cleanup();
    });
});
