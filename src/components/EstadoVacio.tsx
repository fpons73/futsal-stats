import { ReactNode } from "react";
import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";

interface Accion {
    /** Texto del botón ("Importar equipos", "Crear competición"...). */
    texto: string;
    /** Ruta interna del router (usa Link). Si se da `onClick`, no navega. */
    a?: string;
    /** Acción directa sin navegación (limpiar filtros, abrir modal...). */
    onClick?: () => void;
    /** Estilo destacado (naranja) o secundario (gris). */
    primario?: boolean;
}

interface EstadoVacioProps {
    icono: LucideIcon;
    titulo: string;
    descripcion?: string;
    acciones?: Accion[];
    /** Condición de "hay filtros activos": cambia el tono a búsqueda sin resultados. */
    porFiltros?: boolean;
    /** Contenido extra bajo las acciones (p.ej. hint de formato). */
    extra?: ReactNode;
}

/** Estado vacío con llamada a la acción (tarea 2.2 del hito 1.0).
 *  Unifica los "No se encontraron X" sueltos de las páginas con un patrón
 *  consistente: icono, título, descripción y CTA. `porFiltros` distingue
 *  "la tabla está vacía" de "tu búsqueda no devuelve nada". */
export function EstadoVacio({
    icono: Icono,
    titulo,
    descripcion,
    acciones = [],
    porFiltros = false,
    extra,
}: EstadoVacioProps) {
    return (
        <div className="col-span-full p-12 text-center border border-white/5 bg-navy-dark/40 rounded-2xl shadow-inner">
            <div
                className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
                    porFiltros ? "bg-white/5" : "bg-orange/10"
                }`}
            >
                <Icono size={28} className={porFiltros ? "text-silver/40" : "text-orange"} />
            </div>
            <h3 className="text-white font-bold text-lg">{titulo}</h3>
            {descripcion && (
                <p className="text-silver/50 text-sm mt-2 max-w-md mx-auto leading-relaxed">{descripcion}</p>
            )}
            {acciones.length > 0 && (
                <div className="flex items-center justify-center gap-3 mt-5 flex-wrap">
                    {acciones.map((accion) =>
                        accion.onClick ? (
                            <button
                                key={accion.texto}
                                onClick={accion.onClick}
                                className={
                                    accion.primario
                                        ? "bg-orange hover:bg-orange-hover text-white px-5 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                        : "px-4 py-2 text-silver/60 hover:text-white border border-white/10 rounded-xl font-bold text-sm transition-colors"
                                }
                            >
                                {accion.texto}
                            </button>
                        ) : accion.a ? (
                            <Link
                                key={accion.texto}
                                to={accion.a}
                                className={
                                    accion.primario
                                        ? "bg-orange hover:bg-orange-hover text-white px-5 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] inline-block"
                                        : "px-4 py-2 text-silver/60 hover:text-white border border-white/10 rounded-xl font-bold text-sm transition-colors inline-block"
                                }
                            >
                                {accion.texto}
                            </Link>
                        ) : null,
                    )}
                </div>
            )}
            {extra && <div className="mt-4 text-xs text-silver/30">{extra}</div>}
        </div>
    );
}
