import { describe, it, expect, beforeEach } from "vitest";
import {
    serializarBorrador, guardarBorrador, leerBorrador, borrarBorrador,
    fusionarBorrador, esBorradorValido, barrerBorradoresAntiguos, listarBorradores,
    idDePartidoDeClave, MS_POR_DIA,
    leerDiasRetencion, guardarDiasRetencion, restablecerDiasRetencion,
    DIAS_RETENCION_DEFECTO, CLAVE_DIAS_RETENCION,
    BorradorActa, FilaConvocada,
} from "../actaDraft";

const CLAVE = "acta_draft_test";

const fila = (overrides: Partial<FilaConvocada> = {}): FilaConvocada => ({
    persona_id: 1,
    dorsal: 10,
    estado: "titular",
    es_capitan: false,
    es_entrenador: false,
    posicion_inicial: "Ala",
    fuente_posicion_inicial: "inferida",
    ...overrides,
});

const plantilla: FilaConvocada[] = [
    fila({ persona_id: 1, dorsal: 1, estado: "titular", posicion_inicial: "Portero" }),
    fila({ persona_id: 2, dorsal: 5, estado: "titular", es_capitan: true, posicion_inicial: "Cierre" }),
    fila({ persona_id: 3, dorsal: 7, estado: "suplente", posicion_inicial: null, fuente_posicion_inicial: null }),
    fila({ persona_id: 4, dorsal: null, estado: "no_convocado", posicion_inicial: null, fuente_posicion_inicial: null }),
    fila({ persona_id: 99, estado: "convocado", es_entrenador: true }), // entrenador
];

describe("idDePartidoDeClave", () => {
    it("extrae el id de claves válidas", () => {
        expect(idDePartidoDeClave("acta_draft_42")).toBe(42);
        expect(idDePartidoDeClave("acta_draft_1")).toBe(1);
    });

    it("rechaza claves ajenas o mal formadas", () => {
        expect(idDePartidoDeClave("theme")).toBeNull();
        expect(idDePartidoDeClave("acta_draft_")).toBeNull();
        expect(idDePartidoDeClave("acta_draft_abc")).toBeNull();
        expect(idDePartidoDeClave("acta_draft_-3")).toBeNull();
    });
});

describe("listarBorradores", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    const borrador = (jugLocal: number, jugVisit: number, ts: number): BorradorActa => ({
        ts,
        formacionLocal: "1-2-1-1",
        formacionVisitante: "1-3-1",
        local: Array.from({ length: jugLocal }, (_, i) => ({
            persona_id: i + 1, dorsal: i + 1, estado: "titular" as const,
            es_capitan: false, posicion_inicial: null, fuente_posicion_inicial: null,
        })),
        visitante: Array.from({ length: jugVisit }, (_, i) => ({
            persona_id: 100 + i, dorsal: i + 1, estado: "titular" as const,
            es_capitan: false, posicion_inicial: null, fuente_posicion_inicial: null,
        })),
    });

    it("lista los borradores con su partido, fecha y convocatoria", () => {
        guardarBorrador("acta_draft_7", borrador(5, 9, 1700000000000));
        guardarBorrador("acta_draft_12", borrador(0, 0, 1700001000000));

        const lista = listarBorradores();
        expect(lista).toHaveLength(2);
        // Más reciente primero
        expect(lista[0].partidoId).toBe(12);
        expect(lista[0].ts).toBe(1700001000000);
        expect(lista[0].clave).toBe("acta_draft_12");
        expect(lista[1].partidoId).toBe(7);
        // Convocados: local + visitante
        expect(lista[0].jugConvocados).toBe(0);
        expect(lista[1].jugConvocados).toBe(14);
    });

    it("ignora claves ajenas y elimina las corruptas", () => {
        guardarBorrador("acta_draft_3", borrador(1, 1, Date.now()));
        localStorage.setItem("theme", "dark");
        localStorage.setItem("acta_draft_x", "no-numero");
        localStorage.setItem("acta_draft_4", "{roto");
        localStorage.setItem("acta_draft_5", JSON.stringify({ ts: 1 }));

        const lista = listarBorradores();
        expect(lista).toHaveLength(1);
        expect(lista[0].partidoId).toBe(3);
        // Las corruptas se purgaron del almacenamiento
        expect(localStorage.getItem("acta_draft_4")).toBeNull();
        expect(localStorage.getItem("acta_draft_5")).toBeNull();
        // La clave ajena está intacta
        expect(localStorage.getItem("theme")).toBe("dark");
    });

    it("devuelve una lista vacía sin borradores", () => {
        expect(listarBorradores()).toEqual([]);
    });
});

describe("Borrador del acta: round-trip", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("serializa excluyendo entrenadores y conservando los campos editables", () => {
        const b = serializarBorrador(plantilla, [], "1-2-1-1", "1-3-1", 1700000000000);
        expect(b.ts).toBe(1700000000000);
        expect(b.formacionLocal).toBe("1-2-1-1");
        expect(b.formacionVisitante).toBe("1-3-1");
        // El entrenador (99) no entra en el borrador
        expect(b.local.map(f => f.persona_id)).toEqual([1, 2, 3, 4]);
        // Campos por fila conservados
        const capitan = b.local.find(f => f.persona_id === 2)!;
        expect(capitan.es_capitan).toBe(true);
        expect(capitan.posicion_inicial).toBe("Cierre");
        expect(capitan.fuente_posicion_inicial).toBe("inferida");
        const suplente = b.local.find(f => f.persona_id === 3)!;
        expect(suplente.estado).toBe("suplente");
        expect(suplente.posicion_inicial).toBeNull();
    });

    it("guarda y lee de forma idéntica (round-trip completo)", () => {
        const b = serializarBorrador(plantilla, plantilla, "1-3-1", "1-1-2-1");
        guardarBorrador(CLAVE, b);
        const leido = leerBorrador(CLAVE);
        expect(leido).not.toBeNull();
        expect(leido).toEqual(b);
    });

    it("devuelve null cuando no hay borrador", () => {
        expect(leerBorrador(CLAVE)).toBeNull();
    });

    it("borra el borrador", () => {
        guardarBorrador(CLAVE, serializarBorrador(plantilla, [], "1-3-1", "1-3-1"));
        borrarBorrador(CLAVE);
        expect(leerBorrador(CLAVE)).toBeNull();
    });

    it("detecta y descarta borradores corruptos (JSON inválido)", () => {
        localStorage.setItem(CLAVE, "{no-es-json");
        expect(leerBorrador(CLAVE)).toBeNull();
        // Además lo elimina para no tropezar de nuevo
        expect(localStorage.getItem(CLAVE)).toBeNull();
    });

    it("detecta y descarta borradores con estructura inválida", () => {
        localStorage.setItem(CLAVE, JSON.stringify({ ts: "ayer", local: "todo mal" }));
        expect(leerBorrador(CLAVE)).toBeNull();
        expect(localStorage.getItem(CLAVE)).toBeNull();
    });

    it("valida estructura con esBorradorValido", () => {
        const b = serializarBorrador(plantilla, [], "1-3-1", "1-3-1");
        expect(esBorradorValido(b)).toBe(true);
        expect(esBorradorValido(null)).toBe(false);
        expect(esBorradorValido({ ts: 1 })).toBe(false);
        expect(esBorradorValido({ ...b, local: [{ persona_id: "x" }] })).toBe(false);
    });

    it("guarda y lee en localStorage (sobrevive a reinicios)", () => {
        const b = serializarBorrador(plantilla, [], "1-3-1", "1-3-1");
        guardarBorrador(CLAVE, b);
        // El borrador debe estar en localStorage, no en sessionStorage
        expect(localStorage.getItem(CLAVE)).not.toBeNull();
        expect(sessionStorage.getItem(CLAVE)).toBeNull();
        expect(leerBorrador(CLAVE)).toEqual(b);
    });
});

describe("Preferencia de días de retención", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("devuelve 7 por defecto (sin clave, inválido o fuera de rango)", () => {
        expect(leerDiasRetencion()).toBe(DIAS_RETENCION_DEFECTO);
        localStorage.setItem(CLAVE_DIAS_RETENCION, "abc");
        expect(leerDiasRetencion()).toBe(DIAS_RETENCION_DEFECTO);
        localStorage.setItem(CLAVE_DIAS_RETENCION, "-5");
        expect(leerDiasRetencion()).toBe(1);
        localStorage.setItem(CLAVE_DIAS_RETENCION, "9999");
        expect(leerDiasRetencion()).toBe(365);
    });

    it("guarda sujetando a 1–365 y redondeando", () => {
        expect(guardarDiasRetencion(30)).toBe(30);
        expect(leerDiasRetencion()).toBe(30);
        expect(guardarDiasRetencion(7.6)).toBe(8);
        expect(guardarDiasRetencion(0)).toBe(1);
        expect(guardarDiasRetencion(-10)).toBe(1);
        expect(guardarDiasRetencion(5000)).toBe(365);
    });

    it("restablece al valor por defecto eliminando la clave", () => {
        guardarDiasRetencion(14);
        restablecerDiasRetencion();
        expect(localStorage.getItem(CLAVE_DIAS_RETENCION)).toBeNull();
        expect(leerDiasRetencion()).toBe(DIAS_RETENCION_DEFECTO);
    });

    it("el barrido usa la preferencia guardada si no se pasan días", () => {
        const ahora = 1_800_000_000_000;
        const b = { ...serializarBorrador(plantilla, [], "1-3-1", "1-3-1"), ts: ahora - 20 * MS_POR_DIA };
        guardarBorrador("acta_draft_9", b);
        guardarDiasRetencion(30);
        expect(barrerBorradoresAntiguos(undefined, ahora)).toBe(0);
        guardarDiasRetencion(14);
        expect(barrerBorradoresAntiguos(undefined, ahora)).toBe(1);
        expect(localStorage.getItem("acta_draft_9")).toBeNull();
    });
});

describe("Barrido de borradores antiguos", () => {
    beforeEach(() => {
        localStorage.clear();
    });

    it("elimina los borradores con más de 7 días y conserva los recientes", () => {
        const ahora = 1_800_000_000_000;
        const reciente = { ...serializarBorrador(plantilla, [], "1-3-1", "1-3-1"), ts: ahora - 1 * MS_POR_DIA };
        const viejo = { ...serializarBorrador(plantilla, [], "1-3-1", "1-3-1"), ts: ahora - 8 * MS_POR_DIA };
        guardarBorrador("acta_draft_1", reciente);
        guardarBorrador("acta_draft_2", viejo);
        const eliminados = barrerBorradoresAntiguos(7, ahora);
        expect(eliminados).toBe(1);
        expect(localStorage.getItem("acta_draft_1")).not.toBeNull();
        expect(localStorage.getItem("acta_draft_2")).toBeNull();
    });

    it("no toca otras claves de localStorage", () => {
        localStorage.setItem("theme", "dark");
        localStorage.setItem("otra_cosa", JSON.stringify({ ts: 1 }));
        barrerBorradoresAntiguos(7);
        expect(localStorage.getItem("theme")).toBe("dark");
        expect(localStorage.getItem("otra_cosa")).toBe("{\"ts\":1}");
    });

    it("elimina también los corruptos que encuentre", () => {
        localStorage.setItem("acta_draft_3", "{roto");
        localStorage.setItem("acta_draft_4", JSON.stringify({ ts: Date.now() })); // inválido
        const eliminados = barrerBorradoresAntiguos(7);
        expect(eliminados).toBe(2);
        expect(localStorage.getItem("acta_draft_3")).toBeNull();
        expect(localStorage.getItem("acta_draft_4")).toBeNull();
    });

    it("respeta el límite de días personalizado", () => {
        const ahora = 1_800_000_000_000;
        const b = { ...serializarBorrador(plantilla, [], "1-3-1", "1-3-1"), ts: ahora - 3 * MS_POR_DIA };
        guardarBorrador("acta_draft_5", b);
        expect(barrerBorradoresAntiguos(7, ahora)).toBe(0);
        expect(barrerBorradoresAntiguos(2, ahora)).toBe(1);
        expect(localStorage.getItem("acta_draft_5")).toBeNull();
    });

    it("devuelve 0 con almacenamiento vacío", () => {
        expect(barrerBorradoresAntiguos(7)).toBe(0);
    });
});

describe("Borrador del acta: fusión", () => {
    const borrador: BorradorActa = {
        ts: 1700000000000,
        formacionLocal: "1-2-2",
        formacionVisitante: "1-4-0",
        local: [
            { persona_id: 1, dorsal: 12, estado: "suplente", es_capitan: false, posicion_inicial: null, fuente_posicion_inicial: null },
            { persona_id: 3, dorsal: 3, estado: "titular", es_capitan: true, posicion_inicial: "Pívot", fuente_posicion_inicial: "manual" },
            { persona_id: 555, dorsal: 55, estado: "titular", es_capitan: false, posicion_inicial: "Ala", fuente_posicion_inicial: "inferida" }, // no existe en pantalla
        ],
        visitante: [],
    };

    it("fusiona por persona_id sobrescribiendo los campos del borrador", () => {
        const actual = [
            fila({ persona_id: 1, dorsal: 1, estado: "titular", posicion_inicial: "Portero" }),
            fila({ persona_id: 3, dorsal: 7, estado: "no_convocado", posicion_inicial: null, fuente_posicion_inicial: null }),
        ];
        const { local } = fusionarBorrador(borrador, actual, []);
        const p1 = local.find(p => p.persona_id === 1)!;
        expect(p1.estado).toBe("suplente");
        expect(p1.dorsal).toBe(12);
        expect(p1.es_capitan).toBe(false);
        expect(p1.posicion_inicial).toBeNull();
        const p3 = local.find(p => p.persona_id === 3)!;
        expect(p3.estado).toBe("titular");
        expect(p3.es_capitan).toBe(true);
        expect(p3.posicion_inicial).toBe("Pívot");
        expect(p3.fuente_posicion_inicial).toBe("manual");
    });

    it("mantiene los jugadores presentes en pantalla pero ausentes del borrador", () => {
        const actual = [
            fila({ persona_id: 1 }),
            fila({ persona_id: 9, dorsal: 9, estado: "convocado", posicion_inicial: null, fuente_posicion_inicial: null }),
        ];
        const { local } = fusionarBorrador(borrador, actual, []);
        const p9 = local.find(p => p.persona_id === 9)!;
        expect(p9).toEqual(actual[1]); // intacto
        expect(local).toHaveLength(2);
    });

    it("ignora las filas del borrador sin jugador en pantalla", () => {
        const { local } = fusionarBorrador(borrador, [fila({ persona_id: 1 })], []);
        expect(local).toHaveLength(1);
        expect(local[0].persona_id).toBe(1);
    });

    it("es puro: no muta las listas de entrada", () => {
        const actual = [fila({ persona_id: 1, estado: "titular" })];
        const copia = JSON.parse(JSON.stringify(actual));
        fusionarBorrador(borrador, actual, []);
        expect(actual).toEqual(copia);
    });

    it("round-trip completo: serializar → guardar → leer → fusionar", () => {
        const borrado = serializarBorrador(plantilla, plantilla, "1-1-3", "1-3-1");
        guardarBorrador(CLAVE, borrado);
        const leido = leerBorrador(CLAVE)!;
        // En pantalla llegó un estado distinto (p.ej. la BD recargada)
        const pantalla = [fila({ persona_id: 1, dorsal: 1, estado: "titular" }), fila({ persona_id: 3, estado: "suplente" })];
        const { local } = fusionarBorrador(leido, pantalla, []);
        // persona 1: el borrador manda
        expect(local.find(p => p.persona_id === 1)!.estado).toBe("titular");
        expect(local.find(p => p.persona_id === 1)!.dorsal).toBe(1);
        // persona 3: el borrador manda (suplente), la pantalla tenía suplente también
        expect(local.find(p => p.persona_id === 3)!.estado).toBe("suplente");
        // persona 2 (capitán en el borrador) no está en pantalla: no aparece
        expect(local.find(p => p.persona_id === 2)).toBeUndefined();
    });
});
