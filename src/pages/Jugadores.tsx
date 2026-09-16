import { useState, useEffect, useMemo } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Plus, Search, Trash2, Edit, Eye, Filter, User, Upload, X, Calendar, AlertTriangle } from "lucide-react";
import { toast } from "../components/Toast";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";
import { useFormGuard } from "../hooks/useFormGuard";
import { normalizeString } from "../utils/stringUtils";

// Definición de posiciones de Futsal
const POSICIONES = ["Portero", "Cierre", "Ala", "Pívot", "Universal"];

interface Pais {
    id: number;
    nombre: string;
    bandera_path: string | null;
}

interface Jugador {
    id: number;
    nombre: string;
    apellidos: string;
    nombre_deportivo: string;
    fecha_nacimiento: string;
    nacionalidad_principal_id: number | null;
    nacionalidades_secundarias: string;
    foto_path: string | null;
    posicion_principal: string;
    posiciones_secundarias: string; // CORREGIDO: Plural
    roles: string;
}

export default function Jugadores() {
    const [jugadores, setJugadores] = useState<Jugador[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    // Filtros. Búsqueda debounced (200 ms): con ~20k jugadores, reevaluar el
    // índice en cada tecla congela la escritura.
    const [busquedaInput, setBusquedaInput] = useState("");
    const [busqueda, setBusqueda] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setBusqueda(busquedaInput), 200);
        return () => clearTimeout(t);
    }, [busquedaInput]);
    const [filtroPais, setFiltroPais] = useState("todos");
    const [filtroPos, setFiltroPos] = useState("todas");

    // Paginación de render: 20k filas con imágenes congelarían la pestaña.
    const POR_PAGINA = 100;
    const [pagina, setPagina] = useState(1);

    // Modales
    const [modalFormOpen, setModalFormOpen] = useState(false);
    const [modalViewOpen, setModalViewOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [selectedPlayer, setSelectedPlayer] = useState<Jugador | null>(null);
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [jugadorABorrar, setJugadorABorrar] = useState<Jugador | null>(null);

    // Formulario
    const [formData, setFormData] = useState({
        nombre: "",
        apellidos: "",
        apodo: "",
        nacimiento: "",
        pais1: "",
        pais2: "",
        pos1: "Ala",
        pos2: "",
        foto: null as string | null
    });

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const resPaises = await db.select<Pais[]>("SELECT * FROM Pais ORDER BY nombre ASC");
            setPaises(resPaises);

            const resJug = await db.select<Jugador[]>(`SELECT * FROM Persona WHERE roles LIKE '%Jugador%' ORDER BY nombre_deportivo ASC`);
            setJugadores(resJug);
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar los jugadores");
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
        setFormData({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", pais2: "", pos1: "Ala", pos2: "", foto: null });
        iniciar({ nombre: "", apellidos: "", apodo: "", nacimiento: "", pais1: "", pais2: "", pos1: "Ala", pos2: "", foto: null });
        setModalFormOpen(true);
    }

    function abrirEditar(j: Jugador) {
        setEditingId(j.id);
        let nac2 = "";
        try {
            const parsed = JSON.parse(j.nacionalidades_secundarias || "[]");
            if (Array.isArray(parsed) && parsed.length > 0) nac2 = parsed[0];
        } catch { nac2 = j.nacionalidades_secundarias || ""; }

        setFormData({
            nombre: j.nombre,
            apellidos: j.apellidos,
            apodo: j.nombre_deportivo,
            nacimiento: j.fecha_nacimiento,
            pais1: j.nacionalidad_principal_id?.toString() || "",
            pais2: nac2,
            pos1: j.posicion_principal,
            pos2: j.posiciones_secundarias || "", // CORREGIDO: Plural
            foto: j.foto_path
        });
        iniciar({
            nombre: j.nombre,
            apellidos: j.apellidos,
            apodo: j.nombre_deportivo,
            nacimiento: j.fecha_nacimiento,
            pais1: j.nacionalidad_principal_id?.toString() || "",
            pais2: nac2,
            pos1: j.posicion_principal,
            pos2: j.posiciones_secundarias || "",
            foto: j.foto_path
        });
        setModalFormOpen(true);
    }

    function abrirFicha(j: Jugador) {
        setSelectedPlayer(j);
        setModalViewOpen(true);
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro(formData, guardar)) setModalFormOpen(false);
    };

    async function guardar(): Promise<boolean> {
        if (!formData.nombre || !formData.apodo || !formData.pais1) {
            toast.warning("Rellena los campos obligatorios (Nombre, Apodo, País)");
            return false;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const nac2Json = formData.pais2 ? JSON.stringify([formData.pais2]) : JSON.stringify([]);
            const rolesJson = JSON.stringify(["Jugador"]);

            if (editingId) {
                // CORREGIDO: usamos posiciones_secundarias (plural) en la SQL
                await db.execute(`
                UPDATE Persona SET 
                nombre=$1, apellidos=$2, nombre_deportivo=$3, fecha_nacimiento=$4, 
                nacionalidad_principal_id=$5, nacionalidades_secundarias=$6, 
                foto_path=$7, posicion_principal=$8, posiciones_secundarias=$9 
                WHERE id=$10
            `, [formData.nombre, formData.apellidos, formData.apodo, formData.nacimiento, formData.pais1, nac2Json, formData.foto, formData.pos1, formData.pos2, editingId]);
            } else {
                // CORREGIDO: usamos posiciones_secundarias (plural) en la SQL
                await db.execute(`
                INSERT INTO Persona 
                (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, nacionalidades_secundarias, foto_path, posicion_principal, posiciones_secundarias, roles)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [formData.nombre, formData.apellidos, formData.apodo, formData.nacimiento, formData.pais1, nac2Json, formData.foto, formData.pos1, formData.pos2, rolesJson]);
            }
            setModalFormOpen(false);
            cargarDatos();
            return true;
        } catch (error) {
            console.error("Error guardando:", error);
            toast.error("Error al guardar el jugador");
            return false;
        }
    }

    function solicitarBorrarJugador(j: Jugador) {
        setJugadorABorrar(j);
        setIsDeleteConfirmOpen(true);
    }

    async function ejecutarBorradoJugador() {
        if (!jugadorABorrar) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Persona WHERE id = $1", [jugadorABorrar.id]);
            cargarDatos();
            setIsDeleteConfirmOpen(false);
            setJugadorABorrar(null);
        } catch (error) {
            console.error("Error al borrar jugador:", error);
            toast.error("No se pudo eliminar el jugador. Puede tener actas asociadas.");
            toast.error("No se pudo eliminar el jugador. Puede tener actas asociadas.");
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

    // Helper para obtener posiciones secundarias de forma segura
    const getPosicionesSecundarias = (posiciones_secundarias?: string): string[] => {
        if (!posiciones_secundarias) return [];

        // Si es un string simple (no JSON), devolverlo como array
        if (!posiciones_secundarias.startsWith('[')) {
            return [posiciones_secundarias];
        }

        // Si es un array JSON, parsearlo
        try {
            const parsed = JSON.parse(posiciones_secundarias);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    };

    // Personas importadas sin nacionalidad (el CSV de origen no traía país).
    // Tienen filtro propio para poder repararlas manualmente desde aquí.
    const totalSinNacionalidad = useMemo(
        () => jugadores.filter(j => !j.nacionalidad_principal_id).length,
        [jugadores]
    );

    // Índice de texto normalizado por jugador: una sola vez por carga de datos.
    const indiceBusqueda = useMemo(() => {
        const mapa = new Map<number, string>();
        for (const j of jugadores) mapa.set(j.id, normalizeString(j.nombre_deportivo + " " + j.nombre + " " + j.apellidos));
        return mapa;
    }, [jugadores]);

    const jugadoresFiltrados = useMemo(() => {
        const busquedaNorm = normalizeString(busqueda);
        return jugadores.filter(j => {
            if (busquedaNorm && !(indiceBusqueda.get(j.id)?.includes(busquedaNorm))) return false;
            if (filtroPais === "sin") {
                if (j.nacionalidad_principal_id) return false;
            } else if (filtroPais !== "todos" && j.nacionalidad_principal_id?.toString() !== filtroPais) {
                return false;
            }
            if (filtroPos !== "todas" && j.posicion_principal !== filtroPos) return false;
            return true;
        });
    }, [jugadores, indiceBusqueda, busqueda, filtroPais, filtroPos]);

    const totalPaginas = Math.max(1, Math.ceil(jugadoresFiltrados.length / POR_PAGINA));
    const paginaActual = Math.min(pagina, totalPaginas);
    const jugadoresVisibles = useMemo(
        () => jugadoresFiltrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA),
        [jugadoresFiltrados, paginaActual]
    );
    useEffect(() => {
        setPagina(1);
    }, [busqueda, filtroPais, filtroPos]);

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <User className="text-orange text-glow-orange animate-pulse" /> Jugadores
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">{jugadores.length.toLocaleString("es-ES")} jugadores registrados en el sistema</p>
                    {totalSinNacionalidad > 0 && (
                        <button
                            onClick={() => setFiltroPais("sin")}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors"
                            title="Personas importadas sin nacionalidad en el CSV de origen. Clic para filtrarlas."
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
                    <input value={busquedaInput} onChange={e => setBusquedaInput(e.target.value)} placeholder="Buscar por nombre..." className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm" />
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
                    <select value={filtroPos} onChange={e => setFiltroPos(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold">
                        <option value="todas">Todas las Posiciones</option>
                        {POSICIONES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            </div>

            {filtroPais === "sin" && (
                <div className="glass-panel p-4 rounded-xl border border-warning/30 mb-6 flex items-center gap-3 bg-warning/5">
                    <AlertTriangle size={20} className="text-warning shrink-0" />
                    <p className="text-sm text-silver/70">
                        Mostrando las <strong className="text-warning">{jugadoresFiltrados.length.toLocaleString("es-ES")} personas sin nacionalidad conocida</strong>: el CSV de origen no traía país para ellas.
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
                            <th className="p-4">Posición</th>
                            <th className="p-4 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-silver/80">
                        {jugadoresVisibles.map((j) => {
                            let nac2Id = null;
                            try { nac2Id = JSON.parse(j.nacionalidades_secundarias)[0]; } catch { }

                            return (
                                <tr key={j.id} className="hover:bg-white/5 transition-colors group duration-200">
                                    <td className="p-3 text-center">
                                        <div className="w-10 h-10 rounded-full bg-navy border border-white/10 overflow-hidden mx-auto flex items-center justify-center shadow-inner">
                                            <ImagenLocal path={j.foto_path} alt={j.nombre_deportivo} className="w-full h-full object-cover" />
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-white group-hover:text-orange transition-colors">{j.nombre_deportivo}</div>
                                        <div className="text-xs text-silver/40 font-medium">{j.nombre} {j.apellidos}</div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="flex justify-center gap-1.5">
                                            {j.nacionalidad_principal_id ? (
                                                <>
                                                    {getBandera(j.nacionalidad_principal_id) && <img src={getBandera(j.nacionalidad_principal_id)!} className="w-6 h-4 border border-white/10 shadow-sm rounded-sm" />}
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
                                        {calcularEdad(j.fecha_nacimiento)}
                                    </td>
                                    <td className="p-4">
                                        {(() => {
                                            const posSecundarias = getPosicionesSecundarias(j.posiciones_secundarias);
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="bg-orange/10 text-orange border border-orange/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{j.posicion_principal}</span>
                                                    {posSecundarias.length > 0 && (
                                                        <span className="text-silver/40 text-xs font-normal uppercase">/ {posSecundarias[0]}</span>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                        <button onClick={() => abrirFicha(j)} className="p-1.5 text-success hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Eye size={16} /></button>
                                        <button onClick={() => abrirEditar(j)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                        <button onClick={() => solicitarBorrarJugador(j)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {jugadoresFiltrados.length === 0 && <div className="p-10 text-center text-silver/40 font-medium">No se encontraron jugadores.</div>}

                {/* PAGINACIÓN */}
                {jugadoresFiltrados.length > POR_PAGINA && (
                    <div className="flex items-center justify-between p-4 border-t border-white/5 text-sm">
                        <span className="text-silver/50 font-medium">
                            Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, jugadoresFiltrados.length).toLocaleString("es-ES")} de {jugadoresFiltrados.length.toLocaleString("es-ES")} jugadores
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
                                {paginaActual} / {totalPaginas}
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

            <Modal isOpen={modalFormOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Jugador" : "Nuevo Jugador"}>
                <div className="space-y-4">
                    <div className="flex items-center gap-4 mb-4">
                        <div onClick={seleccionarFoto} className="w-20 h-20 rounded-full bg-navy-dark border border-white/10 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative shadow-inner">
                            <ImagenLocal path={formData.foto} alt="Foto" className="w-full h-full object-cover" />
                            {!formData.foto && <Upload size={20} className="text-silver/40" />}
                        </div>
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Deportivo</label>
                            <input value={formData.apodo} onChange={e => setFormData({ ...formData, apodo: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl font-bold text-white outline-none focus:border-orange transition-colors animate-all" placeholder="Ej: Ricardinho" />
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
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Fecha Nacimiento</label>
                            <input type="date" value={formData.nacimiento} onChange={e => setFormData({ ...formData, nacimiento: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Posición Principal</label>
                            <select value={formData.pos1} onChange={e => setFormData({ ...formData, pos1: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer font-display">
                                {POSICIONES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Posición Secundaria (Opcional)</label>
                        <select value={formData.pos2} onChange={e => setFormData({ ...formData, pos2: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white/70 outline-none focus:border-orange transition-colors font-bold cursor-pointer font-display">
                            <option value="">-- Ninguna --</option>
                            {POSICIONES.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

            {modalViewOpen && selectedPlayer && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in">
                    <div className="bg-[#0B1F3B] w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden border border-white/10">
                        <div className="relative p-8 flex items-center gap-6 border-b border-white/10 bg-gradient-to-r from-[#0B1F3B] to-[#16294a]">
                            <button onClick={() => setModalViewOpen(false)} className="absolute top-4 right-4 text-white/50 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"><X size={24} /></button>
                            <div className="w-24 h-24 rounded-full border-4 border-white/20 shadow-xl overflow-hidden bg-white/5 flex-shrink-0">
                                <ImagenLocal path={selectedPlayer.foto_path} alt={selectedPlayer.nombre_deportivo} className="w-full h-full object-cover" />
                            </div>
                            <div>
                                <h2 className="text-3xl font-bold text-white mb-1">{selectedPlayer.nombre_deportivo}</h2>
                                <p className="text-white/60 text-sm mb-3">{selectedPlayer.nombre} {selectedPlayer.apellidos}</p>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                        {getBandera(selectedPlayer.nacionalidad_principal_id) && <img src={getBandera(selectedPlayer.nacionalidad_principal_id)!} className="w-5 h-3.5" />}
                                        <span className="text-xs text-white font-medium uppercase tracking-wide">{getNombrePais(selectedPlayer.nacionalidad_principal_id)}</span>
                                    </div>
                                    <div className="flex items-center gap-2 bg-white/10 px-3 py-1 rounded-full border border-white/5">
                                        <Calendar size={14} className="text-white/70" />
                                        <span className="text-xs text-white font-medium">{selectedPlayer.fecha_nacimiento}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-white/10 border-b border-white/10 bg-[#08162b]">
                            <div className="p-6 text-center"><div className="text-3xl font-black text-white mb-1">0</div><div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Partidos Totales</div></div>
                            <div className="p-6 text-center"><div className="text-3xl font-black text-white mb-1">0</div><div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">Minutos Totales</div></div>
                        </div>
                        <div className="p-6 bg-[#0B1F3B]">
                            <h4 className="text-xs font-bold text-white/50 uppercase mb-4 flex items-center gap-2">
                                <ClockIcon /> Historial de Temporadas
                            </h4>
                            <div className="bg-white/5 rounded-lg p-4 border border-white/5 flex justify-between items-center">
                                <div className="flex items-center gap-4"><div className="text-white font-bold text-sm">Sin historial</div></div>
                                <div className="text-white/30 text-xs">--</div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {isDeleteConfirmOpen && jugadorABorrar && (
                <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Eliminar Jugador">
                    <div className="space-y-4 text-white">
                        <p className="text-sm text-silver/80">
                            ¿Estás seguro de que deseas eliminar de forma permanente a <strong className="text-orange">{jugadorABorrar.nombre_deportivo}</strong>?
                        </p>
                        <p className="text-xs text-red bg-red/10 border border-red/25 p-3 rounded-xl">
                            ⚠️ Esta acción es irreversible. Se eliminará permanentemente su ficha y todo su historial de temporadas y estadísticas en el sistema.
                        </p>
                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                            <button onClick={ejecutarBorradoJugador} className="bg-red hover:bg-red/80 text-white px-6 py-2 rounded-xl font-bold shadow-md transition-all">Eliminar permanentemente</button>
                        </div>
                    </div>
                </Modal>
            )}
            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
        </div>
    );
}

function ClockIcon() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg> }