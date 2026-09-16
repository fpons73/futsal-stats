import { describe, it, expect } from "vitest";
import { resolverPais } from "../importadorMasivo";

// Muestra mínima como la tabla Pais real (español, con acentos).
const PAISES = [
  { id: 1, nombre: "Afganistán" },
  { id: 2, nombre: "Alemania" },
  { id: 3, nombre: "España" },
  { id: 4, nombre: "Desconocido" },
];

describe("resolverPais", () => {
  it("casar por nombre ignorando acentos y mayúsculas", async () => {
    const r = await resolverPais(PAISES, "ESPAÑA");
    expect(r.id).toBe(3);
    const r2 = await resolverPais(PAISES, "alemania");
    expect(r2.id).toBe(2);
  });

  it("fila sin país → país 'Desconocido', nunca un país real", async () => {
    const r = await resolverPais(PAISES, "");
    expect(r.id).toBe(4);
    expect(r.aviso).toBeUndefined();
    const r2 = await resolverPais(PAISES, "   ");
    expect(r2.id).toBe(4);
  });

  it("país no encontrado → null + aviso (sin fallback silencioso)", async () => {
    const r = await resolverPais(PAISES, "Atlántida");
    expect(r.id).toBeNull();
    expect(r.aviso).toContain("Atlántida");
  });

  it("sin país 'Desconocido' en la BD → null + aviso de crearlo", async () => {
    const sinDesc = PAISES.filter((p) => p.nombre !== "Desconocido");
    const r = await resolverPais(sinDesc, "");
    expect(r.id).toBeNull();
    expect(r.aviso).toContain("Desconocido");
  });

  it("undefined/null en la celda se trata como fila sin país", async () => {
    const r = await resolverPais(PAISES, undefined);
    expect(r.id).toBe(4);
  });

  it("alias en portugués: 'Espanha' → España vía ALIAS_PAIS", async () => {
    const r = await resolverPais(PAISES, "Espanha");
    expect(r.id).toBe(3);
    expect(r.aviso).toBeUndefined();
  });

  it("el match directo normalizado sigue funcionando ('Itália' → Italia sin alias)", async () => {
    const conItalia = [...PAISES, { id: 5, nombre: "Italia" }];
    const r = await resolverPais(conItalia, "Itália");
    expect(r.id).toBe(5);
  });

  it("alias cuyo destino no existe en la BD → null + aviso", async () => {
    const r = await resolverPais(PAISES, "Cazaquistão");
    expect(r.id).toBeNull();
    expect(r.aviso).toContain("Cazaquistão");
  });
});
