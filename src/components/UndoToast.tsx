import { useEffect, useState, useCallback } from "react";
import { RotateCcw, X } from "lucide-react";

const DURACION_DEFECTO = 6000;

export interface PendingUndo<T = unknown> {
  /** Clave única del pending (evita restaurar dos veces el mismo). */
  id: number;
  /** Datos que la acción destruyó/modificó (snapshot del evento, fila, stats...). */
  data: T;
}

/**
 * Hook para gestionar una acción destructiva pendiente de deshacer.
 * Auto-expira a los `duracionMs` ms; `push` reemplaza el pendiente anterior.
 */
export function useUndoToast<T>(duracionMs: number = DURACION_DEFECTO) {
  const [pendiente, setPendiente] = useState<PendingUndo<T> | null>(null);
  const [marca, setMarca] = useState(0); // reinicia el timer al reemplazar

  useEffect(() => {
    if (!pendiente) return;
    const t = setTimeout(() => setPendiente(null), duracionMs);
    return () => clearTimeout(t);
  }, [pendiente, marca, duracionMs]);

  const push = useCallback((data: T) => {
    setMarca(m => m + 1);
    setPendiente({ id: Date.now(), data });
  }, []);

  const clear = useCallback(() => setPendiente(null), []);

  return { pendiente, push, clear };
}

type Props<T> = {
  pendiente: PendingUndo<T> | null;
  onUndo: (data: T) => void;
  onDescartar?: () => void;
  /** Mensaje fijo o en función del snapshot: (d) => `...`. */
  mensaje: string | ((data: T) => string);
  duracionMs?: number;
  /** Barra de progreso del tiempo restante. */
  barra?: boolean;
};

export function UndoToast<T>({ pendiente, onUndo, onDescartar, mensaje, duracionMs = DURACION_DEFECTO, barra = true }: Props<T>) {
  const [restantePct, setRestantePct] = useState(100);

  // Progreso de la barra: se reinicia con cada nuevo pendiente.
  useEffect(() => {
    if (!pendiente || !barra) return;
    const inicio = Date.now();
    setRestantePct(100);
    const interval = setInterval(() => {
      const pct = Math.max(0, 100 - (100 * (Date.now() - inicio) / duracionMs));
      setRestantePct(pct);
    }, 100);
    return () => clearInterval(interval);
  }, [pendiente?.id, barra, duracionMs]);

  if (!pendiente) return null;

  const texto = typeof mensaje === "function" ? mensaje(pendiente.data) : mensaje;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[70] w-auto min-w-[320px] max-w-[90vw] overflow-hidden bg-navy-light border border-white/10 shadow-2xl rounded-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-4 duration-200">
      <div className="flex items-center gap-4 px-4 py-3">
        <span className="text-sm text-silver/80">{texto}</span>
        <div className="h-5 w-px bg-white/10" />
        <button
          onClick={() => { onUndo(pendiente.data); onDescartar?.(); }}
          className="flex items-center gap-1.5 text-sm font-black text-accent-blue hover:text-white transition-colors uppercase tracking-wider"
        >
          <RotateCcw size={15} /> Deshacer
        </button>
        <button
          onClick={() => onDescartar?.()}
          className="text-silver/40 hover:text-white transition-colors"
          title="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      {barra && (
        <div
          className="h-0.5 bg-accent-blue/80 transition-none"
          style={{ width: `${restantePct}%` }}
        />
      )}
    </div>
  );
}
