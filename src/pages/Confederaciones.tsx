import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Globe, Trash2, Upload, Edit, X } from "lucide-react";
import { toast } from "../components/Toast";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";

interface Confederacion {
    id: number;
    nombre: string;
    codigo: string;
    logo_path: string | null;
}

export default function Confederaciones() {
    const [data, setData] = useState<Confederacion[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // ESTADOS DEL FORMULARIO
    const [editingId, setEditingId] = useState<number | null>(null);
    const [nombre, setNombre] = useState("");
    const [codigo, setCodigo] = useState("");
    const [logoPath, setLogoPath] = useState<string | null>(null);

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask() nativo).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT back al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Confederacion", cargarDatos);

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            // AQUÍ ESTABA EL ERROR: Aseguramos que lea de 'Confederacion'
            const res = await db.select<Confederacion[]>("SELECT * FROM Confederacion ORDER BY id DESC");
            setData(res);
        } catch (error) {
            console.error("Error cargando:", error);
            toast.error("Error al cargar las confederaciones");
        }
    }

    // ABRIR VENTANA PARA ELEGIR FOTO
    async function seleccionarLogo() {
        try {
            const file = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) {
                setLogoPath(file as string);
            }
        } catch (error) {
            console.error("Error seleccionando archivo:", error);
            toast.error("No se pudo abrir el selector de archivos");
        }
    }

    // PREPARAR EL MODAL PARA CREAR
    function abrirCrear() {
        setEditingId(null);
        setNombre("");
        setCodigo("");
        setLogoPath(null);
        iniciar({ nombre: "", codigo: "", logoPath: null });
        setIsModalOpen(true);
    }

    // PREPARAR EL MODAL PARA EDITAR
    function abrirEditar(conf: Confederacion) {
        setEditingId(conf.id);
        setNombre(conf.nombre);
        setCodigo(conf.codigo);
        setLogoPath(conf.logo_path);
        iniciar({ nombre: conf.nombre, codigo: conf.codigo, logoPath: conf.logo_path });
        setIsModalOpen(true);
    }

    // GUARDAR (CREAR O EDITAR)
    async function guardar(): Promise<boolean> {
        if (!nombre || !codigo) {
            toast.warning("Nombre y código son obligatorios");
            return false;
        }

        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            if (editingId) {
                // MODO EDICIÓN (UPDATE)
                await db.execute(
                    "UPDATE Confederacion SET nombre = $1, codigo = $2, logo_path = $3 WHERE id = $4",
                    [nombre, codigo, logoPath, editingId]
                );
            } else {
                // MODO CREACIÓN (INSERT)
                await db.execute(
                    "INSERT INTO Confederacion (nombre, codigo, logo_path) VALUES ($1, $2, $3)",
                    [nombre, codigo, logoPath]
                );
            }

            cerrarModal();
            cargarDatos();
            return true;
        } catch (error) {
            console.error("Error guardando:", error);
            toast.error("Error al guardar en base de datos.");
            return false;
        }
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar esta confederación permanentemente?", titulo: "Confirmar Eliminación", textoConfirmar: "Sí, Eliminar", textoCancelar: "Cancelar", peligroso: true });

        if (!confirm) return;
        await borrarFila(id);
    }

    function cerrarModal() {
        setIsModalOpen(false);
        setEditingId(null);
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro({ nombre, codigo, logoPath }, guardar)) cerrarModal();
    };

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-8 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <Globe className="text-orange text-glow-orange animate-pulse" /> Confederaciones
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">Organismos rectores del fútbol sala mundial en el sistema</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nueva</span>
                </button>
            </div>

            {/* REJILLA DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {data.map((conf) => (
                    <div key={conf.id} className="glass-panel p-8 rounded-2xl border border-white/5 hover:border-white/10 hover:shadow-2xl transition-all duration-300 flex flex-col items-center text-center relative group">

                        {/* Logo Circular */}
                        <div className="w-24 h-24 mb-4 rounded-full bg-navy-dark flex items-center justify-center border border-white/10 shadow-inner overflow-hidden p-2 relative">
                            {conf.logo_path ? (
                                <img
                                    src={convertFileSrc(conf.logo_path)}
                                    alt={conf.codigo}
                                    className="w-full h-full object-contain filter drop-shadow-lg"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement?.classList.add('bg-navy-dark');
                                    }}
                                />
                            ) : (
                                <Globe size={40} className="text-silver/20" />
                            )}
                        </div>

                        <h2 className="text-2xl font-display font-black text-white group-hover:text-orange transition-colors mb-1">{conf.codigo}</h2>
                        <p className="text-xs text-silver/50 font-bold uppercase tracking-wider leading-tight h-10 flex items-center justify-center">
                            {conf.nombre}
                        </p>

                        {/* BOTONES FLOTANTES (EDITAR Y BORRAR) */}
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-navy-dark/90 p-1 rounded-xl border border-white/5 shadow-2xl backdrop-blur-sm">
                            <button
                                onClick={() => abrirEditar(conf)}
                                className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg transition-colors"
                                title="Editar"
                            >
                                <Edit size={16} />
                            </button>
                            <button
                                onClick={() => borrar(conf.id)}
                                className="p-1.5 text-red hover:bg-red/10 rounded-lg transition-colors"
                                title="Eliminar"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* MODAL */}
            <Modal
                isOpen={isModalOpen}
                onClose={cerrarModalSeguro}
                title={editingId ? "Editar Confederación" : "Nueva Confederación"}
            >
                <div className="space-y-5">
                    {/* Selector de Logo en el Modal */}
                    <div className="flex flex-col items-center justify-center">
                        <div
                            onClick={seleccionarLogo}
                            className="w-32 h-32 rounded-full border border-white/10 hover:border-orange cursor-pointer flex items-center justify-center transition-colors relative overflow-hidden bg-navy-dark group shadow-inner"
                        >
                            {logoPath ? (
                                <img src={convertFileSrc(logoPath)} className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="text-center text-silver/40 group-hover:text-orange transition-colors">
                                    <Upload size={32} className="mx-auto mb-2 text-silver/30" />
                                    <span className="text-xs font-bold uppercase tracking-wider">Subir Logo</span>
                                </div>
                            )}
                        </div>
                        {logoPath && (
                            <button onClick={() => setLogoPath(null)} className="text-xs text-red mt-2 hover:underline flex items-center gap-1 font-bold">
                                <X size={12} /> Quitar logo
                            </button>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Completo</label>
                        <input
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Unión de Asociaciones Europeas..."
                            className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold"
                        />
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Código (Siglas)</label>
                        <input
                            value={codigo}
                            onChange={e => setCodigo(e.target.value)}
                            placeholder="Ej: UEFA"
                            className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-display font-black uppercase text-center"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">
                            Cancelar
                        </button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                            {editingId ? "Guardar Cambios" : "Crear Confederación"}
                        </button>
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
                mensaje={(f) => `Confederación ${f.nombre} eliminada`}
            />
        </div>
    );
}