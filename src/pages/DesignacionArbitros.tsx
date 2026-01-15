import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { Gavel, Plus, X, Search, ChevronRight, Edit, Upload } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";

interface SelectorData { id: number; nombre: string; }
interface Pais { id: number; nombre: string; }

interface Arbitro {
    id: number;
    nombre: string;
    apellidos: string;
    nombre_deportivo: string;
    foto_path: string | null;
    nacionalidad_principal_id?: number | null;
    fecha_nacimiento?: string;
}

export default function DesignacionArbitros() {
    const [temporadas, setTemporadas] = useState<SelectorData[]>([]);
    const [ediciones, setEdiciones] = useState<SelectorData[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    const [selTemporada, setSelTemporada] = useState("");
    const [selEdicion, setSelEdicion] = useState("");

    const [disponibles, setDisponibles] = useState<Arbitro[]>([]);
    const [asignados, setAsignados] = useState<Arbitro[]>([]);
    const [busqueda, setBusqueda] = useState("");

    // MODAL CREAR/EDITAR
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState({
        nombre: "",
        apellidos: "",
        apodo: "",
        nacimiento: "",
        pais1: "",
        foto: null as string | null
    });

    useEffect(() => { cargarTemporadas(); cargarPaises(); }, []);

    useEffect(() => {
        if (selTemporada) cargarEdiciones(selTemporada);
        else setEdiciones([]);
    }, [selTemporada]);

    useEffect(() => {
        if (selEdicion) cargarListas(selEdicion);
        else { setAsignados([]); setDisponibles([]); }
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

        // 1. ASIGNADOS
        const resAsignados = await db.select<Arbitro[]>(`
      SELECT p.* FROM Persona p
      JOIN Designacion d ON p.id = d.persona_id
      WHERE d.edicion_id = $1 ORDER BY p.nombre_deportivo ASC
    `, [edicionId]);
        setAsignados(resAsignados);

        // 2. TODOS (Rol Arbitro)
        const todos = await db.select<Arbitro[]>(`SELECT * FROM Persona WHERE roles LIKE '%Arbitro%' ORDER BY nombre_deportivo ASC`);

        // 3. DISPONIBLES
        const idsAsignados = new Set(resAsignados.map(a => a.id));
        setDisponibles(todos.filter(a => !idsAsignados.has(a.id)));
    }

    // --- ACCIONES ASIGNACIÓN ---
    async function asignar(arbitro: Arbitro) {
        if (!selEdicion) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("INSERT INTO Designacion (edicion_id, persona_id) VALUES ($1, $2)", [selEdicion, arbitro.id]);
            cargarListas(selEdicion);
        } catch (err) { console.error(err); }
    }

    async function desasignar(arbitroId: number) {
        if (!selEdicion) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Designacion WHERE edicion_id = $1 AND persona_id = $2", [selEdicion, arbitroId]);
            cargarListas(selEdicion);
        } catch (err) { console.error(err); }
    }

    // --- ACCIONES CRUD ARBITRO ---
    function abrirCrear() {
        setEditingId(null);
        setForm({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", foto: null });
        setIsModalOpen(true);
    }

    function abrirEditar(a: Arbitro) {
        setEditingId(a.id);
        setForm({
            nombre: a.nombre,
            apellidos: a.apellidos,
            apodo: a.nombre_deportivo,
            nacimiento: a.fecha_nacimiento || "",
            pais1: a.nacionalidad_principal_id?.toString() || "",
            foto: a.foto_path
        });
        setIsModalOpen(true);
    }

    async function seleccionarFoto() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setForm({ ...form, foto: file as string });
        } catch (err) { console.error(err); }
    }

    async function guardarArbitro() {
        if (!form.nombre || !form.pais1) return alert("Datos incompletos");
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            if (editingId) {
                await db.execute(`
                UPDATE Persona SET nombre=$1, apellidos=$2, nombre_deportivo=$3, fecha_nacimiento=$4, nacionalidad_principal_id=$5, foto_path=$6 
                WHERE id=$7
            `, [form.nombre, form.apellidos, form.apodo, form.nacimiento, form.pais1, form.foto, editingId]);
            } else {
                const rolesJson = JSON.stringify(["Arbitro"]);
                await db.execute(`
                INSERT INTO Persona (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, foto_path, roles)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
            `, [form.nombre, form.apellidos, form.apodo, form.nacimiento, form.pais1, form.foto, rolesJson]);
            }
            setIsModalOpen(false);
            if (selEdicion) cargarListas(selEdicion);
        } catch (e) { console.error(e); }
    }

    const disponiblesFiltrados = disponibles.filter(a => a.nombre_deportivo.toLowerCase().includes(busqueda.toLowerCase()));

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0 flex flex-col">

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
                <div className="flex justify-between items-start">
                    <h1 className="text-2xl font-bold text-navy flex items-center gap-3"><Gavel className="text-yellow-500" /> Designación de Árbitros</h1>
                    <div className="flex gap-4">
                        <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400">Temporada</label><select value={selTemporada} onChange={e => setSelTemporada(e.target.value)} className="p-2 border rounded-lg bg-gray-50 text-sm w-40 outline-none">{temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
                        <div className="flex flex-col"><label className="text-[10px] uppercase font-bold text-gray-400">Edición</label><select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="p-2 border rounded-lg bg-gray-50 text-sm w-64 outline-none">{ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                    </div>
                </div>
            </div>

            <div className="flex gap-6 flex-1 h-[calc(100vh-250px)]">

                {/* IZQ: DISPONIBLES */}
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-lg border">
                            <Search size={18} className="text-gray-400" />
                            <input placeholder="Buscar árbitro..." className="bg-transparent outline-none w-full text-sm" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        </div>
                        <button onClick={abrirCrear} className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700" title="Nuevo Árbitro"><Plus size={20} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {disponiblesFiltrados.map(arb => (
                            <div key={arb.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden relative">
                                        <ImagenLocal path={arb.foto_path} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="font-medium text-navy text-sm">{arb.nombre_deportivo}</span>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => abrirEditar(arb)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-white border rounded"><Edit size={14} /></button>
                                    <button onClick={() => asignar(arb)} className="bg-gray-100 text-gray-400 hover:bg-blue-100 hover:text-blue-600 p-1.5 rounded-md"><Plus size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-center text-gray-300"><ChevronRight size={32} /></div>

                {/* DER: ASIGNADOS */}
                <div className="flex-1 bg-yellow-50 rounded-xl shadow-sm border border-yellow-200 flex flex-col overflow-hidden">
                    <div className="p-4 border-b border-yellow-200 bg-yellow-100/50">
                        <h3 className="font-bold text-yellow-800 text-sm uppercase tracking-wide">Comité Técnico ({asignados.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {asignados.map(arb => (
                            <div key={arb.id} className="flex items-center justify-between p-2 bg-white border border-yellow-100 rounded-lg group">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-gray-100 overflow-hidden relative">
                                        <ImagenLocal path={arb.foto_path} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="font-medium text-navy text-sm">{arb.nombre_deportivo}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => abrirEditar(arb)} className="p-1.5 text-gray-400 hover:text-blue-600 bg-gray-50 border rounded"><Edit size={14} /></button>
                                    <button onClick={() => desasignar(arb.id)} className="text-gray-300 hover:text-red-500 hover:bg-red-50 p-1.5 rounded-md"><X size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODAL ARBITRO */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Árbitro" : "Nuevo Árbitro"}>
                <div className="space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                        <div onClick={seleccionarFoto} className="w-20 h-20 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative">
                            <ImagenLocal path={form.foto} alt="Foto" className="w-full h-full object-contain" />
                            {!form.foto && <Upload size={20} className="text-gray-400" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-navy mb-1">Nombre Deportivo (Auto)</label>
                            <input value={form.apodo} onChange={e => setForm({ ...form, apodo: e.target.value })} className="w-full p-2 border rounded font-bold text-navy bg-gray-50" placeholder="Nombre + Apellidos" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Nombre</label>
                            <input value={form.nombre} onChange={e => {
                                const val = e.target.value; setForm(p => ({ ...p, nombre: val, apodo: `${val} ${p.apellidos}`.trim() }))
                            }} className="w-full p-2 border rounded" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Apellidos</label>
                            <input value={form.apellidos} onChange={e => {
                                const val = e.target.value; setForm(p => ({ ...p, apellidos: val, apodo: `${p.nombre} ${val}`.trim() }))
                            }} className="w-full p-2 border rounded" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">Nacionalidad</label>
                            <select value={form.pais1} onChange={e => setForm({ ...form, pais1: e.target.value })} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-navy mb-1">F. Nacimiento</label>
                            <input type="date" value={form.nacimiento} onChange={e => setForm({ ...form, nacimiento: e.target.value })} className="w-full p-2 border rounded" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardarArbitro} className="bg-navy text-white px-4 py-2 rounded shadow">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}