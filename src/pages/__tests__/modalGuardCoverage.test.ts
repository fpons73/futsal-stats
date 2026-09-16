import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Páginas que renderizan <Modal> pero SIN formularios de edición (solo
    confirmaciones de borrado, importaciones de archivo, etc.): quedan exentas
    de exigir la guarda. Mantener esta lista lo más vacía posible — si una
    página añade un formulario en modal, debe usar useFormGuard. */
const EXENTAS: string[] = [];

const dirPaginas = join(dirname(fileURLToPath(import.meta.url)), "..");
const paginasConModal = readdirSync(dirPaginas)
    .filter(f => f.endsWith(".tsx"))
    .filter(f => readFileSync(join(dirPaginas, f), "utf-8").includes("<Modal isOpen"));

describe("Cobertura de la guarda de cambios sin guardar", () => {
    it("existen páginas con Modal que cubrir (sanity del propio test)", () => {
        expect(paginasConModal.length).toBeGreaterThan(0);
    });

    it.each(paginasConModal)("%s importa useFormGuard para sus formularios en modal", (pagina) => {
        if (EXENTAS.includes(pagina)) return;
        const codigo = readFileSync(join(dirPaginas, pagina), "utf-8");
        expect(codigo).toMatch(/useFormGuard/);
    });
});
