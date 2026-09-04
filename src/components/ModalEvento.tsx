import { useState, useEffect } from "react";
import { X, Save, Timer, Target } from "lucide-react";
import { IoFootball, IoSwapHorizontal } from "react-icons/io5";
import { FaBandage, FaBan } from "react-icons/fa6";
import { MdMonitor } from "react-icons/md";
import Database from "@tauri-apps/plugin-sql";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  partido: any;
  localId: number;
  visitanteId: number;
  eventoAEditar?: any;
  defaultTipoEvento?: string;
}

const TIPOS_GOL = ["Pie Derecho", "Pie Izquierdo", "Cabeza", "Volea", "Rebote", "Doble Penalti", "Falta Directa", "Penalti", "Propia Puerta", "Olímpico", "Chilena"];
const TIPOS_ASISTENCIA = ["Pase", "Pase filtrado", "Centro", "Banda", "Córner", "Dejada", "Rebote", "Tiro parado", "Tacón"];
const TIPOS_PENALTI_FALLO = ["Fuera", "Palo", "Parado"];
const TIPOS_TARJETA = ["Amarilla", "2ª Amarilla", "Roja", "Azul"];
const TIPOS_CAMBIO = ["Táctico", "Lesión", "Conmoción"];
const ZONAS_GOL = ["Área de 6m", "Fuera del área (10m)", "Lejos del arco"];

export function ModalEvento({ isOpen, onClose, onSave, partido, localId, visitanteId, eventoAEditar, defaultTipoEvento }: ModalProps) {
  const [tipoEvento, setTipoEvento] = useState(defaultTipoEvento || "GOL");
  const [minuto, setMinuto] = useState(1);
  const [equipoId, setEquipoId] = useState(localId);
  const [jugadores, setJugadores] = useState<any[]>([]);
  const [protagonistaId, setProtagonistaId] = useState(0);
  const [secundarioId, setSecundarioId] = useState(0);
  const [subtipo, setSubtipo] = useState("");
  const [extraInfo, setExtraInfo] = useState("");
  const [zonaGol, setZonaGol] = useState("Área de 6m");

  useEffect(() => {
    if (isOpen && partido?.id && equipoId) cargarJugadores();
  }, [isOpen, equipoId, partido?.id]);

  useEffect(() => {
    if (eventoAEditar) {
      setTipoEvento(eventoAEditar.tipo || "GOL");
      setMinuto(eventoAEditar.minuto || 1);
      setEquipoId(eventoAEditar.equipo_id || localId);
      setProtagonistaId(eventoAEditar.jugador_id || 0);
      setSecundarioId(eventoAEditar.asistente_id || 0);
      setSubtipo(eventoAEditar.subtipo || "");
      setExtraInfo(eventoAEditar.descripcion || "");
    } else {
      setTipoEvento(defaultTipoEvento || "GOL");
      setMinuto(1);
      setProtagonistaId(0);
      setSecundarioId(0);
      setSubtipo("");
      setExtraInfo("");
    }
  }, [eventoAEditar, defaultTipoEvento, isOpen]);

  async function cargarJugadores() {
    const db = await Database.load("sqlite:globalfutsal.db");
    const res = await db.select<any[]>(`
      SELECT a.persona_id, a.dorsal, a.titular, a.posicion as posicion_partido,
             p.nombre_deportivo, p.foto_path, p.roles
      FROM Alineacion a
      JOIN Persona p ON a.persona_id = p.id
      WHERE a.partido_id = ? AND a.equipo_id = ?
        AND (p.roles IS NULL OR p.roles NOT LIKE '%Entrenador%')
      ORDER BY a.titular DESC, a.dorsal ASC
    `, [partido.id, equipoId]);
    setJugadores(res);
  }

  const guardar = async () => {
    const db = await Database.load("sqlite:globalfutsal.db");
    let tipo = tipoEvento;
    let metadata: any = {};

    if (tipoEvento === "GOL" && subtipo === "Doble Penalti") tipo = "GOL_DOBLE_PENALTI";
    if (tipoEvento === "GOL" && subtipo === "Penalti") tipo = "GOL_PENALTI";
    if (tipoEvento === "GOL" && subtipo === "Falta Directa") tipo = "GOL_FALTA";
    if (tipoEvento === "GOL" && subtipo === "Propia Puerta") tipo = "PROPIA_PUERTA";

    if (zonaGol) metadata.zona = zonaGol;
    if (extraInfo) metadata.info = extraInfo;

    const metadataStr = Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null;

    if (eventoAEditar) {
      await db.execute(`
        UPDATE Evento SET tipo = ?, subtipo = ?, minuto = ?, jugador_id = ?, asistente_id = ?, equipo_id = ?, descripcion = ?, metadata = ?
        WHERE id = ?
      `, [tipo, subtipo || null, minuto, protagonistaId || null, secundarioId || null, equipoId, extraInfo || null, metadataStr, eventoAEditar.id]);
    } else {
      await db.execute(`
        INSERT INTO Evento (partido_id, tipo, subtipo, minuto, jugador_id, asistente_id, equipo_id, descripcion, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [partido.id, tipo, subtipo || null, minuto, protagonistaId || null, secundarioId || null, equipoId, extraInfo || null, metadataStr]);
    }

    onSave();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl w-full max-w-lg p-5 shadow-2xl flex flex-col max-h-[85vh] transition-colors">
        <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-800 pb-3">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {eventoAEditar ? "Editar Evento" : "Nuevo Evento"}
          </h2>
          <button onClick={onClose}><X className="text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors" /></button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {/* Tipo de evento */}
          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tipo</label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {[
                { val: "GOL", icon: IoFootball, label: "Gol" },
                { val: "TARJETA", icon: MdMonitor, label: "Tarjeta" },
                { val: "CAMBIO", icon: IoSwapHorizontal, label: "Cambio" },
                { val: "TIEMPO_MUERTO", icon: Timer, label: "T. Muerto" },
                { val: "FALTA_ACUM", icon: Target, label: "Falta Acum." },
                { val: "LESION", icon: FaBandage, label: "Lesión" },
                { val: "GOL_ANULADO", icon: FaBan, label: "Gol Anulado" },
                { val: "TANDA_PENALTI", icon: IoFootball, label: "T. Penalti" },
              ].map(({ val, icon: Icon, label }) => (
                <button
                  key={val}
                  onClick={() => { setTipoEvento(val); setSubtipo(""); }}
                  className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all text-[10px] font-bold ${
                    tipoEvento === val
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400"
                  }`}
                >
                  <Icon size={16} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Minuto */}
          <div className="flex gap-2">
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Minuto</label>
              <input
                type="number"
                min={1}
                max={90}
                value={minuto}
                onChange={e => setMinuto(Number(e.target.value))}
                className="w-20 bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Equipo</label>
              <select
                value={equipoId}
                onChange={e => setEquipoId(Number(e.target.value))}
                className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
              >
                <option value={localId}>Local</option>
                <option value={visitanteId}>Visitante</option>
              </select>
            </div>
          </div>

          {/* Subtipo según el evento */}
          {tipoEvento === "GOL" && (
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tipo de Gol</label>
              <select value={subtipo} onChange={e => setSubtipo(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <option value="">Seleccionar...</option>
                {TIPOS_GOL.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {tipoEvento === "GOL" && (
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Zona de Gol</label>
              <select value={zonaGol} onChange={e => setZonaGol(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                {ZONAS_GOL.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          )}

          {tipoEvento === "TARJETA" && (
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tipo de Tarjeta</label>
              <select value={subtipo} onChange={e => setSubtipo(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <option value="">Seleccionar...</option>
                {TIPOS_TARJETA.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}

          {tipoEvento === "CAMBIO" && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tipo de Cambio</label>
                <select value={subtipo} onChange={e => setSubtipo(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  {TIPOS_CAMBIO.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Sale (protagonista)</label>
                <select value={protagonistaId} onChange={e => setProtagonistaId(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option value={0}>Seleccionar...</option>
                  {jugadores.map(j => <option key={j.persona_id} value={j.persona_id}>#{j.dorsal} {j.nombre_deportivo}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Entra (secundario)</label>
                <select value={secundarioId} onChange={e => setSecundarioId(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option value={0}>Seleccionar...</option>
                  {jugadores.map(j => <option key={j.persona_id} value={j.persona_id}>#{j.dorsal} {j.nombre_deportivo}</option>)}
                </select>
              </div>
            </>
          )}

          {/* Protagonista para goles, tarjetas, lesiones */}
          {tipoEvento !== "CAMBIO" && tipoEvento !== "TIEMPO_MUERTO" && tipoEvento !== "TANDA_PENALTI" && (
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Jugador</label>
              <select value={protagonistaId} onChange={e => setProtagonistaId(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <option value={0}>Seleccionar...</option>
                {jugadores.map(j => <option key={j.persona_id} value={j.persona_id}>#{j.dorsal} {j.nombre_deportivo}</option>)}
              </select>
            </div>
          )}

          {/* Asistente para goles */}
          {tipoEvento === "GOL" && (
            <>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Tipo de Asistencia</label>
                <select value={subtipo === "Doble Penalti" || subtipo === "Penalti" || subtipo === "Propia Puerta" ? "" : subtipo} onChange={() => setSecundarioId(0)} disabled className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none opacity-50">
                  <option value="">N/A</option>
                  {TIPOS_ASISTENCIA.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Asistente</label>
                <select value={secundarioId} onChange={e => setSecundarioId(Number(e.target.value))} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                  <option value={0}>Sin asistencia</option>
                  {jugadores.filter(j => j.persona_id !== protagonistaId).map(j => <option key={j.persona_id} value={j.persona_id}>#{j.dorsal} {j.nombre_deportivo}</option>)}
                </select>
              </div>
            </>
          )}

          {tipoEvento === "TANDA_PENALTI" && (
            <div>
              <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Resultado</label>
              <select value={subtipo} onChange={e => setSubtipo(e.target.value)} className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500">
                <option value="">Seleccionar...</option>
                {TIPOS_PENALTI_FALLO.map(t => <option key={t} value={t}>{t}</option>)}
                <option value="Gol">Gol</option>
              </select>
            </div>
          )}

          <div>
            <label className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase">Descripción (opcional)</label>
            <input
              type="text"
              value={extraInfo}
              onChange={e => setExtraInfo(e.target.value)}
              className="w-full bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded px-2 py-1.5 text-gray-900 dark:text-white outline-none focus:border-blue-500"
              placeholder="Notas adicionales..."
            />
          </div>
        </div>

        <div className="flex gap-2 pt-3 border-t border-gray-200 dark:border-gray-800 mt-3">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 font-bold hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          <button onClick={guardar} className="flex-1 px-4 py-2 rounded-lg bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors flex items-center justify-center gap-2"><Save size={16} /> Guardar</button>
        </div>
      </div>
    </div>
  );
}
