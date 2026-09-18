import { useState, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Escudo, Bandera } from "../components/ImagenSegura";
import { Plus, Search, Trash2, Edit, Upload, Shield, Filter, X, AlertTriangle } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
import SpinnerCarga from "../components/SpinnerCarga";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import { normalizeString } from "../utils/stringUtils";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";

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
    // Seed de búsqueda desde la paleta global (B4): /equipos?q=Nombre precarga el filtro.
    const [searchParams] = useSearchParams();
    const [equipos, setEquipos] = useState<Equipo[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);

    // Filtros. La búsqueda va debounced (200 ms): el índice de ~18k equipos solo
    // se reevalúa cuando el usuario deja de teclear, no en cada pulsación.
    const [busquedaInput, setBusquedaInput] = useState(() => searchParams.get("q") ?? "");
    const [busqueda, setBusqueda] = useState(() => searchParams.get("q") ?? "");
    useEffect(() => {
        const t = setTimeout(() => setBusqueda(busquedaInput), 200);
        return () => clearTimeout(t);
    }, [busquedaInput]);
    const [filtroPais, setFiltroPais] = useState("todos");
    const [filtroCat, setFiltroCat] = useState("todos");
    // Primera carga en curso: decide entre spinner / lista / estado vacío.
    const [cargando, setCargando] = useState(true);

    // Paginación de render: con 18k equipos, montar todas las filas (cada una con
    // imágenes) congela la pestaña. Se pintan POR_PAGINA filas y se pagina.
    const POR_PAGINA = 100;
    const [pagina, setPagina] = useState(1);

    // Modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // --- CAMBIOS SIN GUARDAR EN EL FORMULARIO (useFormGuard) ---
    // Instantánea al abrir el modal; al cerrar con cambios se ofrece
    // Guardar y cerrar / Descartar / Seguir editando.
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask() nativo).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Equipo", cargarDatos);
    const valoresFormulario = () => ({
        nombre, abreviatura, categoria, selPais, escudoPath, color1, color2
    });
    const cerrarModalSeguro = async () => {
        const ok = await cerrarSeguro(valoresFormulario(), guardar);
        if (ok) setIsModalOpen(false);
    };

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

        } catch (error) {
            console.error(error);
            toast.error("Error al cargar los equipos");
        } finally {
            setCargando(false);
        }
    }

    // --- CRUD ---
    async function seleccionarEscudo() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setEscudoPath(file as string);
        } catch (err) {
            console.error(err);
            toast.error("No se pudo abrir el selector de archivos");
        }
    }

    function abrirCrear() {
        setEditingId(null);
        setNombre(""); setAbreviatura(""); setCategoria("Club"); setSelPais("");
        setEscudoPath(null); setColor1("#1F2E5C"); setColor2("#FFFFFF");
        iniciar({ nombre: "", abreviatura: "", categoria: "Club", selPais: "", escudoPath: null, color1: "#1F2E5C", color2: "#FFFFFF" });
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
        iniciar({ nombre: e.nombre, abreviatura: e.abreviatura, categoria: e.categoria, selPais: e.pais_id?.toString() || "", escudoPath: e.escudo_path, color1: e.color1 || "#ffffff", color2: e.color2 || "#000000" });
        setIsModalOpen(true);
    }

    async function guardar(): Promise<boolean> {
        if (!nombre || !selPais) { toast.warning("El nombre y el país son obligatorios"); return false; }
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
            return true;
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar el equipo");
            return false;
        }
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar equipo?", titulo: "Confirmar", textoConfirmar: "Sí", textoCancelar: "No", peligroso: true });
        if (confirm) await borrarFila(id);
    }

    // --- LÓGICA DE FILTRADO ---
    // País "Desconocido": equipos importados sin país en el CSV de origen.
    // Tienen filtro propio para poder repararlos manualmente desde aquí.
    const idDesconocido = useMemo(
        () => paises.find(p => normalizeString(p.nombre) === "desconocido")?.id ?? null,
        [paises]
    );
    const totalDesconocidos = useMemo(
        () => (idDesconocido ? equipos.filter(e => e.pais_id === idDesconocido).length : 0),
        [equipos, idDesconocido]
    );

    // Índice de texto normalizado por equipo: se calcula UNA vez por carga de datos
    // (no en cada tecla), así la búsqueda con acentos ignorados es O(1) por fila.
    const indiceBusqueda = useMemo(() => {
        const mapa = new Map<number, string>();
        for (const e of equipos) mapa.set(e.id, normalizeString(e.nombre + " " + e.abreviatura));
        return mapa;
    }, [equipos]);

    const equiposFiltrados = useMemo(() => {
        const busquedaNorm = normalizeString(busqueda);
        return equipos.filter(e => {
            if (busquedaNorm && !(indiceBusqueda.get(e.id)?.includes(busquedaNorm))) return false;
            if (filtroPais === "desconocido") {
                if (e.pais_id !== idDesconocido) return false;
            } else if (filtroPais !== "todos" && e.pais_id?.toString() !== filtroPais) {
                return false;
            }
            if (filtroCat !== "todos" && e.categoria !== filtroCat) return false;
            return true;
        });
    }, [equipos, indiceBusqueda, busqueda, filtroPais, filtroCat, idDesconocido]);

    // Ventana visible + reset a la primera página cuando cambian los filtros.
    const totalPaginas = Math.max(1, Math.ceil(equiposFiltrados.length / POR_PAGINA));
    const paginaActual = Math.min(pagina, totalPaginas);
    const equiposVisibles = useMemo(
        () => equiposFiltrados.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA),
        [equiposFiltrados, paginaActual]
    );
    useEffect(() => {
        setPagina(1);
    }, [busqueda, filtroPais, filtroCat]);

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <Shield className="text-orange text-glow-orange animate-pulse" /> Equipos
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">{equipos.length.toLocaleString("es-ES")} equipos registrados en el sistema</p>
                    {totalDesconocidos > 0 && (
                        <button
                            onClick={() => setFiltroPais("desconocido")}
                            className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors"
                            title="Equipos importados sin país en el CSV de origen. Clic para filtrarlos."
                        >
                            <AlertTriangle size={12} />
                            {totalDesconocidos.toLocaleString("es-ES")} sin país — revisar
                        </button>
                    )}
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
                        value={busquedaInput}
                        onChange={e => setBusquedaInput(e.target.value)}
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
                        {idDesconocido !== null && (
                            <option value="desconocido">
                                ⚠ Sin país (Desconocido){totalDesconocidos > 0 ? ` — ${totalDesconocidos.toLocaleString("es-ES")}` : ""}
                            </option>
                        )}
                        {paises.filter(p => p.id !== idDesconocido).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
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

            {/* AVISO: filtro de sin país activo */}
            {filtroPais === "desconocido" && (
                <div className="glass-panel p-4 rounded-xl border border-warning/30 mb-6 flex items-center gap-3 bg-warning/5">
                    <AlertTriangle size={20} className="text-warning shrink-0" />
                    <p className="text-sm text-silver/80">
                        Mostrando los <strong className="text-warning">{totalDesconocidos.toLocaleString("es-ES")} equipos sin país conocido</strong>: el CSV de origen no tenía país para ellos.
                        Edita cada equipo y asigna su país real cuando lo conozcas.
                    </p>
                    <button
                        onClick={() => setFiltroPais("todos")}
                        className="ml-auto shrink-0 text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-navy border border-white/10 text-silver/70 hover:text-white transition-colors"
                    >
                        Quitar filtro
                    </button>
                </div>
            )}

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
                        {equiposVisibles.map((equipo) => (
                            <tr key={equipo.id} className="hover:bg-white/5 transition-colors group duration-200">
                                <td className="p-3 text-center">
                                    <div className="w-10 h-10 mx-auto flex items-center justify-center bg-white p-1 rounded-xl shadow-sm border border-white/10 overflow-hidden">
                                        <Escudo ruta={equipo.escudo_path} nombre={equipo.nombre} className="w-full h-full" />
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-white group-hover:text-orange transition-colors">{equipo.nombre}</td>
                                <td className="p-4 text-center font-display font-black text-orange text-glow-orange text-xs uppercase tracking-wider">{equipo.abreviatura}</td>
                                <td className="p-4 text-center">
                                    {equipo.pais_id === idDesconocido ? (
                                        <span
                                            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-warning"
                                            title="Sin país conocido: edítalo y asigna el país real"
                                        >
                                            <AlertTriangle size={13} />
                                            Sin país
                                        </span>
                                    ) : equipo.pais_bandera ? (
                                        <Bandera ruta={equipo.pais_bandera} nombre={equipo.pais_nombre} className="w-6 h-4 mx-auto shadow-sm" />
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
                {cargando ? (
                    <SpinnerCarga mensaje="Cargando equipos…" />
                ) : equiposFiltrados.length === 0 && (equipos.length === 0 ? (
                    <EstadoVacio
                        icono={Shield}
                        titulo="Aún no hay equipos"
                        descripcion="Importa la enciclopedia de equipos desde un CSV o crea el primero a mano."
                        acciones={[
                            { texto: "Importar CSV", a: "/importar", primario: true },
                            { texto: "Inscribir equipo", a: "/inscripcion-equipos" },
                        ]}
                    />
                ) : (
                    <EstadoVacio
                        icono={Search}
                        titulo="Ningún equipo coincide"                        descripcion="Prueba con otro nombre o quita los filtros de país."
                        porFiltros
                        acciones={[{ texto: "Limpiar búsqueda", onClick: () => { setBusqueda(""); setBusquedaInput(""); setFiltroPais("todos"); } }]}
                    />
                ))}

                {/* PAGINACIÓN */}
                {equiposFiltrados.length > POR_PAGINA && (
                    <div className="flex items-center justify-between p-4 border-t border-white/5 text-sm">
                        <span className="text-silver/50 font-medium">
                            Mostrando {(paginaActual - 1) * POR_PAGINA + 1}–{Math.min(paginaActual * POR_PAGINA, equiposFiltrados.length).toLocaleString("es-ES")} de {equiposFiltrados.length.toLocaleString("es-ES")} equipos
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

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Equipo" : "Nuevo Equipo"}>
                <div className="space-y-4">

                    <div className="flex justify-center mb-4">
                        <div
                            onClick={seleccionarEscudo}
                            className="w-24 h-24 rounded-2xl border border-white/10 hover:border-orange cursor-pointer flex items-center justify-center bg-white overflow-hidden relative group shadow-inner"
                        >
                            {escudoPath ? (
                                <img src={convertFileSrc(escudoPath)} className="w-full h-full object-contain p-2 filter drop-shadow-md" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
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
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
            {/* Diálogo de confirmación destructiva */}
            {dialogoConfirmar}
            <UndoToast
                pendiente={filaBorrada}
                onUndo={deshacer}
                onDescartar={limpiarBorrado}
                mensaje={(f) => `Equipo ${f.nombre} eliminado`}
            />
        </div>
    );
}