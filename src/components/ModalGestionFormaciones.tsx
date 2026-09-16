import { useState, useEffect } from "react";
import { X, Plus, Trash2, Pencil, Check, LayoutTemplate } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";
import { useConfirm } from "./ConfirmDialog";
import { toast } from "./Toast";

interface ModalProps { isOpen: boolean; onClose: () => void; onSave?: () => void; }

export function ModalGestionFormaciones({ isOpen, onClose, onSave }: ModalProps) {
  const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
  const [formaciones, setFormaciones] = useState<any[]>([]);
  const [nueva, setNueva] = useState("");
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [textoEditando, setTextoEditando] = useState("");

  useEffect(() => { if (isOpen) cargar(); }, [isOpen]);

  async function cargar() {
    const db = await Database.load("sqlite:globalfutsal.db");
    const res = await db.select<any[]>("SELECT * FROM Formacion ORDER BY nombre ASC");
    setFormaciones(res);
  }

  const crear = async () => {
    if (!nueva.trim()) return;
    const db = await Database.load("sqlite:globalfutsal.db");
    await db.execute("INSERT INTO Formacion (nombre) VALUES (?)", [nueva.trim()]);
    setNueva("");
    cargar();
    if (onSave) onSave();
  };

  const eliminar = async (id: number) => {
    const ok = await confirmar({
      titulo: "Eliminar táctica",
      mensaje: "¿Eliminar esta formación? Dejará de estar disponible en los selectores.",
      textoConfirmar: "Sí, eliminar",
    });
    if (!ok) return;
    const db = await Database.load("sqlite:globalfutsal.db");
    await db.execute("DELETE FROM Formacion WHERE id = ?", [id]);
    toast.success("Táctica eliminada");
    cargar();
    if (onSave) onSave();
  };

  const guardarEdicion = async () => {
    if (!editandoId) return;
    const db = await Database.load("sqlite:globalfutsal.db");
    await db.execute("UPDATE Formacion SET nombre = ? WHERE id = ?", [textoEditando, editandoId]);
    setEditandoId(null);
    cargar();
    if (onSave) onSave();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-md p-5 shadow-2xl flex flex-col max-h-[80vh] transition-colors">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-800 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <LayoutTemplate className="text-blue-500" size={20} /> Gestionar Tácticas
          </h2>
          <button onClick={onClose}><X className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" /></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-2 mb-4">
          {formaciones.map(f => (
            <div key={f.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-2 rounded border border-gray-200 dark:border-gray-700 hover:border-blue-500/50 transition-colors">
              {editandoId === f.id ? (
                <input autoFocus value={textoEditando} onChange={e => setTextoEditando(e.target.value)} onKeyDown={e => e.key === "Enter" && guardarEdicion()} className="bg-white dark:bg-black text-gray-900 dark:text-white px-2 py-1 rounded border border-blue-500 w-full mr-2 outline-none" />
              ) : (
                <span className="text-gray-700 dark:text-gray-200 font-mono font-bold">{f.nombre}</span>
              )}
              <div className="flex gap-1">
                {editandoId === f.id ? (
                  <button onClick={guardarEdicion} className="p-1.5 bg-green-600 hover:bg-green-500 rounded text-white transition-colors"><Check size={14} /></button>
                ) : (
                  <button onClick={() => { setEditandoId(f.id); setTextoEditando(f.nombre); }} className="p-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-blue-600 rounded text-gray-600 dark:text-gray-300 hover:text-white transition-colors"><Pencil size={14} /></button>
                )}
                <button onClick={() => eliminar(f.id)} className="p-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-red-600 rounded text-gray-600 dark:text-gray-300 hover:text-white transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-800">
          <input value={nueva} onChange={e => setNueva(e.target.value)} onKeyDown={e => e.key === "Enter" && crear()} placeholder="Nueva (Ej: 1-3-1)" className="flex-1 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-3 py-2 text-gray-900 dark:text-white focus:border-blue-500 outline-none transition-colors" />
          <button onClick={crear} className="bg-blue-600 hover:bg-blue-500 text-white px-4 rounded font-bold flex items-center gap-1 transition-colors"><Plus size={18} /> Añadir</button>
        </div>
      </div>
      {dialogoConfirmar}
    </div>
  );
}
