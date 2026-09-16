import Database from "@tauri-apps/plugin-sql";
import { toast } from "../components/Toast";
import { useUndoToast } from "../components/UndoToast";

/** Tablas hijas de Partido que se borran (y restauran) junto al partido.
    Todas comparten la columna partido_id y no hay FK entre ellas. */
const TABLAS_HIJAS = [
    "Alineacion",
    "Evento",
    "EstadisticaPartidoEquipo",
    "EstadisticaPartidoJugador",
] as const;

export interface BorradorPartido {
    /** Etiqueta opcional para el toast (p. ej. "O Parrulo vs Alzira"). */
    etiqueta?: string;
    /** La fila de Partido completa (con su id original). */
    partido: Record<string, any>;
    /** Filas de cada tabla hija, en el orden de TABLAS_HIJAS. */
    hijas: Record<string, any[]>;
}

type Db = Awaited<ReturnType<typeof Database.load>>;

/** Re-inserta una fila con TODAS sus columnas (incluido el id original). */
async function reinsertar(db: Db, tabla: string, fila: Record<string, any>) {
    const claves = Object.keys(fila);
    await db.execute(
        `INSERT INTO ${tabla} (${claves.join(", ")}) VALUES (${claves.map(() => "?").join(", ")})`,
        claves.map((k) => fila[k])
    );
}

/**
 * Borrado con deshacer para PARTIDOS (patrón UndoToast):
 *
 *   const { pendiente, borrar: borrarPartido, deshacer, clear } = useBorradorPartidoConDeshacer(() => cargarPartidos());
 *
 *   async function borrar(id: number, nombre: string) {
 *     const confirm = await confirmar({ mensaje: "...", peligroso: true });
 *     if (confirm) await borrarPartido(id, nombre);
 *   }
 *
 * `borrar` captura la fila de Partido y TODAS las filas de sus 4 tablas hijas
 * (Alineacion, Evento, EstadisticaPartidoEquipo, EstadisticaPartidoJugador)
 * ANTES de borrar nada, borra todo y ofrece el snapshot en el UndoToast.
 * `deshacer` re-inserta el partido (con su id original) y después las hijas
 * (también con sus ids originales), y recarga la vista.
 *
 * La confirmación previa (ConfirmDialog/Modal) sigue viviendo en la página.
 */
export function useBorradorPartidoConDeshacer(recargar: () => void | Promise<void>) {
    const { pendiente, push, clear } = useUndoToast<BorradorPartido>();

    /** Captura partido + hijas, borra todo y deja el pendiente para deshacer. */
    async function borrar(id: number, etiqueta?: string): Promise<boolean> {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const filasPartido = await db.select<any[]>("SELECT * FROM Partido WHERE id = $1", [id]);
            if (filasPartido.length === 0) {
                toast.error("El partido ya no existe");
                return false;
            }

            // Instantánea de las hijas ANTES de borrar nada.
            const hijas: Record<string, any[]> = {};
            for (const tabla of TABLAS_HIJAS) {
                hijas[tabla] = await db.select<any[]>(
                    `SELECT * FROM ${tabla} WHERE partido_id = $1`, [id]
                );
            }

            for (const tabla of TABLAS_HIJAS) {
                await db.execute(`DELETE FROM ${tabla} WHERE partido_id = $1`, [id]);
            }
            await db.execute("DELETE FROM Partido WHERE id = $1", [id]);

            push({ etiqueta, partido: filasPartido[0], hijas });
            await recargar();
            return true;
        } catch (e) {
            console.error("Error borrando partido:", e);
            toast.error("No se pudo eliminar el partido");
            return false;
        }
    }

    /** Re-inserta el partido y sus hijas (ids originales) y recarga la vista. */
    async function deshacer(b: BorradorPartido) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await reinsertar(db, "Partido", b.partido);
            for (const tabla of TABLAS_HIJAS) {
                for (const fila of b.hijas[tabla] ?? []) {
                    await reinsertar(db, tabla, fila);
                }
            }
            await recargar();
        } catch (e) {
            console.error("Error restaurando partido:", e);
            toast.error("No se pudo restaurar el partido");
        }
    }

    return { pendiente, borrar, deshacer, clear };
}
