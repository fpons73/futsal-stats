/** Pila global de overlays abiertos (Modal, ModalEvento, ConfirmDialog...).
 *
 * Sin esta pila, Escape disparaba el keydown de TODOS los overlays montados:
 * al abrir un ConfirmDialog de guarda sobre un modal, ambos recibían el evento,
 * el modal de fondo reentraba en su guarda (doble diálogo) y quedaban promesas
 * de confirmación sin resolver. Con la pila, solo el overlay SUPERIOR reacciona
 * a Escape; al cerrarse, el control vuelve al inmediatamente inferior.
 */

const pila: symbol[] = [];

/** Registra un overlay abierto y devuelve su token. */
export function pushOverlay(): symbol {
    const token = Symbol("overlay");
    pila.push(token);
    return token;
}

/** Retira el overlay del token dado (tolera retiros desordenados o repetidos). */
export function popOverlay(token: symbol): void {
    const i = pila.lastIndexOf(token);
    if (i >= 0) pila.splice(i, 1);
}

/** true si el overlay del token es el superior: el único que debe reaccionar a Escape. */
export function esOverlaySuperior(token: symbol): boolean {
    return pila.length > 0 && pila[pila.length - 1] === token;
}
