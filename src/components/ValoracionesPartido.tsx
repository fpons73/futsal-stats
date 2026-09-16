import { useState, useEffect } from "react";
import { Save, Star } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";

interface Props {
  partidoId: number;
  localId: number;
  visitanteId: number;
  localNombre: string;
  visitanteNombre: string;
}

export function ValoracionesPartido({ partidoId, localId, visitanteId, localNombre, visitanteNombre }: Props) {
  const [jugadoresLocal, setJugadoresLocal] = useState<any[]>([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState<any[]>([]);
  const [ratings, setRatings] = useState<{ [key: number]: number }>({});

  useEffect(() => { cargarJugadores(); }, [partidoId]);

  async function cargarJugadores() {
    const db = await Database.load("sqlite:globalfutsal.db");
    const query = `
      SELECT a.persona_id, a.dorsal, a.rating, a.titular, COALESCE(a.posicion_inicial, a.posicion) as posicion, a.equipo_id,
             p.nombre_deportivo, p.foto_path, p.posicion_principal
      FROM Alineacion a
      JOIN Persona p ON a.persona_id = p.id
      WHERE a.partido_id = ? AND (p.roles IS NULL OR p.roles NOT LIKE '%Entrenador%')
      ORDER BY a.titular DESC, a.dorsal ASC
    `;
    const todos = await db.select<any[]>(query, [partidoId]);
    setJugadoresLocal(todos.filter(j => j.equipo_id === localId));
    setJugadoresVisitante(todos.filter(j => j.equipo_id === visitanteId));

    const ratingsMap: { [key: number]: number } = {};
    todos.forEach(j => {
      if (j.rating) ratingsMap[j.persona_id] = j.rating;
    });
    setRatings(ratingsMap);
  }

  const setRating = (personaId: number, value: number) => {
    setRatings(prev => ({ ...prev, [personaId]: value }));
  };

  const guardar = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    for (const [personaIdStr, rating] of Object.entries(ratings)) {
      await db.execute(
        "UPDATE Alineacion SET rating = ? WHERE partido_id = ? AND persona_id = ?",
        [rating, partidoId, parseInt(personaIdStr)]
      );
    }
  };

  const renderItem = (j: any) => {
    const rating = ratings[j.persona_id] || 0;
    return (
      <div key={j.persona_id} className="flex items-center gap-2 py-1.5 px-2 border-b border-gray-100 dark:border-gray-800">
        <span className="w-6 text-center text-xs font-bold text-gray-500 dark:text-gray-400">{j.dorsal || "-"}</span>
        <span className="flex-1 text-xs text-gray-700 dark:text-gray-300 truncate">{j.nombre_deportivo}</span>
        <div className="flex items-center gap-0.5">
          <input
            type="number"
            min="0"
            max="10"
            step="0.1"
            value={rating || ""}
            onChange={e => setRating(j.persona_id, Number(e.target.value))}
            className="w-12 text-center bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-1 py-0.5 text-gray-900 dark:text-white outline-none focus:border-blue-500 text-xs"
          />
          <Star size={12} className={rating >= 6 ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={guardar} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-colors">
          <Save size={14} /> Guardar Valoraciones
        </button>
      </div>

      {(["local", "visitante"] as const).map(equipo => {
        const jugadores = equipo === "local" ? jugadoresLocal : jugadoresVisitante;
        const nombre = equipo === "local" ? localNombre : visitanteNombre;
        if (jugadores.length === 0) return null;
        return (
          <div key={equipo}>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-1 border-b border-gray-200 dark:border-gray-700 pb-1">{nombre}</h3>
            {jugadores.map(j => renderItem(j))}
          </div>
        );
      })}
    </div>
  );
}
