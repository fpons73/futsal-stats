import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import { BarChart3, Trophy, User, Shield, Briefcase, Settings, ChevronDown, Plus, Trash2, Save } from "lucide-react";
import { toast } from "../components/Toast";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";
import { useFormGuard } from "../hooks/useFormGuard";

// --- INTERFACES ---
interface Selector { id: number; nombre: string; }
interface Bandera { id: number; path: string; }

interface FilaClasificacion {
    equipo_id: number; nombre: string; escudo: string | null;
    pj: number; g: number; e: number; p: number;
    gf: number; gc: number; dg: number; puntos: number;
    forma: string[];
}

interface StatRow {
    id: number;
    nombre: string;
    subtitulo: string; // Posición
    foto: string | null;
    bandera: string | null; // Bandera Principal
    nacionalidad2: string | null; // JSON con IDs de secundarias
    equipo_nombre: string;
    equipo_escudo: string | null;
    valor: number;
    pj: number;
}

interface ReglaPosicion { desde: number; hasta: number; nombre: string; color: string; }

// --- CONFIGURACIÓN DE MÉTRICAS ---
const METRICAS_JUGADORES = [
    { label: "Goles Totales", value: "GOL" },
    { label: "Goles de Penalti", value: "GOL_PENALTI" },
    { label: "Goles de Doble Penalti", value: "GOL_DOBLE_PENALTI" },
    { label: "Goles de Falta", value: "GOL_FALTA" },
    { label: "Asistencias", value: "ASISTENCIA" },
    { label: "Tarjetas Amarillas", value: "TARJETA_AMARILLA" },
    { label: "2ª Amarilla (Doble)", value: "DOBLE_AMARILLA" },
    { label: "Tarjetas Rojas", value: "TARJETA_ROJA" },
    { label: "Partidos Ganados", value: "VICTORIAS" },
    { label: "Partidos Empatados", value: "EMPATES" },
    { label: "Partidos Perdidos", value: "DERROTAS" },
    { label: "Lesiones", value: "LESION" },
    { label: "Penaltis Fallados", value: "PENALTI_FALLADO" },
    { label: "Dobles Penaltis Fallados", value: "DOBLE_PENALTI_FALLADO" },
    { label: "Goles en Propia Puerta", value: "PROPIA_PUERTA" }
];

const METRICAS_EQUIPOS = [
    { label: "Goles a Favor", value: "GF" },
    { label: "Goles en Contra", value: "GC" },
    { label: "Posesión Media (%)", value: "POSESION" },
    { label: "Saques de Esquina", value: "CORNERS" },
    { label: "Faltas Cometidas", value: "FALTAS" },
    { label: "Partidos Ganados", value: "VICTORIAS" },
    { label: "Partidos Empatados", value: "EMPATES" },
    { label: "Partidos Perdidos", value: "DERROTAS" },
    { label: "Tarjetas Amarillas", value: "TARJETA_AMARILLA" },
    { label: "Tarjetas Rojas", value: "TARJETA_ROJA" }
];

const METRICAS_ENTRENADORES = [
    { label: "Partidos Ganados", value: "VICTORIAS" },
    { label: "Partidos Empatados", value: "EMPATES" },
    { label: "Partidos Perdidos", value: "DERROTAS" },
    { label: "Tarjetas Amarillas", value: "TARJETA_AMARILLA" },
    { label: "2ª Amarilla", value: "DOBLE_AMARILLA" },
    { label: "Tarjetas Rojas", value: "TARJETA_ROJA" }
];

export default function CentroDatos() {
    const [ediciones, setEdiciones] = useState<Selector[]>([]);
    const [selEdicion, setSelEdicion] = useState("");
    const [tab, setTab] = useState("tabla");

    // DATOS
    const [clasificacion, setClasificacion] = useState<FilaClasificacion[]>([]);
    const [statsData, setStatsData] = useState<StatRow[]>([]);
    const [paises, setPaises] = useState<Bandera[]>([]);

    // FILTROS
    const [metrica, setMetrica] = useState("GOL");
    const [filtroLugar, setFiltroLugar] = useState<"total" | "local" | "visitante">("total");
    const [filtroModo, setFiltroModo] = useState<"total" | "promedio">("total");
    const [grupos, setGrupos] = useState<string[]>([]);
    const [selGrupo, setSelGrupo] = useState("");

    // CONFIGURACIÓN
    const [reglas, setReglas] = useState<ReglaPosicion[]>([]);
    const [modalConfigOpen, setModalConfigOpen] = useState(false);
    const [nuevaRegla, setNuevaRegla] = useState<ReglaPosicion>({ desde: 1, hasta: 1, nombre: "", color: "#3b82f6" });

    // --- GUARDA DE CAMBIOS SIN GUARDAR (configuración de colores) ---
    // Lo persistente es la lista de reglas; se compara serializada para que la
    // recreación de objetos (agregar/eliminar) no confunda identidad con edición.
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    const valoresConfig = () => ({ reglas: JSON.stringify(reglas) });
    const abrirConfig = () => {
        iniciar(valoresConfig());
        setModalConfigOpen(true);
    };
    const cerrarModalConfigSeguro = async () => {
        if (await cerrarSeguro(valoresConfig(), guardarReglas)) setModalConfigOpen(false);
    };
    const guardarYCerrarConfig = async () => {
        if (await guardarReglas()) setModalConfigOpen(false);
    };

    useEffect(() => { cargarEdiciones(); cargarPaises(); }, []);

    useEffect(() => {
        if (selEdicion) {
            cargarGrupos();
            if (tab === "tabla") cargarClasificacion();
            else if (tab === "jugadores") cargarStatsPersonas("Jugador");
            else if (tab === "entrenadores") cargarStatsPersonas("Entrenador");
            else if (tab === "equipos") cargarStatsEquipos();
        }
    }, [selEdicion, tab, metrica, filtroLugar, selGrupo]);

    async function cargarEdiciones() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>(`
      SELECT e.id, c.nombre || ' (' || t.nombre || ')' || COALESCE(' - ' || e.nombre, '') as nombre
      FROM Edicion e JOIN Competicion c ON e.competicion_id = c.id JOIN Temporada t ON e.temporada_id = t.id
      ORDER BY t.fecha_inicio DESC
    `);
        setEdiciones(res);
        if (res.length > 0) setSelEdicion(res[0].id.toString());
    }

    async function cargarGrupos() {
        if (!selEdicion) return;
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<{ grupo: string }[]>("SELECT DISTINCT grupo FROM Inscripcion WHERE edicion_id = $1 AND grupo IS NOT NULL AND grupo != '' ORDER BY grupo ASC", [selEdicion]);
        const lista = res.map(r => r.grupo);
        setGrupos(lista);
        if (!lista.includes(selGrupo)) setSelGrupo("");
    }

    async function cargarPaises() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Bandera[]>("SELECT id, bandera_path as path FROM Pais");
        setPaises(res);
    }

    // --- 1. TABLA DE LIGA ---
    async function cargarClasificacion() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const edicion = await db.select<any[]>("SELECT puntos_victoria, puntos_empate, puntos_derrota, reglas_json FROM Edicion WHERE id=$1", [selEdicion]);
        const ptsV = edicion[0]?.puntos_victoria || 3;
        const ptsE = edicion[0]?.puntos_empate || 1;
        if (edicion[0]?.reglas_json) try { setReglas(JSON.parse(edicion[0].reglas_json)); } catch { setReglas([]); } else setReglas([]);

        const equipos = await db.select<any[]>(`
            SELECT e.id, e.nombre, e.escudo_path 
            FROM Equipo e 
            JOIN Inscripcion i ON e.id = i.equipo_id 
            WHERE i.edicion_id = $1 ${selGrupo ? "AND i.grupo = $2" : ""}
        `, selGrupo ? [selEdicion, selGrupo] : [selEdicion]);

        const partidos = await db.select<any[]>(`
            SELECT local_id, visitante_id, goles_local, goles_visitante 
            FROM Partido 
            WHERE edicion_id = $1 AND estado = 'finalizado'
        `, [selEdicion]);

        const tabla: Record<number, FilaClasificacion> = {};
        equipos.forEach(eq => {
            tabla[eq.id] = { equipo_id: eq.id, nombre: eq.nombre, escudo: eq.escudo_path, pj: 0, g: 0, e: 0, p: 0, gf: 0, gc: 0, dg: 0, puntos: 0, forma: [] };
        });

        partidos.forEach(p => {
            const local = tabla[p.local_id]; const visit = tabla[p.visitante_id];
            if (!local || !visit) return;
            local.pj++; visit.pj++;
            local.gf += p.goles_local; local.gc += p.goles_visitante;
            visit.gf += p.goles_visitante; visit.gc += p.goles_local;
            if (p.goles_local > p.goles_visitante) { local.g++; local.puntos += ptsV; local.forma.push('G'); visit.p++; visit.forma.push('P'); }
            else if (p.goles_local < p.goles_visitante) { visit.g++; visit.puntos += ptsV; visit.forma.push('G'); local.p++; local.forma.push('P'); }
            else { local.e++; local.puntos += ptsE; local.forma.push('E'); visit.e++; visit.puntos += ptsE; visit.forma.push('E'); }
        });

        const lista = Object.values(tabla).map(t => ({ ...t, dg: t.gf - t.gc })).sort((a, b) => (b.puntos - a.puntos) || (b.dg - a.dg) || (b.gf - a.gf));
        setClasificacion(lista);
    }

    // --- 2. STATS PERSONAS (JUGADORES/ENTRENADORES) ---
    async function cargarStatsPersonas(rol: "Jugador" | "Entrenador") {
        const db = await Database.load("sqlite:globalfutsal.db");

        let filtroSQL = "";
        if (filtroLugar === "local") filtroSQL = "AND par.local_id = ev.equipo_id";
        if (filtroLugar === "visitante") filtroSQL = "AND par.visitante_id = ev.equipo_id";

        // CASOS ESPECIALES (Victorias/Empates/Derrotas)
        if (["VICTORIAS", "EMPATES", "DERROTAS"].includes(metrica)) {

            // AHORA CONSULTAMOS LA TABLA 'ALINEACION' (Solo gente que estuvo en el acta)
            // Y cruzamos con el resultado del partido
            let condicionResultado = "";
            if (metrica === "VICTORIAS") {
                condicionResultado = `
                (par.local_id = al.equipo_id AND par.goles_local > par.goles_visitante) OR 
                (par.visitante_id = al.equipo_id AND par.goles_visitante > par.goles_local)
            `;
            } else if (metrica === "EMPATES") {
                condicionResultado = `par.goles_local = par.goles_visitante`;
            } else { // DERROTAS
                condicionResultado = `
                (par.local_id = al.equipo_id AND par.goles_local < par.goles_visitante) OR 
                (par.visitante_id = al.equipo_id AND par.goles_visitante < par.goles_local)
            `;
            }

            const query = `
            SELECT p.id, p.nombre_deportivo as nombre, p.posicion_principal as subtitulo, 
                   p.foto_path as foto, pa.bandera_path as bandera, p.nacionalidades_secundarias as nacionalidad2,
                   eq.nombre as equipo_nombre, eq.escudo_path as equipo_escudo,
                   COUNT(al.id) as valor,
                   (SELECT COUNT(*) FROM Alineacion al2 WHERE al2.persona_id = p.id) as pj
            FROM Alineacion al
            JOIN Partido par ON al.partido_id = par.id
            JOIN Persona p ON al.persona_id = p.id
            LEFT JOIN Pais pa ON p.nacionalidad_principal_id = pa.id
            JOIN Equipo eq ON al.equipo_id = eq.id
            WHERE par.edicion_id = ${selEdicion} 
              AND par.estado = 'finalizado'
              AND p.roles LIKE '%${rol}%'
              AND (${condicionResultado})
            GROUP BY p.id
            ORDER BY valor DESC
            LIMIT 50
        `;

            try {
                const res = await db.select<StatRow[]>(query);
                setStatsData(res);
            } catch (e) { console.error(e); }
            return;
        }

        // EVENTOS
        let whereTipo = `ev.tipo = '${metrica}'`;
        if (metrica === "GOL_PENALTI") whereTipo = "ev.tipo = 'GOL' AND ev.subtipo = 'PENALTI'";
        if (metrica === "GOL_DOBLE_PENALTI") whereTipo = "ev.tipo = 'GOL' AND ev.subtipo = 'DOBLE_PENALTI'";
        if (metrica === "GOL_FALTA") whereTipo = "ev.tipo = 'GOL' AND ev.subtipo = 'FALTA'";
        if (metrica === "PROPIA_PUERTA") whereTipo = "ev.tipo = 'GOL' AND ev.subtipo = 'PROPIA_PUERTA'";

        const query = `
        SELECT p.id, p.nombre_deportivo as nombre, p.posicion_principal as subtitulo, 
               p.foto_path as foto, pa.bandera_path as bandera, p.nacionalidades_secundarias as nacionalidad2,
               eq.nombre as equipo_nombre, eq.escudo_path as equipo_escudo,
               COUNT(ev.id) as valor,
               (SELECT COUNT(*) FROM Partido par2 WHERE (par2.local_id = eq.id OR par2.visitante_id = eq.id) AND par2.edicion_id = ${selEdicion} AND par2.estado='finalizado') as pj
        FROM Evento ev
        JOIN Persona p ON ev.jugador_id = p.id
        LEFT JOIN Pais pa ON p.nacionalidad_principal_id = pa.id
        JOIN Equipo eq ON ev.equipo_id = eq.id
        JOIN Partido par ON ev.partido_id = par.id
        WHERE par.edicion_id = ${selEdicion} AND ${whereTipo} AND p.roles LIKE '%${rol}%' ${filtroSQL}
        GROUP BY p.id ORDER BY valor DESC LIMIT 50
    `;

        try {
            const res = await db.select<StatRow[]>(query);
            setStatsData(res);
        } catch (e) { console.error(e); }
    }

    // --- 3. STATS EQUIPOS ---
    async function cargarStatsEquipos() {
        const db = await Database.load("sqlite:globalfutsal.db");

        if (["VICTORIAS", "EMPATES", "DERROTAS", "GF", "GC"].includes(metrica)) {
            await cargarClasificacion();
            const datos = clasificacion.map(c => {
                let val = 0;
                if (metrica === "VICTORIAS") val = c.g;
                if (metrica === "EMPATES") val = c.e;
                if (metrica === "DERROTAS") val = c.p;
                if (metrica === "GF") val = c.gf;
                if (metrica === "GC") val = c.gc;
                return {
                    id: c.equipo_id, nombre: c.nombre, subtitulo: "", foto: c.escudo, bandera: null, nacionalidad2: null,
                    equipo_nombre: "", equipo_escudo: null, valor: val, pj: c.pj
                } as StatRow;
            }).sort((a, b) => b.valor - a.valor);
            setStatsData(datos);
            return;
        }

        if (["POSESION", "CORNERS", "FALTAS"].includes(metrica)) {
            const query = `
            SELECT eq.id, eq.nombre, '' as subtitulo, eq.escudo_path as foto, null as bandera, null as nacionalidad2,
            '' as equipo_nombre, null as equipo_escudo,
            SUM(st.${metrica.toLowerCase()}) as valor, COUNT(st.id) as pj
            FROM EstadisticaPartidoEquipo st
            JOIN Equipo eq ON st.equipo_id = eq.id
            JOIN Partido par ON st.partido_id = par.id
            WHERE par.edicion_id = ${selEdicion}
            GROUP BY eq.id ORDER BY valor DESC
        `;
            const res = await db.select<StatRow[]>(query);
            setStatsData(res);
            return;
        }

        const query = `
        SELECT eq.id, eq.nombre, '' as subtitulo, eq.escudo_path as foto, null as bandera, null as nacionalidad2,
        '' as equipo_nombre, null as equipo_escudo,
        COUNT(ev.id) as valor,
        (SELECT COUNT(*) FROM Partido par2 WHERE (par2.local_id = eq.id OR par2.visitante_id = eq.id) AND par2.edicion_id = ${selEdicion} AND par2.estado='finalizado') as pj
        FROM Evento ev
        JOIN Equipo eq ON ev.equipo_id = eq.id
        JOIN Partido par ON ev.partido_id = par.id
        WHERE par.edicion_id = ${selEdicion} AND ev.tipo = '${metrica}'
        GROUP BY eq.id ORDER BY valor DESC
    `;
        const res = await db.select<StatRow[]>(query);
        setStatsData(res);
    }

    const getValorVisual = (row: StatRow) => {
        if (filtroModo === "promedio" && row.pj > 0) return (row.valor / row.pj).toFixed(2);
        return row.valor;
    };

    // --- HELPER BANDERAS (CORREGIDO) ---
    const getFlagSrc = (id: number | string) => {
        // Usamos '==' para que 5 sea igual a "5" (La solución clave)
        const f = paises.find(p => p.id == id);
        return f ? convertFileSrc(f.path) : null;
    };

    const listaMetricas = () => {
        if (tab === "equipos") return METRICAS_EQUIPOS;
        if (tab === "entrenadores") return METRICAS_ENTRENADORES;
        return METRICAS_JUGADORES;
    };

    const agregarRegla = () => {
        if (!nuevaRegla.nombre) return toast.warning("Indica un nombre para la regla");
        setReglas([...reglas, nuevaRegla].sort((a, b) => a.desde - b.desde));
        setNuevaRegla({ desde: nuevaRegla.hasta + 1, hasta: nuevaRegla.hasta + 1, nombre: "", color: "#3b82f6" });
    };

    const eliminarRegla = (idx: number) => {
        setReglas(reglas.filter((_, i) => i !== idx));
    };

    const guardarReglas = async (): Promise<boolean> => {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("UPDATE Edicion SET reglas_json = $1 WHERE id = $2", [JSON.stringify(reglas), selEdicion]);
            await cargarClasificacion(); // Refrescar los datos para aplicar los colores
            toast.success("Configuración de colores guardada");
            return true;
        } catch (e) {
            console.error(e);
            toast.error("No se pudo guardar la configuración de colores");
            return false;
        }
    };

    const getReglaPosicion = (pos: number) => {
        return reglas.find(r => pos >= r.desde && pos <= r.hasta);
    };

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5">
                <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><BarChart3 className="text-orange text-glow-orange animate-pulse" /> Centro de Datos</h1>
                <div className="flex gap-4">
                    {grupos.length > 0 && tab === "tabla" && (
                        <div className="w-48">
                            <select value={selGrupo} onChange={e => setSelGrupo(e.target.value)} className="w-full p-2 border border-white/10 rounded-xl bg-navy-light font-bold outline-none text-orange cursor-pointer">
                                <option value="">-- Todos los Grupos --</option>
                                {grupos.map(g => <option key={g} value={g}>Grupo {g}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="w-64">
                        <select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="w-full p-2 border border-white/10 rounded-xl bg-navy-light font-bold outline-none text-white cursor-pointer">
                            {ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            <div className="flex justify-between items-center mb-6">
                <div className="flex gap-1.5 glass-panel p-1.5 rounded-xl border border-white/5 w-fit">
                    {[{ id: "tabla", l: "Tabla", i: Trophy }, { id: "jugadores", l: "Jugadores", i: User }, { id: "equipos", l: "Equipos", i: Shield }, { id: "entrenadores", l: "Entrenadores", i: Briefcase }].map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2.5 rounded-lg text-xs uppercase tracking-wider font-black flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${tab === t.id ? 'bg-gradient-to-r from-orange to-orange-neon text-white shadow-neon-orange' : 'text-silver/50 hover:bg-white/5 hover:text-white'}`}><t.i size={14} /> {t.l}</button>
                    ))}
                </div>

                {tab === "tabla" && (
                    <button
                        onClick={abrirConfig}
                        className="flex items-center gap-2 text-xs font-black uppercase text-silver/60 hover:text-orange transition-all duration-300 tracking-wider px-3 py-2"
                    >
                        <Settings size={14} className="animate-spin-slow" /> CONFIGURAR COLORES
                    </button>
                )}
            </div>

            <div className="flex-1 glass-panel rounded-2xl border border-white/5 overflow-hidden flex flex-col shadow-2xl">
                {tab !== "tabla" && (
                    <div className="p-4 border-b border-white/5 bg-navy-dark/45 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black text-silver/40 uppercase tracking-widest">Métrica:</span>
                            <div className="relative">
                                <select value={metrica} onChange={e => setMetrica(e.target.value)} className="appearance-none pl-3 pr-8 py-2 border border-white/10 rounded-lg bg-navy-light text-sm font-bold w-64 focus:ring-1 focus:ring-orange outline-none cursor-pointer text-white">
                                    {listaMetricas().map((m, i) => <option key={i} value={m.value}>{m.label}</option>)}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-3 text-silver/40 pointer-events-none" />
                            </div>
                        </div>
                        <div className="h-6 w-px bg-white/10 mx-2"></div>
                        <div className="flex bg-navy-dark/60 rounded-lg border border-white/5 overflow-hidden">
                            <button onClick={() => setFiltroLugar("total")} className={`px-4 py-2 text-[10px] tracking-wider font-black ${filtroLugar === "total" ? "bg-orange text-white" : "text-silver/50 hover:bg-white/5"}`}>TOTAL</button>
                            <button onClick={() => setFiltroLugar("local")} className={`px-4 py-2 text-[10px] tracking-wider font-black ${filtroLugar === "local" ? "bg-orange text-white" : "text-silver/50 hover:bg-white/5"}`}>LOCAL</button>
                            <button onClick={() => setFiltroLugar("visitante")} className={`px-4 py-2 text-[10px] tracking-wider font-black ${filtroLugar === "visitante" ? "bg-orange text-white" : "text-silver/50 hover:bg-white/5"}`}>VISITANTE</button>
                        </div>
                        <div className="flex bg-navy-dark/60 rounded-lg border border-white/5 overflow-hidden">
                            <button onClick={() => setFiltroModo("total")} className={`px-4 py-2 text-[10px] tracking-wider font-black ${filtroModo === "total" ? "bg-accent-blue text-white" : "text-silver/50 hover:bg-white/5"}`}>CANTIDAD</button>
                            <button onClick={() => setFiltroModo("promedio")} className={`px-4 py-2 text-[10px] tracking-wider font-black ${filtroModo === "promedio" ? "bg-accent-blue text-white" : "text-silver/50 hover:bg-white/5"}`}>POR PARTIDO</button>
                        </div>
                    </div>
                )}

                {tab !== "tabla" ? (
                    <div className="flex-1 overflow-auto p-4">
                        <div className="max-w-5xl mx-auto">
                            <div className="flex justify-between text-[10px] text-silver/40 uppercase tracking-widest font-black px-4 mb-3">
                                <div className="w-[40%]">{tab === 'equipos' ? 'Equipo' : 'Nombre'}</div>
                                {tab !== 'equipos' && <div className="w-[40%]">Equipo</div>}
                                <div className="flex gap-8 justify-end flex-1">
                                    <span>PJ</span>
                                    <span className="w-20 text-right text-orange">{filtroModo === 'promedio' ? 'Promedio' : 'Total'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {statsData.map((s, idx) => {
                                    let nac2Id = null;
                                    try { nac2Id = JSON.parse(s.nacionalidad2 || "[]")[0]; } catch { }

                                    return (
                                        <div key={s.id} className="flex items-center justify-between p-3.5 bg-navy-dark/35 border border-white/5 rounded-xl hover:bg-white/5 transition-all duration-300 group">
                                            {/* COLUMNA 1: PERSONA */}
                                            <div className="flex items-center gap-4 w-[40%]">
                                                <span className="font-display font-black text-silver/20 text-xl w-6 text-center group-hover:text-orange/60 transition-colors">{idx + 1}</span>
                                                <div className="w-12 h-12 rounded-full bg-navy border border-white/10 overflow-hidden shrink-0"><ImagenLocal path={s.foto} alt="" /></div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-white truncate">{s.nombre}</div>
                                                    {tab !== 'equipos' && (
                                                        <div className="flex items-center gap-2 text-[10px] text-silver/50 mt-1 font-semibold">
                                                            {s.bandera && <img src={convertFileSrc(s.bandera)} className="w-4.5 h-3 shadow border border-white/5" alt="nac1" />}
                                                            {nac2Id && getFlagSrc(nac2Id) && <img src={getFlagSrc(nac2Id)!} className="w-4.5 h-3 shadow border border-white/5 opacity-80" alt="nac2" />}
                                                            {s.subtitulo && <span className="uppercase text-[9px] bg-white/5 px-1.5 py-0.5 rounded border border-white/5">{s.subtitulo}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* COLUMNA 2: EQUIPO */}
                                            {tab !== 'equipos' && (
                                                <div className="flex items-center gap-3 w-[40%] border-l border-white/5 pl-4">
                                                    <div className="w-8 h-8 shrink-0 bg-white p-0.5 rounded-lg border border-white/10 flex items-center justify-center shadow-sm"><ImagenLocal path={s.equipo_escudo} alt="" className="w-full h-full object-contain" /></div>
                                                    <span className="text-sm font-semibold text-silver/80 group-hover:text-white transition-colors truncate">{s.equipo_nombre}</span>
                                                </div>
                                            )}

                                            {/* COLUMNA 3: VALOR */}
                                            <div className="flex items-center gap-8 justify-end flex-1 pl-4">
                                                <div className="text-silver/50 font-display font-bold text-sm">{s.pj}</div>
                                                <div className="font-display font-black text-3xl text-orange text-glow-orange w-20 text-right">{getValorVisual(s)}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {statsData.length === 0 && <div className="text-center py-12 text-silver/30 font-semibold">No hay datos para esta métrica.</div>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-navy-dark/85 border-b border-white/5 text-[10px] text-silver/40 uppercase tracking-widest font-black sticky top-0 z-10 font-display">
                                <tr>
                                    <th className="p-4 w-12 text-center">Pos</th>
                                    <th className="p-4">Equipo</th>
                                    <th className="p-4 w-12 text-center">PJ</th>
                                    <th className="p-4 w-12 text-center text-success">G</th>
                                    <th className="p-4 w-12 text-center text-orange">E</th>
                                    <th className="p-4 w-12 text-center text-red">P</th>
                                    <th className="p-4 w-12 text-center">GF</th>
                                    <th className="p-4 w-12 text-center">GC</th>
                                    <th className="p-4 w-12 text-center">DG</th>
                                    <th className="p-4 w-16 text-center bg-white/5 text-white font-black">PTS</th>
                                    <th className="p-4 w-24 text-center">Forma</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5 text-sm text-silver/80">
                                {clasificacion.map((fila, idx) => {
                                    const pos = idx + 1;
                                    const regla = getReglaPosicion(pos);
                                    return (
                                        <tr key={fila.equipo_id} className={`hover:bg-white/5 group transition-colors duration-200`}>
                                            <td className="p-4 text-center font-display font-bold relative text-white">
                                                {regla && <div className="absolute left-0 top-1 bottom-1 w-1 rounded-r-md shadow-lg" style={{ backgroundColor: regla.color }}></div>}
                                                <span className={regla ? "text-white text-glow-blue" : "text-silver/40"}>{pos}</span>
                                            </td>
                                            <td className="p-4 flex items-center gap-3">
                                                <div className="w-7 h-7 shrink-0 bg-white p-0.5 rounded-lg border border-white/10 flex items-center justify-center shadow-sm"><ImagenLocal path={fila.escudo} alt="" className="w-full h-full object-contain" /></div>
                                                <span className="font-bold text-white group-hover:text-orange transition-colors duration-200">{fila.nombre}</span>
                                            </td>
                                            <td className="p-4 text-center">{fila.pj}</td>
                                            <td className="p-4 text-center font-bold text-white">{fila.g}</td>
                                            <td className="p-4 text-center">{fila.e}</td>
                                            <td className="p-4 text-center">{fila.p}</td>
                                            <td className="p-4 text-center">{fila.gf}</td>
                                            <td className="p-4 text-center">{fila.gc}</td>
                                            <td className="p-4 text-center font-medium">{fila.dg > 0 ? `+${fila.dg}` : fila.dg}</td>
                                            <td className="p-4 text-center font-display font-black text-base bg-white/5 text-white">{fila.puntos}</td>
                                            <td className="p-4 text-center">
                                                <div className="flex gap-1.5 justify-center">
                                                    {fila.forma.slice(-5).map((f, i) => (
                                                        <div key={i} className={`w-2.5 h-2.5 rounded-full shadow-inner ${f === 'G' ? 'bg-success shadow-success/40' : f === 'E' ? 'bg-orange shadow-orange/40' : 'bg-red shadow-red/40'}`} title={f}></div>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {reglas.length > 0 && (
                            <div className="p-4 bg-navy-dark/65 border-t border-white/5 flex flex-wrap gap-4">
                                {reglas.map((r, i) => (
                                    <div key={i} className="flex items-center gap-2 bg-white/5 border border-white/5 px-2.5 py-1 rounded-lg">
                                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: r.color }}></div>
                                        <span className="text-[9px] font-black uppercase text-silver/70 tracking-wider">{r.nombre}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* MODAL CONFIGURAR COLORES */}
            <Modal isOpen={modalConfigOpen} onClose={cerrarModalConfigSeguro} title="Configurar Colores de Posición">
                <div className="space-y-4 text-white">
                    <p className="text-xs text-silver/50 italic">Define rangos de posiciones y colores para resaltar la tabla (ej: 1 al 1, Campeón).</p>

                    <div className="space-y-2 max-h-60 overflow-auto border-b border-white/5 pb-4">
                        {reglas.map((r, i) => (
                            <div key={i} className="flex items-center gap-3 bg-navy-light/45 p-2.5 rounded-xl border border-white/5 group">
                                <div className="w-4 h-4 rounded-full border border-white/10 shadow-sm" style={{ backgroundColor: r.color }}></div>
                                <div className="flex-1 text-sm">
                                    <span className="font-bold text-white">Pos {r.desde}-{r.hasta}:</span> <span className="text-silver/70">{r.nombre}</span>
                                </div>
                                <button onClick={() => eliminarRegla(i)} className="p-1 text-red hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 size={14} /></button>
                            </div>
                        ))}
                        {reglas.length === 0 && <div className="text-center py-6 text-silver/30 text-sm">No hay reglas configuradas.</div>}
                    </div>

                    <div className="grid grid-cols-4 gap-2 items-end bg-navy-light/25 p-3 rounded-xl border border-white/5">
                        <div className="col-span-1">
                            <label className="block text-[9px] font-black text-silver/40 mb-1.5 uppercase tracking-wider">Rango</label>
                            <div className="flex items-center gap-1">
                                <input type="number" min="1" value={nuevaRegla.desde} onChange={e => setNuevaRegla({ ...nuevaRegla, desde: parseInt(e.target.value) || 1 })} className="w-full p-2 border border-white/10 rounded-lg text-xs bg-navy text-center text-white" />
                                <span className="text-silver/40">-</span>
                                <input type="number" min="1" value={nuevaRegla.hasta} onChange={e => setNuevaRegla({ ...nuevaRegla, hasta: parseInt(e.target.value) || 1 })} className="w-full p-2 border border-white/10 rounded-lg text-xs bg-navy text-center text-white" />
                            </div>
                        </div>
                        <div className="col-span-2">
                            <label className="block text-[9px] font-black text-silver/40 mb-1.5 uppercase tracking-wider">Etiqueta (ej: Champions)</label>
                            <input type="text" value={nuevaRegla.nombre} onChange={e => setNuevaRegla({ ...nuevaRegla, nombre: e.target.value })} className="w-full p-2 border border-white/10 rounded-lg text-xs bg-navy text-white" placeholder="Nombre de la zona..." />
                        </div>
                        <div className="col-span-1 flex gap-1">
                            <input type="color" value={nuevaRegla.color} onChange={e => setNuevaRegla({ ...nuevaRegla, color: e.target.value })} className="w-9 h-9 p-0 border border-white/10 rounded-lg cursor-pointer shrink-0" />
                            <button onClick={agregarRegla} className="bg-orange text-white p-2 rounded-lg flex-1 hover:bg-orange-hover transition-colors shadow-md flex items-center justify-center"><Plus size={18} className="mx-auto" /></button>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalConfigSeguro} className="px-4 py-2 text-silver/50 hover:text-white transition-colors text-sm font-bold uppercase tracking-wider">Cancelar</button>
                        <button onClick={guardarYCerrarConfig} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2"><Save size={16} /> GUARDAR CONFIGURACIÓN</button>
                    </div>
                </div>
            </Modal>
            {dialogo}
        </div>
    );
}