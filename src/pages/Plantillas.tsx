import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Shirt, Plus, Trash2, Edit, Search, User, Briefcase, ChevronRight, Download, Upload } from "lucide-react";
import Modal from "../components/Modal";
import { normalizeString } from "../utils/stringUtils";

// Definición de posiciones de Futsal
const POSICIONES = ["Portero", "Cierre", "Ala", "Pívot", "Universal"];

// --- INTERFACES ---
interface SelectorData { id: number; nombre: string; }
interface Persona {
    id: number;
    nombre: string;
    apellidos: string;
    nombre_deportivo: string;
    fecha_nacimiento?: string;
    foto_path: string | null;
    nacionalidad_principal_id: number;
    nacionalidades_secundarias?: string;
    posicion_principal?: string;
    posiciones_secundarias?: string;
    rol_persona?: string;
    plantilla_id?: number;
    dorsal?: number;
}
interface Bandera { id: number; path: string | null; nombre: string; } // Añadido nombre para el selector

// --- COMPONENTE AVATAR ---
const Avatar = ({ path, alt }: { path: string | null, alt: string }) => {
    if (!path) return <div className="w-full h-full bg-gray-200 flex items-center justify-center text-gray-400"><User size={16} /></div>;

    return (
        <img
            src={convertFileSrc(path)}
            alt={alt}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
                e.currentTarget.style.display = 'none';
                e.currentTarget.parentElement!.classList.add('bg-gray-200');
            }}
        />
    );
};

export default function Plantillas() {
    // --- ESTADOS ---
    const [temporadas, setTemporadas] = useState<SelectorData[]>([]);
    const [ediciones, setEdiciones] = useState<SelectorData[]>([]);
    const [equipos, setEquipos] = useState<SelectorData[]>([]);

    const [selTemp, setSelTemp] = useState("");
    const [selEdicion, setSelEdicion] = useState("");
    const [selEquipo, setSelEquipo] = useState("");

    const [tab, setTab] = useState<"Jugador" | "Entrenador">("Jugador");
    const [disponibles, setDisponibles] = useState<Persona[]>([]);
    const [plantilla, setPlantilla] = useState<Persona[]>([]);
    const [paises, setPaises] = useState<Bandera[]>([]);

    const [busqueda, setBusqueda] = useState("");

    // --- MODALES ---
    const [modalDorsalOpen, setModalDorsalOpen] = useState(false);
    const [personaToAdd, setPersonaToAdd] = useState<Persona | null>(null);
    const [dorsalTemp, setDorsalTemp] = useState("");

    const [modalImportarOpen, setModalImportarOpen] = useState(false);
    const [edicionesPrevias, setEdicionesPrevias] = useState<any[]>([]);
    const [selEdicionPrevia, setSelEdicionPrevia] = useState("");

    // Modal de Crear/Editar Persona
    const [modalPersonaOpen, setModalPersonaOpen] = useState(false);
    const [editPersonaId, setEditPersonaId] = useState<number | null>(null); // Si es null = Crear nuevo
    const [personaForm, setPersonaForm] = useState({
        nombre: "",
        apellidos: "",
        apodo: "",
        fecha_nacimiento: "",
        pais_id: "",
        pais2_id: "",
        pos1: "Ala",
        pos2: "",
        foto: null as string | null
    });

    // --- CARGA INICIAL ---
    useEffect(() => { cargarTemporadas(); cargarBanderas(); }, []);

    useEffect(() => { if (selTemp) cargarEdiciones(selTemp); else setEdiciones([]); }, [selTemp]);
    useEffect(() => { if (selEdicion) cargarEquipos(selEdicion); else setEquipos([]); }, [selEdicion]);
    useEffect(() => {
        if (selEquipo && selEdicion) cargarListas();
        else { setDisponibles([]); setPlantilla([]); }
    }, [selEquipo, tab]);

    // --- FUNCIONES DB ---
    async function cargarBanderas() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Bandera[]>("SELECT id, nombre, bandera_path as path FROM Pais ORDER BY nombre ASC");
        setPaises(res);
    }

    async function cargarTemporadas() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<SelectorData[]>("SELECT id, nombre FROM Temporada ORDER BY fecha_inicio DESC");
        setTemporadas(res);
        if (res.length > 0) setSelTemp(res[0].id.toString());
    }

    async function cargarEdiciones(tempId: string) {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<SelectorData[]>(`
      SELECT e.id, COALESCE(NULLIF(e.nombre, ''), c.nombre || ' (' || t.nombre || ')') as nombre
      FROM Edicion e JOIN Competicion c ON e.competicion_id = c.id JOIN Temporada t ON e.temporada_id = t.id
      WHERE e.temporada_id = $1 ORDER BY c.nombre ASC
    `, [tempId]);
        setEdiciones(res);
        if (res.length > 0) setSelEdicion(res[0].id.toString());
    }

    async function cargarEquipos(edicionId: string) {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<SelectorData[]>(`
      SELECT e.id, e.nombre FROM Equipo e
      JOIN Inscripcion i ON e.id = i.equipo_id
      WHERE i.edicion_id = $1 ORDER BY e.nombre ASC
    `, [edicionId]);
        setEquipos(res);
        if (res.length > 0) setSelEquipo(res[0].id.toString());
        else setSelEquipo("");
    }

    async function cargarListas() {
        if (!selEquipo || !selEdicion) return;
        const db = await Database.load("sqlite:globalfutsal.db");

        // Plantilla
        const resPlantilla = await db.select<Persona[]>(`
      SELECT p.*, pl.id as plantilla_id, pl.dorsal
      FROM Plantilla pl
      JOIN Persona p ON pl.persona_id = p.id
      WHERE pl.edicion_id = $1 AND pl.equipo_id = $2 AND pl.rol = $3
      ORDER BY pl.dorsal ASC
    `, [selEdicion, selEquipo, tab]);
        setPlantilla(resPlantilla);

        // Disponibles
        const idsEnPlantilla = resPlantilla.map(p => p.id);
        const rolBusqueda = tab === "Jugador" ? '%Jugador%' : '%Entrenador%';
        const todos = await db.select<Persona[]>(`SELECT * FROM Persona WHERE roles LIKE '${rolBusqueda}' ORDER BY nombre_deportivo ASC`);
        const filtrados = todos.filter(p => !idsEnPlantilla.includes(p.id));
        setDisponibles(filtrados);
    }

    // --- ACCIONES INSCRIPCIÓN ---
    function prepararAlta(p: Persona) {
        setPersonaToAdd(p);
        setDorsalTemp("");
        if (tab === "Jugador") {
            setModalDorsalOpen(true);
        } else {
            altaDirecta(p);
        }
    }

    async function altaDirecta(p: Persona) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute(
                "INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, rol, dorsal) VALUES ($1, $2, $3, $4, NULL)",
                [selEdicion, selEquipo, p.id, tab]
            );
            cargarListas();
        } catch (e) { console.error(e); }
    }

    async function guardarAltaConDorsal() {
        if (!personaToAdd) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute(
                "INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, rol, dorsal) VALUES ($1, $2, $3, $4, $5)",
                [selEdicion, selEquipo, personaToAdd.id, tab, dorsalTemp || null]
            );
            setModalDorsalOpen(false);
            cargarListas();
        } catch (e) { console.error(e); }
    }

    const handleKeyDownDorsal = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            guardarAltaConDorsal();
        }
    };

    async function baja(plantillaId: number) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Plantilla WHERE id = $1", [plantillaId]);
            cargarListas();
        } catch (e) { console.error(e); }
    }

    // --- ACCIONES CREAR / EDITAR PERSONA (IN-SITU) ---

    // Abrir modal para crear NUEVO
    function abrirCrearPersona() {
        setEditPersonaId(null);
        setPersonaForm({ nombre: "", apellidos: "", apodo: "", fecha_nacimiento: "", pais_id: "", pais2_id: "", pos1: "Ala", pos2: "", foto: null });
        setModalPersonaOpen(true);
    }

    // Abrir modal para EDITAR existente
    function abrirEditarPersona(p: Persona) {
        setEditPersonaId(p.id);

        // Parsear nacionalidades secundarias
        let nac2 = "";
        const nacsSecundarias = getNacionalidadesSecundarias(p.nacionalidades_secundarias);
        if (nacsSecundarias.length > 0) nac2 = nacsSecundarias[0].toString();

        // Parsear posiciones secundarias
        let pos2 = "";
        const posSecundarias = getPosicionesSecundarias(p.posiciones_secundarias);
        if (posSecundarias.length > 0) pos2 = posSecundarias[0];

        setPersonaForm({
            nombre: p.nombre,
            apellidos: p.apellidos,
            apodo: p.nombre_deportivo,
            fecha_nacimiento: p.fecha_nacimiento || "",
            pais_id: p.nacionalidad_principal_id.toString(),
            pais2_id: nac2,
            pos1: p.posicion_principal || "Ala",
            pos2: pos2,
            foto: p.foto_path
        });
        setModalPersonaOpen(true);
    }

    async function seleccionarNuevaFoto() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setPersonaForm({ ...personaForm, foto: file as string });
        } catch (err) { console.error(err); }
    }

    async function guardarPersonaDB() {
        if (!personaForm.nombre || !personaForm.pais_id) {
            alert("El nombre y el país son obligatorios.");
            return;
        }

        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            // Preparar nacionalidades secundarias
            const nac2Json = personaForm.pais2_id ? JSON.stringify([personaForm.pais2_id]) : JSON.stringify([]);

            if (editPersonaId) {
                // UPDATE
                await db.execute(
                    `UPDATE Persona SET 
                    nombre=$1, apellidos=$2, nombre_deportivo=$3, fecha_nacimiento=$4,
                    nacionalidad_principal_id=$5, nacionalidades_secundarias=$6,
                    foto_path=$7, posicion_principal=$8, posiciones_secundarias=$9 
                    WHERE id=$10`,
                    [personaForm.nombre, personaForm.apellidos, personaForm.apodo, personaForm.fecha_nacimiento,
                    personaForm.pais_id, nac2Json, personaForm.foto, personaForm.pos1, personaForm.pos2, editPersonaId]
                );
            } else {
                // INSERT (NUEVO)
                // Determinamos el rol según la pestaña activa
                const rol = tab === "Jugador" ? JSON.stringify(["Jugador"]) : JSON.stringify(["Entrenador"]);

                await db.execute(
                    `INSERT INTO Persona 
                (nombre, apellidos, nombre_deportivo, fecha_nacimiento, nacionalidad_principal_id, nacionalidades_secundarias, 
                 foto_path, roles, posicion_principal, posiciones_secundarias)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                    [personaForm.nombre, personaForm.apellidos, personaForm.apodo || personaForm.nombre, personaForm.fecha_nacimiento,
                    personaForm.pais_id, nac2Json, personaForm.foto, rol, personaForm.pos1, personaForm.pos2]
                );
            }
            setModalPersonaOpen(false);
            cargarListas();
        } catch (e) { console.error(e); alert("Error al guardar"); }
    }

    // --- IMPORTAR ---
    async function abrirImportar() {
        if (!selEquipo) return;
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<any[]>(`
        SELECT DISTINCT e.id, COALESCE(NULLIF(e.nombre, ''), c.nombre || ' (' || t.nombre || ')') as nombre_completo
        FROM Plantilla pl
        JOIN Edicion e ON pl.edicion_id = e.id
        JOIN Competicion c ON e.competicion_id = c.id
        JOIN Temporada t ON e.temporada_id = t.id
        WHERE pl.equipo_id = $1 AND pl.edicion_id != $2
    `, [selEquipo, selEdicion]);
        setEdicionesPrevias(res);
        setModalImportarOpen(true);
    }

    async function ejecutarImportacion() {
        if (!selEdicionPrevia) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute(`
            INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, dorsal, rol)
            SELECT $1, equipo_id, persona_id, dorsal, rol
            FROM Plantilla
            WHERE edicion_id = $2 AND equipo_id = $3
        `, [selEdicion, selEdicionPrevia, selEquipo]);
            setModalImportarOpen(false);
            alert("Plantilla importada con éxito");
            cargarListas();
        } catch (e) { console.error(e); alert("Error importando"); }
    }

    const getFlag = (id: number) => {
        const f = paises.find(p => p.id === id);
        return f?.path || null;
    };

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

    // Helper para calcular edad
    const calcularEdad = (fecha?: string): string => {
        if (!fecha) return "";
        const hoy = new Date();
        const nac = new Date(fecha);
        let edad = hoy.getFullYear() - nac.getFullYear();
        const m = hoy.getMonth() - nac.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--;
        return `${edad} años`;
    };

    // Helper para obtener nacionalidades secundarias de forma segura
    const getNacionalidadesSecundarias = (nacionalidades_secundarias?: string): number[] => {
        if (!nacionalidades_secundarias) return [];

        // Si es un string simple (no JSON), intentar convertir a número
        if (!nacionalidades_secundarias.startsWith('[')) {
            const num = parseInt(nacionalidades_secundarias);
            return isNaN(num) ? [] : [num];
        }

        // Si es un array JSON, parsearlo
        try {
            const parsed = JSON.parse(nacionalidades_secundarias);
            if (!Array.isArray(parsed)) return [];

            // Convertir cada elemento a número (pueden venir como strings)
            return parsed.map(item => {
                const num = typeof item === 'string' ? parseInt(item) : item;
                return isNaN(num) ? null : num;
            }).filter((n): n is number => n !== null);
        } catch {
            return [];
        }
    };

    const disponiblesFiltrados = disponibles.filter(p => {
        const busquedaNorm = normalizeString(busqueda);
        const textoNorm = normalizeString(p.nombre_deportivo + p.nombre + p.apellidos);
        return textoNorm.includes(busquedaNorm);
    });

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="glass-panel p-6 rounded-2xl border border-white/5 mb-6 shadow-2xl">
                <div className="flex justify-between items-start flex-wrap gap-4">
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><Shirt className="text-purple-light text-glow-blue animate-pulse" /> Gestión de Plantillas</h1>
                    <div className="flex gap-4">
                        <div className="flex flex-col"><label className="text-[9px] uppercase font-black tracking-wider text-silver/40 mb-1">Temporada</label><select value={selTemp} onChange={e => setSelTemp(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm w-36 outline-none text-white cursor-pointer font-bold">{temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}</select></div>
                        <div className="flex flex-col"><label className="text-[9px] uppercase font-black tracking-wider text-silver/40 mb-1">Edición</label><select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm w-56 outline-none text-white cursor-pointer font-bold">{ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                        <div className="flex flex-col"><label className="text-[9px] uppercase font-black tracking-wider text-silver/40 mb-1">Equipo</label><select value={selEquipo} onChange={e => setSelEquipo(e.target.value)} className="p-2 border border-white/10 rounded-xl bg-navy-light text-sm w-56 outline-none text-white cursor-pointer font-bold">{equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                    </div>
                </div>
                <div className="flex gap-2 mt-6 border-t border-white/5 pt-4">
                    <button onClick={() => setTab("Jugador")} className={`px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider font-black flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${tab === "Jugador" ? "bg-gradient-to-r from-purple to-purple-light text-white shadow-neon-blue" : "text-silver/50 hover:bg-white/5 hover:text-white"}`}><User size={16} /> Jugadores</button>
                    <button onClick={() => setTab("Entrenador")} className={`px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider font-black flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${tab === "Entrenador" ? "bg-gradient-to-r from-purple to-purple-light text-white shadow-neon-blue" : "text-silver/50 hover:bg-white/5 hover:text-white"}`}><Briefcase size={16} /> Cuerpo Técnico</button>
                </div>
            </div>

            <div className="flex gap-6 flex-1 h-[calc(100vh-310px)]">

                {/* IZQUIERDA: DISPONIBLES */}
                <div className="flex-1 glass-panel rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-xl">
                    <div className="p-3.5 border-b border-white/5 bg-navy-dark/45 flex gap-2">
                        <div className="flex-1 flex items-center gap-2 bg-navy-light/60 px-3 py-2 rounded-xl border border-white/5">
                            <Search size={16} className="text-silver/40" />
                            <input placeholder="Buscar..." className="bg-transparent outline-none w-full text-sm text-white placeholder-silver/40" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
                        </div>
                        {/* BOTÓN NUEVO */}
                        <button onClick={abrirCrearPersona} className="bg-orange text-white p-2.5 rounded-xl hover:bg-orange-hover transition-colors shadow-md flex items-center justify-center" title={`Crear ${tab}`}><Plus size={20} /></button>
                        <button onClick={abrirImportar} className="bg-navy-light border border-white/10 text-white px-3.5 rounded-xl text-sm hover:bg-white/5 transition-colors flex items-center gap-1 font-bold" title="Importar plantilla"><Download size={16} /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {disponiblesFiltrados.map(p => {
                            return (
                                <div key={p.id} className="flex items-center justify-between p-2.5 bg-navy-dark/35 border border-white/5 rounded-xl hover:bg-white/5 transition-all duration-300 group">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-navy border border-white/10 overflow-hidden relative shadow-inner shrink-0">
                                            <Avatar path={p.foto_path} alt="" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-white truncate">{p.nombre_deportivo}</div>
                                            <div className="text-[10px] text-silver/40 flex items-center gap-1.5 mt-0.5 font-medium">
                                                <span>{p.nombre} {p.apellidos}</span>
                                                {p.fecha_nacimiento && (
                                                    <>
                                                        <span>•</span>
                                                        <span>{p.fecha_nacimiento} ({calcularEdad(p.fecha_nacimiento)})</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                {/* Banderas */}
                                                {getFlag(p.nacionalidad_principal_id) && (
                                                    <div className="w-4.5 h-3 border border-white/10 shadow-sm overflow-hidden shrink-0 rounded-sm">
                                                        <Avatar path={getFlag(p.nacionalidad_principal_id)} alt="" />
                                                    </div>
                                                )}
                                                {(() => {
                                                    const nacsSecundarias = getNacionalidadesSecundarias(p.nacionalidades_secundarias);
                                                    return nacsSecundarias.length > 0 && getFlag(nacsSecundarias[0]) && (
                                                        <div className="w-4.5 h-3 border border-white/10 shadow-sm overflow-hidden opacity-80 shrink-0 rounded-sm">
                                                            <Avatar path={getFlag(nacsSecundarias[0])} alt="" />
                                                        </div>
                                                    );
                                                })()}
                                                {/* Posiciones */}
                                                {tab === "Jugador" && (() => {
                                                    const posSecundarias = getPosicionesSecundarias(p.posiciones_secundarias);
                                                    return (
                                                        <div className="text-[9px] uppercase flex items-center gap-1 ml-1 font-bold">
                                                            <span className="text-orange">{p.posicion_principal}</span>
                                                            {posSecundarias.length > 0 && (
                                                                <span className="text-silver/40 font-normal">/ {posSecundarias[0]}</span>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                        <button onClick={() => abrirEditarPersona(p)} className="p-1.5 text-silver/60 hover:text-orange bg-navy border border-white/5 rounded-lg transition-colors"><Edit size={14} /></button>
                                        <button onClick={() => prepararAlta(p)} className="bg-purple text-white p-1.5 rounded-lg hover:bg-purple-light transition-colors"><Plus size={16} /></button>
                                    </div>
                                </div>
                            );
                        })}
                        {disponiblesFiltrados.length === 0 && <div className="text-center py-12 text-silver/30 font-semibold">No se encontraron integrantes disponibles.</div>}
                    </div>
                </div>

                <div className="flex items-center text-silver/20"><ChevronRight size={32} /></div>

                {/* DERECHA: PLANTILLA */}
                <div className="flex-1 bg-purple/10 border border-purple/20 rounded-2xl flex flex-col overflow-hidden shadow-xl">
                    <div className="p-4 border-b border-purple/15 bg-purple/15 flex justify-between items-center">
                        <h3 className="font-display font-black text-purple-light text-glow-blue text-xs uppercase tracking-wider">Plantilla Inscrita ({plantilla.length})</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto p-3 space-y-2">
                        {plantilla.map(p => (
                            <div key={p.plantilla_id} className="flex items-center bg-navy-dark/45 border border-white/5 rounded-xl p-3 shadow-md group hover:bg-white/5 transition-all duration-300">
                                <div className="w-8 text-center font-display font-black text-xl text-purple-light text-glow-blue">{p.dorsal || "-"}</div>
                                <div className="relative w-10 h-10 mx-3 shrink-0">
                                    <div className="w-10 h-10 rounded-full overflow-hidden bg-navy border border-white/15 shadow-inner"><Avatar path={p.foto_path} alt="" /></div>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-bold text-white text-sm truncate">{p.nombre_deportivo}</div>
                                    <div className="text-[10px] text-silver/40 flex items-center gap-1.5 mt-0.5 font-medium">
                                        <span>{p.nombre} {p.apellidos}</span>
                                        {p.fecha_nacimiento && (
                                            <>
                                                <span>•</span>
                                                <span>{p.fecha_nacimiento} ({calcularEdad(p.fecha_nacimiento)})</span>
                                            </>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                        {/* Banderas */}
                                        {getFlag(p.nacionalidad_principal_id) && (
                                            <div className="w-4.5 h-3 border border-white/10 shadow-sm overflow-hidden shrink-0 rounded-sm">
                                                <Avatar path={getFlag(p.nacionalidad_principal_id)} alt="" />
                                            </div>
                                        )}
                                        {(() => {
                                            const nacsSecundarias = getNacionalidadesSecundarias(p.nacionalidades_secundarias);
                                            return nacsSecundarias.length > 0 && getFlag(nacsSecundarias[0]) && (
                                                <div className="w-4.5 h-3 border border-white/10 shadow-sm overflow-hidden opacity-80 shrink-0 rounded-sm">
                                                    <Avatar path={getFlag(nacsSecundarias[0])} alt="" />
                                                </div>
                                            );
                                        })()}
                                        {/* Posiciones */}
                                        {tab === "Jugador" ? (() => {
                                            const posSecundarias = getPosicionesSecundarias(p.posiciones_secundarias);
                                            return (
                                                <div className="text-[9px] uppercase flex items-center gap-1 ml-1 font-bold">
                                                    <span className="text-orange">{p.posicion_principal}</span>
                                                    {posSecundarias.length > 0 && (
                                                        <span className="text-silver/40 font-normal">/ {posSecundarias[0]}</span>
                                                    )}
                                                </div>
                                            );
                                        })() : (
                                            <span className="text-silver/50 text-[9px] uppercase tracking-wider ml-1 font-bold">Cuerpo Técnico</span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pl-2">
                                    <button onClick={() => abrirEditarPersona(p)} className="p-1.5 text-silver/60 hover:text-orange bg-navy border border-white/5 rounded-lg transition-colors"><Edit size={14} /></button>
                                    <button onClick={() => baja(p.plantilla_id!)} className="text-silver/40 hover:text-red p-1.5 hover:bg-red/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                                </div>
                            </div>
                        ))}
                        {plantilla.length === 0 && <div className="text-center py-12 text-silver/30 font-semibold">No hay miembros inscritos en la plantilla.</div>}
                    </div>
                </div>
            </div>

            {/* MODAL DORSAL */}
            <Modal isOpen={modalDorsalOpen} onClose={() => setModalDorsalOpen(false)} title={`Inscribir a ${personaToAdd?.nombre_deportivo}`}>
                <div className="space-y-4 text-white">
                    <p className="text-sm text-silver/70">Asigna el dorsal para esta temporada:</p>
                    <input
                        type="number"
                        value={dorsalTemp}
                        onChange={e => setDorsalTemp(e.target.value)}
                        onKeyDown={handleKeyDownDorsal}
                        className="w-full p-4 text-center text-4xl font-display font-black border border-white/10 bg-navy rounded-xl focus:ring-2 focus:ring-purple-light outline-none text-purple-light text-glow-blue"
                        placeholder="#"
                        autoFocus
                    />
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={() => setModalDorsalOpen(false)} className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">Cancelar</button>
                        <button onClick={guardarAltaConDorsal} className="bg-purple text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-blue">Inscribir</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL CREAR/EDITAR PERSONA */}
            <Modal isOpen={modalPersonaOpen} onClose={() => setModalPersonaOpen(false)} title={editPersonaId ? `Editar ${tab}` : `Nuevo ${tab}`}>
                <div className="space-y-4 text-white">
                    <div className="flex justify-center mb-4">
                        <div onClick={seleccionarNuevaFoto} className="w-24 h-24 rounded-full bg-navy border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer hover:border-orange overflow-hidden relative group shadow-inner">
                            <Avatar path={personaForm.foto} alt="Foto" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <Upload size={20} />
                            </div>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Nombre</label><input value={personaForm.nombre} onChange={e => { const val = e.target.value; setPersonaForm(p => ({ ...p, nombre: val, apodo: `${val} ${p.apellidos}`.trim() })) }} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white focus:ring-1 focus:ring-orange outline-none" /></div>
                        <div><label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Apellidos</label><input value={personaForm.apellidos} onChange={e => { const val = e.target.value; setPersonaForm(p => ({ ...p, apellidos: val, apodo: `${p.nombre} ${val}`.trim() })) }} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white focus:ring-1 focus:ring-orange outline-none" /></div>
                    </div>
                    <div>
                        <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Nombre Deportivo</label>
                        <input value={personaForm.apodo} onChange={e => setPersonaForm({ ...personaForm, apodo: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm font-bold text-white focus:ring-1 focus:ring-orange outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">1ª Nacionalidad</label>
                            <select
                                value={personaForm.pais_id}
                                onChange={e => setPersonaForm({ ...personaForm, pais_id: e.target.value })}
                                className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none"
                            >
                                <option value="">-- Seleccionar --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">2ª Nacionalidad</label>
                            <select
                                value={personaForm.pais2_id}
                                onChange={e => setPersonaForm({ ...personaForm, pais2_id: e.target.value })}
                                className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none"
                            >
                                <option value="">Ninguna</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div><label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Fecha Nacimiento</label><input type="date" value={personaForm.fecha_nacimiento} onChange={e => setPersonaForm({ ...personaForm, fecha_nacimiento: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white focus:ring-1 focus:ring-orange outline-none cursor-pointer" /></div>
                        {tab === "Jugador" && (
                            <div>
                                <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Posición Principal</label>
                                <select value={personaForm.pos1} onChange={e => setPersonaForm({ ...personaForm, pos1: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none">
                                    {POSICIONES.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                        )}
                    </div>
                    {tab === "Jugador" && (
                        <div>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Posición Secundaria (Opcional)</label>
                            <select value={personaForm.pos2} onChange={e => setPersonaForm({ ...personaForm, pos2: e.target.value })} className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none">
                                <option value="">-- Ninguna --</option>
                                {POSICIONES.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={() => setModalPersonaOpen(false)} className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">Cancelar</button>
                        <button onClick={guardarPersonaDB} className="bg-gradient-to-r from-orange to-orange-neon text-white px-5 py-2.5 rounded-xl font-bold shadow-neon-orange">Guardar Cambios</button>
                    </div>
                </div>
            </Modal>

            {/* MODAL IMPORTAR */}
            <Modal isOpen={modalImportarOpen} onClose={() => setModalImportarOpen(false)} title="Importar Plantilla">
                <div className="space-y-4 text-white">
                    {edicionesPrevias.length === 0 ? (
                        <p className="text-red">Este equipo no tiene plantillas en otras ediciones.</p>
                    ) : (
                        <>
                            <label className="block text-xs font-black tracking-wider text-silver/40 mb-1.5 uppercase">Selecciona la edición de origen:</label>
                            <select className="w-full p-2.5 border border-white/10 rounded-lg bg-navy text-sm text-white cursor-pointer focus:ring-1 focus:ring-orange outline-none" value={selEdicionPrevia} onChange={e => setSelEdicionPrevia(e.target.value)}>
                                <option value="">-- Seleccionar --</option>
                                {edicionesPrevias.map(e => <option key={e.id} value={e.id}>{e.nombre_completo}</option>)}
                            </select>
                            <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                                <button onClick={() => setModalImportarOpen(false)} className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">Cancelar</button>
                                <button onClick={ejecutarImportacion} disabled={!selEdicionPrevia} className="bg-success text-white px-5 py-2.5 rounded-xl font-bold disabled:opacity-50 shadow-md">Copiar</button>
                            </div>
                        </>
                    )}
                </div>
            </Modal>

        </div>
    );
}