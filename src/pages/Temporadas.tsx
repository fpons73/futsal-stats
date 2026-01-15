import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { ask } from "@tauri-apps/plugin-dialog";
import { Plus, Calendar, Trash2, Edit, CalendarRange } from "lucide-react";
import Modal from "../components/Modal";

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

    useEffect(() => {
        cargarDatos();
    }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            // Ordenamos por fecha de inicio descendente (la más nueva primero)
            const res = await db.select<Temporada[]>("SELECT * FROM Temporada ORDER BY fecha_inicio DESC");
            setTemporadas(res);
        } catch (error) {
            console.error("Error cargando temporadas:", error);
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
        setIsModalOpen(true);
    }

    function abrirEditar(t: Temporada) {
        setEditingId(t.id);
        setNombre(t.nombre);
        setFechaInicio(t.fecha_inicio);
        setFechaFin(t.fecha_fin);
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!nombre || !fechaInicio || !fechaFin) {
            alert("Por favor completa todos los campos.");
            return;
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
        } catch (error) {
            console.error("Error guardando:", error);
        }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar esta temporada? Cuidado, si hay partidos asociados podrían quedar huérfanos.", {
            title: "Eliminar Temporada",
            kind: "warning",
            okLabel: "Eliminar",
            cancelLabel: "Cancelar"
        });

        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Temporada WHERE id = $1", [id]);
            cargarDatos();
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
                        <CalendarRange className="text-orange" /> Temporadas
                    </h1>
                    <p className="text-silver-dim mt-1">Gestión de años deportivos.</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-lg font-semibold shadow-md flex items-center gap-2 hover:scale-105 transition-transform">
                    <Plus size={20} /> <span>Nueva</span>
                </button>
            </div>

            {/* GRID DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {temporadas.map((temp) => (
                    <div key={temp.id} className="bg-white p-8 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all relative group flex flex-col items-center text-center">

                        {/* Icono decorativo */}
                        <div className="mb-4 bg-blue-50 p-3 rounded-full text-navy">
                            <Calendar size={32} />
                        </div>

                        <h3 className="text-2xl font-bold text-navy mb-2">{temp.nombre}</h3>

                        <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-3 py-1 rounded-full border border-gray-100">
                            <span>{temp.fecha_inicio}</span>
                            <span className="text-orange font-bold">→</span>
                            <span>{temp.fecha_fin}</span>
                        </div>

                        {/* Botones Flotantes */}
                        <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded shadow-sm">
                            <button onClick={() => abrirEditar(temp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                            <button onClick={() => borrar(temp.id)} className="p-1.5 text-red hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                        </div>
                    </div>
                ))}

                {temporadas.length === 0 && (
                    <div className="col-span-full text-center py-10 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                        <CalendarRange size={48} className="mx-auto mb-4 opacity-50" />
                        <p>No hay temporadas registradas.</p>
                        <button onClick={abrirCrear} className="text-orange font-bold mt-2 hover:underline">Crear la primera</button>
                    </div>
                )}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModal} title={editingId ? "Editar Temporada" : "Nueva Temporada"}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">Nombre Temporada</label>
                        <input
                            value={nombre}
                            onChange={e => setNombre(e.target.value)}
                            placeholder="Ej: 2024/2025 o Mundial 2026"
                            className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-orange outline-none font-bold text-lg text-navy"
                            autoFocus
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">Fecha Inicio</label>
                            <input
                                type="date"
                                value={fechaInicio}
                                onChange={e => setFechaInicio(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded text-gray-600"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">Fecha Fin</label>
                            <input
                                type="date"
                                value={fechaFin}
                                onChange={e => setFechaFin(e.target.value)}
                                className="w-full p-2 border border-gray-300 rounded text-gray-600"
                            />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 mt-4">
                        <button onClick={cerrarModal} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                        <button onClick={guardar} className="bg-navy text-white px-6 py-2 rounded font-medium shadow-md">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}