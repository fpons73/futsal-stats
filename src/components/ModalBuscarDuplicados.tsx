import { useState, useEffect } from "react";
import { X, Search, AlertTriangle, User } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";

interface ModalProps { isOpen: boolean; onClose: () => void; }

export function ModalBuscarDuplicados({ isOpen, onClose }: ModalProps) {
  const [duplicados, setDuplicados] = useState<any[]>([]);
  const [busqueda, setBusqueda] = useState("");

  useEffect(() => { if (isOpen) buscar(); }, [isOpen]);

  const buscar = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    // Buscar personas con el mismo nombre_deportivo
    const res = await db.select<any[]>(`
      SELECT nombre_deportivo, COUNT(*) as c, GROUP_CONCAT(id) as ids, GROUP_CONCAT(fecha_nacimiento) as fechas
      FROM Persona
      GROUP BY LOWER(nombre_deportivo)
      HAVING c > 1
      ORDER BY c DESC
    `);
    setDuplicados(res);
  };

  const fusionar = async (ids: string, mantenerId: number) => {
    const db = await Database.load("sqlite:globalfutsal.db");
    const idList = ids.split(",").map(Number).filter(id => id !== mantenerId);
    for (const id of idList) {
      // Mover referencias
      await db.execute("UPDATE Alineacion SET persona_id = ? WHERE persona_id = ?", [mantenerId, id]);
      await db.execute("UPDATE Evento SET jugador_id = ? WHERE jugador_id = ?", [mantenerId, id]);
      await db.execute("UPDATE Evento SET asistente_id = ? WHERE asistente_id = ?", [mantenerId, id]);
      await db.execute("UPDATE Afiliacion SET persona_id = ? WHERE persona_id = ?", [mantenerId, id]);
      await db.execute("UPDATE Plantilla SET persona_id = ? WHERE persona_id = ?", [mantenerId, id]);
      await db.execute("DELETE FROM Persona WHERE id = ?", [id]);
    }
    buscar();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-2xl p-5 shadow-2xl flex flex-col max-h-[80vh] transition-colors">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-800 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <AlertTriangle className="text-yellow-500" size={20} /> Buscar Duplicados
          </h2>
          <button onClick={onClose}><X className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" /></button>
        </div>

        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Filtrar..." className="w-full pl-8 pr-3 py-2 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded text-gray-900 dark:text-white outline-none focus:border-blue-500 text-sm" />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {duplicados.length === 0 ? (
            <div className="text-center text-gray-500 dark:text-gray-400 py-8">No se encontraron duplicados</div>
          ) : (
            duplicados
              .filter(d => !busqueda || d.nombre_deportivo.toLowerCase().includes(busqueda.toLowerCase()))
              .map(d => (
                <div key={d.ids} className="bg-gray-50 dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-2 mb-2">
                    <User size={14} className="text-gray-400" />
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{d.nombre_deportivo}</span>
                    <span className="text-xs text-gray-500">{d.c} registros</span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {d.ids.split(",").map((id: string, i: number) => (
                      <button
                        key={id}
                        onClick={() => fusionar(d.ids, parseInt(id))}
                        className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900 transition-colors"
                      >
                        Mantener #{id} ({d.fechas?.split(",")[i] || "?"})
                      </button>
                    ))}
                  </div>
                </div>
              ))
          )}
        </div>
      </div>
    </div>
  );
}
