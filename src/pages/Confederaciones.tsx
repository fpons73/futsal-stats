import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Globe, Trash2, Upload, Edit, X } from "lucide-react";
import Modal from "../components/Modal";

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

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            // AQUÍ ESTABA EL ERROR: Aseguramos que lea de 'Confederacion'
            const res = await db.select<Confederacion[]>("SELECT * FROM Confederacion ORDER BY id DESC");
            setData(res);
        } catch (error) {
            console.error("Error cargando:", error);
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
        }
    }

    // PREPARAR EL MODAL PARA CREAR
    function abrirCrear() {
        setEditingId(null);
        setNombre("");
        setCodigo("");
        setLogoPath(null);
        setIsModalOpen(true);
    }

    // PREPARAR EL MODAL PARA EDITAR
    function abrirEditar(conf: Confederacion) {
        setEditingId(conf.id);
        setNombre(conf.nombre);
        setCodigo(conf.codigo);
        setLogoPath(conf.logo_path);
        setIsModalOpen(true);
    }

    // GUARDAR (CREAR O EDITAR)
    async function guardar() {
        if (!nombre || !codigo) return;

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
        } catch (error) {
            console.error("Error guardando:", error);
            alert("Error al guardar en base de datos.");
        }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar esta confederación permanentemente?", {
            title: "Confirmar Eliminación",
            kind: "warning",
            okLabel: "Sí, Eliminar",
            cancelLabel: "Cancelar"
        });

        if (!confirm) return;

        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Confederacion WHERE id = $1", [id]);
            cargarDatos();
        } catch (error) {
            console.error("Error borrando:", error);
        }
    }

    function cerrarModal() {
        setIsModalOpen(false);
        setEditingId(null);
    }

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
                        <Globe className="text-purple" /> Confederaciones
                    </h1>
                    <p className="text-silver-dim mt-1">Organismos rectores del fútbol mundial.</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-lg font-semibold shadow-md flex items-center gap-2 transition-transform hover:scale-105">
                    <Plus size={20} /> <span>Nueva</span>
                </button>
            </div>

            {/* REJILLA DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {data.map((conf) => (
                    <div key={conf.id} className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all flex flex-col items-center text-center relative group">

                        {/* Logo Circular */}
                        <div className="w-24 h-24 mb-4 rounded-full bg-gray-50 flex items-center justify-center border border-gray-100 shadow-inner overflow-hidden p-2 relative">
                            {conf.logo_path ? (
                                <img
                                    src={convertFileSrc(conf.logo_path)}
                                    alt={conf.codigo}
                                    className="w-full h-full object-contain"
                                    onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.parentElement?.classList.add('bg-red-50');
                                    }}
                                />
                            ) : (
                                <Globe size={40} className="text-gray-300" />
                            )}
                        </div>

                        <h2 className="text-2xl font-black text-navy mb-1">{conf.codigo}</h2>
                        <p className="text-sm text-silver-dim font-medium leading-tight h-10 flex items-center justify-center">
                            {conf.nombre}
                        </p>

                        {/* BOTONES FLOTANTES (EDITAR Y BORRAR) */}
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded-lg shadow-sm backdrop-blur-sm">
                            <button
                                onClick={() => abrirEditar(conf)}
                                className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                title="Editar"
                            >
                                <Edit size={16} />
                            </button>
                            <button
                                onClick={() => borrar(conf.id)}
                                className="p-1.5 text-red hover:bg-red-50 rounded-md transition-colors"
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
                onClose={cerrarModal}
                title={editingId ? "Editar Confederación" : "Nueva Confederación"}
            >
                <div className="space-y-5">
                    {/* Selector de Logo en el Modal */}
                    <div className="flex flex-col items-center justify-center">
                        <div
                            onClick={seleccionarLogo}
                            className="w-32 h-32 rounded-full border-2 border-dashed border-gray-300 hover:border-orange cursor-pointer flex items-center justify-center transition-colors relative overflow-hidden bg-gray-50 group"
                        >
                            {logoPath ? (
                                <img src={convertFileSrc(logoPath)} className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="text-center text-gray-400 group-hover:text-orange transition-colors">
                                    <Upload size={32} className="mx-auto mb-2" />
                                    <span className="text-xs font-medium">Subir Logo</span>
                                </div>
                            )}
                        </div>
                        {logoPath && (
                            <button onClick={() => setLogoPath(null)} className="text-xs text-red mt-2 hover:underline flex items-center gap-1">
                                <X size={12} /> Quitar logo
                            </button>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-navy mb-1">Nombre Completo</label>
                        <input
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: Unión de Asociaciones Europeas..."
                            className="w-full p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange outline-none text-navy"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-navy mb-1">Código (Siglas)</label>
                        <input
                            value={codigo}
                            onChange={e => setCodigo(e.target.value)}
                            placeholder="Ej: UEFA"
                            className="w-full p-2.5 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange outline-none font-bold uppercase text-navy"
                        />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
                        <button onClick={cerrarModal} className="px-4 py-2 text-gray-500 hover:text-navy hover:bg-gray-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button onClick={guardar} className="bg-navy hover:bg-navy-light text-white px-6 py-2 rounded-lg font-medium shadow-lg transition-transform active:scale-95">
                            {editingId ? "Guardar Cambios" : "Crear Confederación"}
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}