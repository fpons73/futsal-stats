import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { Users, Plus, X, Search, ChevronRight, Shield, Edit, Upload } from "lucide-react";
import { convertFileSrc } from "@tauri-apps/api/core";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal"; // Usamos el componente arreglado

interface SelectorData { id: number; nombre: string; }
interface Pais { id: number; nombre: string; }

interface Equipo {
    id: number;
    nombre: string;
    escudo_path: string | null;
    categoria: string;
    abreviatura?: string;
    pais_id?: number | null;
    color1?: string;
    color2?: string;
}

export default function InscripcionEquipos() {
    // Datos Generales
    const [temporadas, setTemporadas] = useState<SelectorData[]>([]);
    const [ediciones, setEdiciones] = useState<SelectorData[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    // Selectores
    const [selTemporada, setSelTemporada] = useState("");
    const [selEdicion, setSelEdicion] = useState("");

    // Listas
    const [disponibles, setDisponibles] = useState<Equipo[]>([]);
    const [inscritos, setInscritos] = useState<Equipo[]>([]);
    const [busqueda, setBusqueda] = useState("");

    // MODAL CREAR/EDITAR EQUIPO
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState({
        nombre: "",
        abreviatura: "",
        categoria: "Club",
        pais_id: "",
        escudo: null as string | null,
        color1: "#1F2E5C",
        color2: "#FFFFFF"
    });

    useEffect(() => { cargarTemporadas(); cargarPaises(); }, []);

    useEffect(() => {
        if (selTemporada) cargarEdiciones(selTemporada);
        else setEdiciones([]);
    }, [selTemporada]);

    useEffect(() => {
        if (selEdicion) cargarListas(selEdicion);
        else { setInscritos([]); setDisponibles([]); }
    }, [selEdicion]);

    // --- CARGAS DB ---
    async function cargarPaises() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Pais[]>("SELECT id, nombre FROM Pais ORDER BY nombre ASC");
        setPaises(res);
    }

    async function cargarTemporadas() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<SelectorData[]>("SELECT id, nombre FROM Temporada ORDER BY fecha_inicio DESC");
        setTemporadas(res);
        if (res.length > 0) setSelTemporada(res[0].id.toString());
    }

    async function cargarEdiciones(tempId: string) {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<SelectorData[]>(`
      SELECT e.id, c.nombre || ' (' || t.nombre || ')' as nombre
      FROM Edicion e JOIN Competicion c ON e.competicion_id = c.id JOIN Temporada t ON e.temporada_id = t.id
      WHERE e.temporada_id = $1 ORDER BY c.nombre ASC
    `, [tempId]);
        setEdiciones(res);
        if (res.length > 0) setSelEdicion(res[0].id.toString());
        else setSelEdicion("");
    }

    async function cargarListas(edicionId: string) {
        const db = await Database.load("sqlite:globalfutsal.db");

        // 1. INSCRITOS
        const resInscritos = await db.select<Equipo[]>(`
      SELECT e.* FROM Equipo e
      JOIN Inscripcion i ON e.id = i.equipo_id
      WHERE i.edicion_id = $1 ORDER BY e.nombre ASC
    `, [edicionId]);
        setInscritos(resInscritos);

        // 2. TODOS
        const todos = await db.select<Equipo[]>("SELECT * FROM Equipo ORDER BY nombre ASC");

        // 3. DISPONIBLES
        const idsInscritos = new Set(resInscritos.map(e => e.id));
        setDisponibles(todos.filter(e => !idsInscritos.has(e.id)));
    }

    // --- ACCIONES INSCRIPCIÓN ---
    async function inscribir(equipo: Equipo) {
        if (!selEdicion) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("INSERT INTO Inscripcion (edicion_id, equipo_id) VALUES ($1, $2)", [selEdicion, equipo.id]);
            cargarListas(selEdicion);
        } catch (err) { console.error(err); }
    }

    async function desinscribir(equipoId: number) {
        if (!selEdicion) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Inscripcion WHERE edicion_id = $1 AND equipo_id = $2", [selEdicion, equipoId]);
            cargarListas(selEdicion);
        } catch (err) { console.error(err); }
    }

    // --- ACCIONES CRUD EQUIPO ---
    function abrirCrear() {
        setEditingId(null);
        setForm({ nombre: "", abreviatura: "", categoria: "Club", pais_id: "", escudo: null, color1: "#1F2E5C", color2: "#FFFFFF" });
        setIsModalOpen(true);
    }

    function abrirEditar(e: Equipo) {
        setEditingId(e.id);
        setForm({
            nombre: e.nombre,
            abreviatura: e.abreviatura || "",
            categoria: e.categoria,
            pais_id: e.pais_id?.toString() || "",
            escudo: e.escudo_path,
            color1: e.color1 || "#1F2E5C",
            color2: e.color2 || "#FFFFFF"
        });
        setIsModalOpen(true);
    }

    async function seleccionarEscudo() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });
            if (file) setForm({ ...form, escudo: file as string });
        } catch (err) { console.error(err); }
    }

    async function guardarEquipo() {
        if (!form.nombre) return alert("Nombre obligatorio");
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const paisId = form.pais_id ? parseInt(form.pais_id) : null;

            if (editingId) {
                await db.execute(
                    `UPDATE Equipo SET nombre=$1, abreviatura=$2, pais_id=$3, escudo_path=$4, categoria=$5, color1=$6, color2=$7 WHERE id=$8`,
                    [form.nombre, form.abreviatura, paisId, form.escudo, form.categoria, form.color1, form.color2, editingId]
                );
            } else {
                await db.execute(
                    `INSERT INTO Equipo (nombre, abreviatura, pais_id, escudo_path, categoria, color1, color2) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [form.nombre, form.abreviatura, paisId, form.escudo, form.categoria, form.color1, form.color2]
                );
            }
            setIsModalOpen(false);
            if (selEdicion) cargarListas(selEdicion); // Recargar listas
        } catch (e) { console.error(e); }
    }

    const disponiblesFiltrados = disponibles.filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
                <div className="flex justify-between items-start">
                    <h1 className="text-2xl font-bold text-navy flex items-center gap-3"><Users className="text-orange" /> Inscripción de Equipos</h1>
                    <div className="flex gap-4">
                        <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400">Temporada</label><select value={selTemporada} onChange={e => setSelTemporada(e.target.value)} className="p-2 border rounded-lg bg-gray-50 text-sm w-40 outline-none">{temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
                        <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400">Edición</label><select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="p-2 border rounded-lg bg-gray-50 text-sm w-64 outline-none">{ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                    </div>
                </div>
            </div>

            <div className="flex gap-6 flex-1 h-[calc(100vh-250px)]">

                {/* IZQ: DISPONIBLES */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                    <div className="p-3 border-b flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border">
                            <Search size={16} className="text-gray-400" />
                            <input placeholder="Buscar equipo..." className="bg-transparent outline-none w-full text-sm" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        </div>
                        <button onClick={abrirCrear} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700" title="Crear nuevo equipo"><Plus size={20} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {disponiblesFiltrados.map(eq => (
                            <div key={eq.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center overflow-hidden">
                                        <ImagenLocal path={eq.escudo_path} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="font-medium text-navy text-sm">{eq.nombre}</span>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => abrirEditar(eq)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-white border rounded"><Edit size={14} /></button>
                                    <button onClick={() => inscribir(eq)} className="bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600 p-1.5 rounded-md"><Plus size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center text-gray-300"><ChevronRight size={32} /></div>

                {/* DER: INSCRITOS */}
                <div className="flex-1 bg-blue-50/50 rounded-xl shadow-sm border border-blue-100 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-blue-100 bg-blue-50">
                        <h3 className="font-bold text-blue-800 text-sm uppercase tracking-wide">Inscritos ({inscritos.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {inscritos.map(eq => (
                            <div key={eq.id} className="flex items-center justify-between p-2 bg-white border border-blue-100 rounded-lg shadow-sm group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-white border flex items-center justify-center overflow-hidden">
                                        <ImagenLocal path={eq.escudo_path} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="font-medium text-navy text-sm">{eq.nombre}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => abrirEditar(eq)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 border rounded"><Edit size={14} /></button>
                                    <button onClick={() => desinscribir(eq.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md"><X size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODAL CREAR/EDITAR EQUIPO */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Equipo" : "Nuevo Equipo"}>
                <div className="space-y-4">
                    <div className="flex justify-center mb-4">
                        <div onClick={seleccionarEscudo} className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 hover:border-orange cursor-pointer flex items-center justify-center bg-gray-50 overflow-hidden relative group">
                            <ImagenLocal path={form.escudo} alt="Escudo" className="w-full h-full object-contain p-2" />
                            {!form.escudo && <div className="text-center text-gray-400"><Shield size={20} className="mx-auto" /><span className="text-[10px]">Logo</span></div>}
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2"><label className="block text-xs font-bold text-navy mb-1">Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full p-2 border rounded" /></div>
                        <div><label className="block text-xs font-bold text-navy mb-1">ABR</label><input value={form.abreviatura} onChange={e => setForm({ ...form, abreviatura: e.target.value })} className="w-full p-2 border rounded uppercase text-center" maxLength={3} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">País</label>
                            <select value={form.pais_id} onChange={e => setForm({ ...form, pais_id: e.target.value })} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Colores</label>
                            <div className="flex gap-2">
                                <input type="color" value={form.color1} onChange={e => setForm({ ...form, color1: e.target.value })} className="w-full h-9 p-0 border rounded cursor-pointer" />
                                <input type="color" value={form.color2} onChange={e => setForm({ ...form, color2: e.target.value })} className="w-full h-9 p-0 border rounded cursor-pointer" />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardarEquipo} className="bg-navy text-white px-4 py-2 rounded shadow">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}