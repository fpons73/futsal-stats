import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, Save } from "lucide-react";
import { useDialogFocus } from "../hooks/useDialogFocus";

interface ConfirmDialogProps {
    isOpen: boolean;
    titulo?: string;
    mensaje: string;
    textoConfirmar?: string;
    textoCancelar?: string;
    /** Tercera acción (p.ej. "Guardar y salir"): botón verde; solo se muestra si se define. */
    textoGuardarSalir?: string;
    onGuardarSalir?: () => void;
    /** Variante destructiva: botón rojo e icono de alerta. */
    peligroso?: boolean;
    onConfirmar: () => void;
    onCancelar: () => void;
}

/** Diálogo de confirmación temático (sustituye a confirm() nativo).
    Consistente con la app en claro y oscuro; el botón de acción
    peligrosa se pinta en rojo. */
export default function ConfirmDialog({
    isOpen,
    titulo = "¿Estás seguro?",
    mensaje,
    textoConfirmar = "Confirmar",
    textoCancelar = "Cancelar",
    textoGuardarSalir,
    onGuardarSalir,
    peligroso = true,
    onConfirmar,
    onCancelar,
}: ConfirmDialogProps) {
    // Última referencia a onCancelar (el resolver del hook cambia con cada estado).
    const onCancelarRef = useRef(onCancelar);
    useEffect(() => { onCancelarRef.current = onCancelar; });

    // Etiqueta ARIA: el título es el nombre accesible del diálogo.
    const tituloId = useId();

    // useDialogFocus registra el diálogo en la pila de overlays, atrapa Tab y
    // devuelve el foco al cerrar. Mientras esté abierto es el overlay superior:
    // acapara Escape (= cancelar/seguir editando) y los modales de fondo no
    // reaccionan al teclado hasta que este se cierra.
    const panelRef = useDialogFocus({
        activo: isOpen,
        onKeyDown: (e) => {
            if (e.key === "Escape") {
                e.preventDefault();
                onCancelarRef.current();
            }
        },
    });

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-[75] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            onClick={onCancelar}
        >
            <div
                ref={panelRef}
                tabIndex={-1}
                className="w-full max-w-md bg-navy-light border border-white/10 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 outline-none"
                onClick={(e) => e.stopPropagation()}
                role="alertdialog"
                aria-modal="true"
                aria-labelledby={tituloId}
            >
                <div className="p-5 flex items-start gap-4">
                    {peligroso && (
                        <div className="w-10 h-10 shrink-0 rounded-full bg-red/15 border border-red/30 flex items-center justify-center">
                            <AlertTriangle size={18} className="text-red" />
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <h3 id={tituloId} className="text-base font-black text-white mb-1">{titulo}</h3>
                        <p className="text-sm text-silver/70 leading-relaxed whitespace-pre-line">{mensaje}</p>
                    </div>
                </div>
                <div className="px-5 py-4 bg-navy-dark/40 border-t border-white/10 flex justify-end gap-3">
                    <button
                        onClick={onCancelar}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-silver/60 hover:text-white hover:bg-white/5 transition-colors"
                    >
                        {textoCancelar}
                    </button>
                    {textoGuardarSalir && onGuardarSalir && (
                        <button
                            onClick={onGuardarSalir}
                            autoFocus
                            className="px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors shadow-md bg-success hover:bg-success/80 flex items-center gap-1.5"
                        >
                            <Save size={14} /> {textoGuardarSalir}
                        </button>
                    )}
                    <button
                        onClick={onConfirmar}
                        autoFocus={!textoGuardarSalir}
                        className={`px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors shadow-md ${
                            peligroso
                                ? "bg-red hover:bg-red/80"
                                : "bg-orange hover:bg-orange-hover"
                        }`}
                    >
                        {textoConfirmar}
                    </button>
                </div>
            </div>
        </div>
    );
}

type OpcionesConfirm = {
    mensaje: string;
    titulo?: string;
    textoConfirmar?: string;
    textoCancelar?: string;
    /** Si se define, el diálogo muestra la tercera opción (p.ej. "Guardar y salir"). */
    textoGuardarSalir?: string;
    peligroso?: boolean;
};

/** Resultado posible del diálogo: false = cancelar, true = confirmar,
    "guardar" = tercera opción (guardar y salir). */
export type ResultadoConfirm = boolean | "guardar";

/** Hook de conveniencia:
    const { confirmar, dialogo } = useConfirm();
    if (await confirmar({ mensaje: "..." })) { ... }
    y renderizar {dialogo} una vez en la página. */
export function useConfirm() {
    const [estado, setEstado] = useState<{ opciones: OpcionesConfirm; resolver: (v: ResultadoConfirm) => void } | null>(null);

    const confirmar = useCallback((opciones: OpcionesConfirm) => {
        return new Promise<ResultadoConfirm>((resolver) => {
            setEstado({ opciones, resolver });
        });
    }, []);

    const dialogo = estado ? (
        <ConfirmDialog
            isOpen
            {...estado.opciones}
            onConfirmar={() => { estado.resolver(true); setEstado(null); }}
            onGuardarSalir={() => { estado.resolver("guardar"); setEstado(null); }}
            onCancelar={() => { estado.resolver(false); setEstado(null); }}
        />
    ) : null;

    return { confirmar, dialogo };
}
