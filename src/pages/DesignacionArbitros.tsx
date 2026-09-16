import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { Gavel, Plus, X, Search, ChevronRight, Edit, Upload } from "lucide-react";
import { toast } from "../components/Toast";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";
import { useFormGuard } from "../hooks/useFormGuard";

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

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();

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
      SELECT e.id, c.nombre || ' (' || t.nombre || ')' || COALESCE(' - ' || e.nombre, '') as nombre
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
        const inicial = { nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", foto: null };
        setForm(inicial);
        iniciar(inicial);
        setIsModalOpen(true);
    }

    function abrirEditar(a: Arbitro) {
        setEditingId(a.id);
        const inicial = {
            nombre: a.nombre,
            apellidos: a.apellidos,
            apodo: a.nombre_deportivo,
            nacimiento: a.fecha_nacimiento || "",
            pais1: a.nacionalidad_principal_id?.toString() || "",
            foto: a.foto_path
        };
        setForm(inicial);
        iniciar(inicial);
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

    async function guardarArbitro(): Promise<boolean> {
        if (!form.nombre || !form.pais1) { toast.warning("Datos incompletos"); return false; }
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
            return true;
        } catch (e) {
            console.error(e);
            toast.error("Error al guardar el árbitro");
            return false;
        }
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro(form, guardarArbitro)) setIsModalOpen(false);
    };

    const disponiblesFiltrados = disponibles.filter(a => a.nombre_deportivo.toLowerCase().includes(busqueda.toLowerCase()));

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-6 shadow-2xl">
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><Gavel className="text-orange text-glow-orange animate-pulse" /> Designación de Árbitros</h1>
                        <p className="text-silver/50 text-sm mt-1">Asigna colegiados a las diferentes ediciones y competiciones</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase font-black tracking-wider text-silver/40 mb-1">Temporada</label>
                            <select value={selTemporada} onChange={e => setSelTemporada(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold w-40">
                                {temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                            </select>
                        </div>
                        <div className="flex flex-col">
                            <label className="text-[10px] uppercase font-black tracking-wider text-silver/40 mb-1">Edición</label>
                            <select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold w-64">
                                {ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex gap-6 flex-1 h-[calc(100vh-250px)]">

                {/* IZQ: DISPONIBLES */}
                <div className="flex-1 glass-panel rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-2xl">
                    <div className="p-4 border-b border-white/5 flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                            <Search size={18} className="text-silver/40" />
                            <input placeholder="Buscar árbitro..." className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        </div>
                        <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white p-2.5 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]" title="Nuevo Árbitro"><Plus size={20} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {disponiblesFiltrados.map(arb => (
                            <div key={arb.id} className="flex items-center justify-between p-2 hover:bg-white/5 rounded-xl group transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-navy border border-white/10 overflow-hidden relative shadow-inner flex items-center justify-center">
                                        <ImagenLocal path={arb.foto_path} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="font-bold text-white group-hover:text-orange transition-colors text-sm">{arb.nombre_deportivo}</span>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => abrirEditar(arb)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={14} /></button>
                                    <button onClick={() => asignar(arb)} className="bg-navy border border-white/5 text-success hover:bg-white/5 p-1.5 rounded-lg transition-colors"><Plus size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex items-center justify-center text-silver/20"><ChevronRight size={32} /></div>

                {/* DER: ASIGNADOS */}
                <div className="flex-1 glass-panel rounded-2xl border border-orange/10 flex flex-col overflow-hidden shadow-2xl bg-orange/5">
                    <div className="p-4 border-b border-orange/10 bg-orange/10">
                        <h3 className="font-display font-black text-orange text-xs uppercase tracking-widest text-glow-orange flex items-center gap-2">Comité Técnico Asignado ({asignados.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {asignados.map(arb => (
                            <div key={arb.id} className="flex items-center justify-between p-2 bg-navy border border-white/5 rounded-xl group hover:border-orange/20 transition-all duration-200">
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-navy border border-white/10 overflow-hidden relative shadow-inner flex items-center justify-center">
                                        <ImagenLocal path={arb.foto_path} alt="" className="w-full h-full object-cover" />
                                    </div>
                                    <span className="font-bold text-white group-hover:text-orange transition-colors text-sm">{arb.nombre_deportivo}</span>
                                </div>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <button onClick={() => abrirEditar(arb)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={14} /></button>
                                    <button onClick={() => desasignar(arb.id)} className="text-red hover:bg-red/10 p-1.5 rounded-lg transition-colors"><X size={16} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* MODAL ARBITRO */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Árbitro" : "Nuevo Árbitro"}>
                <div className="space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                        <div onClick={seleccionarFoto} className="w-20 h-20 rounded-full bg-navy-dark border border-white/10 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative shadow-inner">
                            <ImagenLocal path={form.foto} alt="Foto" className="w-full h-full object-cover" />
                            {!form.foto && <Upload size={20} className="text-silver/40" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Deportivo (Auto)</label>
                            <input value={form.apodo} onChange={e => setForm({ ...form, apodo: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl font-bold text-white outline-none focus:border-orange transition-colors" placeholder="Nombre + Apellidos" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                            <input value={form.nombre} onChange={e => {
                                const val = e.target.value; setForm(p => ({ ...p, nombre: val, apodo: `${val} ${p.apellidos}`.trim() }))
                            }} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Apellidos</label>
                            <input value={form.apellidos} onChange={e => {
                                const val = e.target.value; setForm(p => ({ ...p, apellidos: val, apodo: `${p.nombre} ${val}`.trim() }))
                            }} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nacionalidad</label>
                            <select value={form.pais1} onChange={e => setForm({ ...form, pais1: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">F. Nacimiento</label>
                            <input type="date" value={form.nacimiento} onChange={e => setForm({ ...form, nacimiento: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardarArbitro} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
        </div>
    );
}