import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { Users, Plus, X, Search, ChevronRight, Shield, Edit } from "lucide-react";
import { toast } from "../components/Toast";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal"; // Usamos el componente arreglado
import { useFormGuard } from "../hooks/useFormGuard";

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

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();

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

        // 1. INSCRITOS
        const resInscritos = await db.select<Equipo[]>(`
      SELECT e.*, i.grupo FROM Equipo e
      JOIN Inscripcion i ON e.id = i.equipo_id
      WHERE i.edicion_id = $1 ORDER BY i.grupo ASC, e.nombre ASC
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

    async function actualizarGrupo(equipoId: number, grupo: string) {
        if (!selEdicion) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("UPDATE Inscripcion SET grupo = $1 WHERE edicion_id = $2 AND equipo_id = $3", [grupo, selEdicion, equipoId]);

            // Actualización optimista en el estado
            setInscritos(prev => prev.map(eq => eq.id === equipoId ? { ...eq, grupo } : eq));
        } catch (err) { console.error(err); }
    }

    // --- ACCIONES CRUD EQUIPO ---
    function abrirCrear() {
        setEditingId(null);
        const inicial = { nombre: "", abreviatura: "", categoria: "Club", pais_id: "", escudo: null, color1: "#1F2E5C", color2: "#FFFFFF" };
        setForm(inicial);
        iniciar(inicial);
        setIsModalOpen(true);
    }

    function abrirEditar(e: Equipo) {
        setEditingId(e.id);
        const inicial = {
            nombre: e.nombre,
            abreviatura: e.abreviatura || "",
            categoria: e.categoria,
            pais_id: e.pais_id?.toString() || "",
            escudo: e.escudo_path,
            color1: e.color1 || "#1F2E5C",
            color2: e.color2 || "#FFFFFF"
        };
        setForm(inicial);
        iniciar(inicial);
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

    async function guardarEquipo(): Promise<boolean> {
        if (!form.nombre) { toast.warning("Nombre obligatorio"); return false; }
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
            return true;
        } catch (e) {
            console.error(e);
            toast.error("Error al guardar el equipo");
            return false;
        }
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro(form, guardarEquipo)) setIsModalOpen(false);
    };

    const disponiblesFiltrados = disponibles.filter(e => e.nombre.toLowerCase().includes(busqueda.toLowerCase()));

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-6 shadow-2xl">
                <div className="flex justify-between items-start flex-wrap gap-4">
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><Users className="text-orange text-glow-orange animate-pulse" /> Inscripción de Equipos</h1>
                    <div className="flex gap-4">
                        <div className="flex flex-col"><label className="text-[9px] uppercase font-black tracking-wider text-silver/40 mb-1">Temporada</label><select value={selTemporada} onChange={e => setSelTemporada(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm w-44 outline-none text-white cursor-pointer font-bold">{temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
                        <div className="flex flex-col"><label className="text-[9px] uppercase font-black tracking-wider text-silver/40 mb-1">Edición</label><select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm w-64 outline-none text-white cursor-pointer font-bold">{ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                    </div>
                </div>
            </div>

            <div className="flex gap-6 flex-1 h-[calc(100vh-260px)]">

                {/* IZQ: DISPONIBLES */}
                <div className="flex-1 glass-panel rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-xl">
                    <div className="p-3.5 border-b border-white/5 bg-navy-dark/45 flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                            <Search size={16} className="text-silver/40" />
                            <input placeholder="Buscar equipo..." className="bg-transparent outline-none w-full text-sm text-white placeholder-silver/40" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        </div>
                        <button onClick={abrirCrear} className="bg-orange text-white p-2.5 rounded-xl hover:bg-orange-hover transition-colors shadow-md flex items-center justify-center" title="Crear nuevo equipo"><Plus size={20} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {disponiblesFiltrados.map(eq => (
                            <div key={eq.id} className="flex items-center justify-between p-2.5 bg-navy-dark/35 border border-white/5 rounded-xl hover:bg-white/5 transition-all duration-300 group">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-xl bg-white border border-white/10 shadow-sm flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                                        <ImagenLocal path={eq.escudo_path} alt="" className="w-full h-full object-contain" />
                                    </div>
                                    <span className="font-semibold text-white group-hover:text-orange transition-colors duration-200 text-sm">{eq.nombre}</span>
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                    <button onClick={() => abrirEditar(eq)} className="p-1.5 text-silver/60 hover:text-orange bg-navy border border-white/5 rounded-lg transition-colors"><Edit size={14} /></button>
                                    <button onClick={() => inscribir(eq)} className="bg-white/5 text-silver/50 hover:bg-white/10 hover:text-white p-1.5 border border-white/5 rounded-lg transition-colors"><Plus size={16} /></button>
                                </div>
                            </div>
                        ))}
                        {disponiblesFiltrados.length === 0 && <div className="text-center py-12 text-silver/30 font-semibold">No se encontraron equipos disponibles.</div>}
                    </div>
                </div>

                <div className="flex items-center text-silver/20"><ChevronRight size={32} /></div>

                {/* DER: INSCRITOS */}
                <div className="flex-1 bg-accent-blue/10 border border-accent-blue/20 rounded-2xl flex flex-col overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-accent-blue/15 bg-accent-blue/15 flex justify-between items-center">
                        <h3 className="font-display font-black text-accent-blue text-glow-blue text-xs uppercase tracking-wider">Equipos Inscritos ({inscritos.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {inscritos.map(eq => (
                            <div key={eq.id} className="flex flex-col p-3 bg-navy-dark/45 border border-white/5 rounded-xl shadow-md group hover:bg-white/5 transition-all duration-300 gap-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-xl bg-white border border-white/10 shadow-sm flex items-center justify-center overflow-hidden shrink-0 p-0.5">
                                            <ImagenLocal path={eq.escudo_path} alt="" className="w-full h-full object-contain" />
                                        </div>
                                        <span className="font-bold text-white text-sm">{eq.nombre}</span>
                                    </div>
                                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <button onClick={() => abrirEditar(eq)} className="p-1.5 text-silver/60 hover:text-orange bg-navy border border-white/5 rounded-lg transition-colors"><Edit size={14} /></button>
                                        <button onClick={() => desinscribir(eq.id)} className="text-silver/40 hover:text-red p-1.5 hover:bg-red/10 rounded-lg transition-colors"><X size={16} /></button>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 pl-12 border-t border-white/5 pt-2">
                                    <label className="text-[9px] uppercase font-black text-silver/40 tracking-wider">Grupo:</label>
                                    <input
                                        type="text"
                                        placeholder="A, B, C..."
                                        className="text-xs font-bold text-accent-blue bg-navy border border-white/10 px-2 py-1 rounded-lg w-18 outline-none focus:ring-1 focus:ring-accent-blue text-center"
                                        value={(eq as any).grupo || ""}
                                        onChange={(e) => actualizarGrupo(eq.id, e.target.value)}
                                    />
                                </div>
                            </div>
                        ))}
                        {inscritos.length === 0 && <div className="text-center py-12 text-silver/30 font-semibold">No hay equipos inscritos en esta edición.</div>}
                    </div>
                </div>
            </div>

            {/* MODAL CREAR/EDITAR EQUIPO */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Equipo" : "Nuevo Equipo"}>
                <div className="space-y-4 text-white">
                    <div className="flex justify-center mb-4">
                        <div onClick={seleccionarEscudo} className="w-20 h-20 rounded-2xl border-2 border-dashed border-white/10 hover:border-orange cursor-pointer flex items-center justify-center bg-white overflow-hidden relative group shadow-md">
                            <ImagenLocal path={form.escudo} alt="Escudo" className="w-full h-full object-contain p-2 filter drop-shadow-sm" />
                            {!form.escudo && <div className="text-center text-silver/40"><Shield size={20} className="mx-auto" /><span className="text-[10px]">Logo</span></div>}
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <Plus size={20} />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-2"><label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Nombre</label><input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white focus:ring-1 focus:ring-orange outline-none" /></div>
                        <div><label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">ABR</label><input value={form.abreviatura} onChange={e => setForm({ ...form, abreviatura: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm font-bold text-white text-center focus:ring-1 focus:ring-orange outline-none uppercase" maxLength={3} /></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">País</label>
                            <select value={form.pais_id} onChange={e => setForm({ ...form, pais_id: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Colores Corporativos</label>
                            <div className="flex gap-2">
                                <input type="color" value={form.color1} onChange={e => setForm({ ...form, color1: e.target.value })} className="w-full h-10 p-0 border border-white/10 rounded-lg cursor-pointer bg-transparent" />
                                <input type="color" value={form.color2} onChange={e => setForm({ ...form, color2: e.target.value })} className="w-full h-10 p-0 border border-white/10 rounded-lg cursor-pointer bg-transparent" />
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">Cancelar</button>
                        <button onClick={guardarEquipo} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
        </div>
    );
}