import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    Users, Trophy, Shield, Activity,
    MapPin, Goal, CalendarDays, FileClock, Trash2
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from "recharts";
import { toast } from "../components/Toast";
import { UndoToast, useUndoToast } from "../components/UndoToast";
import {
    listarBorradores, leerBorrador, borrarBorrador, guardarBorrador,
    BorradorPendiente, BorradorActa,
} from "../utils/actaDraft";

// --- INTERFACES DE DATOS ---
interface DashboardStats {
    totalEdiciones: number;
    totalEquipos: number;
    totalJugadores: number;
    totalPartidos: number;
    golesLocal: number;
    golesVisitante: number;
}

interface RankingPais {
    nombre: string;
    bandera: string | null;
    total: number;
}

interface StatsPosicion {
    name: string;
    value: number;
}

/** Borrador pendiente enriquecido con el nombre del partido (resuelto de la BD). */
interface PartidoBorrador extends BorradorPendiente {
    local: string | null;
    visitante: string | null;
    fecha: string | null;
}

function nombrePartido(b: { partidoId: number; local: string | null; visitante: string | null }): string {
    return b.local && b.visitante ? `${b.local} vs ${b.visitante}` : `Partido #${b.partidoId}`;
}

function haceCuanto(ts: number): string {
    const min = Math.floor((Date.now() - ts) / 60000);
    if (min < 1) return "hace instantes";
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.floor(h / 24);
    return `hace ${d} ${d === 1 ? "día" : "días"}`;
}

/** Widget: lista los borradores de acta pendientes (localStorage) con el nombre
    del partido resuelto desde la BD. Permite abrir el partido para recuperar el
    borrador o descartarlo (con deshacer). Se oculta cuando no hay ninguno. */
function BorradoresPendientes() {
    const [borradores, setBorradores] = useState<PartidoBorrador[]>([]);
    const { pendiente, push } = useUndoToast<{ clave: string; borrador: BorradorActa; nombre: string }>();

    const cargar = useCallback(async () => {
        const pendientes = listarBorradores();
        if (pendientes.length === 0) {
            setBorradores([]);
            return;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const enriquecidos = await Promise.all(pendientes.map(async (b) => {
                try {
                    const r = await db.select<any[]>(
                        `SELECT l.nombre as local, v.nombre as visitante, p.fecha_hora as fecha
                         FROM Partido p
                         JOIN Equipo l ON p.local_id = l.id
                         JOIN Equipo v ON p.visitante_id = v.id
                         WHERE p.id = ?`,
                        [b.partidoId]
                    );
                    return {
                        ...b,
                        local: (r[0]?.local as string) ?? null,
                        visitante: (r[0]?.visitante as string) ?? null,
                        fecha: (r[0]?.fecha as string) ?? null,
                    };
                } catch {
                    return { ...b, local: null, visitante: null, fecha: null };
                }
            }));
            setBorradores(enriquecidos);
        } catch (error) {
            console.error("Error resolviendo partidos de borradores:", error);
            toast.warning("No se pudieron resolver los equipos de los borradores");
            setBorradores(pendientes.map(b => ({ ...b, local: null, visitante: null, fecha: null })));
        }
    }, []);

    useEffect(() => {
        cargar();
    }, [cargar]);

    const descartar = (b: PartidoBorrador) => {
        const snapshot = leerBorrador(b.clave); // validado; null si corrupto
        borrarBorrador(b.clave);
        setBorradores(prev => prev.filter(x => x.clave !== b.clave));
        if (snapshot) push({ clave: b.clave, borrador: snapshot, nombre: nombrePartido(b) });
    };

    const deshacer = async (d: { clave: string; borrador: BorradorActa; nombre: string }) => {
        guardarBorrador(d.clave, d.borrador); // reemplaza el borrador sin borrar los demás
        await cargar();
        toast.info(`Borrador de ${d.nombre} restaurado`);
    };

    if (borradores.length === 0) return null;

    return (
        <div className="glass-panel p-6 rounded-2xl border border-warning/20 mb-8">
            <h3 className="font-display font-bold text-white mb-5 flex items-center gap-2 text-sm uppercase tracking-wider">
                <FileClock size={18} className="text-warning" /> Borradores de acta pendientes
                <span className="text-[10px] font-black bg-warning/15 text-warning border border-warning/25 rounded-full px-2 py-0.5">
                    {borradores.length}
                </span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {borradores.map((b) => {
                    const fechaOk = b.fecha && !isNaN(new Date(b.fecha).getTime())
                        ? ` · ${new Date(b.fecha).toLocaleDateString()}`
                        : "";
                    return (
                        <div key={b.clave} className="flex items-center gap-3 p-3 bg-white/5 border border-white/5 rounded-xl">
                            <div className="w-9 h-9 shrink-0 rounded-lg bg-warning/10 border border-warning/25 flex items-center justify-center">
                                <FileClock size={16} className="text-warning" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <Link
                                    to={`/partido/${b.partidoId}`}
                                    className="block text-sm font-bold text-white hover:text-orange transition-colors truncate"
                                >
                                    {nombrePartido(b)}
                                </Link>
                                <p className="text-[11px] text-silver/50 truncate">
                                    {b.jugConvocados} convocados · {haceCuanto(b.ts)}{fechaOk}
                                </p>
                            </div>
                            <Link
                                to={`/partido/${b.partidoId}`}
                                title="Abrir el partido para revisar y recuperar este borrador"
                                className="px-3 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-wider text-white bg-success/80 hover:bg-success transition-colors shrink-0"
                            >
                                Recuperar
                            </Link>
                            <button
                                onClick={() => descartar(b)}
                                title="Descartar borrador"
                                className="p-2 rounded-lg text-silver/40 hover:text-red hover:bg-red/10 transition-colors shrink-0"
                            >
                                <Trash2 size={15} />
                            </button>
                        </div>
                    );
                })}
            </div>
            <UndoToast
                pendiente={pendiente}
                onUndo={deshacer}
                mensaje={(d) => `Borrador de ${d.nombre} descartado`}
            />
        </div>
    );
}

export default function Dashboard() {
    const [stats, setStats] = useState<DashboardStats>({
        totalEdiciones: 0, totalEquipos: 0, totalJugadores: 0, totalPartidos: 0,
        golesLocal: 0, golesVisitante: 0
    });

    const [topPaisesJugadores, setTopPaisesJugadores] = useState<RankingPais[]>([]);
    const [topPaisesEquipos, setTopPaisesEquipos] = useState<RankingPais[]>([]);
    const [graficoPosiciones, setGraficoPosiciones] = useState<StatsPosicion[]>([]);

    useEffect(() => {
        cargarDatos();
    }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            // 1. KPIs GENERALES
            const resEdiciones = await db.select<any[]>("SELECT COUNT(*) as c FROM Edicion");
            const resEquipos = await db.select<any[]>("SELECT COUNT(*) as c FROM Equipo");
            const resJugadores = await db.select<any[]>("SELECT COUNT(*) as c FROM Persona WHERE roles LIKE '%Jugador%'");
            const resPartidos = await db.select<any[]>("SELECT COUNT(*) as c, SUM(goles_local) as gl, SUM(goles_visitante) as gv FROM Partido WHERE estado = 'finalizado'");

            setStats({
                totalEdiciones: resEdiciones[0].c,
                totalEquipos: resEquipos[0].c,
                totalJugadores: resJugadores[0].c,
                totalPartidos: resPartidos[0].c,
                golesLocal: resPartidos[0].gl || 0,
                golesVisitante: resPartidos[0].gv || 0
            });

            // 2. TOP PAÍSES JUGADORES
            const resTopJug = await db.select<RankingPais[]>(`
        SELECT pa.nombre, pa.bandera_path as bandera, COUNT(pe.id) as total
        FROM Persona pe
        JOIN Pais pa ON pe.nacionalidad_principal_id = pa.id
        WHERE pe.roles LIKE '%Jugador%'
        GROUP BY pa.id
        ORDER BY total DESC
        LIMIT 8
      `);
            setTopPaisesJugadores(resTopJug);

            // 3. TOP PAÍSES EQUIPOS
            const resTopEq = await db.select<RankingPais[]>(`
        SELECT pa.nombre, pa.bandera_path as bandera, COUNT(e.id) as total
        FROM Equipo e
        JOIN Pais pa ON e.pais_id = pa.id
        GROUP BY pa.id
        ORDER BY total DESC
        LIMIT 8
      `);
            setTopPaisesEquipos(resTopEq);

            // 4. GRÁFICA POSICIONES
            const resPos = await db.select<any[]>(`
        SELECT posicion_principal as name, COUNT(*) as value
        FROM Persona
        WHERE roles LIKE '%Jugador%' AND posicion_principal IS NOT NULL
        GROUP BY posicion_principal
      `);
            setGraficoPosiciones(resPos);

        } catch (error) {
            console.error("Error cargando dashboard:", error);
            toast.error("Error al cargar el dashboard");
        }
    }

    // Datos para gráfica circular
    const dataGoles = [
        { name: 'Local', value: stats.golesLocal },
        { name: 'Visitante', value: stats.golesVisitante },
    ];
    const COLORES_GOLES = ['#F28C28', '#00D2FF']; // Naranja Oficial y Azul Eléctrico

    return (
        <div className="p-8 min-h-screen bg-transparent ml-0">

            <div className="mb-8">
                <h1 className="text-3xl font-display font-black text-white tracking-tight text-glow-orange">Dashboard</h1>
                <p className="text-silver/60 text-sm mt-1">Resumen analítico global de Futsal Stats.</p>
            </div>

            {/* 0. BORRADORES DE ACTA PENDIENTES */}
            <BorradoresPendientes />

            {/* 1. TARJETAS KPI SUPERIORES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <KPICard icon={Trophy} title="Ediciones Activas" value={stats.totalEdiciones} gradient="from-orange/20 to-orange/5" iconColor="text-orange" />
                <KPICard icon={Shield} title="Equipos Registrados" value={stats.totalEquipos} gradient="from-accent-blue/20 to-accent-blue/5" iconColor="text-accent-blue" />
                <KPICard icon={Users} title="Jugadores" value={stats.totalJugadores} gradient="from-purple/20 to-purple/5" iconColor="text-purple-light" />
                <KPICard icon={CalendarDays} title="Partidos Jugados" value={stats.totalPartidos} gradient="from-green-500/20 to-green-500/5" iconColor="text-success" />
            </div>

            {/* 2. GRÁFICOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* GRÁFICO BARRAS: POSICIONES */}
                <div className="lg:col-span-2 glass-panel p-6 rounded-2xl border border-white/5">
                    <h3 className="font-display font-bold text-white mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Activity size={18} className="text-orange animate-pulse" /> Distribución por Posición
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={graficoPosiciones}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#C9CED6' }} axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#C9CED6', fontSize: 11 }} />
                                <Tooltip 
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }} 
                                    contentStyle={{ 
                                        backgroundColor: '#0B1F3B', 
                                        borderRadius: '12px', 
                                        border: '1px solid rgba(255,255,255,0.1)', 
                                        boxShadow: '0 8px 32px 0 rgba(0,0,0,0.5)',
                                        color: '#fff' 
                                    }} 
                                />
                                <Bar dataKey="value" fill="#F28C28" radius={[6, 6, 0, 0]} barSize={36} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* GRÁFICO DONUT: GOLES */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                    <h3 className="font-display font-bold text-white mb-6 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Goal size={18} className="text-accent-blue animate-pulse" /> Goles Local vs Visitante
                    </h3>
                    <div className="h-64 relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                                <Pie
                                    data={dataGoles}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={65}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {dataGoles.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORES_GOLES[index % COLORES_GOLES.length]} />
                                    ))}
                                </Pie>
                                <Tooltip 
                                    contentStyle={{ 
                                        backgroundColor: '#0B1F3B', 
                                        borderRadius: '12px', 
                                        border: '1px solid rgba(255,255,255,0.1)',
                                        color: '#fff'
                                    }} 
                                />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Texto central */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                            <span className="text-3xl font-display font-black text-white text-glow-orange">{stats.golesLocal + stats.golesVisitante}</span>
                            <span className="text-[9px] text-silver/40 uppercase tracking-widest font-black mt-1">Goles Totales</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. LISTAS TOP PAÍSES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* TOP PAÍSES JUGADORES */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                    <h3 className="font-display font-bold text-white mb-5 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <MapPin size={18} className="text-purple-light" /> Top Nacionalidades (Jugadores)
                    </h3>
                    <div className="space-y-2">
                        {topPaisesJugadores.map((pais, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-xl transition-all duration-300 group">
                                <div className="flex items-center gap-3">
                                    <span className={`font-display font-black w-6 text-center text-sm ${idx < 3 ? 'text-orange text-glow-orange' : 'text-silver/30'}`}>{idx + 1}</span>
                                    <img src={convertFileSrc(pais.bandera || "")} className="w-6 h-4 object-cover shadow-md rounded-sm border border-white/10" />
                                    <span className="text-sm font-medium text-silver/90 group-hover:text-white transition-colors">{pais.nombre}</span>
                                </div>
                                <div className="font-display font-bold text-white bg-white/5 border border-white/5 px-2.5 py-0.5 rounded-lg text-xs">
                                    {pais.total}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* TOP PAÍSES EQUIPOS */}
                <div className="glass-panel p-6 rounded-2xl border border-white/5">
                    <h3 className="font-display font-bold text-white mb-5 flex items-center gap-2 text-sm uppercase tracking-wider">
                        <Shield size={18} className="text-accent-blue" /> Top Países (Equipos)
                    </h3>
                    <div className="space-y-2">
                        {topPaisesEquipos.map((pais, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2.5 hover:bg-white/5 rounded-xl transition-all duration-300 group">
                                <div className="flex items-center gap-3">
                                    <span className={`font-display font-black w-6 text-center text-sm ${idx < 3 ? 'text-orange text-glow-orange' : 'text-silver/30'}`}>{idx + 1}</span>
                                    <img src={convertFileSrc(pais.bandera || "")} className="w-6 h-4 object-cover shadow-md rounded-sm border border-white/10" />
                                    <span className="text-sm font-medium text-silver/90 group-hover:text-white transition-colors">{pais.nombre}</span>
                                </div>
                                <div className="font-display font-bold text-white bg-white/5 border border-white/5 px-2.5 py-0.5 rounded-lg text-xs">
                                    {pais.total}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>

        </div>
    );
}

// Componente para las tarjetas de arriba
function KPICard({ icon: Icon, title, value, gradient, iconColor }: any) {
    return (
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl flex items-center gap-5 border border-white/5">
            <div className={`p-4 rounded-xl bg-gradient-to-br ${gradient} ${iconColor} border border-white/5 shadow-inner`}>
                <Icon size={22} className="animate-pulse" />
            </div>
            <div>
                <p className="text-[10px] text-silver/50 font-black uppercase tracking-wider">{title}</p>
                <p className="text-3xl font-display font-extrabold text-white mt-1">{value}</p>
            </div>
        </div>
    );
}