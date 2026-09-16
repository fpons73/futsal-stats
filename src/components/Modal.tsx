import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    /** Cerrar al hacer clic en el fondo (como ConfirmDialog). Por defecto true:
        el clic pasa por onClose, así que los modales con guarda preguntan antes
        de descartar. Poner false en flujos largos donde un clic perdido no debe
        descartar nada (p. ej. importación de calendario en curso). */
    cerrarAlClicarFuera?: boolean;
    /** Manejador adicional de teclas (Enter, atajos...). Escape lo gestiona el
        propio Modal (cierra vía onClose); el resto se delega aquí, y solo cuando
        este modal es el overlay superior. */
    onKeyDown?: (e: KeyboardEvent) => void;
    /** Pie fijo bajo el cuerpo con scroll (como ConfirmDialog); solo se muestra si se define. */
    footer?: React.ReactNode;
    /** Clase de anchura del panel. Por defecto "max-w-4xl"; los formularios
        compactos pasan p. ej. "max-w-lg". */
    ancho?: string;
}

export default function Modal({ isOpen, onClose, title, children, cerrarAlClicarFuera = true, onKeyDown, footer, ancho = "max-w-4xl" }: ModalProps) {
    // Última referencia a onClose: las páginas suelen pasar closures inline que
    // cambian de identidad en cada render; así el listener no se rearma (y el
    // token de la pila no se recicla, lo que podría colocar este modal encima).
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; });
    const onKeyDownRef = useRef(onKeyDown);
    useEffect(() => { onKeyDownRef.current = onKeyDown; });

    // ARIA: el panel se anuncia como diálogo modal y su nombre accesible es el título.
    const tituloId = useId();

    // Registro en la pila de overlays, atrapamiento de Tab, foco inicial y
    // devolución del foco al cerrar (vía useDialogFocus). Mientras haya un
    // ConfirmDialog (u otro overlay) encima, este modal no reacciona al teclado.
    const panelRef = useDialogFocus({
        activo: isOpen,
        onKeyDown: (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onCloseRef.current();
                return;
            }
            onKeyDownRef.current?.(e);
        },
    });

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
            onClick={cerrarAlClicarFuera ? onClose : undefined}
        >
            {/* HEMOS CAMBIADO max-w-md POR max-w-4xl PARA QUE SEA MAS ANCHO */}
            <div
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={tituloId}
                onClick={(e) => e.stopPropagation()}
                className={`bg-white w-full ${ancho} rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh] outline-none`}
            >

                {/* Cabecera */}
                <div className="bg-navy px-6 py-4 flex justify-between items-center border-b border-navy-light shrink-0">
                    <h3 id={tituloId} className="text-white font-bold text-lg">{title}</h3>
                    <button onClick={onClose} className="text-silver hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Cuerpo con Scroll si es necesario */}
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>

                {/* Pie fijo (opcional): fuera del área de scroll, como ConfirmDialog */}
                {footer && (
                    <div className="shrink-0 px-6 py-4 bg-navy-dark/40 border-t border-white/10 flex justify-end gap-3">
                        {footer}
                    </div>
                )}

            </div>
        </div>
    );
}