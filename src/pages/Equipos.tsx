import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Upload, Shield, Filter, X } from "lucide-react";
import Modal from "../components/Modal";

// Interfaces
interface Equipo {
    id: number;
    nombre: string;
    abreviatura: string;
    pais_id: number | null;
    escudo_path: string | null;
    categoria: string; // "Club" o "Seleccion"
    color1: string;
    color2: string;
    // Campos extra del JOIN
    pais_nombre?: string;
    pais_bandera?: string;
    pais_iso2?: string;
}

interface Pais {
    id: number;
    nombre: string;
}

export default function Equipos() {
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    // Filtros
    const [busqueda, setBusqueda] = useState("");
    const [filtroPais, setFiltroPais] = useState("todos");
    const [filtroCat, setFiltroCat] = useState("todos");

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Formulario
    const [nombre, setNombre] = useState("");
    const [abreviatura, setAbreviatura] = useState("");
    const [categoria, setCategoria] = useState("Club");
    const [selPais, setSelPais] = useState("");
    const [escudoPath, setEscudoPath] = useState<string | null>(null);
    const [color1, setColor1] = useState("#ffffff");
    const [color2, setColor2] = useState("#000000");

    useEffect(() => {
        cargarDatos();
    }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            // Cargar Equipos con datos del País (JOIN)
            const query = `
        SELECT e.*, p.nombre as pais_nombre, p.bandera_path as pais_bandera, p.codigo_iso2 as pais_iso2
        FROM Equipo e
        LEFT JOIN Pais p ON e.pais_id = p.id
        ORDER BY e.nombre ASC
      `;
            const resEquipos = await db.select<Equipo[]>(query);
            setEquipos(resEquipos);

            // Cargar lista de países para el selector
            const resPaises = await db.select<Pais[]>("SELECT id, nombre FROM Pais ORDER BY nombre ASC");
            setPaises(resPaises);

        } catch (error) { console.error(error); }
    }

    // --- CRUD ---
    async function seleccionarEscudo() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setEscudoPath(file as string);
        } catch (err) { console.error(err); }
    }

    function abrirCrear() {
        setEditingId(null);
        setNombre(""); setAbreviatura(""); setCategoria("Club"); setSelPais("");
        setEscudoPath(null); setColor1("#1F2E5C"); setColor2("#FFFFFF");
        setIsModalOpen(true);
    }

    function abrirEditar(e: Equipo) {
        setEditingId(e.id);
        setNombre(e.nombre);
        setAbreviatura(e.abreviatura);
        setCategoria(e.categoria);
        setSelPais(e.pais_id?.toString() || "");
        setEscudoPath(e.escudo_path);
        setColor1(e.color1 || "#ffffff");
        setColor2(e.color2 || "#000000");
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!nombre) { alert("El nombre es obligatorio"); return; }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const paisId = selPais ? parseInt(selPais) : null;

            if (editingId) {
                await db.execute(
                    `UPDATE Equipo SET nombre=$1, abreviatura=$2, pais_id=$3, escudo_path=$4, categoria=$5, color1=$6, color2=$7 WHERE id=$8`,
                    [nombre, abreviatura, paisId, escudoPath, categoria, color1, color2, editingId]
                );
            } else {
                await db.execute(
                    `INSERT INTO Equipo (nombre, abreviatura, pais_id, escudo_path, categoria, color1, color2) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [nombre, abreviatura, paisId, escudoPath, categoria, color1, color2]
                );
            }
            setIsModalOpen(false);
            cargarDatos();
        } catch (error) { console.error(error); }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar equipo?", { title: "Confirmar", kind: "warning", okLabel: "Sí", cancelLabel: "No" });
        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Equipo WHERE id = $1", [id]);
            cargarDatos();
        }
    }

    // --- LÓGICA DE FILTRADO ---
    const equiposFiltrados = equipos.filter(e => {
        const coincideTexto = e.nombre.toLowerCase().includes(busqueda.toLowerCase()) || e.abreviatura.toLowerCase().includes(busqueda.toLowerCase());
        const coincidePais = filtroPais === "todos" || e.pais_id?.toString() === filtroPais;
        const coincideCat = filtroCat === "todos" || e.categoria === filtroCat;
        return coincideTexto && coincidePais && coincideCat;
    });

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
                        <Shield className="text-orange" /> Equipos
                    </h1>
                    <p className="text-silver-dim mt-1">{equipos.length} equipos registrados</p>
                </div>
                <div className="flex gap-2">
                    {/* Botón Importar (Visual por ahora) */}
                    <button className="bg-white border border-gray-300 text-navy px-4 py-2.5 rounded-lg font-medium shadow-sm hover:bg-gray-50 flex items-center gap-2">
                        <Upload size={18} /> <span>Importar</span>
                    </button>
                    <button onClick={abrirCrear} className="bg-navy hover:bg-navy-light text-white px-6 py-2.5 rounded-lg font-medium shadow-md flex items-center gap-2">
                        <Plus size={20} /> <span>Nuevo</span>
                    </button>
                </div>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                    <Search className="text-gray-400" size={20} />
                    <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar equipo..."
                        className="bg-transparent outline-none w-full text-navy placeholder-gray-400"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={20} className="text-gray-400" />
                    <select
                        value={filtroPais}
                        onChange={e => setFiltroPais(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-orange outline-none"
                    >
                        <option value="todos">Todos los Países</option>
                        {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>

                    <select
                        value={filtroCat}
                        onChange={e => setFiltroCat(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-orange outline-none"
                    >
                        <option value="todos">Todas las Categorías</option>
                        <option value="Club">Clubes</option>
                        <option value="Seleccion">Selecciones</option>
                    </select>
                </div>
            </div>

            {/* TABLA */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-50 text-gray-400 text-xs uppercase tracking-wider font-bold">
                        <tr>
                            <th className="p-4 w-20 text-center">Escudo</th>
                            <th className="p-4">Nombre</th>
                            <th className="p-4 w-24 text-center">ABR</th>
                            <th className="p-4 w-24 text-center">País</th>
                            <th className="p-4 w-32 text-center">Categoría</th>
                            <th className="p-4 w-24 text-center">Colores</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {equiposFiltrados.map((equipo) => (
                            <tr key={equipo.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-3 text-center">
                                    <div className="w-10 h-10 mx-auto flex items-center justify-center">
                                        {equipo.escudo_path ? (
                                            <img src={convertFileSrc(equipo.escudo_path)} className="max-w-full max-h-full object-contain" />
                                        ) : (
                                            <Shield className="text-gray-200" />
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-navy">{equipo.nombre}</td>
                                <td className="p-4 text-center font-mono text-orange font-bold text-xs">{equipo.abreviatura}</td>
                                <td className="p-4 text-center">
                                    {equipo.pais_bandera ? (
                                        <img src={convertFileSrc(equipo.pais_bandera)} title={equipo.pais_nombre} className="w-6 h-4 object-cover border border-gray-200 mx-auto shadow-sm" />
                                    ) : (
                                        <span className="text-xs text-gray-300">-</span>
                                    )}
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`text-[10px] px-2 py-1 rounded font-bold uppercase border ${equipo.categoria === 'Club' ? 'bg-blue-50 text-blue-600 border-blue-100' : 'bg-green-50 text-green-600 border-green-100'
                                        }`}>
                                        {equipo.categoria}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center -space-x-1">
                                        <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: equipo.color1 }}></div>
                                        <div className="w-4 h-4 rounded-full border border-gray-300" style={{ backgroundColor: equipo.color2 }}></div>
                                    </div>
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => abrirEditar(equipo)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                    <button onClick={() => borrar(equipo.id)} className="p-1.5 text-red hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {equiposFiltrados.length === 0 && <div className="p-10 text-center text-gray-400">No se encontraron equipos.</div>}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Equipo" : "Nuevo Equipo"}>
                <div className="space-y-4">

                    <div className="flex justify-center mb-4">
                        <div
                            onClick={seleccionarEscudo}
                            className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 hover:border-orange cursor-pointer flex items-center justify-center bg-gray-50 overflow-hidden relative group"
                        >
                            {escudoPath ? (
                                <img src={convertFileSrc(escudoPath)} className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="text-center text-gray-400 group-hover:text-orange"><Shield size={24} className="mx-auto" /><span className="text-[10px]">Escudo</span></div>
                            )}
                        </div>
                        {escudoPath && (
                            <button onClick={(e) => { e.stopPropagation(); setEscudoPath(null); }} className="absolute ml-16 mt-0 text-red bg-white rounded-full p-1 shadow border"><X size={12} /></button>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-navy mb-1">Nombre</label>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2 border rounded" placeholder="Ej: Movistar Inter" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Abreviatura</label>
                            <input value={abreviatura} onChange={e => setAbreviatura(e.target.value)} className="w-full p-2 border rounded text-center uppercase" placeholder="INT" maxLength={5} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Categoría</label>
                            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full p-2 border rounded bg-white">
                                <option value="Club">Club</option>
                                <option value="Seleccion">Selección</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">País</label>
                            <select value={selPais} onChange={e => setSelPais(e.target.value)} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-navy mb-2">Colores (1º y 2º)</label>
                        <div className="flex gap-4">
                            <input type="color" value={color1} onChange={e => setColor1(e.target.value)} className="w-full h-10 p-0 border-0 rounded cursor-pointer" />
                            <input type="color" value={color2} onChange={e => setColor2(e.target.value)} className="w-full h-10 p-0 border-0 rounded cursor-pointer" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t mt-4">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardar} className="bg-navy text-white px-6 py-2 rounded shadow-md">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}