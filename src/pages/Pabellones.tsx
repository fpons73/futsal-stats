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
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <MapPin className="text-orange text-glow-orange animate-pulse" /> Pabellones
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">{pabellones.length} recintos deportivos en el sistema</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nuevo</span>
                </button>
            </div>

            {/* FILTROS */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                    <Search className="text-silver/40" size={18} />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar por nombre o ciudad..." className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-silver/40" />
                    <select value={filtroPais} onChange={e => setFiltroPais(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold">
                        <option value="todos">Todos los Países</option>
                        {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                </div>
            </div>

            {/* TABLA */}
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                <table className="w-full text-left">
                    <thead className="bg-navy-dark/85 border-b border-white/5 text-[10px] text-silver/40 uppercase tracking-widest font-black font-display">
                        <tr>
                            <th className="p-4 w-24">Foto</th>
                            <th className="p-4">Nombre</th>
                            <th className="p-4">Ciudad</th>
                            <th className="p-4 text-center">País</th>
                            <th className="p-4 text-right">Capacidad</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-silver/80">
                        {pabellonesFiltrados.map((p) => (
                            <tr key={p.id} className="hover:bg-white/5 transition-colors group duration-200">
                                <td className="p-3">
                                    <div className="w-20 h-12 bg-navy border border-white/10 rounded overflow-hidden flex items-center justify-center shadow-inner">
                                        <ImagenLocal path={p.foto_path} alt="Foto" className="w-full h-full object-cover" />
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-white group-hover:text-orange transition-colors">{p.nombre}</td>
                                <td className="p-4 text-silver/60 font-medium">{p.ciudad}</td>
                                <td className="p-4 text-center">
                                    {p.pais_bandera ? (
                                        <div className="flex flex-col items-center">
                                            <img src={convertFileSrc(p.pais_bandera)} className="w-6 h-4 object-cover border border-white/10 rounded-sm shadow-sm mb-1" />
                                            <span className="text-[10px] text-silver/40 font-bold">{p.pais_nombre}</span>
                                        </div>
                                    ) : <span className="text-silver/30">-</span>}
                                </td>
                                <td className="p-4 text-right font-display text-orange font-bold text-sm">
                                    {p.capacidad > 0 ? p.capacidad.toLocaleString('es-ES') : "-"}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                    <button onClick={() => abrirEditar(p)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => borrar(p.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {pabellonesFiltrados.length === 0 && <div className="p-10 text-center text-silver/40 font-medium">No se encontraron pabellones.</div>}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Pabellón" : "Nuevo Pabellón"}>
                <div className="space-y-4">

                    {/* Foto Panorámica */}
                    <div
                        onClick={seleccionarFoto}
                        className="w-full h-32 rounded-xl border border-white/10 hover:border-orange cursor-pointer flex items-center justify-center bg-navy-dark overflow-hidden relative group shadow-inner"
                    >
                        {fotoPath ? (
                            <ImagenLocal path={fotoPath} alt="Foto" className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-center text-silver/40 group-hover:text-orange">
                                <Upload size={24} className="mx-auto mb-1 text-silver/30" />
                                <span className="text-xs uppercase tracking-wider font-bold">Subir Foto</span>
                            </div>
                        )}
                        {fotoPath && <button onClick={(e) => { e.stopPropagation(); setFotoPath(null); }} className="absolute top-2 right-2 p-1 bg-navy border border-white/10 text-red rounded-full shadow-2xl hover:bg-white/5"><X size={14} /></button>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" placeholder="Ej: Palacio de Deportes" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Ciudad</label>
                            <input value={ciudad} onChange={e => setCiudad(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" placeholder="Ej: Murcia" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Capacidad</label>
                            <input type="number" value={capacidad} onChange={e => setCapacidad(parseInt(e.target.value))} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">País</label>
                            <select value={selPais} onChange={e => setSelPais(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}