import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Plus, ListOrdered, Trash2, Edit, Filter, Flag } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";

// Tipos de datos
interface Fase {
    id: number;
    nombre: string;
    tipo: string;       // "Liga" o "Eliminatoria"
    orden: number;
    ida_vuelta: number; // 0 = Partido Único, 1 = Ida y Vuelta
}

interface EdicionSelector {
    id: number;
    nombre_completo: string; // "LaLiga - 2025/2026"
}

export default function Fases() {
    // Datos
    const [ediciones, setEdiciones] = useState<EdicionSelector[]>([]);
    const [fases, setFases] = useState<Fase[]>([]);

    // Filtro Principal (Estado clave)
    const [edicionSeleccionada, setEdicionSeleccionada] = useState<string>("");

    // Modal y Formulario
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [nombre, setNombre] = useState("");
    const [orden, setOrden] = useState(1);
    const [tipo, setTipo] = useState("Liga");
    const [formato, setFormato] = useState(0); // 0: Único, 1: Ida/Vuelta

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask()/message() nativos).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Fase", () => cargarFases(parseInt(edicionSeleccionada)));

    // 1. CARGAR EDICIONES AL INICIO
    useEffect(() => {
        cargarEdiciones();
    }, []);

    // 2. CARGAR FASES CUANDO CAMBIA LA EDICIÓN SELECCIONADA
    useEffect(() => {
        if (edicionSeleccionada) {
            cargarFases(parseInt(edicionSeleccionada));
        } else {
            setFases([]);
        }
    }, [edicionSeleccionada]);

    async function cargarEdiciones() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            // Hacemos un JOIN bonito para que en el select salga "Competición - Temporada - Nombre"
            const query = `
        SELECT e.id, (c.nombre || ' - ' || t.nombre || COALESCE(' - ' || e.nombre, '')) as nombre_completo
        FROM Edicion e
        JOIN Competicion c ON e.competicion_id = c.id
        JOIN Temporada t ON e.temporada_id = t.id
        ORDER BY t.fecha_inicio DESC, c.nombre ASC
      `;
            const res = await db.select<EdicionSelector[]>(query);
            setEdiciones(res);

            // Si hay ediciones, seleccionamos la primera por defecto para que no salga vacío
            if (res.length > 0) {
                setEdicionSeleccionada(res[0].id.toString());
            }
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar las ediciones");
        }
    }

    async function cargarFases(edicionId: number) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            // Ordenamos por el campo 'orden' (Jornada 1, Jornada 2...)
            const res = await db.select<Fase[]>(
                "SELECT * FROM Fase WHERE edicion_id = $1 ORDER BY orden ASC",
                [edicionId]
            );
            setFases(res);

            // Calcular el siguiente orden automáticamente para la próxima fase nueva
            if (res.length > 0) {
                setOrden(res[res.length - 1].orden + 1);
            } else {
                setOrden(1);
            }
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar las fases");
        }
    }

    // --- CRUD ---

    function abrirCrear() {
        if (!edicionSeleccionada) {
            toast.warning("Primero selecciona una edición.");
            return;
        }
        setEditingId(null);
        setNombre(`Jornada ${orden}`); // Sugerencia automática
        // Mantenemos el orden calculado
        setTipo("Liga");
        setFormato(0);
        iniciar({ nombre: `Jornada ${orden}`, orden, tipo: "Liga", formato: 0 });
        setIsModalOpen(true);
    }

    function abrirEditar(f: Fase) {
        setEditingId(f.id);
        setNombre(f.nombre);
        setOrden(f.orden);
        setTipo(f.tipo);
        setFormato(f.ida_vuelta);
        iniciar({ nombre: f.nombre, orden: f.orden, tipo: f.tipo, formato: f.ida_vuelta });
        setIsModalOpen(true);
    }

    async function guardar(): Promise<boolean> {
        if (!nombre) return false;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            if (editingId) {
                await db.execute(
                    "UPDATE Fase SET nombre=$1, orden=$2, tipo=$3, ida_vuelta=$4 WHERE id=$5",
                    [nombre, orden, tipo, formato, editingId]
                );
            } else {
                await db.execute(
                    "INSERT INTO Fase (edicion_id, nombre, orden, tipo, ida_vuelta) VALUES ($1, $2, $3, $4, $5)",
                    [edicionSeleccionada, nombre, orden, tipo, formato]
                );
            }
            setIsModalOpen(false);
            cargarFases(parseInt(edicionSeleccionada));
            return true;
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar la fase");
            return false;
        }
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro({ nombre, orden, tipo, formato }, guardar)) setIsModalOpen(false);
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar esta fase/jornada?", titulo: "Atención", textoConfirmar: "Borrar", textoCancelar: "Cancelar", peligroso: true });
        if (confirm) await borrarFila(id);
    }

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <ListOrdered className="text-orange text-glow-orange animate-pulse" /> Fases y Jornadas
                    </h1>
                </div>
                <button
                    onClick={abrirCrear}
                    disabled={!edicionSeleccionada}
                    className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={20} /> <span>Nueva Fase</span>
                </button>
            </div>

            {/* FILTRO DE EDICIÓN */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex items-center gap-4">
                <div className="flex items-center gap-2 text-silver/40">
                    <Filter size={18} />
                    <span className="font-bold text-xs uppercase tracking-wider">Selecciona Edición:</span>
                </div>
                <select
                    value={edicionSeleccionada}
                    onChange={(e) => setEdicionSeleccionada(e.target.value)}
                    className="flex-1 p-2.5 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold"
                >
                    <option value="">-- Seleccionar --</option>
                    {ediciones.map(ed => (
                        <option key={ed.id} value={ed.id}>{ed.nombre_completo}</option>
                    ))}
                </select>
            </div>

            {/* TABLA DE FASES */}
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                <table className="w-full text-left">
                    <thead className="bg-navy-dark/85 border-b border-white/5 text-[10px] text-silver/40 uppercase tracking-widest font-black font-display">
                        <tr>
                            <th className="p-4 w-24 text-center">Orden</th>
                            <th className="p-4">Nombre de la Fase</th>
                            <th className="p-4 w-32 text-center">Tipo</th>
                            <th className="p-4 w-40 text-center">Formato</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-silver/80">
                        {fases.map((f) => (
                            <tr key={f.id} className="hover:bg-white/5 transition-colors group duration-200">
                                <td className="p-4 text-center font-display font-black text-orange text-sm">{f.orden}</td>
                                <td className="p-4 font-bold text-white group-hover:text-orange transition-colors">{f.nombre}</td>
                                <td className="p-4 text-center">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase border tracking-wider ${f.tipo === 'Liga' ? 'bg-success/10 text-success border-success/20' : 'bg-red/10 text-red border-red/20'}`}>
                                        {f.tipo}
                                    </span>
                                </td>
                                <td className="p-4 text-center text-sm font-bold text-white/70">
                                    {f.ida_vuelta === 1 ? "Ida y Vuelta" : "Partido Único"}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                    <button onClick={() => abrirEditar(f)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => borrar(f.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ESTADO VACÍO */}
                {!edicionSeleccionada ? (
                    <div className="p-10 text-center text-silver/40 font-medium">Selecciona una edición arriba para ver sus jornadas.</div>
                ) : fases.length === 0 ? (
                    <EstadoVacio
                        icono={Flag}
                        titulo="Esta edición no tiene fases"
                        descripcion="Crea al menos una fase (Liga, Playoff...) para empezar a programar partidos en ella."
                        acciones={[{ texto: "Crear fase", onClick: abrirCrear, primario: true }]}
                    />
                ) : null}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Fase" : "Nueva Fase"}>
                <div className="space-y-4">

                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Orden</label>
                            <input type="number" value={orden} onChange={e => setOrden(parseInt(e.target.value))} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-center font-display font-black text-white outline-none focus:border-orange" />
                        </div>
                        <div className="col-span-3">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" autoFocus />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Tipo</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="Liga">Liga Regular</option>
                                <option value="Eliminatoria">Eliminatoria / Playoff</option>
                                <option value="Grupos">Fase de Grupos</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Formato</label>
                            <select value={formato} onChange={e => setFormato(parseInt(e.target.value))} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value={0}>Partido Único</option>
                                <option value={1}>Ida y Vuelta</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
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
                mensaje={(f) => `Fase ${f.nombre} eliminada`}
            />
        </div>
    );
}