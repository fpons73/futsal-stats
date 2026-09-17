import { useState } from "react";
import { Database as DbIcon, Download, CheckCircle, AlertCircle, Upload, Calendar, FileWarning, FileSpreadsheet } from "lucide-react";
import Database from "@tauri-apps/plugin-sql";
import { toast } from "../components/Toast";
import { useEdicion } from "../context/EdicionContext";
import { importarCalendarioCSV, importarCalendarioTexto } from "../utils/importadorCalendario";
import { importarEquiposCSV, importarJugadoresCSV, importarEntrenadoresCSV, importarCompeticionesCSV, ULTIMOS_INFORMES } from "../utils/importadorMasivo";
import { exportarInforme, informeTieneProblemas, InformeImportacion } from "../utils/informeImportacion";
import { generarRoundRobin, asignarPabellones, asignarFechas } from "../utils/generadorCalendario";
import { seedConfederacionesFutsal } from "../utils/seedConfederaciones";
import { seedCompeticionesFutsal } from "../utils/seedCompeticionesFutsal";
import { avisarSiRutaDenegada } from "../utils/carpetaDatos";

export default function Importar() {
  const { edicionActiva, refrescar } = useEdicion();
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Último informe con problemas (tarea 1.2): habilita "Exportar informe".
  const [informe, setInforme] = useState<InformeImportacion | null>(null);

  /** Envuelve una importación masiva y recuerda su informe si trae problemas. */
  const ejecutarConInforme = async (tipo: string, accion: () => Promise<string>) => {
    setCargando(true); setError(null); setResultado(null); setInforme(null);
    try {
      const res = await accion();
      setResultado(res);
      toast.info(res);
      const ultimo = ULTIMOS_INFORMES[tipo];
      if (ultimo && informeTieneProblemas(ultimo)) setInforme(ultimo);
    } catch (e) {
      if (!avisarSiRutaDenegada(e)) setError(String(e));
    } finally { setCargando(false); }
  };

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

  const handleImportarEquipos = () => ejecutarConInforme("equipos", () => importarEquiposCSV());

  const handleImportarJugadores = () => ejecutarConInforme("jugadores", () => importarJugadoresCSV());

  const handleImportarEntrenadores = () => ejecutarConInforme("entrenadores", () => importarEntrenadoresCSV());

  const handleImportarCompeticiones = () => ejecutarConInforme("competiciones", () => importarCompeticionesCSV());

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
      let ultimoError: unknown = null;
      for (const p of conFechas) {
        try {
          await db.execute(`
            INSERT INTO Partido (edicion_id, jornada, fecha_hora, local_id, visitante_id, estadio_id, estado)
            VALUES (?, ?, ?, ?, ?, ?, 'programado')
          `, [edicionActiva.id, String(p.jornada), p.fecha, p.local_id, p.visitante_id, p.pabellon_id || null]);
          importados++;
        } catch (e) {
          console.error("Error insertando partido:", e);
          ultimoError = e; // el toast final muestra el primer error real
          fallos++;
        }
      }
      setResultado(`Calendario generado: ${importados} partidos`);
      if (fallos > 0) {
        const primero = String(ultimoError ?? "").slice(0, 140);
        toast.warning(`${fallos} partido(s) no se pudieron insertar. Primer error: ${primero}`);
      }
      if (importados > 0) toast.success(`Calendario generado: ${importados} partidos`);
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
        <button onClick={handleImportarEntrenadores} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Importar entrenadores (CSV)
        </button>
        <button onClick={handleImportarCompeticiones} disabled={cargando} className="w-full text-left px-4 py-3 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-gray-300 flex items-center gap-3 transition-colors disabled:opacity-50">
          <Download size={16} /> Importar competiciones (CSV)
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
      {informe && (
        <div className="bg-amber-950/20 border border-amber-500/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2 text-amber-400 text-sm font-bold">
            <FileWarning size={16} />
            La importación terminó con avisos: {informe.errores} error(es),
            {" "}{informe.paisesNoEncontrados.length} país(es) del CSV sin coincidencia.
          </div>
          {informe.paisesNoEncontrados.length > 0 && (
            <p className="text-xs text-silver/50">
              Países afectados: {informe.paisesNoEncontrados.slice(0, 8).map(p => `${p.pais} ×${p.filas}`).join(" · ")}
              {informe.paisesNoEncontrados.length > 8 && " …"}
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-silver/40">Exportar el detalle completo:</span>
            <button onClick={() => exportarInforme(informe, "csv")} disabled={cargando}
              className="px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-40">
              <FileSpreadsheet size={14} /> CSV
            </button>
            <button onClick={() => exportarInforme(informe, "json")} disabled={cargando}
              className="px-4 py-2 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors disabled:opacity-40">
              <FileSpreadsheet size={14} /> JSON
            </button>
          </div>
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
