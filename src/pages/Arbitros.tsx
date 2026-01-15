import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Eye, Filter, Gavel, Upload, X, Calendar } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";

interface Pais {
    id: number;
    nombre: string;
    bandera_path: string | null;
}

interface Arbitro {
    id: number;
    nombre: string;
    apellidos: string;
    nombre_deportivo: string;
    fecha_nacimiento: string;
    nacionalidad_principal_id: number | null;
    nacionalidades_secundarias: string;
    foto_path: string | null;
    roles: string;
}

export default function Arbitros() {
    const [arbitros, setArbitros] = useState<Arbitro[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    // Filtros
    const [busqueda, setBusqueda] = useState("");
    const [filtroPais, setFiltroPais] = useState("todos");

    // Modales
    const [modalFormOpen, setModalFormOpen] = useState(false);
    const [modalViewOpen, setModalViewOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [selectedRef, setSelectedRef] = useState<Arbitro | null>(null);

    // Formulario
    const [formData, setFormData] = useState({
        nombre: "",
        apellidos: "",
        apodo: "",
        nacimiento: "",
        pais1: "",
        pais2: "",
        foto: null as string | null
    });

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const resPaises = await db.select<Pais[]>("SELECT * FROM Pais ORDER BY nombre ASC");
            setPaises(resPaises);

            const resArb = await db.select<Arbitro[]>(`SELECT * FROM Persona WHERE roles LIKE '%Arbitro%' ORDER BY nombre_deportivo ASC`);
            setArbitros(resArb);
        } catch (error) { console.error(error); }
    }

    async function seleccionarFoto() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setFormData({ ...formData, foto: file as string });
        } catch (err) { console.error(err); }
    }

    function abrirCrear() {
        setEditingId(null);
        setFormData({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", pais2: "", foto: null });
        setModalFormOpen(true);
    }

    function abrirEditar(a: Arbitro) {
        setEditingId(a.id);
        let nac2 = "";
        try {
            const parsed = JSON.parse(a.nacionalidades_secundarias || "[]");
            if (Array.isArray(parsed) && parsed.length > 0) nac2 = parsed[0];
        } catch { nac2 = a.nacionalidades_secundarias || ""; }

        setFormData({
            nombre: a.nombre,
            apellidos: a.apellidos,
            apodo: a.nombre_deportivo,
            nacimiento: a.fecha_nacimiento,
            pais1: a.nacionalidad_principal_id?.toString() || "",
            pais2: nac2,
            foto: a.foto_path
        });
        setModalFormOpen(true);
    }

    function abrirFicha(a: Arbitro) {
        setSelectedRef(a);
        setModalViewOpen(true);
    }

    async function guardar() {
        if (!formData.nombre || !formData.apodo || !formData.pais1) {
            alert("Rellena nombre, apodo y nacionalidad.");
            return;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const nac2Json = formData.pais2 ? JSON.stringify([formData.pais2]) : JSON.stringify([]);
            const rolesJson = JSON.stringify(["Arbitro"]);

            if (editingId) {
                await db.execute(`
                UPDATE Persona SET 
                nombre=$1, apellidos=$2, nombre_deportivo=$3, fecha_nacimiento=$4, 
                nacionalidad_principal_id=$5, nacionalidades_secundarias=$6, 
                foto_path=$7 
                WHERE id=$8
            `, [formData.nombre, formData.apellidos, formData.apodo, formData.nacimiento, formData.pais1, nac2Json, formData.foto, editingId]);
            } else {
                await db.execute(`
                INSERT INTO Persona 
                (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, nacionalidades_secundarias, foto_path, roles, posicion_principal, posiciones_secundarias)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)
            `, [formData.nombre, formData.apellidos, formData.apodo, formData.nacimiento, formData.pais1, nac2Json, formData.foto, rolesJson]);
            }
            setModalFormOpen(false);
            cargarDatos();
        } catch (error) { console.error("Error guardando:", error); }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar árbitro?", { title: "Confirmar", kind: "warning", okLabel: "Sí", cancelLabel: "No" });
        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Persona WHERE id = $1", [id]);
            cargarDatos();
        }
    }

    function calcularEdad(fecha: string) {
        if (!fecha) return "-";
        const hoy = new Date();
        const nac = new Date(fecha);
        let edad = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
        return edad;
    }

    function getBandera(idPais: number | string | null) {
        if (!idPais) return null;
        const p = paises.find(x => x.id == idPais);
        return p?.bandera_path ? convertFileSrc(p.bandera_path) : null;
    }

    function getNombrePais(idPais: number | string | null) {
        if (!idPais) return "";
        return paises.find(x => x.id == idPais)?.nombre || "";
    }

    const arbitrosFiltrados = arbitros.filter(a => {
        const texto = (a.nombre_deportivo + a.nombre + a.apellidos).toLowerCase();
        const matchTexto = texto.includes(busqueda.toLowerCase());
        const matchPais = filtroPais === "todos" || a.nacionalidad_principal_id?.toString() === filtroPais;
        return matchTexto && matchPais;
    });

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
                        <Gavel className="text-orange" /> Árbitros
                    </h1>
                    <p className="text-silver-dim mt-1">{arbitros.length} colegiados registrados</p>
                </div>
                <button onClick={abrirCrear} className="bg-navy hover:bg-navy-light text-white px-6 py-2.5 rounded-lg font-medium shadow-md flex items-center gap-2">
                    <Plus size={20} /> <span>Nuevo</span>
                </button>
            </div>

            {/* FILTROS */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200">
                    <Search className="text-gray-400" size={20} />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar árbitro..." className="bg-transparent outline-none w-full text-navy placeholder-gray-400" />
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
                            <th className="p-4 w-16 text-center">Foto</th>
                            <th className="p-4">Nombre Deportivo</th>
                            <th className="p-4 text-center">Nacionalidad</th>
                            <th className="p-4 w-20 text-center">Edad</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {arbitrosFiltrados.map((a) => {
                            let nac2Id = null;
                            try { nac2Id = JSON.parse(a.nacionalidades_secundarias)[0]; } catch { }

                            return (
                                <tr key={a.id} className="hover:bg-gray-50 transition-colors group">
                                    <td className="p-3 text-center">
                                        <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 overflow-hidden mx-auto flex items-center justify-center">
                                            <ImagenLocal path={a.foto_path} alt={a.nombre_deportivo} className="w-full h-full object-cover" />
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-navy">{a.nombre_deportivo}</div>
                                        <div className="text-xs text-gray-400">{a.nombre} {a.apellidos}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1">
                                            {getBandera(a.nacionalidad_principal_id) && <img src={getBandera(a.nacionalidad_principal_id)!} className="w-6 h-4 border border-gray-200 shadow-sm" />}
                                            {getBandera(nac2Id) && <img src={getBandera(nac2Id)!} className="w-6 h-4 border border-gray-200 shadow-sm opacity-80" />}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center font-mono text-sm text-gray-600">
                                        {calcularEdad(a.fecha_nacimiento)}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => abrirFicha(a)} className="p-1.5 text-green-600 hover:bg-green-50 rounded bg-white border border-gray-200"><Eye size={16} /></button>
                                        <button onClick={() => abrirEditar(a)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded bg-white border border-gray-200"><Edit size={16} /></button>
                                        <button onClick={() => borrar(a.id)} className="p-1.5 text-red hover:bg-red-50 rounded bg-white border border-gray-200"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {arbitrosFiltrados.length === 0 && <div className="p-10 text-center text-gray-400">No se encontraron árbitros.</div>}
            </div>

            {/* --- MODAL FORMULARIO --- */}
            <Modal isOpen={modalFormOpen} onClose={() => setModalFormOpen(false)} title={editingId ? "Editar Árbitro" : "Nuevo Árbitro"}>
                <div className="space-y-4">

                    <div className="flex items-center gap-4 mb-4">
                        <div onClick={seleccionarFoto} className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative">
                            <ImagenLocal path={formData.foto} alt="Foto" className="w-full h-full object-cover" />
                            {!formData.foto && <Upload size={20} className="text-gray-400" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-navy mb-1">Nombre Deportivo (Automático)</label>
                            <input
                                value={formData.apodo}
                                onChange={e => setFormData({ ...formData, apodo: e.target.value })}
                                className="w-full p-2 border rounded font-bold text-navy bg-gray-50"
                                placeholder="Nombre + Apellidos"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Nombre</label>
                            <input
                                value={formData.nombre}
                                onChange={e => {
                                    const val = e.target.value;
                                    // Actualizamos nombre y también regeneramos el apodo
                                    setFormData(prev => ({
                                        ...prev,
                                        nombre: val,
                                        apodo: `${val} ${prev.apellidos}`.trim()
                                    }));
                                }}
                                className="w-full p-2 border rounded"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Apellidos</label>
                            <input
                                value={formData.apellidos}
                                onChange={e => {
                                    const val = e.target.value;
                                    // Actualizamos apellidos y también regeneramos el apodo
                                    setFormData(prev => ({
                                        ...prev,
                                        apellidos: val,
                                        apodo: `${prev.nombre} ${val}`.trim()
                                    }));
                                }}
                                className="w-full p-2 border rounded"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">1ª Nacionalidad</label>
                            <select value={formData.pais1} onChange={e => setFormData({ ...formData, pais1: e.target.value })} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">2ª Nacionalidad</label>
                            <select value={formData.pais2} onChange={e => setFormData({ ...formData, pais2: e.target.value })} className="w-full p-2 border rounded bg-white">
                                <option value="">Ninguna</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-navy mb-1">Fecha Nacimiento</label>
                        <input type="date" value={formData.nacimiento} onChange={e => setFormData({ ...formData, nacimiento: e.target.value })} className="w-full p-2 border rounded" />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t">
                        <button onClick={() => setModalFormOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardar} className="bg-navy text-white px-6 py-2 rounded font-medium shadow-md">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* --- FICHA TÉCNICA ÁRBITRO --- */}
            {modalViewOpen && selectedRef && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#0B1F3B] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/10">
                        <div className="relative p-8 flex items-center gap-6 border-b border-white/10 bg-gradient-to-r from-[#0B1F3B] to-[#16294a]">
                            <button onClick={() => setModalViewOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"><X size={24} /></button>
                            <div className="w-24 h-24 rounded-full border-4 border-white/20 shadow-xl overflow-hidden bg-white/5 flex-shrink-0">
                                <ImagenLocal path={selectedRef.foto_path} alt={selectedRef.nombre_deportivo} className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-1">{selectedRef.nombre_deportivo}</h2>
                                <span className="bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block">Árbitro</span>
                                <p className="text-white/60 text-sm mb-3">{selectedRef.nombre} {selectedRef.apellidos}</p>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                        {getBandera(selectedRef.nacionalidad_principal_id) && <img src={getBandera(selectedRef.nacionalidad_principal_id)!} className="w-5 h-3.5" />}
                                        <span className="text-xs text-white font-medium uppercase tracking-wide">{getNombrePais(selectedRef.nacionalidad_principal_id)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                        <Calendar size={14} className="text-white/70" />
                                        <span className="text-xs text-white font-medium">{selectedRef.fecha_nacimiento}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Historial (Mockup) */}
                        <div className="p-6 bg-[#0B1F3B]">
                            <h4 className="text-xs font-bold text-white/50 uppercase mb-4 flex items-center gap-2">Historial de Arbitraje</h4>
                            <div className="bg-white/5 rounded-lg p-4 border border-white/5 text-center text-white/30 text-xs">
                                Partidos arbitrados próximamente...
                            </div>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}