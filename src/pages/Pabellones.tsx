import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Upload, MapPin, Filter, X } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";

interface Pabellon {
    id: number;
    nombre: string;
    ciudad: string;
    pais_id: number | null;
    capacidad: number;
    foto_path: string | null;
    // Campos extra del JOIN
    pais_nombre?: string;
    pais_bandera?: string;
}

interface Pais {
    id: number;
    nombre: string;
}

export default function Pabellones() {
    const [pabellones, setPabellones] = useState<Pabellon[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    // Filtros
    const [busqueda, setBusqueda] = useState("");
    const [filtroPais, setFiltroPais] = useState("todos");

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Formulario
    const [nombre, setNombre] = useState("");
    const [ciudad, setCiudad] = useState("");
    const [capacidad, setCapacidad] = useState(0);
    const [selPais, setSelPais] = useState("");
    const [fotoPath, setFotoPath] = useState<string | null>(null);

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            // JOIN para sacar datos del país
            const query = `
        SELECT e.*, p.nombre as pais_nombre, p.bandera_path as pais_bandera
        FROM Estadio e
        LEFT JOIN Pais p ON e.pais_id = p.id
        ORDER BY e.nombre ASC
      `;
            // Nota: En la BD se llama tabla 'Estadio', pero en la UI mostramos 'Pabellón'
            const resPab = await db.select<Pabellon[]>(query);
            setPabellones(resPab);

            const resPaises = await db.select<Pais[]>("SELECT id, nombre FROM Pais ORDER BY nombre ASC");
            setPaises(resPaises);

        } catch (error) { console.error(error); }
    }

    async function seleccionarFoto() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setFotoPath(file as string);
        } catch (err) { console.error(err); }
    }

    function abrirCrear() {
        setEditingId(null);
        setNombre(""); setCiudad(""); setCapacidad(0); setSelPais(""); setFotoPath(null);
        setIsModalOpen(true);
    }

    function abrirEditar(p: Pabellon) {
        setEditingId(p.id);
        setNombre(p.nombre);
        setCiudad(p.ciudad);
        setCapacidad(p.capacidad);
        setSelPais(p.pais_id?.toString() || "");
        setFotoPath(p.foto_path);
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!nombre) { alert("El nombre es obligatorio"); return; }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const paisId = selPais ? parseInt(selPais) : null;

            if (editingId) {
                await db.execute(
                    `UPDATE Estadio SET nombre=$1, ciudad=$2, pais_id=$3, capacidad=$4, foto_path=$5 WHERE id=$6`,
                    [nombre, ciudad, paisId, capacidad, fotoPath, editingId]
                );
            } else {
                await db.execute(
                    `INSERT INTO Estadio (nombre, ciudad, pais_id, capacidad, foto_path) VALUES ($1, $2, $3, $4, $5)`,
                    [nombre, ciudad, paisId, capacidad, fotoPath]
                );
            }
            setIsModalOpen(false);
            cargarDatos();
        } catch (error) { console.error(error); }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar este pabellón?", { title: "Confirmar", kind: "warning", okLabel: "Sí", cancelLabel: "No" });
        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Estadio WHERE id = $1", [id]);
            cargarDatos();
        }
    }

    // Filtrado
    const pabellonesFiltrados = pabellones.filter(p => {
        const texto = (p.nombre + p.ciudad).toLowerCase();
        const matchTexto = texto.includes(busqueda.toLowerCase());
        const matchPais = filtroPais === "todos" || p.pais_id?.toString() === filtroPais;
        return matchTexto && matchPais;
    });

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
                        <MapPin className="text-green-600" /> Pabellones
                    </h1>
                    <p className="text-silver-dim mt-1">{pabellones.length} recintos deportivos</p>
                </div>
                <button onClick={abrirCrear} className="bg-navy hover:bg-navy-light text-white px-6 py-2.5 rounded-lg font-medium shadow-md flex items-center gap-2">
                    <Plus size={20} /> <span>Nuevo</span>
                </button>
            </div>

            {/* FILTROS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                    <Search className="text-gray-400" size={20} />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o ciudad..." className="bg-transparent outline-none w-full text-navy placeholder-gray-400" />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-gray-400" />
                    <select value={filtroPais} onChange={e => setFiltroPais(e.target.value)} className="p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-orange outline-none">
                        <option value="todos">Todos los Países</option>
                        {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                </div>
            </div>

            {/* TABLA */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider font-bold">
                        <tr>
                            <th className="p-4 w-24">Foto</th>
                            <th className="p-4">Nombre</th>
                            <th className="p-4">Ciudad</th>
                            <th className="p-4 text-center">País</th>
                            <th className="p-4 text-right">Capacidad</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {pabellonesFiltrados.map((p) => (
                            <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-3">
                                    <div className="w-20 h-12 bg-gray-100 rounded border border-gray-200 overflow-hidden flex items-center justify-center">
                                        <ImagenLocal path={p.foto_path} alt="Foto" className="w-full h-full object-cover" />
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-navy">{p.nombre}</td>
                                <td className="p-4 text-gray-600">{p.ciudad}</td>
                                <td className="p-4 text-center">
                                    {p.pais_bandera ? (
                                        <div className="flex flex-col items-center">
                                            <img src={convertFileSrc(p.pais_bandera)} className="w-6 h-4 object-cover border shadow-sm mb-1" />
                                            <span className="text-[10px] text-gray-400">{p.pais_nombre}</span>
                                        </div>
                                    ) : <span>-</span>}
                                </td>
                                <td className="p-4 text-right font-mono text-blue-600 font-bold">
                                    {p.capacidad > 0 ? p.capacidad.toLocaleString('es-ES') : "-"}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => abrirEditar(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                    <button onClick={() => borrar(p.id)} className="p-1.5 text-red hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {pabellonesFiltrados.length === 0 && <div className="p-10 text-center text-gray-400">No se encontraron pabellones.</div>}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Pabellón" : "Nuevo Pabellón"}>
                <div className="space-y-4">

                    {/* Foto Panorámica */}
                    <div
                        onClick={seleccionarFoto}
                        className="w-full h-32 rounded-lg border-2 border-dashed border-gray-300 hover:border-orange cursor-pointer flex items-center justify-center bg-gray-50 overflow-hidden relative group"
                    >
                        {fotoPath ? (
                            <ImagenLocal path={fotoPath} alt="Foto" className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-center text-gray-400 group-hover:text-orange">
                                <Upload size={24} className="mx-auto mb-1" />
                                <span className="text-xs">Subir Foto</span>
                            </div>
                        )}
                        {fotoPath && <button onClick={(e) => { e.stopPropagation(); setFotoPath(null); }} className="absolute top-2 right-2 p-1 bg-white text-red rounded-full shadow"><X size={14} /></button>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-bold text-navy mb-1">Nombre</label><input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2 border rounded" placeholder="Ej: Palacio de Deportes" /></div>
                        <div><label className="block text-xs font-bold text-navy mb-1">Ciudad</label><input value={ciudad} onChange={e => setCiudad(e.target.value)} className="w-full p-2 border rounded" placeholder="Ej: Murcia" /></div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Capacidad</label>
                            <input type="number" value={capacidad} onChange={e => setCapacidad(parseInt(e.target.value))} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">País</label>
                            <select value={selPais} onChange={e => setSelPais(e.target.value)} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardar} className="bg-navy text-white px-6 py-2 rounded shadow-md">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}