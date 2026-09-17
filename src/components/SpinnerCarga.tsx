import { Loader2 } from "lucide-react";

interface SpinnerCargaProps {
    /** Texto corto bajo el spinner ("Cargando equipos…"). Opcional. */
    mensaje?: string;
    /** Clases extra; por defecto ocupa la celda completa de la rejilla,
        el mismo hueco que ocupa EstadoVacio (se intercambian). */
    className?: string;
}

/** Spinner de primera carga (cierra el hueco menor de la tarea 2.2).
 *  Se muestra mientras la página carga sus datos y desaparece antes de
 *  decidir entre lista y EstadoVacio — así el estado vacío nunca destella
 *  durante la carga inicial. */
export default function SpinnerCarga({ mensaje = "Cargando…", className = "" }: SpinnerCargaProps) {
    return (
        <div
            className={`col-span-full flex flex-col items-center justify-center gap-3 py-14 text-silver/40 ${className}`}
            role="status"
            aria-live="polite"
            aria-busy="true"
        >
            <Loader2 size={28} className="animate-spin text-orange" aria-hidden />
            {mensaje && (
                <p className="text-xs font-bold uppercase tracking-widest">{mensaje}</p>
            )}
        </div>
    );
}
