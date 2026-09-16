import { useEffect, useState } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

/* Sistema global de notificaciones tipo toast (sustituye a alert()).
   Uso: import { toast } from "../components/Toast"; toast.error("...");
   Funciona fuera de componentes (singleton con suscriptores); <ToastContainer />
   se monta una vez en App y pinta la pila en la esquina inferior derecha. */

export type ToastTipo = "success" | "error" | "warning" | "info";

interface ToastItem {
  id: number;
  tipo: ToastTipo;
  mensaje: string;
}

type Listener = (items: ToastItem[]) => void;

const DURACION_MS = 4200;
const MAX_VISIBLES = 5;

let items: ToastItem[] = [];
let listeners: Listener[] = [];

function emitir() {
  const copia = [...items];
  listeners.forEach(l => l(copia));
}

function quitar(id: number) {
  items = items.filter(t => t.id !== id);
  emitir();
}

function añadir(tipo: ToastTipo, mensaje: string) {
  // Sin duplicados consecutivos: un doble clic en "Guardar" no apila el mismo toast dos veces.
  const ultimo = items[items.length - 1];
  if (ultimo && ultimo.tipo === tipo && ultimo.mensaje === mensaje) return;
  const id = Date.now() + Math.random();
  items = [...items, { id, tipo, mensaje }].slice(-MAX_VISIBLES);
  emitir();
  setTimeout(() => quitar(id), DURACION_MS);
}

export const toast = {
  success: (mensaje: string) => añadir("success", mensaje),
  error: (mensaje: string) => añadir("error", mensaje),
  warning: (mensaje: string) => añadir("warning", mensaje),
  info: (mensaje: string) => añadir("info", mensaje),
  /** Descarta todos los toasts pendientes (útil en tests y resets de vista). */
  clear: () => { items = []; emitir(); },
};

const ESTILO_POR_TIPO: Record<ToastTipo, { icono: typeof CheckCircle; clase: string; borde: string }> = {
  success: { icono: CheckCircle, clase: "text-success", borde: "border-l-success" },
  error: { icono: XCircle, clase: "text-red", borde: "border-l-red" },
  warning: { icono: AlertTriangle, clase: "text-warning", borde: "border-l-warning" },
  info: { icono: Info, clase: "text-accent-blue", borde: "border-l-accent-blue" },
};

export function ToastContainer() {
  const [lista, setLista] = useState<ToastItem[]>(() => [...items]);

  useEffect(() => {
    const listener: Listener = (nuevos) => setLista(nuevos);
    listeners.push(listener);
    return () => { listeners = listeners.filter(l => l !== listener); };
  }, []);

  if (!lista.length) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[80] flex flex-col gap-2 w-80 max-w-[90vw]">
      {lista.map(t => {
        const { icono: Icono, clase, borde } = ESTILO_POR_TIPO[t.tipo];
        return (
          <div
            key={t.id}
            className={`flex items-start gap-3 bg-navy-light border border-white/10 border-l-4 ${borde} rounded-xl shadow-2xl backdrop-blur-md px-4 py-3 animate-in fade-in slide-in-from-right-4 duration-200`}
          >
            <Icono size={18} className={`${clase} shrink-0 mt-0.5`} />
            <span className="flex-1 text-sm text-silver leading-snug">{t.mensaje}</span>
            <button onClick={() => quitar(t.id)} className="text-silver/40 hover:text-silver transition-colors shrink-0" title="Cerrar">
              <X size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
