import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Eye, Filter, Gavel, Upload, X, Calendar } from "lucide-react";
import { toast } from "../components/Toast";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import ImagenLocal from "../components/ImagenLocal";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";
import { normalizeString } from "../utils/stringUtils";

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

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask() nativo).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Persona", cargarDatos);

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
        iniciar({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", pais2: "", foto: null });
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
        iniciar({
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

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro(formData, guardar)) setModalFormOpen(false);
    };

    async function guardar(): Promise<boolean> {
        if (!formData.nombre || !formData.apodo || !formData.pais1) {
            toast.warning("Rellena nombre, apodo y nacionalidad.");
            return false;
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
            return true;
        } catch (error) {
            console.error("Error guardando:", error);
            toast.error("Error al guardar el árbitro");
            return false;
        }
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar árbitro?", titulo: "Confirmar", textoConfirmar: "Sí", textoCancelar: "No", peligroso: true });
        if (confirm) await borrarFila(id);
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
        const busquedaNorm = normalizeString(busqueda);
        const textoNorm = normalizeString(a.nombre_deportivo + a.nombre + a.apellidos);
        const matchTexto = textoNorm.includes(busquedaNorm);
        const matchPais = filtroPais === "todos" || a.nacionalidad_principal_id?.toString() === filtroPais;
        return matchTexto && matchPais;
    });    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <Gavel className="text-orange text-glow-orange animate-pulse" /> Árbitros
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">{arbitros.length} colegiados registrados en el sistema</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nuevo</span>
                </button>
            </div>

            {/* FILTROS */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                    <Search className="text-silver/40" size={18} />
                    <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar árbitro..." className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm" />
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
                            <th className="p-4 w-16 text-center">Foto</th>
                            <th className="p-4">Nombre Deportivo</th>
                            <th className="p-4 text-center">Nacionalidad</th>
                            <th className="p-4 w-20 text-center">Edad</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-silver/80">
                        {arbitrosFiltrados.map((a) => {
                            let nac2Id = null;
                            try { nac2Id = JSON.parse(a.nacionalidades_secundarias)[0]; } catch { }

                            return (
                                <tr key={a.id} className="hover:bg-white/5 transition-colors group duration-200">
                                    <td className="p-3 text-center">
                                        <div className="w-10 h-10 rounded-full bg-navy border border-white/10 overflow-hidden mx-auto flex items-center justify-center shadow-inner">
                                            <ImagenLocal path={a.foto_path} alt={a.nombre_deportivo} className="w-full h-full object-cover" />
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-white group-hover:text-orange transition-colors">{a.nombre_deportivo}</div>
                                        <div className="text-xs text-silver/40 font-medium">{a.nombre} {a.apellidos}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1.5">
                                            {getBandera(a.nacionalidad_principal_id) && <img src={getBandera(a.nacionalidad_principal_id)!} className="w-6 h-4 border border-white/10 shadow-sm rounded-sm" />}
                                            {getBandera(nac2Id) && <img src={getBandera(nac2Id)!} className="w-6 h-4 border border-white/10 shadow-sm opacity-80 rounded-sm" />}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center font-display font-bold text-sm text-white">
                                        {calcularEdad(a.fecha_nacimiento)}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                        <button onClick={() => abrirFicha(a)} className="p-1.5 text-success hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Eye size={16} /></button>
                                        <button onClick={() => abrirEditar(a)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                        <button onClick={() => borrar(a.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {arbitrosFiltrados.length === 0 && <div className="p-12 text-center text-silver/30 font-semibold">No se encontraron árbitros registrados.</div>}
            </div>

            {/* --- MODAL FORMULARIO --- */}
            <Modal isOpen={modalFormOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Árbitro" : "Nuevo Árbitro"}>
                <div className="space-y-4 text-white">

                    <div className="flex items-center gap-4 mb-4">
                        <div onClick={seleccionarFoto} className="w-20 h-20 rounded-full bg-navy border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative shadow-inner shrink-0">
                            <ImagenLocal path={formData.foto} alt="Foto" className="w-full h-full object-cover" />
                            {!formData.foto && <Upload size={20} className="text-silver/40" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Nombre Deportivo (Automático)</label>
                            <input
                                value={formData.apodo}
                                onChange={e => setFormData({ ...formData, apodo: e.target.value })}
                                className="w-full p-2.5 border border-white/10 rounded-lg font-bold text-white bg-navy outline-none focus:ring-1 focus:ring-orange"
                                placeholder="Nombre + Apellidos"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Nombre</label>
                            <input
                                value={formData.nombre}
                                onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => ({
                                        ...prev,
                                        nombre: val,
                                        apodo: `${val} ${prev.apellidos}`.trim()
                                    }));
                                }}
                                className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white focus:ring-1 focus:ring-orange outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Apellidos</label>
                            <input
                                value={formData.apellidos}
                                onChange={e => {
                                    const val = e.target.value;
                                    setFormData(prev => ({
                                        ...prev,
                                        apellidos: val,
                                        apodo: `${prev.nombre} ${val}`.trim()
                                    }));
                                }}
                                className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white focus:ring-1 focus:ring-orange outline-none"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">1ª Nacionalidad</label>
                            <select value={formData.pais1} onChange={e => setFormData({ ...formData, pais1: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">2ª Nacionalidad</label>
                            <select value={formData.pais2} onChange={e => setFormData({ ...formData, pais2: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none">
                                <option value="">Ninguna</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Fecha Nacimiento</label>
                        <input type="date" value={formData.nacimiento} onChange={e => setFormData({ ...formData, nacimiento: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none" />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">Cancelar</button>
                        <button onClick={guardar} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* --- FICHA TÉCNICA ÁRBITRO --- */}
            {modalViewOpen && selectedRef && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#050f1e]/90 backdrop-blur-xl w-full max-w-2xl rounded-2xl shadow-glass overflow-hidden border border-white/10">
                        <div className="relative p-8 flex items-center gap-6 border-b border-white/5 bg-gradient-to-r from-[#050f1e] to-[#0D1E36]">
                            <button onClick={() => setModalViewOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white p-1.5 rounded-full hover:bg-white/10 transition-colors"><X size={20} /></button>
                            <div className="w-24 h-24 rounded-full border-4 border-white/10 shadow-2xl overflow-hidden bg-white/5 flex-shrink-0">
                                <ImagenLocal path={selectedRef.foto_path} alt={selectedRef.nombre_deportivo} className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-display font-extrabold text-white mb-1 text-glow-orange">{selectedRef.nombre_deportivo}</h2>
                                <span className="bg-orange text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider mb-2.5 inline-block shadow-md">Árbitro</span>
                                <p className="text-silver/50 text-sm mb-3 font-semibold">{selectedRef.nombre} {selectedRef.apellidos}</p>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/5">
                                        {getBandera(selectedRef.nacionalidad_principal_id) && <img src={getBandera(selectedRef.nacionalidad_principal_id)!} className="w-5 h-3.5 rounded-sm" />}
                                        <span className="text-[10px] text-white font-bold uppercase tracking-wider">{getNombrePais(selectedRef.nacionalidad_principal_id)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/5 px-3 py-1 rounded-full border border-white/5 text-silver/70">
                                        <Calendar size={14} className="text-orange animate-pulse" />
                                        <span className="text-[10px] text-white font-bold">{selectedRef.fecha_nacimiento}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Historial (Mockup) */}
                        <div className="p-6 bg-transparent">
                            <h4 className="text-[10px] font-black text-silver/40 uppercase tracking-widest mb-4 flex items-center gap-2">Historial de Arbitraje</h4>
                            <div className="bg-white/5 rounded-xl p-6 border border-white/5 text-center text-silver/30 text-xs font-semibold">
                                Partidos arbitrados próximamente...
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
            {/* Diálogo de confirmación destructiva */}
            {dialogoConfirmar}
            <UndoToast
                pendiente={filaBorrada}
                onUndo={deshacer}
                onDescartar={limpiarBorrado}
                mensaje={(f) => `Árbitro ${f.nombre_deportivo || f.nombre} eliminado`}
            />
        </div>
    );
}