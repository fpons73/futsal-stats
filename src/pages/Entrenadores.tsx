import { useState, useEffect, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Eye, Filter, UserCog, Upload, X, Calendar, AlertTriangle, Trophy } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
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

interface Entrenador {
    id: number;
    nombre: string;
    apellidos: string;
    nombre_deportivo: string;
    fecha_nacimiento: string;
    nacionalidad_principal_id: number | null;
    nacionalidades_secundarias: string;
    foto_path: string | null;
    roles: string;
    /** Datos extra del CSV de origen: { equipo_actual, titulos } */
    meta: string | null;
}

interface EquipoBasico {
    id: number;
    nombre: string;
    escudo_path: string | null;
}

export default function Entrenadores() {
    const [entrenadores, setEntrenadores] = useState<Entrenador[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);
    const [equipos, setEquipos] = useState<EquipoBasico[]>([]);

    // Filtros. La búsqueda pasa por un debounce de 200ms: recalcula el
    // índice en cada tecla congela la escritura.
    const [busquedaInput, setBusquedaInput] = useState("");
    const [busqueda, setBusqueda] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setBusqueda(busquedaInput), 200);
        return () => clearTimeout(t);
    }, [busquedaInput]);
    const [filtroPais, setFiltroPais] = useState("todos");

    // Paginación de render: miles de filas con imágenes congelarían la pestaña.
    const POR_PAGINA = 100;
    const [pagina, setPagina] = useState(1);

    // Modales
    const [modalFormOpen, setModalFormOpen] = useState(false);
    const [modalViewOpen, setModalViewOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [selectedCoach, setSelectedCoach] = useState<Entrenador | null>(null);

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

            // Equipos (con escudo) para enriquecer la ficha con el equipo actual
            const resEq = await db.select<EquipoBasico[]>("SELECT id, nombre, escudo_path FROM Equipo");
            setEquipos(resEq);

            // FILTRAMOS POR ROL 'Entrenador'
            const resEnt = await db.select<Entrenador[]>(`SELECT * FROM Persona WHERE roles LIKE '%Entrenador%' ORDER BY nombre_deportivo ASC`);
            setEntrenadores(resEnt);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar los entrenadores");
        }
    }

    async function seleccionarFoto() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setFormData({ ...formData, foto: file as string });
        } catch (err) {
            console.error(err);
            toast.error("No se pudo abrir el selector de archivos");
        }
    }

    function abrirCrear() {
        setEditingId(null);
        setFormData({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", pais2: "", foto: null });
        iniciar({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", pais2: "", foto: null });
        setModalFormOpen(true);
    }

    function abrirEditar(e: Entrenador) {
        setEditingId(e.id);
        let nac2 = "";
        try {
            const parsed = JSON.parse(e.nacionalidades_secundarias || "[]");
            if (Array.isArray(parsed) && parsed.length > 0) nac2 = parsed[0];
        } catch { nac2 = e.nacionalidades_secundarias || ""; }

        setFormData({
            nombre: e.nombre,
            apellidos: e.apellidos,
            apodo: e.nombre_deportivo,
            nacimiento: e.fecha_nacimiento,
            pais1: e.nacionalidad_principal_id?.toString() || "",
            pais2: nac2,
            foto: e.foto_path
        });
        iniciar({
            nombre: e.nombre,
            apellidos: e.apellidos,
            apodo: e.nombre_deportivo,
            nacimiento: e.fecha_nacimiento,
            pais1: e.nacionalidad_principal_id?.toString() || "",
            pais2: nac2,
            foto: e.foto_path
        });
        setModalFormOpen(true);
    }

    function abrirFicha(e: Entrenador) {
        setSelectedCoach(e);
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

            // AQUÍ ESTÁ LA CLAVE: ROL ENTRENADOR
            const roles = "Entrenador";

            if (editingId) {
                await db.execute(`
                UPDATE Persona SET 
                nombre=$1, apellidos=$2, nombre_deportivo=$3, fecha_nacimiento=$4, 
                nacionalidad_principal_id=$5, nacionalidades_secundarias=$6, 
                foto_path=$7 
                WHERE id=$8
            `, [formData.nombre, formData.apellidos, formData.apodo, formData.nacimiento, formData.pais1, nac2Json, formData.foto, editingId]);
            } else {
                // Pasamos NULL a las posiciones porque es entrenador
                await db.execute(`
                INSERT INTO Persona 
                (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, nacionalidades_secundarias, foto_path, roles, posicion_principal, posiciones_secundarias)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NULL, NULL)
            `, [formData.nombre, formData.apellidos, formData.apodo, formData.nacimiento, formData.pais1, nac2Json, formData.foto, roles]);
            }
            setModalFormOpen(false);
            cargarDatos();
            return true;
        } catch (error) {
            console.error("Error guardando:", error);
            toast.error("Error al guardar el entrenador");
            return false;
        }
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar entrenador?", titulo: "Confirmar", textoConfirmar: "Sí", textoCancelar: "No", peligroso: true });
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

    /** Meta JSON del CSV: { equipo_actual?, titulos? }. */
    function getMetaEntrenador(e: Entrenador | null): { equipo_actual?: string; titulos?: number } | null {
        if (!e?.meta) return null;
        try {
            const parsed = JSON.parse(e.meta);
            return parsed && typeof parsed === "object" ? parsed : null;
        } catch { return null; }
    }

    const equiposPorNombre = useMemo(
        () => new Map(equipos.map(q => [normalizeString(q.nombre), q])),
        [equipos]
    );

    /** Equipo de la BD cuyo nombre coincide (sin acentos) con el del CSV. */
    function getEquipoPorNombre(nombre: string): EquipoBasico | null {
        return equiposPorNombre.get(normalizeString(nombre)) ?? null;
    }

    // Entrenadores importados sin nacionalidad (el CSV de origen no traía país):
    // filtro propio para poder repararlos manualmente desde aquí.
    const totalSinNacionalidad = useMemo(
        () => entrenadores.filter(e => !e.nacionalidad_principal_id).length,
        [entrenadores]
    );

    // Índice de texto normalizado: una sola vez por carga de datos (no por tecla).
    const indiceBusqueda = useMemo(() => {
        const mapa = new Map<number, string>();
        for (const e of entrenadores) mapa.set(e.id, normalizeString(e.nombre_deportivo + " " + e.nombre + " " + e.apellidos));
        return mapa;
    }, [entrenadores]);

    const entrenadoresFiltrados = useMemo(() => {
        const busquedaNorm = normalizeString(busqueda);
        return entrenadores.filter(e => {
            if (busquedaNorm && !(indiceBusqueda.get(e.id)?.includes(busquedaNorm))) return false;
            if (filtroPais === "sin") {
                if (e.nacionalidad_principal_id) return false;
            } else if (filtroPais !== "todos" && e.nacionalidad_principal_id?.toString() !== filtroPais) {
                return false;
            }
            return true;
        });
    }, [entrenadores, indiceBusqueda, busqueda, filtroPais]);

    // Ventana visible + reset a la primera página cuando cambian los filtros.
    const totalPaginas = Math.max(1, Math.ceil(entrenadoresFiltrados.length / POR_PAGINA));
    const paginaActual = Math.min(pagina, totalPaginas);
    const entrenadoresVisibles = useMemo(
        () => entrenadoresFiltrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA),
        [entrenadoresFiltrados, paginaActual]
    );
    useEffect(() => {
        setPagina(1);
    }, [busqueda, filtroPais]);

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <UserCog className="text-orange text-glow-orange animate-pulse" /> Entrenadores
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">{entrenadores.length.toLocaleString("es-ES")} técnicos registrados en el sistema</p>
                    {totalSinNacionalidad > 0 && (
                        <button
                            onClick={() => setFiltroPais("sin")}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors"
                            title="Entrenadores importados sin nacionalidad en el CSV de origen. Clic para filtrarlos."
                        >
                            <AlertTriangle size={12} />
                            {totalSinNacionalidad.toLocaleString("es-ES")} sin nacionalidad — revisar
                        </button>
                    )}
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nuevo</span>
                </button>
            </div>

            {/* FILTROS */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px] flex items-center gap-3 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                    <Search className="text-silver/40" size={18} />
                    <input value={busquedaInput} onChange={e => setBusquedaInput(e.target.value)} placeholder="Buscar entrenador..." className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm" />
                </div>
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-silver/40" />
                    <select value={filtroPais} onChange={e => setFiltroPais(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold">
                        <option value="todos">Todos los Países</option>
                        {totalSinNacionalidad > 0 && (
                            <option value="sin">⚠ Sin nacionalidad — {totalSinNacionalidad.toLocaleString("es-ES")}</option>
                        )}
                        {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                    </select>
                </div>
            </div>

            {filtroPais === "sin" && (
                <div className="glass-panel p-4 rounded-xl border border-warning/30 mb-6 flex items-center gap-3 bg-warning/5">
                    <AlertTriangle size={20} className="text-warning shrink-0" />
                    <p className="text-sm text-silver/70">
                        Mostrando los <strong className="text-warning">{entrenadoresFiltrados.length.toLocaleString("es-ES")} entrenadores sin nacionalidad conocida</strong>: el CSV de origen no traía país para ellos.
                        Edita cada ficha para asignar su nacionalidad real.
                    </p>
                    <button onClick={() => setFiltroPais("todos")} className="ml-auto text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl bg-navy-light text-silver hover:text-white border border-white/10 transition-colors">Quitar filtro</button>
                </div>
            )}

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
                        {entrenadoresVisibles.map((e) => {
                            let nac2Id = null;
                            try { nac2Id = JSON.parse(e.nacionalidades_secundarias)[0]; } catch { }

                            return (
                                <tr key={e.id} className="hover:bg-white/5 transition-colors group duration-200">
                                    <td className="p-3 text-center">
                                        <div className="w-10 h-10 rounded-full bg-navy border border-white/10 overflow-hidden mx-auto flex items-center justify-center shadow-inner">
                                            <ImagenLocal path={e.foto_path} alt={e.nombre_deportivo} className="w-full h-full object-cover" />
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-white group-hover:text-orange transition-colors">{e.nombre_deportivo}</div>
                                        <div className="text-xs text-silver/40 font-medium">{e.nombre} {e.apellidos}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1.5">
                                            {e.nacionalidad_principal_id ? (
                                                <>
                                                    {getBandera(e.nacionalidad_principal_id) && <img src={getBandera(e.nacionalidad_principal_id)!} className="w-6 h-4 border border-white/10 shadow-sm rounded-sm" />}
                                                    {getBandera(nac2Id) && <img src={getBandera(nac2Id)!} className="w-6 h-4 border border-white/10 shadow-sm opacity-80 rounded-sm" />}
                                                </>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-warning" title="Sin nacionalidad conocida: edítala y asigna el país real">
                                                    <AlertTriangle size={11} /> Sin nac.
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center font-display font-bold text-sm text-white">
                                        {calcularEdad(e.fecha_nacimiento)}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                        <button onClick={() => abrirFicha(e)} className="p-1.5 text-success hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Eye size={16} /></button>
                                        <button onClick={() => abrirEditar(e)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                        <button onClick={() => borrar(e.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {entrenadoresFiltrados.length === 0 && (entrenadores.length === 0 ? (
                    <EstadoVacio
                        icono={UserCog}
                        titulo="Aún no hay entrenadores"
                        descripcion="Importa la enciclopedia de entrenadores desde un CSV o crea el primero a mano."
                        acciones={[
                            { texto: "Importar CSV", a: "/importar", primario: true },
                            { texto: "Crear entrenador", onClick: abrirCrear },
                        ]}
                    />
                ) : (
                    <EstadoVacio
                        icono={Search}
                        titulo="Ningún entrenador coincide"
                        descripcion="Prueba con otro nombre o quita los filtros de país."
                        porFiltros
                        acciones={[{ texto: "Limpiar búsqueda", onClick: () => { setBusqueda(""); setBusquedaInput(""); setFiltroPais("todos"); } }]}
                    />
                ))}

                {/* PAGINACIÓN */}
                {entrenadoresFiltrados.length > POR_PAGINA && (
                    <div className="flex items-center justify-between p-4 border-t border-white/5 text-sm">
                        <span className="text-silver/50 font-medium">
                            Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, entrenadoresFiltrados.length).toLocaleString("es-ES")} de {entrenadoresFiltrados.length.toLocaleString("es-ES")} entrenadores
                        </span>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setPagina(p => Math.max(1, p - 1))}
                                disabled={paginaActual <= 1}
                                className="px-4 py-1.5 rounded-lg bg-navy border border-white/5 font-bold text-silver/80 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                ← Anterior
                            </button>
                            <span className="font-display font-black text-orange text-glow-orange px-2">
                                {paginaActual} / {totalPaginas.toLocaleString("es-ES")}
                            </span>
                            <button
                                onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
                                disabled={paginaActual >= totalPaginas}
                                className="px-4 py-1.5 rounded-lg bg-navy border border-white/5 font-bold text-silver/80 hover:text-white hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                                Siguiente →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- MODAL FORMULARIO --- */}
            <Modal isOpen={modalFormOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Entrenador" : "Nuevo Entrenador"}>
                <div className="space-y-4">

                    <div className="flex items-center gap-4 mb-4">
                        <div onClick={seleccionarFoto} className="w-20 h-20 rounded-full bg-navy-dark border border-white/10 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative shadow-inner">
                            <ImagenLocal path={formData.foto} alt="Foto" className="w-full h-full object-cover" />
                            {!formData.foto && <Upload size={20} className="text-silver/40" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Deportivo</label>
                            <input value={formData.apodo} onChange={e => setFormData({ ...formData, apodo: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl font-bold text-white outline-none focus:border-orange transition-colors" placeholder="Ej: Jesús Velasco" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                            <input value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Apellidos</label>
                            <input value={formData.apellidos} onChange={e => setFormData({ ...formData, apellidos: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors" />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">1ª Nacionalidad</label>
                            <select value={formData.pais1} onChange={e => setFormData({ ...formData, pais1: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">2ª Nacionalidad</label>
                            <select value={formData.pais2} onChange={e => setFormData({ ...formData, pais2: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">Ninguna</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Fecha Nacimiento</label>
                        <input type="date" value={formData.nacimiento} onChange={e => setFormData({ ...formData, nacimiento: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors" />
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* --- FICHA TÉCNICA ENTRENADOR --- */}
            {modalViewOpen && selectedCoach && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#0B1F3B] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/10">
                        <div className="relative p-8 flex items-center gap-6 border-b border-white/10 bg-gradient-to-r from-[#0B1F3B] to-[#16294a]">
                            <button onClick={() => setModalViewOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"><X size={24} /></button>
                            <div className="w-24 h-24 rounded-full border-4 border-white/20 shadow-xl overflow-hidden bg-white/5 flex-shrink-0">
                                <ImagenLocal path={selectedCoach.foto_path} alt={selectedCoach.nombre_deportivo} className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-1">{selectedCoach.nombre_deportivo}</h2>
                                <span className="bg-orange text-white text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider mb-2 inline-block shadow-neon-orange">Entrenador</span>
                                <p className="text-white/60 text-sm mb-3">{selectedCoach.nombre} {selectedCoach.apellidos}</p>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                        {getBandera(selectedCoach.nacionalidad_principal_id) && <img src={getBandera(selectedCoach.nacionalidad_principal_id)!} className="w-5 h-3.5" />}
                                        <span className="text-xs text-white font-medium uppercase tracking-wide">{getNombrePais(selectedCoach.nacionalidad_principal_id)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                        <Calendar size={14} className="text-white/70" />
                                        <span className="text-xs text-white font-medium">{selectedCoach.fecha_nacimiento}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Trayectoria: equipo actual desde el CSV de origen (Persona.meta) */}
                        {(() => {
                            const meta = getMetaEntrenador(selectedCoach);
                            const equipo = meta?.equipo_actual ? getEquipoPorNombre(meta.equipo_actual) : null;
                            return (
                                <div className="p-6 bg-[#0B1F3B]">
                                    <h4 className="text-xs font-bold text-white/50 uppercase mb-4 flex items-center gap-2">Trayectoria</h4>
                                    {meta?.equipo_actual ? (
                                        <div className="bg-white/5 rounded-lg p-4 border border-white/5 flex items-center gap-4">
                                            {equipo?.escudo_path ? (
                                                <ImagenLocal path={equipo.escudo_path} alt={equipo.nombre} className="w-10 h-10 object-contain" />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-navy border border-white/10 flex items-center justify-center text-[10px] font-black text-silver/50 shrink-0">
                                                    {meta.equipo_actual.slice(0, 2).toUpperCase()}
                                                </div>
                                            )}
                                            <div>
                                                <div className="text-[10px] font-bold uppercase tracking-wider text-white/40">Equipo actual</div>
                                                <div className="font-bold text-white">
                                                    {meta.equipo_actual}
                                                    {equipo && equipo.nombre !== meta.equipo_actual && (
                                                        <span className="text-white/40 text-xs font-medium"> ({equipo.nombre})</span>
                                                    )}
                                                </div>
                                                {!!meta.titulos && (
                                                    <div className="text-xs text-orange font-bold mt-0.5 flex items-center gap-1">
                                                        <Trophy size={12} /> {meta.titulos} título{meta.titulos === 1 ? "" : "s"}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-white/5 rounded-lg p-4 border border-white/5 text-center text-white/30 text-xs">
                                            Equipo actual no disponible para este entrenador.
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
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
                mensaje={(f) => `Entrenador ${f.nombre_deportivo || f.nombre} eliminado`}
            />
        </div>
    );
}