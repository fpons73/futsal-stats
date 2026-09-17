import { useState, useEffect, useCallback } from "react";
import { Settings, Trash2, Database as DbIcon, Check, Sparkles, Calendar, Users, FileClock, FolderOpen, Save, RotateCcw, History } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { open as abrirDialogo } from "@tauri-apps/plugin-dialog";
import { ModalBuscarDuplicados } from "../components/ModalBuscarDuplicados";
import { useConfirm } from "../components/ConfirmDialog";
import { getPreferencia } from "../db";
import { geminiService, DEFAULT_GEMINI_MODEL } from "../services/geminiService";
import { exportarPersonasCSV, exportarEquiposCSV } from "../utils/csvExporters";
import { seedConfederacionesFutsal } from "../utils/seedConfederaciones";
import { seedCompeticionesFutsal } from "../utils/seedCompeticionesFutsal";
import {
    leerCarpetaDatos, guardarCarpetaDatos, esRutaAlcanzable, carpetaSugerida,
} from "../utils/carpetaDatos";
import { toast } from "../components/Toast";
import {
    leerDiasRetencion, guardarDiasRetencion, restablecerDiasRetencion,
    barrerBorradoresAntiguos, listarBorradores,
} from "../utils/actaDraft";

export default function Configuracion() {
  const [loading, setLoading] = useState(false);
  const [modalDuplicadosOpen, setModalDuplicadosOpen] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL);
  const [savedKey, setSavedKey] = useState(false);
  // Preferencia de retención de borradores ("" mientras carga).
  const [diasRetencion, setDiasRetencion] = useState<number | "">("");
  const [numBorradores, setNumBorradores] = useState(0);
  // Carpeta de datos configurable (null mientras carga).
  const [carpetaDatos, setCarpetaDatos] = useState<string | null>(null);
  const [alcanzable, setAlcanzable] = useState<boolean | null>(null);
  // Carpeta sugerida según contexto (raíz del proyecto en dev, Documentos en producción).
  const [sugerida, setSugerida] = useState("");
  // Copias de seguridad (tarea 1.3): lista, retención y estado de acciones.
  interface BackupInfo { ruta: string; nombre: string; bytes: number; fecha: string; }
  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [retencionBackups, setRetencionBackups] = useState<number | "">("");
  const [accionBackup, setAccionBackup] = useState(false);

  const recargarBackups = useCallback(async () => {
    try {
      setBackups(await invoke<BackupInfo[]>("listar_backups_bd"));
    } catch (e) {
      // Visible: si el listado falla la tarjeta diría "no hay copias" y el
      // usuario podría creer que está sin protección cuando es un fallo de lectura.
      console.error("listar_backups_bd falló:", e);
      toast.warning("No se pudo leer la lista de copias de seguridad.");
    }
  }, []);
  // Confirmación temática para acciones destructivas (sustituye a ask()/message() nativos).
  const { confirmar, dialogo: dialogoConfirmar } = useConfirm();

  useEffect(() => {
    geminiService.loadPreferences().then(({ apiKey, model }) => {
      setApiKey(apiKey);
      setModel(model);
    });
    setDiasRetencion(leerDiasRetencion());
    setNumBorradores(listarBorradores().length);
    leerCarpetaDatos().then(c => {
      setCarpetaDatos(c);
      if (c) esRutaAlcanzable(c).then(setAlcanzable);
    });
    carpetaSugerida().then(setSugerida);
    recargarBackups();
    // Retención guardada por Rust en Preferencia (fallback 7 = defecto del comando).
    getPreferencia("backups_retencion").then(v => {
      const n = parseInt(v, 10);
      setRetencionBackups(Number.isFinite(n) && n >= 1 ? n : 7);
    });
  }, [recargarBackups]);

  const guardarConfiguracionIA = () => {
    geminiService.setApiKey(apiKey);
    geminiService.setModel(model);
    setSavedKey(true);
    setTimeout(() => setSavedKey(false), 3000);
  };

  // Guarda los días de retención y aplica el barrido al momento: si se reduce el
  // plazo, los borradores ya caducados se eliminan ahora, no en el próximo arranque.
  const guardarRetencion = () => {
    if (diasRetencion === "") return; // aún cargando
    const efectivo = guardarDiasRetencion(Number(diasRetencion));
    setDiasRetencion(efectivo);
    const eliminados = barrerBorradoresAntiguos();
    const pendientes = listarBorradores().length;
    setNumBorradores(pendientes);
    toast.success(
      eliminados > 0
        ? `Retención: ${efectivo} días · ${eliminados} borrador(es) caducado(s) eliminado(s)`
        : `Retención: ${efectivo} días · ${pendientes} borrador(es) siguen vigentes`
    );
  };

  const restablecerRetencion = () => {
    restablecerDiasRetencion();
    setDiasRetencion(leerDiasRetencion());
    setNumBorradores(listarBorradores().length);
    toast.info("Retención de borradores restablecida a 7 días");
  };

  const elegirCarpetaDatos = async () => {
    const sel = await abrirDialogo({ directory: true, multiple: false });
    if (!sel || typeof sel !== "string") return;
    try {
      await guardarCarpetaDatos(sel);
      setCarpetaDatos(sel);
      setAlcanzable(await esRutaAlcanzable(sel));
      toast.success(`Carpeta de datos configurada: ${sel}`);
    } catch (e) {
      toast.error(`No se pudo configurar la carpeta: ${e}`);
    }
  };

  /** Un clic para adoptar la carpeta sugerida. */
  const usarSugerida = async () => {
    try {
      await guardarCarpetaDatos(sugerida);
      setCarpetaDatos(sugerida);
      setAlcanzable(await esRutaAlcanzable(sugerida));
      toast.success(`Carpeta de datos configurada: ${sugerida}`);
    } catch (e) {
      toast.error(`No se pudo configurar la carpeta: ${e}`);
    }
  };

  // --- Backups de la BD (tarea 1.3) ---
  const crearBackupAhora = async () => {
    setAccionBackup(true);
    try {
      const ruta = await invoke<string>("crear_backup_bd");
      toast.success(`Copia creada: ${ruta.split(/[\\\\/]/).pop()}`);
      await recargarBackups();
    } catch (e) {
      toast.error(`No se pudo crear la copia: ${e}`);
    } finally {
      setAccionBackup(false);
    }
  };

  const restaurarBackup = async (b: BackupInfo) => {
    const ok = await confirmar({
      titulo: "Restaurar copia",
      mensaje: `La base de datos actual se reemplazará por la copia del ${b.fecha}.\n\nSe cerrará la aplicación para completar la restauración. ¿Continuar?`,
      textoConfirmar: "Restaurar y reiniciar",
      textoCancelar: "Cancelar",
      peligroso: true,
    });
    if (!ok) return;
    setAccionBackup(true);
    try {
      await invoke("restaurar_backup_bd", { rutaCopia: b.ruta });
      toast.success("Copia restaurada — reiniciando…");
      setTimeout(() => window.location.reload(), 800);
    } catch (e) {
      toast.error(`No se pudo restaurar: ${e}`);
      setAccionBackup(false);
    }
  };

  const guardarRetencionBackups = async () => {
    if (retencionBackups === "") return;
    setAccionBackup(true);
    try {
      const borradas = await invoke<number>("guardar_retencion_backups", { retener: Number(retencionBackups) });
      toast.success(
        borradas > 0
          ? `Retención: ${retencionBackups} copias · ${borradas} vieja(s) eliminada(s)`
          : `Retención: ${retencionBackups} copias`,
      );
      await recargarBackups();
    } catch (e) {
      toast.error(`No se pudo guardar la retención: ${e}`);
    } finally {
      setAccionBackup(false);
    }
  };

  const resetFabrica = async () => {
    const confirmacion = await confirmar({
      mensaje: "¡PELIGRO!\n\nEsto borrará TODOS los datos (Jugadores, Partidos, Equipos...).\n\n¿Estás seguro?",
      titulo: "¡Peligro!", textoConfirmar: "Aceptar", textoCancelar: "Cancelar", peligroso: true
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
      toast.success("Datos borrados correctamente.");
    } catch (err) {
      toast.error(`Error al borrar datos: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  const cargarSeeds = async () => {
    setLoading(true);
    try {
      await seedConfederacionesFutsal();
      await seedCompeticionesFutsal();
      toast.success("Seeds de futsal cargados correctamente.");
    } catch (err) {
      toast.error(`Error al cargar seeds: ${err}`);
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

      {/* Borradores de acta */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><FileClock size={18} className="text-warning" /> Borradores de acta</h2>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold text-gray-400 uppercase">Días de retención antes de eliminarlos automáticamente</label>
            <div className="flex items-center gap-3 mt-1">
              <input
                type="number"
                min={1}
                max={365}
                value={diasRetencion}
                onChange={e => setDiasRetencion(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-28 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-warning"
              />
              <button onClick={guardarRetencion} className="px-4 py-2 bg-warning/20 hover:bg-warning/30 text-warning border border-warning/30 rounded-lg font-bold flex items-center gap-2 transition-colors">
                <Check size={16} /> Guardar
              </button>
              <button onClick={restablecerRetencion} className="px-4 py-2 bg-gray-800/50 hover:bg-gray-800 text-gray-300 rounded-lg font-bold flex items-center gap-2 transition-colors">
                Restablecer (7 días)
              </button>
            </div>
            <p className="text-xs text-gray-400/60 mt-2">
              Se aplica al arrancar la app y al guardar. Límite 1–365 días.
              {numBorradores > 0 && ` · ${numBorradores} borrador(es) pendientes ahora mismo`}
            </p>
          </div>
        </div>
      </div>

      {/* Carpeta de datos */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-4"><FolderOpen size={18} className="text-emerald-400" /> Carpeta de datos</h2>
        <p className="text-xs text-gray-400/70 mb-3">
          Carpeta que la app puede leer para importar CSVs y mostrar fotos/banderas.
          En desarrollo la raíz del proyecto ya está permitida; aquí puedes añadir otra.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={elegirCarpetaDatos} className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 rounded-lg font-bold flex items-center gap-2 transition-colors">
            <FolderOpen size={16} /> Elegir carpeta…
          </button>
          {!carpetaDatos && (
            <button onClick={usarSugerida} className="px-4 py-2 bg-gray-800/50 hover:bg-gray-800 text-gray-300 border border-gray-700 rounded-lg font-bold flex items-center gap-2 transition-colors">
              <Check size={16} /> Usar sugerida ({sugerida || "…"})
              <span className="hidden sm:inline text-gray-400/70 font-normal">— donde vive Futsal_Data/</span>
            </button>
          )}
          <code className="text-xs text-gray-300 bg-gray-900/70 border border-gray-700 rounded px-2 py-1.5 max-w-full truncate">
            {carpetaDatos ?? "— sin configurar —"}
          </code>
          {carpetaDatos && alcanzable !== null && (
            <span className={`text-xs font-bold px-2 py-1 rounded ${alcanzable ? "text-success bg-success/10" : "text-red bg-red/10"}`}>
              {alcanzable ? "✓ accesible" : "✗ no accesible"}
            </span>
          )}
        </div>
        <p className="text-xs text-gray-400/60 mt-2">
          Sugerencia: <code className="text-gray-300">{sugerida || "…"}</code> (donde vive <code className="text-gray-300">Futsal_Data/</code> en desarrollo).
          El cambio se aplica al momento y persiste entre sesiones.
        </p>
      </div>

      {/* Copias de seguridad de la BD */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h2 className="text-lg font-bold text-white flex items-center gap-2 mb-1"><History size={18} className="text-orange" /> Copias de seguridad</h2>
        <p className="text-xs text-gray-400/70 mb-3">
          Copia automática diaria al arrancar la app (primera del día). Restaurar reemplaza
          la base de datos actual y reinicia la aplicación.
        </p>
        <div className="flex items-center gap-3 flex-wrap mb-3">
          <button onClick={crearBackupAhora} disabled={accionBackup}
            className="px-4 py-2 bg-orange/20 hover:bg-orange/30 text-orange border border-orange/30 rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-40">
            <Save size={16} /> Crear copia ahora
          </button>
          <label className="text-xs font-bold text-gray-400 uppercase">Conservar</label>
          <input type="number" min={1} max={365} value={retencionBackups}
            onChange={e => setRetencionBackups(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-20 bg-gray-900 border border-gray-700 rounded px-3 py-2 text-white outline-none focus:border-orange" />
          <button onClick={guardarRetencionBackups} disabled={accionBackup || retencionBackups === ""}
            className="px-3 py-2 bg-gray-800/50 hover:bg-gray-800 text-gray-300 border border-gray-700 rounded-lg font-bold flex items-center gap-2 transition-colors disabled:opacity-40">
            <Check size={16} /> Guardar retención
          </button>
        </div>
        {backups.length === 0 ? (
          <p className="text-xs text-gray-400/50">Todavía no hay copias — se crearán automáticamente o con "Crear copia ahora".</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-auto">
            {backups.map(b => (
              <div key={b.ruta} className="flex items-center gap-3 bg-gray-900/60 border border-gray-700/60 rounded-lg px-3 py-2">
                <History size={14} className="text-silver/40 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-200 truncate">{b.fecha}</p>
                  <p className="text-[11px] text-gray-400/60 truncate">{b.nombre} · {(b.bytes / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <button onClick={() => restaurarBackup(b)} disabled={accionBackup}
                  className="px-3 py-1.5 bg-warning/15 hover:bg-warning/25 text-warning border border-warning/30 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-40">
                  <RotateCcw size={12} /> Restaurar
                </button>
              </div>
            ))}
          </div>
        )}
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

      {/* Diálogo de confirmación destructiva */}
      {dialogoConfirmar}
    </div>
  );
}
