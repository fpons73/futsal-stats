// Tests de la migración de modelo Gemini (gemini-2.0-flash apagado por
// Google → gemini-3.6-flash). La normalización es la red de seguridad para
// usuarios que tenían el modelo muerto persistido en Preferencia.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    DEFAULT_GEMINI_MODEL, MODELOS_GEMINI_DISPONIBLES,
    normalizarModelo, geminiService,
} from "../geminiService";

const preferencias = vi.hoisted(() => new Map<string, string>());

vi.mock("../../db", () => ({
    getPreferencia: vi.fn(async (clave: string, defecto = "") =>
        preferencias.has(clave) ? preferencias.get(clave) : defecto),
    setPreferencia: vi.fn(async (clave: string, valor: string) => {
        preferencias.set(clave, valor);
    }),
}));

beforeEach(() => {
    preferencias.clear();
});

describe("normalizarModelo", () => {
    it("gemini-2.0-flash (apagado) → default 3.6, marcado como reparado", () => {
        expect(DEFAULT_GEMINI_MODEL).toBe("gemini-3.6-flash");
        const r = normalizarModelo("gemini-2.0-flash");
        expect(r.modelo).toBe("gemini-3.6-flash");
        expect(r.reparado).toBe(true);
    });

    it("otros modelos retirados también se reparan", () => {
        for (const muerto of ["gemini-2.0-flash-lite", "gemini-1.5-flash", "gemini-1.5-pro"]) {
            expect(normalizarModelo(muerto).reparado).toBe(true);
        }
    });

    it("modelos vigentes pasan intactos", () => {
        for (const m of MODELOS_GEMINI_DISPONIBLES) {
            const r = normalizarModelo(m.id);
            expect(r.modelo).toBe(m.id);
            expect(r.reparado).toBe(false);
        }
    });

    it("vacío → default", () => {
        expect(normalizarModelo("").modelo).toBe(DEFAULT_GEMINI_MODEL);
        expect(normalizarModelo(null).reparado).toBe(true);
    });
});

describe("geminiService con preferencias persistidas", () => {
    it("repara el modelo muerto persistido y lo guarda corregido", async () => {
        preferencias.set("gemini_model_name", "gemini-2.0-flash");
        const { model } = await geminiService.loadPreferences();

        expect(model).toBe("gemini-3.6-flash");
        expect(preferencias.get("gemini_model_name")).toBe("gemini-3.6-flash"); // persistida
    });

    it("respeta un modelo vigente elegido por el usuario", async () => {
        preferencias.set("gemini_model_name", "gemini-2.5-flash-lite");
        const { model } = await geminiService.loadPreferences();
        expect(model).toBe("gemini-2.5-flash-lite");
    });

    it("sin preferencia usa el default 3.6", async () => {
        const { model } = await geminiService.loadPreferences();
        expect(model).toBe("gemini-3.6-flash");
    });
});
