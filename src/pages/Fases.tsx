import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { ask } from "@tauri-apps/plugin-dialog";
import { Plus, ListOrdered, Trash2, Edit, Filter } from "lucide-react";
import Modal from "../components/Modal";

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
            // Hacemos un JOIN bonito para que en el select salga "Competición - Temporada"
            const query = `
        SELECT e.id, (c.nombre || ' - ' || t.nombre) as nombre_completo
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
        } catch (error) { console.error(error); }
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
        } catch (error) { console.error(error); }
    }

    // --- CRUD ---

    function abrirCrear() {
        if (!edicionSeleccionada) {
            alert("Primero selecciona una edición.");
            return;
        }
        setEditingId(null);
        setNombre(`Jornada ${orden}`); // Sugerencia automática
        // Mantenemos el orden calculado
        setTipo("Liga");
        setFormato(0);
        setIsModalOpen(true);
    }

    function abrirEditar(f: Fase) {
        setEditingId(f.id);
        setNombre(f.nombre);
        setOrden(f.orden);
        setTipo(f.tipo);
        setFormato(f.ida_vuelta);
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!nombre) return;
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
        } catch (error) { console.error(error); }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar esta fase/jornada?", { title: "Atención", kind: "warning", okLabel: "Borrar", cancelLabel: "Cancelar" });
        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Fase WHERE id = $1", [id]);
            cargarFases(parseInt(edicionSeleccionada));
        }
    }

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
                        <ListOrdered className="text-purple" /> Fases y Jornadas
                    </h1>
                </div>
                <button
                    onClick={abrirCrear}
                    disabled={!edicionSeleccionada}
                    className="bg-purple hover:bg-purple/90 text-white px-6 py-2.5 rounded-lg font-semibold shadow-md flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Plus size={20} /> <span>Nueva Fase</span>
                </button>
            </div>

            {/* FILTRO DE EDICIÓN (ESTILO CAPTURA) */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center gap-4">
                <div className="flex items-center gap-2 text-gray-400">
                    <Filter size={20} />
                    <span className="font-bold text-sm uppercase">Selecciona Edición:</span>
                </div>
                <select
                    value={edicionSeleccionada}
                    onChange={(e) => setEdicionSeleccionada(e.target.value)}
                    className="flex-1 p-2 border border-gray-300 rounded-lg bg-gray-50 font-medium text-navy focus:ring-2 focus:ring-purple outline-none"
                >
                    <option value="">-- Seleccionar --</option>
                    {ediciones.map(ed => (
                        <option key={ed.id} value={ed.id}>{ed.nombre_completo}</option>
                    ))}
                </select>
            </div>

            {/* TABLA DE FASES */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider font-bold">
                        <tr>
                            <th className="p-4 w-24 text-center">Orden</th>
                            <th className="p-4">Nombre de la Fase</th>
                            <th className="p-4 w-32 text-center">Tipo</th>
                            <th className="p-4 w-40 text-center">Formato</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {fases.map((f) => (
                            <tr key={f.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4 text-center font-bold text-blue-600">{f.orden}</td>
                                <td className="p-4 font-bold text-navy">{f.nombre}</td>
                                <td className="p-4 text-center">
                                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase ${f.tipo === 'Liga' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                        {f.tipo}
                                    </span>
                                </td>
                                <td className="p-4 text-center text-sm text-gray-500">
                                    {f.ida_vuelta === 1 ? "Ida y Vuelta" : "Partido Único"}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => abrirEditar(f)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-100 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                    <button onClick={() => borrar(f.id)} className="p-1.5 text-gray-400 hover:text-red bg-gray-100 hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {/* ESTADO VACÍO */}
                {!edicionSeleccionada ? (
                    <div className="p-10 text-center text-gray-400">Selecciona una edición arriba para ver sus jornadas.</div>
                ) : fases.length === 0 ? (
                    <div className="p-10 text-center text-gray-400">Esta edición no tiene fases creadas aún.</div>
                ) : null}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Fase" : "Nueva Fase"}>
                <div className="space-y-4">

                    <div className="grid grid-cols-4 gap-4">
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-navy mb-1">Orden</label>
                            <input type="number" value={orden} onChange={e => setOrden(parseInt(e.target.value))} className="w-full p-2 border rounded text-center font-bold" />
                        </div>
                        <div className="col-span-3">
                            <label className="block text-xs font-bold text-navy mb-1">Nombre</label>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2 border rounded" autoFocus />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Tipo</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full p-2 border rounded bg-white">
                                <option value="Liga">Liga Regular</option>
                                <option value="Eliminatoria">Eliminatoria / Playoff</option>
                                <option value="Grupos">Fase de Grupos</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Formato</label>
                            <select value={formato} onChange={e => setFormato(parseInt(e.target.value))} className="w-full p-2 border rounded bg-white">
                                <option value={0}>Partido Único</option>
                                <option value={1}>Ida y Vuelta</option>
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardar} className="bg-purple hover:bg-purple/90 text-white px-6 py-2 rounded shadow-md">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}