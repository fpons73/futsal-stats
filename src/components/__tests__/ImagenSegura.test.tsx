// Tests de la red de seguridad de imágenes (tarea 2.4 del hito 1.0):
// iniciales deterministas, tono estable por nombre, fallback al fallar la
// carga y reset al cambiar la ruta.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Escudo, Bandera, inicialesDeNombre, tonoDeNombre } from "../ImagenSegura";
import ImagenLocal from "../ImagenLocal";

vi.mock("@tauri-apps/api/core", () => ({
    convertFileSrc: (p: string) => `asset://localhost/${encodeURIComponent(p)}`,
}));

afterEach(cleanup);

describe("inicialesDeNombre", () => {
    it("toma la primera letra de las dos primeras palabras", () => {
        expect(inicialesDeNombre("CP Ferro")).toBe("CF");
        expect(inicialesDeNombre("ElPozo Murcia Costa Cálida")).toBe("EM");
    });

    it("con una sola palabra usa sus dos primeras letras", () => {
        expect(inicialesDeNombre("Barcelona")).toBe("BA");
    });

    it("ignora paréntesis y signos de puntuación", () => {
        expect(inicialesDeNombre("USC Paredes (junior)")).toBe("UP");
        expect(inicialesDeNombre("Guinea-Bissau")).toBe("GB");
    });

    it("sin nombre razonable devuelve ?", () => {
        expect(inicialesDeNombre("")).toBe("?");
        expect(inicialesDeNombre(null)).toBe("?");
        expect(inicialesDeNombre("   ")).toBe("?");
    });
});

describe("tonoDeNombre", () => {
    it("es determinista: mismo nombre, mismo tono", () => {
        expect(tonoDeNombre("CP Ferro")).toBe(tonoDeNombre("CP Ferro"));
    });

    it("reparte tonos distintos para nombres distintos", () => {
        const tonos = new Set(["Barcelona", "Real Madrid", "Portugal", "Brasil"].map(tonoDeNombre));
        expect(tonos.size).toBe(4);
    });

    it("está en rango [0, 360)", () => {
        for (const n of ["A", "Barcelona", "ÑÑÑ", "123"]) {
            const h = tonoDeNombre(n);
            expect(h).toBeGreaterThanOrEqual(0);
            expect(h).toBeLessThan(360);
        }
    });
});

describe("Escudo", () => {
    it("sin ruta muestra las iniciales del equipo", () => {
        render(<Escudo ruta={null} nombre="CP Ferro" />);
        expect(screen.getByText("CF")).toBeTruthy();
    });

    it("con ruta muerta cae a las iniciales tras el error de carga", async () => {
        render(<Escudo ruta="C:/inexistente/escudo.png" nombre="Barcelona" />);
        const img = screen.getByAltText("Barcelona") as HTMLImageElement;
        expect(img).toBeTruthy();
        fireEvent.error(img);
        expect(screen.getByText("BA")).toBeTruthy();
        expect(screen.queryByAltText("Barcelona")).toBeNull();
    });

    it("el placeholder usa el tono determinista del nombre", () => {
        render(<Escudo ruta={null} nombre="CP Ferro" />);
        const div = screen.getByText("CF").parentElement as HTMLElement;
        const h = tonoDeNombre("CP Ferro");
        // jsdom normaliza hsl() a rgb(): pasamos el hsl esperado por la misma
        // normalización (un elemento sonda) y comparamos formas canónicas.
        const sonda = document.createElement("div");
        sonda.style.background = `hsl(${h} 38% 20%)`;
        expect(div.getAttribute("style")).toContain(sonda.style.background);
    });
});

describe("Bandera", () => {
    it("sin ruta muestra un chip con title del país", () => {
        render(<Bandera ruta={null} nombre="Portugal" />);
        const chip = screen.getByTitle("Portugal (sin bandera)");
        expect(chip).toBeTruthy();
    });

    it("con ruta muerta cae al chip silencioso", () => {
        render(<Bandera ruta="C:/vieja/bandera.png" nombre="Kenia" />);
        fireEvent.error(screen.getByAltText("Kenia"));
        expect(screen.getByTitle("Kenia (sin bandera)")).toBeTruthy();
        expect(screen.queryByAltText("Kenia")).toBeNull();
    });
});

describe("ImagenLocal (35 usos heredados)", () => {
    it("sin ruta muestra iniciales (antes: icono User gris)", () => {
        render(<ImagenLocal path={null} alt="Ricardo Fernandes" />);
        expect(screen.getByText("RF")).toBeTruthy();
    });

    it("con ruta muerta cae a iniciales y se recupera al cambiar la ruta", () => {
        const { rerender } = render(<ImagenLocal path="C:/vieja/foto.png" alt="Ana Pérez" />);
        fireEvent.error(screen.getByAltText("Ana Pérez"));
        expect(screen.getByText("AP")).toBeTruthy();

        // El usuario arregla la foto en el formulario: la imagen vuelve a intentarse.
        rerender(<ImagenLocal path="C:/nueva/foto.png" alt="Ana Pérez" />);
        expect(screen.getByAltText("Ana Pérez")).toBeTruthy();
    });

    it("mantiene las clases recibidas en el fallback (layout intacto)", () => {
        render(<ImagenLocal path={null} alt="Ana Pérez" className="w-full h-full object-cover" />);
        const div = screen.getByText("AP").parentElement as HTMLElement;
        expect(div.className).toContain("w-full");
        expect(div.className).toContain("object-cover");
    });
});
