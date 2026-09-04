import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";
import { ResumenPartidoIA } from "./ResumenPartidoIA";
import { ComparisonMetricBar } from "./charts/ComparisonMetricBar";

interface Props {
  partidoId: number;
  localId: number;
  visitanteId: number;
  localNombre: string;
  visitanteNombre: string;
}

export function EstadisticasPartido({ partidoId, localId, visitanteId, localNombre, visitanteNombre }: Props) {
  const [stats, setStats] = useState<any>({ local: {}, visitante: {} });
  const [marcador, setMarcador] = useState({ local: 0, visitante: 0 });
  const [viewMode, setViewMode] = useState<"visual" | "editor">("visual");

  useEffect(() => { cargarStats(); }, [partidoId]);

  async function cargarStats() {
    const db = await Database.load("sqlite:globalfutsal.db");
    const resPartido = await db.select<any[]>("SELECT goles_local, goles_visitante FROM Partido WHERE id=?", [partidoId]);
    if (resPartido.length > 0) {
      setMarcador({ local: resPartido[0].goles_local || 0, visitante: resPartido[0].goles_visitante || 0 });
    }
    const resL = await db.select<any[]>("SELECT * FROM EstadisticaPartidoEquipo WHERE partido_id=? AND equipo_id=?", [partidoId, localId]);
    const resV = await db.select<any[]>("SELECT * FROM EstadisticaPartidoEquipo WHERE partido_id=? AND equipo_id=?", [partidoId, visitanteId]);
    setStats({ local: resL[0] || {}, visitante: resV[0] || {} });
  }

  const guardarStats = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    for (const [equipo, statObj] of Object.entries(stats)) {
      const equipoId = equipo === "local" ? localId : visitanteId;
      const s: any = statObj;
      const existe = await db.select<any[]>("SELECT id FROM EstadisticaPartidoEquipo WHERE partido_id=? AND equipo_id=?", [partidoId, equipoId]);
      if (existe.length > 0) {
        await db.execute(
          `UPDATE EstadisticaPartidoEquipo SET posesion=?, tiros=?, tiros_puerta=?, corners=?, faltas=?, faltas_acumulativas=?, saques_banda=?, saques_puerta=?, pases_totales=?, pases_precisos=?, centros_totales=?, centros_buenos=?, entradas_totales=?, entradas_ganadas=?, intercepciones=?, recuperaciones=?, despejes=?, duelos_ganados=?, duelos_perdidos=?, paradas=?, punos=?, tarjetas_amarillas=?, tarjetas_rojas=? WHERE partido_id=? AND equipo_id=?`,
          [s.posesion||0, s.tiros||0, s.tiros_puerta||0, s.corners||0, s.faltas||0, s.faltas_acumulativas||0, s.saques_banda||0, s.saques_puerta||0, s.pases_totales||0, s.pases_precisos||0, s.centros_totales||0, s.centros_buenos||0, s.entradas_totales||0, s.entradas_ganadas||0, s.intercepciones||0, s.recuperaciones||0, s.despejes||0, s.duelos_ganados||0, s.duelos_perdidos||0, s.paradas||0, s.punos||0, s.tarjetas_amarillas||0, s.tarjetas_rojas||0, partidoId, equipoId]
        );
      } else {
        await db.execute(
          `INSERT INTO EstadisticaPartidoEquipo (partido_id, equipo_id, posesion, tiros, tiros_puerta, corners, faltas, faltas_acumulativas, saques_banda, saques_puerta, pases_totales, pases_precisos, centros_totales, centros_buenos, entradas_totales, entradas_ganadas, intercepciones, recuperaciones, despejes, duelos_ganados, duelos_perdidos, paradas, punos, tarjetas_amarillas, tarjetas_rojas) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [partidoId, equipoId, s.posesion||0, s.tiros||0, s.tiros_puerta||0, s.corners||0, s.faltas||0, s.faltas_acumulativas||0, s.saques_banda||0, s.saques_puerta||0, s.pases_totales||0, s.pases_precisos||0, s.centros_totales||0, s.centros_buenos||0, s.entradas_totales||0, s.entradas_ganadas||0, s.intercepciones||0, s.recuperaciones||0, s.despejes||0, s.duelos_ganados||0, s.duelos_perdidos||0, s.paradas||0, s.punos||0, s.tarjetas_amarillas||0, s.tarjetas_rojas||0]
        );
      }
    }
  };

  const METRICAS_COMPARATIVAS = [
    { key: "posesion", label: "Posesión (%)", type: "percent" },
    { key: "tiros", label: "Tiros" },
    { key: "tiros_puerta", label: "Tiros a Puerta" },
    { key: "corners", label: "Saques de Esquina" },
    { key: "faltas", label: "Faltas" },
    { key: "faltas_acumulativas", label: "Faltas Acumulativas" },
    { key: "saques_banda", label: "Saques de Banda" },
    { key: "pases_totales", label: "Pases Totales" },
    { key: "pases_precisos", label: "Pases Precisos" },
    { key: "centros_totales", label: "Centros" },
    { key: "entradas_totales", label: "Entradas" },
    { key: "intercepciones", label: "Intercepciones" },
    { key: "recuperaciones", label: "Recuperaciones" },
    { key: "duelos_ganados", label: "Duelos Ganados" },
    { key: "paradas", label: "Paradas (Portero)" },
  ];

  const EDITABLE_FIELDS = [
    { key: "posesion", label: "Posesión (%)", type: "number" },
    { key: "tiros", label: "Tiros" },
    { key: "tiros_puerta", label: "Tiros a Puerta" },
    { key: "corners", label: "Saques de Esquina" },
    { key: "faltas", label: "Faltas" },
    { key: "faltas_acumulativas", label: "Faltas Acumulativas" },
    { key: "saques_banda", label: "Saques de Banda" },
    { key: "saques_puerta", label: "Saques de Puerta" },
    { key: "pases_totales", label: "Pases Totales" },
    { key: "pases_precisos", label: "Pases Precisos" },
    { key: "centros_totales", label: "Centros Totales" },
    { key: "centros_buenos", label: "Centros Buenos" },
    { key: "entradas_totales", label: "Entradas Totales" },
    { key: "entradas_ganadas", label: "Entradas Ganadas" },
    { key: "intercepciones", label: "Intercepciones" },
    { key: "recuperaciones", label: "Recuperaciones" },
    { key: "despejes", label: "Despejes" },
    { key: "duelos_ganados", label: "Duelos Ganados" },
    { key: "duelos_perdidos", label: "Duelos Perdidos" },
    { key: "paradas", label: "Paradas" },
    { key: "punos", label: "Puños" },
    { key: "tarjetas_amarillas", label: "Tarjetas Amarillas" },
    { key: "tarjetas_rojas", label: "Tarjetas Rojas" },
  ];

  const setStat = (equipo: "local" | "visitante", key: string, value: any) => {
    setStats((prev: any) => ({
      ...prev,
      [equipo]: { ...prev[equipo], [key]: value }
    }));
  };

  return (
    <div className="space-y-4">
      {/* Toggle visual/editor */}
      <div className="flex items-center gap-2">
        <button onClick={() => setViewMode("visual")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === "visual" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>Visual</button>
        <button onClick={() => setViewMode("editor")} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${viewMode === "editor" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300"}`}>Editor</button>
        {viewMode === "editor" && (
          <button onClick={guardarStats} className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-xs font-bold transition-colors"><Save size={14} /> Guardar</button>
        )}
      </div>

      {/* Resumen IA */}
      <ResumenPartidoIA localNombre={localNombre} visitanteNombre={visitanteNombre} golesLocal={marcador.local} golesVisitante={marcador.visitante} statsLocal={stats.local} statsVisitante={stats.visitante} />

      {viewMode === "visual" ? (
        <div className="space-y-2">
          {METRICAS_COMPARATIVAS.map(m => (
            <ComparisonMetricBar
              key={m.key}
              label={m.label}
              localValue={stats.local?.[m.key] || 0}
              visitanteValue={stats.visitante?.[m.key] || 0}
              localNombre={localNombre}
              visitanteNombre={visitanteNombre}
              type={(m as any).type}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="text-left py-2 px-2 text-gray-500 dark:text-gray-400 font-bold">Métrica</th>
                <th className="text-center py-2 px-2 text-blue-600 dark:text-blue-400 font-bold">{localNombre}</th>
                <th className="text-center py-2 px-2 text-red-600 dark:text-red-400 font-bold">{visitanteNombre}</th>
              </tr>
            </thead>
            <tbody>
              {EDITABLE_FIELDS.map(f => (
                <tr key={f.key} className="border-b border-gray-100 dark:border-gray-800">
                  <td className="py-1.5 px-2 text-gray-700 dark:text-gray-300 font-medium">{f.label}</td>
                  <td className="py-1.5 px-2">
                    <input type="number" value={stats.local?.[f.key] ?? ""} onChange={e => setStat("local", f.key, Number(e.target.value))} className="w-16 text-center bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
                  </td>
                  <td className="py-1.5 px-2">
                    <input type="number" value={stats.visitante?.[f.key] ?? ""} onChange={e => setStat("visitante", f.key, Number(e.target.value))} className="w-16 text-center bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-1 py-1 text-gray-900 dark:text-white outline-none focus:border-blue-500" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
