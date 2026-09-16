import Database from "@tauri-apps/plugin-sql";
import { toast } from "../components/Toast";
import { useUndoToast } from "../components/UndoToast";

/**
 * Borrado con deshacer para filas de una tabla (patrón UndoToast):
 *
 *   const { pendiente, borrar: borrarFila, deshacer, clear } = useBorradorConDeshacer("Equipo", cargarDatos);
 *
 *   async function borrar(id: number) {
 *     const confirm = await confirmar({ mensaje: "...", peligroso: true });
 *     if (confirm) await borrarFila(id);
 *   }
 *
 * `borrar` captura la fila completa (SELECT *) ANTES del DELETE y la ofrece en
 * el UndoToast; `deshacer` la re-inserta con su id original. `recargar` se
 * invoca tras borrar y tras deshacer para refrescar la vista.
 *
 * La confirmación previa (ConfirmDialog) sigue viviendo en la página, que es
 * quien conoce el mensaje y los botones de su entidad.
 */
export function useBorradorConDeshacer(tabla: string, recargar: () => void | Promise<void>) {
    const { pendiente, push, clear } = useUndoToast<Record<string, any>>();

    /** Captura la fila, la borra y deja el pendiente para deshacer. */
    async function borrar(id: number): Promise<boolean> {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const filas = await db.select<any[]>(`SELECT * FROM ${tabla} WHERE id = $1`, [id]);
            await db.execute(`DELETE FROM ${tabla} WHERE id = $1`, [id]);
            if (filas.length > 0) push(filas[0]);
            await recargar();
            return true;
        } catch (e) {
            console.error("Error borrando:", e);
            toast.error("No se pudo eliminar");
            return false;
        }
    }

    /** Re-inserta la fila capturada (con su id original) y recarga la vista. */
    async function deshacer(fila: Record<string, any>) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const claves = Object.keys(fila);
            await db.execute(
                `INSERT INTO ${tabla} (${claves.join(", ")}) VALUES (${claves.map(() => "?").join(", ")})`,
                claves.map((k) => fila[k])
            );
            await recargar();
        } catch (e) {
            console.error("Error restaurando:", e);
            toast.error("No se pudo restaurar el elemento");
        }
    }

    return { pendiente, borrar, deshacer, clear };
}