import { describe, it, expect } from "vitest";
import { pushOverlay, popOverlay, esOverlaySuperior } from "../overlayStack";

/** Cada test limpia sus tokens en finally: la pila es estado global del módulo. */
describe("overlayStack", () => {
    it("el último overlay en abrir es el superior", () => {
        const a = pushOverlay();
        const b = pushOverlay();
        try {
            expect(esOverlaySuperior(b)).toBe(true);
            expect(esOverlaySuperior(a)).toBe(false);
        } finally {
            popOverlay(b);
            popOverlay(a);
        }
    });

    it("al cerrar el superior, el inferior vuelve a serlo (Escape cae al modal de fondo)", () => {
        const a = pushOverlay();
        const b = pushOverlay();
        try {
            popOverlay(b); // se cierra el diálogo que estaba encima
            expect(esOverlaySuperior(a)).toBe(true);
        } finally {
            popOverlay(a);
        }
    });

    it("tolera retiros desordenados sin corromper la pila", () => {
        const a = pushOverlay();
        const b = pushOverlay();
        const c = pushOverlay();
        try {
            popOverlay(a); // retiro del fondo primero (p. ej. desmontaje de React)
            expect(esOverlaySuperior(c)).toBe(true);
            expect(esOverlaySuperior(b)).toBe(false);
            popOverlay(c);
            expect(esOverlaySuperior(b)).toBe(true);
        } finally {
            popOverlay(b);
            popOverlay(a); // repetido: no-op
        }
    });

    it("pop de un token desconocido o repetido es un no-op seguro", () => {
        const fantasma = Symbol("nunca-abierto");
        expect(() => popOverlay(fantasma)).not.toThrow();
        const a = pushOverlay();
        try {
            popOverlay(a);
            expect(() => popOverlay(a)).not.toThrow(); // doble retiro
            expect(esOverlaySuperior(a)).toBe(false);
        } finally {
            popOverlay(a);
        }
    });

    it("con la pila vacía ningún token es superior", () => {
        expect(esOverlaySuperior(Symbol("aislado"))).toBe(false);
    });
});
