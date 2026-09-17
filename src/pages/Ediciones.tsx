import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core"; // <--- CLAVE
import { Plus, Layers, Trash2, Edit, Save, Trophy } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
import SpinnerCarga from "../components/SpinnerCarga";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";
// Ya no usamos ImagenLocal

interface EdicionDisplay {
    id: number;
    competicion_nombre: string;
    competicion_logo: string | null;
    temporada_nombre: string;
    puntos_victoria: number;
    puntos_empate: number;
    puntos_derrota: number;
    competicion_id: number;
    temporada_id: number;
    nombre: string | null;
}

interface SelectorData {
    id: number;
    nombre: string;
}

export default function Ediciones() {
    const [ediciones, setEdiciones] = useState<EdicionDisplay[]>([]);
    const [competiciones, setCompeticiones] = useState<SelectorData[]>([]);
    const [temporadas, setTemporadas] = useState<SelectorData[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [selCompeticion, setSelCompeticion] = useState("");
    const [selTemporada, setSelTemporada] = useState("");
    const [ptsVictoria, setPtsVictoria] = useState(3);
    const [ptsEmpate, setPtsEmpate] = useState(1);
    const [ptsDerrota, setPtsDerrota] = useState(0);
    const [nombreEdicion, setNombreEdicion] = useState("");

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask() nativo).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Edicion", cargarDatos);

    useEffect(() => { cargarDatos(); }, []);

    const [cargando, setCargando] = useState(true);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const query = `
        SELECT e.id, c.nombre as competicion_nombre, c.logo_path as competicion_logo, t.nombre as temporada_nombre,
          e.puntos_victoria, e.puntos_empate, e.puntos_derrota, e.competicion_id, e.temporada_id, e.nombre
        FROM Edicion e
        JOIN Competicion c ON e.competicion_id = c.id
        JOIN Temporada t ON e.temporada_id = t.id
        ORDER BY t.fecha_inicio DESC, c.nombre ASC
      `;
            const resEdiciones = await db.select<EdicionDisplay[]>(query);
            setEdiciones(resEdiciones);

            const resComp = await db.select<SelectorData[]>("SELECT id, nombre FROM Competicion ORDER BY nombre ASC");
            setCompeticiones(resComp);

            const resTemp = await db.select<SelectorData[]>("SELECT id, nombre FROM Temporada ORDER BY fecha_inicio DESC");
            setTemporadas(resTemp);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar las ediciones");
        } finally {
            setCargando(false);
        }
    }

    function abrirCrear() {
        setEditingId(null);
        setSelCompeticion(""); setSelTemporada(""); setPtsVictoria(3); setPtsEmpate(1); setPtsDerrota(0);
        setNombreEdicion("");
        iniciar({ selCompeticion: "", selTemporada: "", ptsVictoria: 3, ptsEmpate: 1, ptsDerrota: 0, nombreEdicion: "" });
        setIsModalOpen(true);
    }

    function abrirEditar(e: EdicionDisplay) {
        setEditingId(e.id);
        setSelCompeticion(e.competicion_id.toString());
        setSelTemporada(e.temporada_id.toString());
        setPtsVictoria(e.puntos_victoria); setPtsEmpate(e.puntos_empate); setPtsDerrota(e.puntos_derrota);
        setNombreEdicion(e.nombre || "");
        iniciar({ selCompeticion: e.competicion_id.toString(), selTemporada: e.temporada_id.toString(), ptsVictoria: e.puntos_victoria, ptsEmpate: e.puntos_empate, ptsDerrota: e.puntos_derrota, nombreEdicion: e.nombre || "" });
        setIsModalOpen(true);
    }

    async function guardar(): Promise<boolean> {
        if (!selCompeticion || !selTemporada) {
            toast.warning("Selecciona Competición y Temporada");
            return false;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            if (editingId) {
                await db.execute(
                    `UPDATE Edicion SET competicion_id=$1, temporada_id=$2, puntos_victoria=$3, puntos_empate=$4, puntos_derrota=$5, nombre=$6 WHERE id=$7`,
                    [selCompeticion, selTemporada, ptsVictoria, ptsEmpate, ptsDerrota, nombreEdicion, editingId]
                );
            } else {
                // Quitamos la restricción de duplicados por Competición+Temporada para permitir varias ediciones de la misma Euro
                await db.execute(
                    `INSERT INTO Edicion (competicion_id, temporada_id, puntos_victoria, puntos_empate, puntos_derrota, nombre) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [selCompeticion, selTemporada, ptsVictoria, ptsEmpate, ptsDerrota, nombreEdicion]
                );
            }
            setIsModalOpen(false);
            cargarDatos();
            return true;
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar la edición");
            return false;
        }
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro({ selCompeticion, selTemporada, ptsVictoria, ptsEmpate, ptsDerrota, nombreEdicion }, guardar)) setIsModalOpen(false);
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar esta edición?", titulo: "Eliminar", textoConfirmar: "Sí", textoCancelar: "Cancelar", peligroso: true });
        if (confirm) await borrarFila(id);
    }

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-8 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><Layers className="text-orange text-glow-orange animate-pulse" /> Ediciones</h1>
                    <p className="text-silver/50 text-sm mt-1">Vincula competiciones con temporadas en el sistema</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nueva Edición</span>
                </button>
            </div>

            {/* REJILLA DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ediciones.map((ed) => (
                    <div key={ed.id} className="glass-panel p-5 rounded-2xl border border-white/5 hover:border-white/10 hover:shadow-2xl transition-all duration-300 flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-xl bg-navy-dark border border-white/10 flex items-center justify-center p-1 overflow-hidden shrink-0 shadow-inner">
                                {ed.competicion_logo ? (
                                    <img src={convertFileSrc(ed.competicion_logo)} alt={ed.competicion_nombre} className="w-full h-full object-contain filter drop-shadow-md" />
                                ) : (
                                    <Trophy className="text-silver/20 animate-pulse" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-bold text-white text-lg group-hover:text-orange transition-colors">
                                    {ed.competicion_nombre}
                                    {ed.nombre && <span className="text-silver/40 font-normal ml-2">- {ed.nombre}</span>}
                                </h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="bg-orange/10 text-orange border border-orange/20 text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-wider">{ed.temporada_nombre}</span>
                                    <span className="text-[10px] text-silver/40 border border-white/5 px-1.5 py-0.5 rounded-md font-bold" title="Sistema de Puntuación (V/E/D)">Pts: {ed.puntos_victoria}/{ed.puntos_empate}/{ed.puntos_derrota}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-navy-dark/95 p-1 rounded-xl border border-white/5 shadow-2xl backdrop-blur-sm">
                            <button onClick={() => abrirEditar(ed)} className="p-2 text-accent-blue hover:bg-white/5 rounded-lg transition-colors"><Edit size={18} /></button>
                            <button onClick={() => borrar(ed.id)} className="p-2 text-red hover:bg-red/10 rounded-lg transition-colors"><Trash2 size={18} /></button>
                        </div>
                    </div>
                ))}
                {cargando ? (
                    <SpinnerCarga mensaje="Cargando ediciones…" />
                ) : ediciones.length === 0 && (
                    <EstadoVacio
                        icono={Layers}
                        titulo="Aún no hay ediciones"
                        descripcion="Crea la edición 2025-26 de tu competición para inscribir equipos y programar partidos."
                        acciones={[{ texto: "Crear la primera", onClick: abrirCrear, primario: true }]}
                    />
                )}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Edición" : "Nueva Edición"}>
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Personalizado (Opcional)</label>
                            <input
                                value={nombreEdicion}
                                onChange={e => setNombreEdicion(e.target.value)}
                                placeholder="Ej: Fase de Clasificación, Ronda Final..."
                                className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Competición</label>
                            <select value={selCompeticion} onChange={e => setSelCompeticion(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Seleccionar --</option>
                                {competiciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Temporada</label>
                            <select value={selTemporada} onChange={e => setSelTemporada(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Seleccionar --</option>
                                {temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="bg-navy-dark/40 p-4 rounded-xl border border-white/5">
                        <h4 className="text-xs font-bold text-silver/40 uppercase mb-3 flex items-center gap-2"><Save size={12} /> Sistema de Puntuación</h4>
                        <div className="grid grid-cols-3 gap-3">
                            <div><label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Victoria</label><input type="number" value={ptsVictoria} onChange={e => setPtsVictoria(parseInt(e.target.value))} className="w-full p-2 bg-navy border border-white/10 rounded-xl text-center font-display font-black text-success outline-none focus:border-orange" /></div>
                            <div><label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Empate</label><input type="number" value={ptsEmpate} onChange={e => setPtsEmpate(parseInt(e.target.value))} className="w-full p-2 bg-navy border border-white/10 rounded-xl text-center font-display font-black text-accent-blue outline-none focus:border-orange" /></div>
                            <div><label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Derrota</label><input type="number" value={ptsDerrota} onChange={e => setPtsDerrota(parseInt(e.target.value))} className="w-full p-2 bg-navy border border-white/10 rounded-xl text-center font-display font-black text-red outline-none focus:border-orange" /></div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">{editingId ? "Guardar Cambios" : "Crear Edición"}</button>
                    </div>
                </div>
            </Modal>

            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
            {/* Diálogo de confirmación destructiva */}
            {dialogoConfirmar}
            <UndoToast
                pendiente={filaBorrada}
                onUndo={deshacer}
                onDescartar={limpiarBorrado}
                mensaje={(f) => `Edición ${f.nombre || f.competicion_nombre || f.id} eliminada`}
            />
        </div>
    );
}