import { useState, useEffect } from "react";
import { X, Save, Settings } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";

interface ModalProps { isOpen: boolean; onClose: () => void; edicionId: number; onGuardado?: () => void; }

const REGLAS_DESEMPATE = [
  { id: "dg", label: "Diferencia de goles" },
  { id: "gf", label: "Goles a favor" },
  { id: "gc", label: "Goles en contra (menos)" },
  { id: "enfrentamiento", label: "Enfrentamiento directo" },
  { id: "fairplay", label: "Fair Play (menos faltas/tarjetas)" },
  { id: "sorteo", label: "Sorteo" },
];

export function ModalConfigTabla({ isOpen, onClose, edicionId, onGuardado }: ModalProps) {
  const [puntosV, setPuntosV] = useState(3);
  const [puntosE, setPuntosE] = useState(1);
  const [puntosD, setPuntosD] = useState(0);
  const [ordenDesempate, setOrdenDesempate] = useState<string[]>(["dg", "gf", "gc", "enfrentamiento"]);

  useEffect(() => {
    if (isOpen) cargar();
  }, [isOpen, edicionId]);

  const cargar = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    const res = await db.select<any[]>("SELECT * FROM Edicion WHERE id = ?", [edicionId]);
    if (res.length > 0) {
      setPuntosV(res[0].puntos_victoria || 3);
      setPuntosE(res[0].puntos_empate || 1);
      setPuntosD(res[0].puntos_derrota || 0);
      if (res[0].desempates_json) {
        try {
          const parsed = JSON.parse(res[0].desempates_json);
          if (parsed.orden) setOrdenDesempate(parsed.orden);
        } catch {}
      }
    }
  };

  const guardar = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    const desempates = JSON.stringify({ orden: ordenDesempate });
    await db.execute("UPDATE Edicion SET puntos_victoria = ?, puntos_empate = ?, puntos_derrota = ?, desempates_json = ? WHERE id = ?",
      [puntosV, puntosE, puntosD, desempates, edicionId]);
    if (onGuardado) onGuardado();
    onClose();
  };

  const toggleRegla = (id: string) => {
    setOrdenDesempate(prev => {
      if (prev.includes(id)) return prev.filter(r => r !== id);
      return [...prev, id];
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-md p-5 shadow-2xl transition-colors">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-800 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Settings className="text-blue-500" size={20} /> Configurar Tabla
          </h2>
          <button onClick={onClose}><X className="text-gray-400 hover:text-gray-900 dark:hover:text-white" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">V (pts)</label>
              <input type="number" value={puntosV} onChange={e => setPuntosV(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">E (pts)</label>
              <input type="number" value={puntosE} onChange={e => setPuntosE(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
            </div>
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">D (pts)</label>
              <input type="number" value={puntosD} onChange={e => setPuntosD(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase mb-2 block">Orden de Desempate</label>
            <div className="space-y-1">
              {REGLAS_DESEMPATE.map((r, i) => (
                <div key={r.id} className="flex items-center gap-2">
                  <button
                    onClick={() => toggleRegla(r.id)}
                    className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                      ordenDesempate.includes(r.id)
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {i + 1}. {r.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex gap-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-800">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={guardar} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold transition-colors flex items-center justify-center gap-2"><Save size={16} /> Guardar</button>
        </div>
      </div>
    </div>
  );
}
