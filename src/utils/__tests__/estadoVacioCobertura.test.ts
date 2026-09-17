import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** Cobertura del patrón de estado vacío (tarea 2.2 del hito 1.0):
 *  estas páginas de listado deben usar el componente EstadoVacio en lugar
 *  de divs sueltos sin llamada a la acción. Añadir una página a esta lista
 *  cuando se migre; una página nueva de listado sin EstadoVacio no rompe
 *  este test (no hay forma estática fiable de detectarla), pero sí debe
 *  añadirse aquí al tocarla. */

const DIR = join(process.cwd(), "src", "pages");

/** Páginas que hoy deben renderizar EstadoVacio. */
const PAGINAS_CON_ESTADO_VACIO = [
    "Equipos.tsx",
    "Jugadores.tsx",
    "Entrenadores.tsx",
    "Arbitros.tsx",
    "Pabellones.tsx",
    "Paises.tsx",
    "Confederaciones.tsx",
    "Competiciones.tsx",
    "Temporadas.tsx",
    "Ediciones.tsx",
    "Fases.tsx",
    "Partidos.tsx",
    "Plantillas.tsx",
];

describe("cobertura de EstadoVacio en páginas de listado", () => {
    for (const pagina of PAGINAS_CON_ESTADO_VACIO) {
        it(`${pagina} importa y usa EstadoVacio`, () => {
            const codigo = readFileSync(join(DIR, pagina), "utf8");
            expect(codigo.includes('from "../components/EstadoVacio"'), `${pagina} debe importar EstadoVacio`).toBe(true);
            expect(/<EstadoVacio/.test(codigo), `${pagina} debe renderizar <EstadoVacio`).toBe(true);
        });
    }
});
