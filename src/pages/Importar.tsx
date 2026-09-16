import { useState } from "react";
import { Database as DbIcon, Download, CheckCircle, AlertCircle, Upload, Calendar } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";
import { toast } from "../components/Toast";
import { useEdicion } from "../context/EdicionContext";
import { importarCalendarioCSV, importarCalendarioTexto } from "../utils/importadorCalendario";
import { importarEquiposCSV, importarJugadoresCSV } from "../utils/importadorMasivo";
import { generarRoundRobin, asignarPabellones, asignarFechas } from "../utils/generadorCalendario";
import { seedConfederacionesFutsal } from "../utils/seedConfederaciones";
import { seedCompeticionesFutsal } from "../utils/seedCompeticionesFutsal";
import { avisarSiRutaDenegada } from "../utils/carpetaDatos";

export default function Importar() {
  const { edicionActiva, refrescar } = useEdicion();
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleImportarCalendarioCSV = async () => {
    if (!edicionActiva) { setError("Selecciona una edición primero"); return; }
    setCargando(true); setError(null); setResultado(null);
    try {
      const res = await importarCalendarioCSV(edicionActiva.id);
      setResultado(res);
      toast.info(res);
      refrescar();
    } catch (e) {
      if (!avisarSiRutaDenegada(e)) setError(String(e));
    } finally { setCargando(false); }
  };

  const handleImportarCalendarioTexto = async () => {
    if (!edicionActiva) { setError("Selecciona una edición primero"); return; }
    setCargando(true); setError(null); setResultado(null);
    try {
      const res = await importarCalendarioTexto(edicionActiva.id);
      setResultado(res);
      toast.info(res);
      refrescar();
    } catch (e) {
      if (!avisarSiRutaDenegada(e)) setError(String(e));
    } finally { setCargando(false); }
  };

  const handleImportarEquipos = async () => {
    setCargando(true); setError(null); setResultado(null);
    try {
      const res = await importarEquiposCSV();
      setResultado(res);
      toast.info(res);
    } catch (e) {
      if (!avisarSiRutaDenegada(e)) setError(String(e));
    } finally { setCargando(false); }
  };

  const handleImportarJugadores = async () => {
    setCargando(true); setError(null); setResultado(null);
    try {
      const res = await importarJugadoresCSV();
      setResultado(res);
      toast.info(res);
    } catch (e) {
      if (!avisarSiRutaDenegada(e)) setError(String(e));
    } finally { setCargando(false); }
  };

  const handleCargarSeeds = async () => {
    setCargando(true); setError(null);
    try {
      await seedConfederacionesFutsal();
      await seedCompeticionesFutsal();
      setResultado("Seeds de futsal cargados correctamente.");
      toast.success("Seeds cargados.");
      refrescar();
    } catch (e) {
      setError(String(e));
    } finally { setCargando(false); }
  };

  const handleGenerarCalendario = async () => {
    if (!edicionActiva) { setError("Selecciona una edición primero"); return; }
    setCargando(true); setError(null);
    try {
      const db = await Database.load("sqlite:globalfutsal.db");
      const equipos = await db.select<any[]>(`
        SELECT e.id, e.nombre, et.estadio_id as pabellon_id
        FROM Equipo e
        JOIN Inscripcion i ON i.equipo_id = e.id
        LEFT JOIN EquipoTemporada et ON et.equipo_id = e.id
        WHERE i.edicion_id = ? AND i.activo = 1
      `, [edicionActiva.id]);

      if (equipos.length < 2) {
        setError("Necesitas al menos 2 equipos inscritos");
        setCargando(false);
        return;
      }

      const partidos = generarRoundRobin(equipos.map(e => ({ id: e.id, nombre: e.nombre, pabellon_id: e.pabellon_id })), true);
      const conPabellones = asignarPabellones(partidos, equipos.map(e => ({ id: e.id, nombre: e.nombre, pabellon_id: e.pabellon_id })));
      const conFechas = asignarFechas(conPabellones, new Date().toISOString().split("T")[0]);

      let importados = 0;
      let fallos = 0;
      for (const p of conFechas) {
        try {
          await db.execute(`
            INSERT INTO Partido (edicion_id, jornada, fecha_hora, local_id, visitante_id, estadio_id, estado)
            VALUES (?, ?, ?, ?, ?, ?, 'programado')
          `, [edicionActiva.id, String(p.jornada), p.fecha, p.local_id, p.visitante_id, p.pabellon_id || null]);
          importados++;
        } catch (e) {
          console.error("Error insertando partido:", e);
          fallos++;
        }
      }
      setResultado(`Calendario generado: ${importados} partidos`);
      if (fallos > 0) {
        toast.warning(`${fallos} partidos no se pudieron insertar (revisa la consola)`);
      }
      toast.success(`Calendario generado: ${importados} partidos`);
      refrescar();
    } catch (e) {
      setError(String(e));
    } finally { setCargando(false); }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Upload size={24} /> Importar Datos</h1>

      {edicionActiva && (
        <div className="text-sm text-gray-400">
          Edición activa: <span className="text-amber-400 font-bold">{edicionActiva.nombre}</span>
        </div>
      )}

      <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><Calendar size={18} className="text-amber-400" /> Calendario</h2>
        <button onClick={handleImportarCalendarioCSV} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Importar calendario desde CSV
        </button>
        <button onClick={handleImportarCalendarioTexto} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Importar calendario desde texto (PDF extraído)
        </button>
        <button onClick={handleGenerarCalendario} disabled={cargando || !edicionActiva} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Calendar size={16} /> Generar calendario automático (Round Robin)
        </button>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><DbIcon size={18} className="text-blue-400" /> Datos Maestros</h2>
        <button onClick={handleImportarEquipos} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Importar equipos (CSV)
        </button>
        <button onClick={handleImportarJugadores} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Importar jugadores (CSV)
        </button>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-2">
        <h2 className="text-lg font-bold text-white flex items-center gap-2"><DbIcon size={18} className="text-green-400" /> Seeds</h2>
        <button onClick={handleCargarSeeds} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Cargar seeds de futsal (confederaciones y competiciones)
        </button>
      </div>

      {resultado && (
        <div className="bg-green-950/20 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle size={16} /> {resultado}
        </div>
      )}
      {error && (
        <div className="bg-red-950/20 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm flex items-center gap-2">
          <AlertCircle size={16} /> {error}
        </div>
      )}
    </div>
  );
}
