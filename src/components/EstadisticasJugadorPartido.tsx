import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Save } from "lucide-react";

interface Props {
  partidoId: number;
  localId: number;
  visitanteId: number;
  localNombre: string;
  visitanteNombre: string;
}

const CAMPOS = [
  { key: "goles", label: "Goles" },
  { key: "asistencias", label: "Asistencias" },
  { key: "tiros", label: "Tiros" },
  { key: "tiros_puerta", label: "Tiros a Puerta" },
  { key: "pases_totales", label: "Pases" },
  { key: "pases_precisos", label: "Pases Precisos" },
  { key: "pases_clave", label: "Pases Clave" },
  { key: "centros_totales", label: "Centros" },
  { key: "centros_buenos", label: "Centros Buenos" },
  { key: "entradas", label: "Entradas" },
  { key: "intercepciones", label: "Intercepciones" },
  { key: "recuperaciones", label: "Recuperaciones" },
  { key: "despejes", label: "Despejes" },
  { key: "duelos_ganados", label: "Duelos Ganados" },
  { key: "duelos_perdidos", label: "Duelos Perdidos" },
  { key: "faltas_cometidas", label: "Faltas Cometidas" },
  { key: "faltas_recibidas", label: "Faltas Recibidas" },
  { key: "penaltis_marcados", label: "Penaltis Marcados" },
  { key: "penaltis_fallados", label: "Penaltis Fallados" },
  { key: "dobles_penaltis_marcados", label: "Dobles Penaltis" },
  { key: "dobles_penaltis_fallados", label: "Dobles Penaltis Fall." },
  { key: "paradas", label: "Paradas" },
  { key: "saques_banda", label: "Saques de Banda" },
  { key: "minutos_jugados", label: "Minutos" },
  { key: "rating", label: "Rating" },
];

export function EstadisticasJugadorPartido({ partidoId, localId, visitanteId, localNombre, visitanteNombre }: Props) {
  const [jugadoresLocal, setJugadoresLocal] = useState<any[]>([]);
  const [jugadoresVisitante, setJugadoresVisitante] = useState<any[]>([]);
  const [stats, setStats] = useState<{ [key: string]: any }>({});

  useEffect(() => { cargarDatos(); }, [partidoId]);

  async function cargarDatos() {
    const db = await Database.load("sqlite:globalfutsal.db");
    const query = `
      SELECT a.persona_id, a.dorsal, p.nombre_deportivo, a.equipo_id, COALESCE(a.posicion_inicial, p.posicion_principal) as posicion_principal
      FROM Alineacion a
      JOIN Persona p ON a.persona_id = p.id
      WHERE a.partido_id = ? AND (p.roles IS NULL OR p.roles NOT LIKE '%Entrenador%')
      ORDER BY a.titular DESC, a.dorsal ASC
    `;
    const todos = await db.select<any[]>(query, [partidoId]);
    setJugadoresLocal(todos.filter(j => j.equipo_id === localId));
    setJugadoresVisitante(todos.filter(j => j.equipo_id === visitanteId));

    // Cargar stats existentes
    const statsRes = await db.select<any[]>(`
      SELECT * FROM EstadisticaPartidoJugador WHERE partido_id = ?
    `, [partidoId]);

    const statsMap: { [key: string]: any } = {};
    statsRes.forEach(s => {
      statsMap[s.persona_id] = s;
    });
    setStats(statsMap);
  }

  const setStat = (personaId: number, key: string, value: any) => {
    setStats(prev => {
      const existing = prev[personaId] || { persona_id: personaId, partido_id: partidoId };
      return { ...prev, [personaId]: { ...existing, [key]: value } };
    });
  };

  const guardar = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    for (const personaIdStr of Object.keys(stats)) {
      const personaId = parseInt(personaIdStr);
      const s = stats[personaId];
      const equipoId = s.equipo_id || (jugadoresLocal.find(j => j.persona_id === personaId)?.equipo_id || jugadoresVisitante.find(j => j.persona_id === personaId)?.equipo_id);

      const existe = await db.select<any[]>("SELECT id FROM EstadisticaPartidoJugador WHERE partido_id=? AND persona_id=?", [partidoId, personaId]);
      const fields = CAMPOS.map(c => c.key).join(", ");
      const placeholders = CAMPADOS_PLACEHOLDERS();
      const values = CAMPOS.map(c => s[c.key] ?? 0);

      if (existe.length > 0) {
        const setClause = CAMPOS.map(c => `${c.key}=?`).join(", ");
        await db.execute(
          `UPDATE EstadisticaPartidoJugador SET ${setClause}, equipo_id=? WHERE partido_id=? AND persona_id=?`,
          [...values, equipoId, partidoId, personaId]
        );
      } else {
        await db.execute(
          `INSERT INTO EstadisticaPartidoJugador (partido_id, persona_id, equipo_id, ${fields}) VALUES (?, ?, ?, ${placeholders})`,
          [partidoId, personaId, equipoId, ...values]
        );
      }
    }
  };

  if (jugadoresLocal.length === 0 && jugadoresVisitante.length === 0) {
    return <div className="text-center text-gray-500 py-8">No hay jugadores alineados</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={guardar} className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-colors">
          <Save size={14} /> Guardar Todo
        </button>
      </div>

      {(["local", "visitante"] as const).map(equipo => {
        const jugadores = equipo === "local" ? jugadoresLocal : jugadoresVisitante;
        const nombre = equipo === "local" ? localNombre : visitanteNombre;
        if (jugadores.length === 0) return null;
        return (
          <div key={equipo}>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-2 border-b border-gray-200 dark:border-gray-700 pb-1">{nombre}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700">
                    <th className="text-left py-1 px-1 text-gray-500 dark:text-gray-400">#</th>
                    <th className="text-left py-1 px-1 text-gray-500 dark:text-gray-400">Jugador</th>
                    {CAMPOS.map(c => (
                      <th key={c.key} className="text-center py-1 px-1 text-gray-500 dark:text-gray-400" title={c.label}>{c.label.length > 8 ? c.label.substring(0, 8) + "…" : c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {jugadores.map(j => {
                    const s = stats[j.persona_id] || {};
                    return (
                      <tr key={j.persona_id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <td className="py-1 px-1 text-gray-600 dark:text-gray-400 font-bold">{j.dorsal || "-"}</td>
                        <td className="py-1 px-1 text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">{j.nombre_deportivo}</td>
                        {CAMPOS.map(c => (
                          <td key={c.key} className="py-0.5 px-0.5">
                            <input
                              type="number"
                              step="any"
                              value={s[c.key] ?? ""}
                              onChange={e => setStat(j.persona_id, c.key, e.target.value === "" ? 0 : Number(e.target.value))}
                              className="w-10 text-center bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-700 rounded px-0.5 py-0.5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CAMPADOS_PLACEHOLDERS() {
  return CAMPOS.map(() => "?").join(", ");
}
