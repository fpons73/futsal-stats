// Tests de la paleta de búsqueda global (B4): atajo Ctrl+K, render agrupado de
// resultados y navegación por teclado hasta el destino. El servicio se mockea
// para probar el componente de forma aislada; el servicio real tiene sus
// propios tests.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { useState } from "react";
import BuscadorGlobal from "../BuscadorGlobal";
import type { ResultadoBusqueda } from "../../services/buscadorService";

const buscarGlobalMock = vi.fn<(q: string) => Promise<ResultadoBusqueda[]>>();

vi.mock("../../services/buscadorService", () => ({
    buscarGlobal: (q: string) => buscarGlobalMock(q),
    invalidarIndiceBusqueda: vi.fn(),
}));

/** Captura la ubicación actual para verificar la navegación al seleccionar. */
function RutaProbe() {
    const loc = useLocation();
    return <span data-testid="ruta">{loc.pathname + loc.search}</span>;
}

/** Anfitrión con estado, replicando cómo App monta la paleta. */
function Anfitrion() {
    const [abierto, setAbierto] = useState(false);
    return (
        <MemoryRouter>
            <BuscadorGlobal
                abierto={abierto}
                alAbrir={() => setAbierto(true)}
                alCerrar={() => setAbierto(false)}
            />
            <RutaProbe />
        </MemoryRouter>
    );
}

const RESULTADOS: ResultadoBusqueda[] = [
    { tipo: "persona", id: 1, titulo: "Rafa", subtitulo: "Cierre", ruta: "/jugadores?q=Rafa", fuente: "Rafa Rafael García" },
    { tipo: "equipo", id: 10, titulo: "ElPozo Murcia", subtitulo: "Primera División", ruta: "/equipos?q=ElPozo%20Murcia", fuente: "ElPozo Murcia" },
];

describe("BuscadorGlobal", () => {
    beforeEach(() => {
        buscarGlobalMock.mockReset();
    });
    afterEach(() => cleanup());

    it("Ctrl+K abre la paleta y la pinta con el campo enfocado", async () => {
        render(<Anfitrion />);
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        const input = screen.getByLabelText("Término de búsqueda");
        expect(input).toBeTruthy();
        // El foco llega vía requestAnimationFrame (tras el foco del panel del Modal).
        await waitFor(() => expect(document.activeElement).toBe(input));
    });

    it("sin resultados vacíos por debajo de 2 caracteres no consulta el servicio", async () => {
        render(<Anfitrion />);
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        fireEvent.change(screen.getByLabelText("Término de búsqueda"), { target: { value: "r" } });
        await new Promise((r) => setTimeout(r, 200));
        expect(buscarGlobalMock).not.toHaveBeenCalled();
    });

    it("escribe, muestra resultados agrupados y navega con Enter tras mover la selección", async () => {
        buscarGlobalMock.mockResolvedValue(RESULTADOS);
        render(<Anfitrion />);
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });

        const input = screen.getByLabelText("Término de búsqueda");
        fireEvent.change(input, { target: { value: "rafa" } });

        await waitFor(() => {
            expect(buscarGlobalMock).toHaveBeenCalledWith("rafa");
        });
        await waitFor(() => {
            expect(screen.getByText("Rafa")).toBeTruthy();
            expect(screen.getByText("ElPozo Murcia")).toBeTruthy();
            // Cabeceras de grupo solo con elementos
            expect(screen.getByText("Equipos")).toBeTruthy();
            expect(screen.getByText("Personas")).toBeTruthy();
        });

        // ↓ mueve a "ElPozo Murcia" (2º resultado plano) y ↵ navega allí.
        fireEvent.keyDown(window, { key: "ArrowDown" });
        fireEvent.keyDown(window, { key: "Enter" });

        await waitFor(() => {
            expect(screen.getByTestId("ruta").textContent).toBe("/equipos?q=ElPozo%20Murcia");
        });
        // La paleta se cierra al navegar.
        expect(screen.queryByLabelText("Término de búsqueda")).toBeNull();
    });

    it("Enter sin selección posible no navega y no rompe", async () => {
        buscarGlobalMock.mockResolvedValue([]);
        render(<Anfitrion />);
        fireEvent.keyDown(window, { key: "k", ctrlKey: true });
        fireEvent.change(screen.getByLabelText("Término de búsqueda"), { target: { value: "xyz" } });
        await waitFor(() => expect(screen.getByText(/Sin resultados/i)).toBeTruthy());
        fireEvent.keyDown(window, { key: "Enter" });
        expect(screen.getByTestId("ruta").textContent).toBe("/");
    });
});
