import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { Plus, Calendar, Trash2, Edit, CalendarRange } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
import SpinnerCarga from "../components/SpinnerCarga";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";

interface Temporada {
    id: number;
    nombre: string;
    fecha_inicio: string;
    fecha_fin: string;
}

export default function Temporadas() {
    const [temporadas, setTemporadas] = useState<Temporada[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Formulario
    const [editingId, setEditingId] = useState<number | null>(null);
    const [nombre, setNombre] = useState("");
    const [fechaInicio, setFechaInicio] = useState("");
    const [fechaFin, setFechaFin] = useState("");

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask() nativo).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Temporada", cargarDatos);

    useEffect(() => {
        cargarDatos();
    }, []);

    const [cargando, setCargando] = useState(true);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            // Ordenamos por fecha de inicio descendente (la más nueva primero)
            const res = await db.select<Temporada[]>("SELECT * FROM Temporada ORDER BY fecha_inicio DESC");
            setTemporadas(res);
        } catch (error) {
            console.error("Error cargando temporadas:", error);
            toast.error("Error al cargar las temporadas");
        } finally {
            setCargando(false);
        }
    }

    // --- CRUD ---
    function abrirCrear() {
        setEditingId(null);
        setNombre("");
        // Sugerimos fechas de hoy por comodidad
        const hoy = new Date().toISOString().split('T')[0];
        setFechaInicio(hoy);
        setFechaFin(hoy);
        iniciar({ nombre: "", fechaInicio: hoy, fechaFin: hoy });
        setIsModalOpen(true);
    }

    function abrirEditar(t: Temporada) {
        setEditingId(t.id);
        setNombre(t.nombre);
        setFechaInicio(t.fecha_inicio);
        setFechaFin(t.fecha_fin);
        iniciar({ nombre: t.nombre, fechaInicio: t.fecha_inicio, fechaFin: t.fecha_fin });
        setIsModalOpen(true);
    }

    async function guardar(): Promise<boolean> {
        if (!nombre || !fechaInicio || !fechaFin) {
            toast.warning("Por favor completa todos los campos.");
            return false;
        }

        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            if (editingId) {
                await db.execute(
                    "UPDATE Temporada SET nombre = $1, fecha_inicio = $2, fecha_fin = $3 WHERE id = $4",
                    [nombre, fechaInicio, fechaFin, editingId]
                );
            } else {
                await db.execute(
                    "INSERT INTO Temporada (nombre, fecha_inicio, fecha_fin) VALUES ($1, $2, $3)",
                    [nombre, fechaInicio, fechaFin]
                );
            }
            cerrarModal();
            cargarDatos();
            return true;
        } catch (error) {
            console.error("Error guardando:", error);
            toast.error("Error al guardar la temporada");
            return false;
        }
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar esta temporada? Cuidado, si hay partidos asociados podrían quedar huérfanos.", titulo: "Eliminar Temporada", textoConfirmar: "Eliminar", textoCancelar: "Cancelar", peligroso: true });

        if (confirm) await borrarFila(id);
    }

    function cerrarModal() {
        setIsModalOpen(false);
        setEditingId(null);
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro({ nombre, fechaInicio, fechaFin }, guardar)) cerrarModal();
    };

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-8 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <CalendarRange className="text-orange text-glow-orange animate-pulse" /> Temporadas
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">Gestión de años deportivos registrados en el sistema</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nueva</span>
                </button>
            </div>

            {/* GRID DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {temporadas.map((temp) => (
                    <div key={temp.id} className="glass-panel p-8 rounded-2xl border border-white/5 hover:border-white/10 hover:shadow-2xl transition-all duration-300 relative group flex flex-col items-center text-center">

                        {/* Icono decorativo */}
                        <div className="mb-4 bg-navy-dark p-3 rounded-full text-orange shadow-inner border border-white/5">
                            <Calendar size={32} className="animate-pulse" />
                        </div>

                        <h3 className="text-2xl font-display font-black text-white group-hover:text-orange transition-colors mb-2">{temp.nombre}</h3>

                        <div className="flex items-center gap-2 text-xs font-bold text-silver/60 bg-navy-dark/60 px-3 py-1.5 rounded-full border border-white/5">
                            <span>{temp.fecha_inicio}</span>
                            <span className="text-orange font-bold text-glow-orange">→</span>
                            <span>{temp.fecha_fin}</span>
                        </div>

                        {/* Botones Flotantes */}
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-navy-dark/95 p-1 rounded-xl border border-white/5 shadow-2xl backdrop-blur-sm">
                            <button onClick={() => abrirEditar(temp)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg transition-colors"><Edit size={16} /></button>
                            <button onClick={() => borrar(temp.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}

                {cargando ? (
                    <SpinnerCarga mensaje="Cargando temporadas…" />
                ) : temporadas.length === 0 && (
                    <EstadoVacio
                        icono={CalendarRange}
                        titulo="Aún no hay temporadas"
                        descripcion="Las temporadas agrupan ediciones por año (2025-26, 2026-27...)."
                        acciones={[{ texto: "Crear la primera", onClick: abrirCrear, primario: true }]}
                    />
                )}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Temporada" : "Nueva Temporada"}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Temporada</label>
                        <input
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: 2024/2025 o Mundial 2026"
                            className="w-full p-2.5 bg-navy border border-white/10 rounded-xl font-bold text-lg text-white outline-none focus:border-orange transition-colors"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Fecha Inicio</label>
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={e => setFechaInicio(e.target.value)}
                                className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Fecha Fin</label>
                            <input
                                type="date"
                                value={fechaFin}
                                onChange={e => setFechaFin(e.target.value)}
                                className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
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
                mensaje={(f) => `Temporada ${f.nombre} eliminada`}
            />
        </div>
    );
}