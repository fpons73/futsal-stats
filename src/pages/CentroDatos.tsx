import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import { BarChart3, Trophy, User, Shield, Briefcase, Settings, ChevronDown, Minus, Plus } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";

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

    // CONFIGURACIÓN
    const [reglas, setReglas] = useState<ReglaPosicion[]>([]);
    const [modalConfigOpen, setModalConfigOpen] = useState(false);

    useEffect(() => { cargarEdiciones(); cargarPaises(); }, []);

    useEffect(() => {
        if (selEdicion) {
            if (tab === "tabla") cargarClasificacion();
            else if (tab === "jugadores") cargarStatsPersonas("Jugador");
            else if (tab === "entrenadores") cargarStatsPersonas("Entrenador");
            else if (tab === "equipos") cargarStatsEquipos();
        }
    }, [selEdicion, tab, metrica, filtroLugar]);

    async function cargarEdiciones() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>(`
      SELECT e.id, c.nombre || ' (' || t.nombre || ')' as nombre
      FROM Edicion e JOIN Competicion c ON e.competicion_id = c.id JOIN Temporada t ON e.temporada_id = t.id
      ORDER BY t.fecha_inicio DESC
    `);
        setEdiciones(res);
        if (res.length > 0) setSelEdicion(res[0].id.toString());
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

        const equipos = await db.select<any[]>(`SELECT e.id, e.nombre, e.escudo_path FROM Equipo e JOIN Inscripcion i ON e.id = i.equipo_id WHERE i.edicion_id = $1`, [selEdicion]);
        const partidos = await db.select<any[]>(`SELECT local_id, visitante_id, goles_local, goles_visitante FROM Partido WHERE edicion_id = $1 AND estado = 'finalizado'`, [selEdicion]);

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

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0 flex flex-col">
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h1 className="text-2xl font-bold text-navy flex items-center gap-3"><BarChart3 className="text-yellow-500" /> Centro de Datos</h1>
                <div className="w-64"><select value={selEdicion} onChange={e => setSelEdicion(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 font-bold outline-none">{ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
            </div>

            <div className="flex gap-1 mb-6 bg-white p-1 rounded-lg border w-fit">
                {[{ id: "tabla", l: "Tabla", i: Trophy }, { id: "jugadores", l: "Jugadores", i: User }, { id: "equipos", l: "Equipos", i: Shield }, { id: "entrenadores", l: "Entrenadores", i: Briefcase }].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)} className={`px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 ${tab === t.id ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-100'}`}><t.i size={16} /> {t.l}</button>
                ))}
            </div>

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col">
                {tab !== "tabla" && (
                    <div className="p-4 border-b bg-gray-50 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-500 uppercase">Métrica:</span>
                            <div className="relative"><select value={metrica} onChange={e => setMetrica(e.target.value)} className="appearance-none pl-3 pr-8 py-2 border rounded bg-white text-sm font-bold w-64 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer">{listaMetricas().map((m, i) => <option key={i} value={m.value}>{m.label}</option>)}</select><ChevronDown size={14} className="absolute right-3 top-3 text-gray-400 pointer-events-none" /></div>
                        </div>
                        <div className="h-6 w-px bg-gray-300 mx-2"></div>
                        <div className="flex bg-white rounded border overflow-hidden">
                            <button onClick={() => setFiltroLugar("total")} className={`px-3 py-1.5 text-xs font-bold ${filtroLugar === "total" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>TOTAL</button>
                            <button onClick={() => setFiltroLugar("local")} className={`px-3 py-1.5 text-xs font-bold ${filtroLugar === "local" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>LOCAL</button>
                            <button onClick={() => setFiltroLugar("visitante")} className={`px-3 py-1.5 text-xs font-bold ${filtroLugar === "visitante" ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>VISITANTE</button>
                        </div>
                        <div className="flex bg-white rounded border overflow-hidden">
                            <button onClick={() => setFiltroModo("total")} className={`px-3 py-1.5 text-xs font-bold ${filtroModo === "total" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>CANTIDAD</button>
                            <button onClick={() => setFiltroModo("promedio")} className={`px-3 py-1.5 text-xs font-bold ${filtroModo === "promedio" ? "bg-green-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}>POR PARTIDO</button>
                        </div>
                    </div>
                )}

                {tab !== "tabla" ? (
                    <div className="flex-1 overflow-auto p-4">
                        <div className="max-w-5xl mx-auto">
                            <div className="flex justify-between text-xs text-gray-400 uppercase font-bold px-4 mb-2">
                                <div className="w-[40%]">{tab === 'equipos' ? 'Equipo' : 'Nombre'}</div>
                                {tab !== 'equipos' && <div className="w-[40%]">Equipo</div>}
                                <div className="flex gap-8 justify-end flex-1">
                                    <span>PJ</span>
                                    <span className="w-20 text-right text-blue-600">{filtroModo === 'promedio' ? 'Promedio' : 'Total'}</span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                {statsData.map((s, idx) => {
                                    let nac2Id = null;
                                    try { nac2Id = JSON.parse(s.nacionalidad2 || "[]")[0]; } catch { }

                                    return (
                                        <div key={s.id} className="flex items-center justify-between p-3 bg-white border rounded-lg shadow-sm hover:shadow-md transition-all group">
                                            {/* COLUMNA 1: PERSONA */}
                                            <div className="flex items-center gap-4 w-[40%]">
                                                <span className="font-black text-gray-300 text-xl w-6 text-center">{idx + 1}</span>
                                                <div className="w-12 h-12 rounded-full bg-gray-50 border overflow-hidden shrink-0"><ImagenLocal path={s.foto} alt="" /></div>
                                                <div className="min-w-0">
                                                    <div className="font-bold text-navy truncate">{s.nombre}</div>
                                                    {tab !== 'equipos' && (
                                                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                                            {s.bandera && <img src={convertFileSrc(s.bandera)} className="w-4 h-3 shadow-sm" alt="nac1" />}
                                                            {nac2Id && getFlagSrc(nac2Id) && <img src={getFlagSrc(nac2Id)!} className="w-4 h-3 shadow-sm opacity-80" alt="nac2" />}
                                                            {s.subtitulo && <span className="uppercase text-[10px] bg-gray-100 px-1 rounded">{s.subtitulo}</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* COLUMNA 2: EQUIPO */}
                                            {tab !== 'equipos' && (
                                                <div className="flex items-center gap-3 w-[40%] border-l pl-4 border-gray-100">
                                                    <div className="w-8 h-8 shrink-0"><ImagenLocal path={s.equipo_escudo} alt="" className="w-full h-full object-contain" /></div>
                                                    <span className="text-sm font-medium text-navy truncate">{s.equipo_nombre}</span>
                                                </div>
                                            )}

                                            {/* COLUMNA 3: VALOR */}
                                            <div className="flex items-center gap-8 justify-end flex-1 pl-4">
                                                <div className="text-gray-400 font-mono text-sm">{s.pj}</div>
                                                <div className="font-black text-3xl text-blue-600 w-20 text-right">{getValorVisual(s)}</div>
                                            </div>
                                        </div>
                                    );
                                })}
                                {statsData.length === 0 && <div className="text-center py-10 text-gray-400">No hay datos para esta métrica.</div>}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-50 text-xs text-gray-400 uppercase font-bold sticky top-0 z-10">
                                <tr>
                                    <th className="p-3 w-12 text-center">Pos</th>
                                    <th className="p-3">Equipo</th>
                                    <th className="p-3 w-12 text-center">PJ</th>
                                    <th className="p-3 w-12 text-center text-green-600">G</th>
                                    <th className="p-3 w-12 text-center text-orange-400">E</th>
                                    <th className="p-3 w-12 text-center text-red-500">P</th>
                                    <th className="p-3 w-12 text-center">GF</th>
                                    <th className="p-3 w-12 text-center">GC</th>
                                    <th className="p-3 w-12 text-center">DG</th>
                                    <th className="p-3 w-16 text-center bg-gray-100 text-navy font-black">PTS</th>
                                    <th className="p-3 w-24 text-center">Forma</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 text-sm">
                                {clasificacion.map((fila, idx) => (
                                    <tr key={fila.equipo_id} className={`hover:bg-gray-50`}>
                                        <td className="p-3 text-center font-bold">{idx + 1}</td>
                                        <td className="p-3 flex items-center gap-3">
                                            <div className="w-6 h-6"><ImagenLocal path={fila.escudo} alt="" /></div>
                                            <span className="font-bold text-navy">{fila.nombre}</span>
                                        </td>
                                        <td className="p-3 text-center">{fila.pj}</td>
                                        <td className="p-3 text-center font-bold">{fila.g}</td>
                                        <td className="p-3 text-center">{fila.e}</td>
                                        <td className="p-3 text-center">{fila.p}</td>
                                        <td className="p-3 text-center">{fila.gf}</td>
                                        <td className="p-3 text-center">{fila.gc}</td>
                                        <td className="p-3 text-center">{fila.dg}</td>
                                        <td className="p-3 text-center font-black text-lg bg-gray-50/50">{fila.puntos}</td>
                                        <td className="p-3 text-center flex gap-1 justify-center">
                                            {fila.forma.slice(-5).map((f, i) => (
                                                <div key={i} className={`w-2 h-2 rounded-full ${f === 'G' ? 'bg-green-500' : f === 'E' ? 'bg-orange-400' : 'bg-red-500'}`}></div>
                                            ))}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            <Modal isOpen={modalConfigOpen} onClose={() => setModalConfigOpen(false)} title="Configurar Colores">
                <div className="text-center text-gray-400 p-4">Configuración de colores de tabla (disponible en v1.1)</div>
            </Modal>
        </div>
    );
}