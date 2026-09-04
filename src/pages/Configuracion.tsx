import { useState, useEffect } from "react";
import { Settings, Trash2, Database as DbIcon, Check, Sparkles, Calendar, Users } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";
import { ask, message } from "@tauri-apps/plugin-dialog";
import { ModalBuscarDuplicados } from "../components/ModalBuscarDuplicados";
import { geminiService, DEFAULT_GEMINI_MODEL } from "../services/geminiService";
import { exportarPersonasCSV, exportarEquiposCSV } from "../utils/csvExporters";
import { seedConfederacionesFutsal } from "../utils/seedConfederaciones";
import { seedCompeticionesFutsal } from "../utils/seedCompeticionesFutsal";

export default function Configuracion() {
  const [loading, setLoading] = useState(false);
  const [modalDuplicadosOpen, setModalDuplicadosOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [savedKey, setSavedKey] = useState(false);

  useEffect(() => {
    geminiService.loadPreferences().then(({ apiKey, model }) => {
      setApiKey(apiKey);
      setModel(model);
    });
  }, []);

  const guardarConfiguracionIA = () => {
    geminiService.setApiKey(apiKey);
    geminiService.setModel(model);
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 3000);
  };

  const resetFabrica = async () => {
    const confirmacion = await ask("¡PELIGRO!\n\nEsto borrara TODOS los datos (Jugadores, Partidos, Equipos...).\n\n¿Estas seguro?", {
      title: "¡Peligro!", kind: "warning", okLabel: "Aceptar", cancelLabel: "Cancelar"
    });
    if (!confirmacion) return;

    setLoading(true);
    try {
      const db = await Database.load("sqlite:globalfutsal.db");
      await db.execute("DELETE FROM Evento");
      await db.execute("DELETE FROM Alineacion");
      await db.execute("DELETE FROM Partido");
      await db.execute("DELETE FROM Plantilla");
      await db.execute("DELETE FROM Designacion");
      await db.execute("DELETE FROM Inscripcion");
      await db.execute("DELETE FROM Fase");
      await db.execute("DELETE FROM Edicion");
      await db.execute("DELETE FROM Equipo");
      await db.execute("DELETE FROM Persona");
      await db.execute("DELETE FROM Estadio");
      await db.execute("DELETE FROM sqlite_sequence");
      await message("Datos borrados correctamente.", { title: "Exito", kind: "info" });
    } catch (err) {
      await message(`Error: ${err}`, { title: "Error", kind: "error" });
    } finally {
      setLoading(false);
    }
  };

  const cargarSeeds = async () => {
    setLoading(true);
    try {
      await seedConfederacionesFutsal();
      await seedCompeticionesFutsal();
      await message("Seeds de futsal cargados correctamente.", { title: "Exito", kind: "info" });
    } catch (err) {
      await message(`Error: ${err}`, { title: "Error", kind: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Settings size={24} /> Configuracion</h1>

      {/* IA / Gemini */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><Sparkles size={18} className="text-purple-400" /> Inteligencia Artificial (Gemini)</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">API Key de Google Gemini</label>
            <input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="AIza..." className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-purple-500 mt-1" />
          </div>
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Modelo</label>
            <input type="text" value={model} onChange={e => setModel(e.target.value)} className="w-full bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-purple-500 mt-1" />
          </div>
          <button onClick={guardarConfiguracionIA} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-bold flex items-center gap-2 transition-colors">
            {savedKey ? <><Check size={16} /> Guardado</> : "Guardar"}
          </button>
        </div>
      </div>

      {/* Herramientas */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><DbIcon size={18} className="text-blue-400" /> Herramientas de Datos</h2>
        <div className="space-y-2">
          <button onClick={() => setModalDuplicadosOpen(true)} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors">
            <Users size={16} /> Buscar y fusionar duplicados
          </button>
          <button onClick={() => exportarPersonasCSV("Jugador")} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors">
            <DbIcon size={16} /> Exportar jugadores (CSV)
          </button>
          <button onClick={() => exportarEquiposCSV()} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors">
            <DbIcon size={16} /> Exportar equipos (CSV)
          </button>
          <button onClick={cargarSeeds} disabled={loading} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
            <Calendar size={16} /> Cargar seeds de futsal (confederaciones y competiciones)
          </button>
        </div>
      </div>

      {/* Zona peligrosa */}
      <div className="bg-red-950/20 rounded-xl border border-red-500/30 p-5">
        <h2 className="text-lg font-bold text-red-400 flex items-center gap-2 mb-4"><Trash2 size={18} /> Zona Peligrosa</h2>
        <button onClick={resetFabrica} disabled={loading} className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-50">
          <Trash2 size={16} /> Reset de Fabrica
        </button>
        <p className="text-xs text-red-300/50 mt-2">Borra todos los datos de la base de datos. No se puede deshacer.</p>
      </div>

      <ModalBuscarDuplicados isOpen={modalDuplicadosOpen} onClose={() => setModalDuplicadosOpen(false)} />
    </div>
  );
}
