import { useCallback, useRef } from "react";
import { useConfirm } from "../components/ConfirmDialog";

/** Compara superficialmente dos formularios (objetos planos de campos primitivos).
    Devuelve true si difieren en algún campo (incluida una clave que existe solo en uno).
    Pura: no muta ninguno de los dos objetos. */
export function esFormularioSucio<T extends Record<string, unknown>>(
    actual: T,
    base: T | null | undefined
): boolean {
    if (!base) return false;
    const claves = new Set([...Object.keys(actual), ...Object.keys(base)]);
    for (const clave of claves) {
        if (actual[clave] !== base[clave]) return true;
    }
    return false;
}

type OpcionesCierre = {
    titulo?: string;
    mensaje?: string;
    /** Botón verde (guardar y cerrar). Por defecto "Guardar y cerrar". */
    textoGuardar?: string;
    /** Botón rojo (perder los cambios). Por defecto "Descartar cambios". */
    textoDescartar?: string;
    /** Botón neutro (volver al formulario). Por defecto "Seguir editando". */
    textoSeguir?: string;
};

/**
 * Guard reutilizable para modales de edición (patrón ya usado en Equipos y Plantillas):
 *
 *   const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
 *
 *   function abrirEditar(x) {
 *       setForm(valoresDe(x));
 *       iniciar(valoresDe(x));          // instantánea al abrir
 *       setIsModalOpen(true);
 *   }
 *
 *   // onClose del Modal y botón Cancelar:
 *   const cerrar = () => cerrarSeguro(form, guardar);
 *
 * Al intentar cerrar con cambios pendientes ofrece:
 *   Guardar y cerrar (solo cierra si el guardado triunfó) / Descartar cambios / Seguir editando.
 *
 * Importante: `form` y `guardar` se evalúan EN EL MOMENTO DEL CIERRE (closures frescos
 * del último render), nunca en el de apertura — así el guardado usa los valores editados.
 * Renderizar {dialogo} una vez por página (es el ConfirmDialog compartido).
 */
export function useFormGuard() {
    const { confirmar, dialogo } = useConfirm();
    // Instantánea del formulario al abrir el modal (null = sin modal registrado).
    // Ref, no estado: no dispara renders y sobrevive entre renders del componente anfitrión.
    const baseRef = useRef<Record<string, unknown> | null>(null);

    /** Registra la instantánea del formulario al abrir el modal. */
    const iniciar = useCallback((valores: Record<string, unknown>) => {
        baseRef.current = { ...valores };
    }, []);

    /** Intento de cierre seguro. Devuelve true si el modal puede cerrarse
        (limpio, descartado o guardado con éxito); false si el usuario se queda editando
        o el guardado falló.
        Si `guardar` se omite, el diálogo muestra solo dos botones (Seguir editando /
        Descartar cambios): para modales cuyo único acto persistente no es un
        "guardado" (mapeos, URLs, selecciones...). */
    const cerrarSeguro = useCallback(async (
        actual: Record<string, unknown>,
        guardar?: () => Promise<boolean>,
        opciones: OpcionesCierre = {}
    ): Promise<boolean> => {
        const sucio = esFormularioSucio(actual, baseRef.current);
        if (!sucio) return true;
        const r = await confirmar({
            titulo: opciones.titulo ?? "Cambios sin guardar",
            mensaje: opciones.mensaje ?? "Hay cambios sin guardar en el formulario. ¿Qué quieres hacer?",
            textoConfirmar: opciones.textoDescartar ?? "Descartar cambios",
            textoCancelar: opciones.textoSeguir ?? "Seguir editando",
            // Sin acción de guardado → diálogo de dos botones (sin "Guardar y cerrar").
            textoGuardarSalir: guardar ? (opciones.textoGuardar ?? "Guardar y cerrar") : undefined,
        });
        if (r === "guardar") {
            return await guardar!(); // solo cierra el modal si el guardado triunfó
        }
        return r === true; // true = descartar y cerrar; false = seguir editando
    }, [confirmar]);

    return { iniciar, cerrarSeguro, dialogo };
}
