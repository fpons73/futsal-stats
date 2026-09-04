import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Plus, Trash2, CheckCircle, XCircle } from "lucide-react";

export function TandaPenaltisPartido({ partido, localId, visitanteId }: any) {
  const [jugadoresLocal, setJugadoresLocal] = useState<any[]>([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState<any[]>([]);
  const [eventosPenaltis, setEventosPenaltis] = useState<any[]>([]);

  useEffect(() => { cargarDatos(); }, [partido.id]);

  const cargarDatos = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    const alineaciones = await db.select<any[]>(`
      SELECT a.persona_id, a.equipo_id, a.titular, p.nombre_deportivo, a.dorsal
      FROM Alineacion a
      JOIN Persona p ON a.persona_id = p.id
      WHERE a.partido_id = ? AND (p.roles IS NULL OR p.roles NOT LIKE '%Entrenador%')
    `, [partido.id]);
    setJugadoresLocal(alineaciones.filter(j => j.equipo_id === localId));
    setJugadoresVisitante(alineaciones.filter(j => j.equipo_id === visitanteId));

    const eventosTanda = await db.select<any[]>(`
      SELECT * FROM Evento
      WHERE partido_id = ? AND tipo = 'TANDA_PENALTI'
      ORDER BY id ASC
    `, [partido.id]);
    const eventosParseados = eventosTanda.map(e => {
      let meta: any = { orden: 0 };
      try { if (e.metadata) meta = JSON.parse(e.metadata); } catch {}
      return { ...e, orden: meta.orden || 0 };
    }).sort((a, b) => a.orden - b.orden);
    setEventosPenaltis(eventosParseados);
  };

  const addPenalti = async (equipoId: number, personaId: number, resultado: string) => {
    const db = await Database.load("sqlite:globalfutsal.db");
    const orden = eventosPenaltis.length;
    await db.execute(
      `INSERT INTO Evento (partido_id, tipo, subtipo, jugador_id, equipo_id, metadata)
       VALUES (?, 'TANDA_PENALTI', ?, ?, ?, ?)`,
      [partido.id, resultado, personaId, equipoId, JSON.stringify({ orden })]
    );
    cargarDatos();
  };

  const deletePenalti = async (id: number) => {
    const db = await Database.load("sqlite:globalfutsal.db");
    await db.execute("DELETE FROM Evento WHERE id = ?", [id]);
    cargarDatos();
  };

  const golesLocal = eventosPenaltis.filter(e => e.equipo_id === localId && e.subtipo === "Gol").length;
  const golesVisitante = eventosPenaltis.filter(e => e.equipo_id === visitanteId && e.subtipo === "Gol").length;

  return (
    <div className="space-y-4">
      <div className="text-center text-2xl font-black text-gray-900 dark:text-white">
        {golesLocal} - {golesVisitante}
        <span className="block text-xs text-gray-500 dark:text-gray-400 font-normal">Tanda de Penaltis (3 lanzadores)</span>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Local */}
        <div>
          <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400 mb-2">Local</h3>
          <div className="space-y-1">
            {eventosPenaltis.filter(e => e.equipo_id === localId).map(e => (
              <div key={e.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded p-1.5">
                {e.subtipo === "Gol" ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                <span className="text-xs flex-1">{e.jugador_nombre || `#${e.dorsal || "?"}`}</span>
                <span className="text-[10px] text-gray-500">{e.subtipo}</span>
                <button onClick={() => deletePenalti(e.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <AddPenalti jugadores={jugadoresLocal} equipoId={localId} onAdd={addPenalti} />
        </div>

        {/* Visitante */}
        <div>
          <h3 className="text-sm font-bold text-red-600 dark:text-red-400 mb-2">Visitante</h3>
          <div className="space-y-1">
            {eventosPenaltis.filter(e => e.equipo_id === visitanteId).map(e => (
              <div key={e.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 rounded p-1.5">
                {e.subtipo === "Gol" ? <CheckCircle size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />}
                <span className="text-xs flex-1">{e.jugador_nombre || `#${e.dorsal || "?"}`}</span>
                <span className="text-[10px] text-gray-500">{e.subtipo}</span>
                <button onClick={() => deletePenalti(e.id)} className="text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
              </div>
            ))}
          </div>
          <AddPenalti jugadores={jugadoresVisitante} equipoId={visitanteId} onAdd={addPenalti} />
        </div>
      </div>
    </div>
  );
}

function AddPenalti({ jugadores, equipoId, onAdd }: any) {
  const [personaId, setPersonaId] = useState(0);
  const [resultado, setResultado] = useState("Gol");

  return (
    <div className="flex gap-1 mt-2">
      <select value={personaId} onChange={e => setPersonaId(Number(e.target.value))} className="flex-1 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-xs text-gray-900 dark:text-white outline-none">
        <option value={0}>Jugador...</option>
        {jugadores.map((j: any) => <option key={j.persona_id} value={j.persona_id}>#{j.dorsal} {j.nombre_deportivo}</option>)}
      </select>
      <select value={resultado} onChange={e => setResultado(e.target.value)} className="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-xs text-gray-900 dark:text-white outline-none">
        <option value="Gol">Gol</option>
        <option value="Parado">Parado</option>
        <option value="Fuera">Fuera</option>
        <option value="Palo">Palo</option>
      </select>
      <button
        onClick={() => personaId && onAdd(equipoId, personaId, resultado)}
        className="bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1 transition-colors"
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
