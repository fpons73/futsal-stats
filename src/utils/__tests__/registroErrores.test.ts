// Tests del registro global de errores (tarea 2.3 del hito 1.0).
// El store es un singleton por fichero de test: se limpia en cada caso y los
// mensajes usan texto único para no cruzarse con la deduplicación.
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    registroErrores, registrarManejadoresGlobales,
} from "../registroErrores";

beforeEach(() => {
    registroErrores.limpiar();
});

describe("registroErrores (store)", () => {
    it("añade entradas con las más recientes primero", () => {
        registroErrores.añadir("error", "consola", "primera falla", "detalle 1");
        registroErrores.añadir("warning", "importacion", "segunda avisa");

        const lista = registroErrores.listar();
        expect(lista).toHaveLength(2);
        expect(lista[0].mensaje).toBe("segunda avisa");
        expect(lista[0].nivel).toBe("warning");
        expect(lista[0].origen).toBe("importacion");
        expect(lista[1].mensaje).toBe("primera falla");
        expect(lista[1].detalle).toBe("detalle 1");
        expect(lista[0].fecha).toBeTruthy();
    });

    it("deduplica el mismo mensaje repetido en ráfaga (2 s)", () => {
        for (let i = 0; i < 5; i++) {
            registroErrores.añadir("error", "consola", "mismo fallo repetido");
        }
        expect(registroErrores.listar()).toHaveLength(1);
        // Mensaje distinto sí entra.
        registroErrores.añadir("error", "consola", "fallo diferente");
        expect(registroErrores.listar()).toHaveLength(2);
    });

    it("acota mensajes largos (300) y detalles (800)", () => {
        registroErrores.añadir("error", "consola", "x".repeat(500), "d".repeat(1200));
        const [e] = registroErrores.listar();
        expect(e.mensaje.length).toBeLessThanOrEqual(301);
        expect(e.mensaje.endsWith("…")).toBe(true);
        expect(e.detalle.length).toBeLessThanOrEqual(801);
    });

    it("mantiene como máximo 500 entradas (las viejas caen)", () => {
        for (let i = 0; i < 505; i++) {
            registroErrores.añadir("error", "test", `error numero ${i}`);
        }
        const lista = registroErrores.listar();
        expect(lista).toHaveLength(500);
        expect(lista[0].mensaje).toBe("error numero 504"); // la última, primero
        expect(lista[499].mensaje).toBe("error numero 5"); // la 0-4 cayeron
    });

    it("cuenta no vistos y los marca al abrir", () => {
        registroErrores.añadir("error", "test", "uno");
        registroErrores.añadir("error", "test", "dos");
        registroErrores.añadir("error", "test", "tres");
        expect(registroErrores.noVistos()).toBe(3);

        registroErrores.marcarVistos();
        expect(registroErrores.noVistos()).toBe(0);

        registroErrores.añadir("error", "test", "cuatro tras abrir");
        expect(registroErrores.noVistos()).toBe(1);
    });

    it("persiste en localStorage y sobrevive a limpiar", () => {
        registroErrores.añadir("error", "test", "persistente", "con detalle");
        const crudo = JSON.parse(localStorage.getItem("registro_errores_v1") ?? "[]");
        expect(crudo).toHaveLength(1);
        expect(crudo[0].mensaje).toBe("persistente");

        registroErrores.limpiar();
        expect(registroErrores.listar()).toHaveLength(0);
        expect(JSON.parse(localStorage.getItem("registro_errores_v1") ?? "[]")).toHaveLength(0);
        expect(localStorage.getItem("registro_errores_vistos")).toBe("0");
    });

    it("exporta CSV con cabecera y escape de comillas", () => {
        registroErrores.añadir("error", "consola", 'fallo con "comillas"', 'detalle "lar"ga');
        const csv = registroErrores.aCSV();
        const lineas = csv.split("\n");
        expect(lineas[0]).toBe("fecha,nivel,origen,mensaje,detalle");
        expect(lineas[1]).toContain('"fallo con ""comillas"""');
        expect(lineas[1]).toContain('"detalle ""lar""ga"');
    });

    it("notifica a los suscriptores y permite darse de baja", () => {
        let avisos = 0;
        const baja = registroErrores.suscribir(() => avisos++);
        registroErrores.añadir("error", "test", "notifica");
        expect(avisos).toBe(1);
        baja();
        registroErrores.añadir("error", "test", "ya no notifica");
        expect(avisos).toBe(1);
    });
});

describe("captura global de errores", () => {
    it("puentea console.error (los catch de la app caen en el registro)", () => {
        registrarManejadoresGlobales();
        const espia = vi.spyOn(console, "error");
        console.error("Error importando equipo:", new Error("constraint failed"));
        espia.mockRestore();

        const [e] = registroErrores.listar();
        expect(e.origen).toBe("consola");
        expect(e.mensaje).toContain("Error importando equipo:");
        expect(e.mensaje).toContain("constraint failed");
        expect(e.detalle).toContain("constraint failed");
    });

    it("instalar dos veces no duplica la captura (idempotente)", () => {
        registrarManejadoresGlobales();
        registrarManejadoresGlobales();
        const antes = registroErrores.listar().length;
        console.error("fallo con captura unica");
        expect(registroErrores.listar().length).toBe(antes + 1);
    });

    it("window 'error' no capturado entra en el registro", () => {
        registrarManejadoresGlobales();
        const evento = new ErrorEvent("error", {
            message: "TypeError sin catch en handler",
            error: new Error("TypeError sin catch en handler"),
        });
        window.dispatchEvent(evento);
        const [e] = registroErrores.listar();
        expect(e.origen).toBe("global");
        expect(e.mensaje).toContain("TypeError sin catch");
    });
});
