import { useState, useEffect } from "react";
import { BarChart3, Trophy, Shield, User, Filter } from "lucide-react";
import { getImgSrc } from "../utils/imageHelpers";
import { calcularClasificacion, obtenerEstadisticasJugadores, obtenerEstadisticasEquipos, obtenerCincoIdeal } from "../utils/calculadoraLiga";
import { ModalConfigTabla } from "../components/ModalConfigTabla";
import { CincoIdeal } from "../components/CincoIdeal";
import { useEdicion } from "../context/EdicionContext";
import { exportarClasificacionCSV, exportarEstadisticasJugadorCSV } from "../utils/csvExporters";

const METRICAS_JUGADOR = [
  { id: "goles_total", label: "Goles Totales" },
  { id: "asistencias", label: "Asistencias" },
  { id: "tiros", label: "Tiros" },
  { id: "tiros_puerta", label: "Tiros a Puerta" },
  { id: "pases_totales", label: "Pases Totales" },
  { id: "pases_precisos", label: "Pases Precisos" },
  { id: "entradas", label: "Entradas" },
  { id: "intercepciones", label: "Intercepciones" },
  { id: "recuperaciones", label: "Recuperaciones" },
  { id: "dobles_penaltis", label: "Dobles Penaltis" },
  { id: "minutos", label: "Minutos" },
  { id: "rating_medio", label: "Rating Medio" },
  { id: "partidos", label: "Partidos" },
  { id: "titular", label: "Titular" },
];

export default function Rankings() {
  const { edicionActiva, refrescar } = useEdicion();
  const [tab, setTab] = useState<"clasificacion" | "jugadores" | "equipos" | "cinco">("clasificacion");
  const [clasificacion, setClasificacion] = useState<any[]>([]);
  const [jugadores, setJugadores] = useState<any[]>([]);
  const [equipos, setEquipos] = useState<any[]>([]);
  const [cinco, setCinco] = useState<any[]>([]);
  const [metricaSel, setMetricaSel] = useState("goles_total");
  const [modalConfigOpen, setModalConfigOpen] = useState(false);

  useEffect(() => {
    if (edicionActiva) cargarDatos();
  }, [edicionActiva]);

  const cargarDatos = async () => {
    if (!edicionActiva) return;
    const [cl, js, eqs, ci] = await Promise.all([
      calcularClasificacion(edicionActiva.id),
      obtenerEstadisticasJugadores(edicionActiva.id),
      obtenerEstadisticasEquipos(edicionActiva.id),
      obtenerCincoIdeal(edicionActiva.id),
    ]);
    setClasificacion(cl);
    setJugadores(js);
    setEquipos(eqs);
    setCinco(ci);
  };

  if (!edicionActiva) {
    return <div className="p-8 text-center text-gray-500">Selecciona una edición para ver los rankings</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2"><BarChart3 size={24} /> Rankings</h1>
        <button onClick={() => setModalConfigOpen(true)} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors">
          <Filter size={14} /> Configurar
        </button>
      </div>

      <div className="flex gap-2">
        {[
          { val: "clasificacion", icon: Trophy, label: "Clasificacion" },
          { val: "jugadores", icon: User, label: "Jugadores" },
          { val: "equipos", icon: Shield, label: "Equipos" },
          { val: "cinco", icon: BarChart3, label: "Cinco Ideal" },
        ].map(({ val, icon: Icon, label }) => (
          <button key={val} onClick={() => setTab(val as any)} className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1 ${tab === val ? "bg-amber-500 text-white" : "bg-white/5 text-gray-400 hover:bg-white/10"}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* CLASIFICACION */}
      {tab === "clasificacion" && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-xs">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">Equipo</th>
                  <th className="text-center py-2 px-2">PJ</th>
                  <th className="text-center py-2 px-2">PG</th>
                  <th className="text-center py-2 px-2">PE</th>
                  <th className="text-center py-2 px-2">PP</th>
                  <th className="text-center py-2 px-2">GF</th>
                  <th className="text-center py-2 px-2">GC</th>
                  <th className="text-center py-2 px-2">DG</th>
                  <th className="text-center py-2 px-3 font-bold text-amber-400">PTS</th>
                </tr>
              </thead>
              <tbody>
                {clasificacion.map(c => (
                  <tr key={c.equipo_id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3 text-gray-400 font-bold">{c.posicion}</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {c.escudo && <img src={getImgSrc(c.escudo)} className="w-5 h-5 object-contain" />}
                        <span className="text-white font-medium">{c.nombre}</span>
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-gray-300">{c.pj}</td>
                    <td className="text-center py-2 px-2 text-green-400">{c.pg}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{c.pe}</td>
                    <td className="text-center py-2 px-2 text-red-400">{c.pp}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{c.gf}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{c.gc}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{c.dg > 0 ? "+" : ""}{c.dg}</td>
                    <td className="text-center py-2 px-3 text-amber-400 font-black text-lg">{c.puntos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => exportarClasificacionCSV(clasificacion, edicionActiva.nombre)} className="mt-2 mb-2 mx-4 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-xs font-bold">Exportar CSV</button>
        </div>
      )}

      {/* JUGADORES */}
      {tab === "jugadores" && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="flex items-center gap-2 p-3">
            <span className="text-xs text-gray-400">Metrica:</span>
            <select value={metricaSel} onChange={e => setMetricaSel(e.target.value)} className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-white text-xs outline-none">
              {METRICAS_JUGADOR.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-xs">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 px-3">Jugador</th>
                  <th className="text-left py-2 px-3">Equipo</th>
                  <th className="text-left py-2 px-3">Pos</th>
                  <th className="text-center py-2 px-3">{METRICAS_JUGADOR.find(m => m.id === metricaSel)?.label}</th>
                  <th className="text-center py-2 px-2">PJ</th>
                </tr>
              </thead>
              <tbody>
                {jugadores
                  .sort((a, b) => (b[metricaSel] || 0) - (a[metricaSel] || 0))
                  .slice(0, 50)
                  .map((j, i) => (
                    <tr key={j.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                      <td className="py-2 px-3 text-gray-400 font-bold">{i + 1}</td>
                      <td className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          {j.foto_path && <img src={getImgSrc(j.foto_path)} className="w-6 h-6 rounded-full object-cover" />}
                          <span className="text-white font-medium">{j.nombre_deportivo}</span>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-300 text-xs">{j.equipo_nombre}</td>
                      <td className="py-2 px-3 text-gray-400 text-xs">{j.posicion_principal}</td>
                      <td className="text-center py-2 px-3 text-amber-400 font-bold">{Number(j[metricaSel] || 0).toFixed(metricaSel === "rating_medio" ? 1 : 0)}</td>
                      <td className="text-center py-2 px-2 text-gray-300">{j.partidos}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <button onClick={() => exportarEstadisticasJugadorCSV(jugadores, edicionActiva.nombre)} className="mt-2 mb-2 mx-4 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-300 rounded text-xs font-bold">Exportar CSV</button>
        </div>
      )}

      {/* EQUIPOS */}
      {tab === "equipos" && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-xs">
                  <th className="text-left py-2 px-3">Equipo</th>
                  <th className="text-center py-2 px-2">PJ</th>
                  <th className="text-center py-2 px-2">Tiros</th>
                  <th className="text-center py-2 px-2">Tiros Puerta</th>
                  <th className="text-center py-2 px-2">Faltas</th>
                  <th className="text-center py-2 px-2">Posesion%</th>
                  <th className="text-center py-2 px-2">Sofa</th>
                </tr>
              </thead>
              <tbody>
                {equipos.map(e => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        {e.escudo_path && <img src={getImgSrc(e.escudo_path)} className="w-5 h-5 object-contain" />}
                        <span className="text-white font-medium">{e.nombre}</span>
                      </div>
                    </td>
                    <td className="text-center py-2 px-2 text-gray-300">{e.partidos}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{e.tiros_total}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{e.tiros_puerta}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{e.faltas_total}</td>
                    <td className="text-center py-2 px-2 text-gray-300">{Number(e.posesion_media || 0).toFixed(1)}</td>
                    <td className="text-center py-2 px-2 text-amber-400 font-bold">{Number(e.sofa_media || 0).toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CINCO IDEAL */}
      {tab === "cinco" && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-gray-400 uppercase">Cinco Ideal de la Edicion</h3>
          <CincoIdeal jugadores={cinco} />
          <div className="grid grid-cols-5 gap-2">
            {cinco.map(j => (
              <div key={j.id} className="bg-white/5 rounded-lg border border-white/10 p-2 text-center">
                {j.foto_path && <img src={getImgSrc(j.foto_path)} className="w-10 h-10 rounded-full object-cover mx-auto mb-1" />}
                <div className="text-xs text-white font-bold">{j.nombre_deportivo}</div>
                <div className="text-[10px] text-gray-400">{j.posicion_principal}</div>
                <div className="text-xs text-amber-400 font-bold">{Number(j.rating_medio || 0).toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <ModalConfigTabla isOpen={modalConfigOpen} onClose={() => setModalConfigOpen(false)} edicionId={edicionActiva.id} onGuardado={() => { cargarDatos(); refrescar(); }} />
    </div>
  );
}
