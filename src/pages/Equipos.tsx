import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Upload, Shield, Filter, X } from "lucide-react";
import Modal from "../components/Modal";
import { normalizeString } from "../utils/stringUtils";

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
        if (!nombre || !selPais) { alert("El nombre y el país son obligatorios"); return; }
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
        const busquedaNorm = normalizeString(busqueda);
        const textoNorm = normalizeString(e.nombre + e.abreviatura);
        const coincideTexto = textoNorm.includes(busquedaNorm);
        const coincidePais = filtroPais === "todos" || e.pais_id?.toString() === filtroPais;
        const coincideCat = filtroCat === "todos" || e.categoria === filtroCat;
        return coincideTexto && coincidePais && coincideCat;
    });

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <Shield className="text-orange text-glow-orange animate-pulse" /> Equipos
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">{equipos.length} equipos registrados en el sistema</p>
                </div>
                <div className="flex gap-2">
                    <button className="bg-navy-light hover:bg-navy-light/80 text-white px-4 py-2.5 rounded-xl font-bold shadow-md border border-white/5 flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                        <Upload size={18} className="text-orange" /> <span>Importar</span>
                    </button>
                    <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                        <Plus size={20} /> <span>Nuevo</span>
                    </button>
                </div>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                    <Search className="text-silver/40" size={18} />
                    <input
                        value={busqueda}
                        onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar equipo..."
                        className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-silver/40" />
                    <select
                        value={filtroPais}
                        onChange={e => setFiltroPais(e.target.value)}
                        className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold"
                    >
                        <option value="todos">Todos los Países</option>
                        {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>

                    <select
                        value={filtroCat}
                        onChange={e => setFiltroCat(e.target.value)}
                        className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold"
                    >
                        <option value="todos">Todas las Categorías</option>
                        <option value="Club">Clubes</option>
                        <option value="Seleccion">Selecciones</option>
                    </select>
                </div>
            </div>

            {/* TABLA */}
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                <table className="w-full text-left">
                    <thead className="bg-navy-dark/85 border-b border-white/5 text-[10px] text-silver/40 uppercase tracking-widest font-black font-display">
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
                    <tbody className="divide-y divide-white/5 text-silver/80">
                        {equiposFiltrados.map((equipo) => (
                            <tr key={equipo.id} className="hover:bg-white/5 transition-colors group duration-200">
                                <td className="p-3 text-center">
                                    <div className="w-10 h-10 mx-auto flex items-center justify-center bg-white p-1 rounded-xl shadow-sm border border-white/10">
                                        {equipo.escudo_path ? (
                                            <img src={convertFileSrc(equipo.escudo_path)} className="max-w-full max-h-full object-contain filter drop-shadow-md" />
                                        ) : (
                                            <Shield className="text-silver/20" />
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-white group-hover:text-orange transition-colors">{equipo.nombre}</td>
                                <td className="p-4 text-center font-display font-black text-orange text-glow-orange text-xs uppercase tracking-wider">{equipo.abreviatura}</td>
                                <td className="p-4 text-center">
                                    {equipo.pais_bandera ? (
                                        <img src={convertFileSrc(equipo.pais_bandera)} title={equipo.pais_nombre} className="w-6 h-4 object-cover border border-white/10 rounded-sm mx-auto shadow-sm" />
                                    ) : (
                                        <span className="text-xs text-silver/30">-</span>
                                    )}
                                </td>
                                <td className="p-4 text-center">
                                    <span className={`text-[10px] px-2 py-0.5 rounded font-black uppercase border tracking-wider ${equipo.categoria === 'Club' ? 'bg-orange/10 text-orange border-orange/20' : 'bg-success/10 text-success border-success/20'
                                        }`}>
                                        {equipo.categoria}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center -space-x-1.5">
                                        <div className="w-4 h-4 rounded-full border border-white/15 shadow-inner" style={{ backgroundColor: equipo.color1 }}></div>
                                        <div className="w-4 h-4 rounded-full border border-white/15 shadow-inner" style={{ backgroundColor: equipo.color2 }}></div>
                                    </div>
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                    <button onClick={() => abrirEditar(equipo)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => borrar(equipo.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {equiposFiltrados.length === 0 && <div className="p-10 text-center text-silver/40 font-medium">No se encontraron equipos.</div>}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Equipo" : "Nuevo Equipo"}>
                <div className="space-y-4">

                    <div className="flex justify-center mb-4">
                        <div
                            onClick={seleccionarEscudo}
                            className="w-24 h-24 rounded-2xl border border-white/10 hover:border-orange cursor-pointer flex items-center justify-center bg-white overflow-hidden relative group shadow-inner"
                        >
                            {escudoPath ? (
                                <img src={convertFileSrc(escudoPath)} className="w-full h-full object-contain p-2 filter drop-shadow-md" />
                            ) : (
                                <div className="text-center text-silver/40 group-hover:text-orange"><Shield size={24} className="mx-auto text-silver/30" /><span className="text-[10px] mt-1 block uppercase font-bold tracking-wider">Escudo</span></div>
                            )}
                        </div>
                        {escudoPath && (
                            <button onClick={(e) => { e.stopPropagation(); setEscudoPath(null); }} className="absolute ml-16 mt-0 text-red bg-navy border border-white/10 rounded-full p-1 shadow-2xl hover:bg-white/5"><X size={12} /></button>
                        )}
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                            <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" placeholder="Ej: Movistar Inter" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">ABR</label>
                            <input value={abreviatura} onChange={e => setAbreviatura(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-center text-white outline-none focus:border-orange transition-colors font-display font-black uppercase" placeholder="INT" maxLength={5} />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Categoría</label>
                            <select value={categoria} onChange={e => setCategoria(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="Club">Club</option>
                                <option value="Seleccion">Selección</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">País</label>
                            <select value={selPais} onChange={e => setSelPais(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-2 uppercase tracking-wider">Colores (1º y 2º)</label>
                        <div className="flex gap-4">
                            <input type="color" value={color1} onChange={e => setColor1(e.target.value)} className="w-full h-10 p-0.5 bg-navy border border-white/10 rounded-xl cursor-pointer" />
                            <input type="color" value={color2} onChange={e => setColor2(e.target.value)} className="w-full h-10 p-0.5 bg-navy border border-white/10 rounded-xl cursor-pointer" />
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5 mt-4">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}