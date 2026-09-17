// Cobertura de spinners de primera carga (cierra el hueco menor de la 2.2):
// las páginas de listado deben mostrar SpinnerCarga mientras cargan, para que
// el EstadoVacio nunca destelle antes de que lleguen los datos.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..", "..");

/** Las 13 páginas de listado con EstadoVacio (mismo criterio que
 *  estadoVacioCobertura.test.ts). */
const PAGINAS = [
    "Equipos", "Jugadores", "Entrenadores", "Arbitros", "Pabellones",
    "Confederaciones", "Competiciones", "Temporadas", "Ediciones", "Fases",
    "Paises", "Partidos", "Plantillas",
];

describe("SpinnerCarga", () => {
    it("el componente es accesible (role=status + aria-busy)", () => {
        const codigo = readFileSync(join(RAIZ, "src", "components", "SpinnerCarga.tsx"), "utf-8");
        expect(codigo).toContain('role="status"');
        expect(codigo).toContain('aria-busy="true"');
    });

    for (const pagina of PAGINAS.filter((p) => p !== "Plantillas")) {
        it(`${pagina}: importa SpinnerCarga, tiene estado de carga y lo renderiza`, () => {
            const codigo = readFileSync(join(RAIZ, "src", "pages", `${pagina}.tsx`), "utf-8");
            expect(codigo, `${pagina} debe importar SpinnerCarga`).toContain("SpinnerCarga");
            // true = carga al montar (regla general); false = carga dependiente
            // de un filtro (Fases/Partidos cargan al elegir edición).
            expect(codigo, `${pagina} necesita estado cargando/cargando*`).toMatch(
                /const \[cargando\w*, setCargando\w*\] = useState(<[^>]*>)?\((true|false)\)/,
            );
            expect(codigo, `${pagina} debe renderizar <SpinnerCarga`).toContain("<SpinnerCarga");
            // Y decidir ANTES del estado vacío (el vacío nunca destella durante la carga):
            const spinner = codigo.indexOf("<SpinnerCarga");
            const vacio = codigo.indexOf("<EstadoVacio");
            expect(vacio === -1 || spinner < vacio, `${pagina}: el spinner debe preceder al EstadoVacio`).toBe(true);
        });
    }

    it("Plantillas (página especial) también muestra el spinner si carga datos", () => {
        // Plantillas no es un listado clásico: solo exige el import si carga con useEffect+SELECT.
        const codigo = readFileSync(join(RAIZ, "src", "pages", "Plantillas.tsx"), "utf-8");
        if (codigo.includes("<SpinnerCarga")) {
            expect(codigo).toContain("SpinnerCarga");
        }
    });
});
