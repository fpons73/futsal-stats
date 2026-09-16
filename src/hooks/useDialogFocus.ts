import { useEffect, useRef } from "react";
import { pushOverlay, popOverlay, esOverlaySuperior } from "../components/overlayStack";

/** Selectores de elementos enfocables dentro de un diálogo. */
const SELECTOR_FOCABLES = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

interface OpcionesDialogoFocus {
    /** true mientras el diálogo esté abierto. */
    activo: boolean;
    /** Keydown del diálogo; SOLO se invoca cuando este es el overlay superior
        (con un ConfirmDialog encima, el diálogo de fondo no reacciona).
        El manejo de Tab (atrapamiento) lo hace el hook, no el componente. */
    onKeyDown?: (e: KeyboardEvent) => void;
}

/**
 * Ciclo de foco completo para diálogos (Modal, ModalEvento, ConfirmDialog):
 *
 *   const panelRef = useDialogFocus({ activo: isOpen, onKeyDown: ... });
 *   <div ref={panelRef} tabIndex={-1}> ... </div>
 *
 * - Registra el diálogo en la pila de overlays (mismo token para Escape y Tab).
 * - Al abrir: guarda el elemento enfocado y mueve el foco al panel, RESPETANDO
 *   cualquier autoFocus interno (p. ej. el botón principal de ConfirmDialog).
 * - Atrapa Tab/Shift+Tab: el foco cicla dentro del panel y no puede escapar.
 * - Al cerrar: devuelve el foco al elemento que lo tenía antes de abrir.
 * - onKeyDown se invoca solo cuando el diálogo es el overlay superior.
 */
export function useDialogFocus({ activo, onKeyDown }: OpcionesDialogoFocus) {
    const panelRef = useRef<HTMLDivElement | null>(null);
    const onKeyDownRef = useRef(onKeyDown);
    useEffect(() => { onKeyDownRef.current = onKeyDown; });
    const focoPrevioRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!activo) return;
        const token = pushOverlay();
        focoPrevioRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        // Foco inicial: si React ya dejó el foco dentro (autoFocus), se respeta;
        // si no, lo recibe el propio panel (requiere tabIndex={-1}).
        const panel = panelRef.current;
        const activoActual = document.activeElement;
        if (panel && !(activoActual instanceof HTMLElement && panel.contains(activoActual))) {
            panel.focus();
        }

        const onKey = (e: KeyboardEvent) => {
            if (!esOverlaySuperior(token)) return;
            if (e.key === "Tab") atraparTab(e, panelRef.current);
            onKeyDownRef.current?.(e);
        };
        window.addEventListener("keydown", onKey);

        return () => {
            window.removeEventListener("keydown", onKey);
            popOverlay(token);
            // Devolver el foco al disparador (si sigue existiendo en el documento).
            const previo = focoPrevioRef.current;
            if (previo && document.contains(previo)) previo.focus();
        };
    }, [activo]);

    return panelRef;
}

/** Atrapa la tabulación dentro del panel: Tab en el último focable vuelve al
    primero, Shift+Tab en el primero va al último, y si el foco se coló fuera
    del panel se reincorpora al primero. */
function atraparTab(e: KeyboardEvent, panel: HTMLElement | null) {
    if (!panel) return;
    const focables = Array.from(panel.querySelectorAll<HTMLElement>(SELECTOR_FOCABLES));
    if (focables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
    }
    const primero = focables[0];
    const ultimo = focables[focables.length - 1];
    const activo = document.activeElement;

    if (!(activo instanceof HTMLElement) || !panel.contains(activo)) {
        // Foco fuera del diálogo (p. ej. tras un clic en el fondo): devolverlo.
        e.preventDefault();
        (e.shiftKey ? ultimo : primero).focus();
        return;
    }
    if (e.shiftKey && activo === primero) {
        e.preventDefault();
        ultimo.focus();
        return;
    }
    if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
        return;
    }
    // Caso normal: el navegador mueve el foco dentro del panel; no intervenimos.
}
