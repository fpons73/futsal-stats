import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import {
    Users, Trophy, Shield, Activity,
    MapPin, Goal, TrendingUp, CalendarDays
} from "lucide-react";
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend
} from "recharts";
import ImagenLocal from "../components/ImagenLocal";

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
        }
    }

    // Datos para gráfica circular
    const dataGoles = [
        { name: 'Local', value: stats.golesLocal },
        { name: 'Visitante', value: stats.golesVisitante },
    ];
    const COLORES_GOLES = ['#009E76', '#1F2E5C']; // Verde Futsal y Azul Navy

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            <div className="mb-8">
                <h1 className="text-3xl font-black text-navy">Dashboard</h1>
                <p className="text-gray-400">Resumen global de la base de datos.</p>
            </div>

            {/* 1. TARJETAS KPI SUPERIORES */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <KPICard icon={Trophy} title="Ediciones Activas" value={stats.totalEdiciones} color="bg-yellow-500" />
                <KPICard icon={Shield} title="Equipos Registrados" value={stats.totalEquipos} color="bg-blue-600" />
                <KPICard icon={Users} title="Jugadores" value={stats.totalJugadores} color="bg-purple-600" />
                <KPICard icon={CalendarDays} title="Partidos Finalizados" value={stats.totalPartidos} color="bg-green-600" />
            </div>

            {/* 2. GRÁFICOS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* GRÁFICO BARRAS: POSICIONES */}
                <div className="lg:col-span-2 bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-orange-500" /> Distribución por Posición
                    </h3>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={graficoPosiciones}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="name" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                                <YAxis axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: '#f3f4f6' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                <Bar dataKey="value" fill="#1F2E5C" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* GRÁFICO DONUT: GOLES */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                        <Goal size={20} className="text-green-600" /> Goles Local vs Visitante
                    </h3>
                    <div className="h-64 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={dataGoles}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {dataGoles.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORES_GOLES[index % COLORES_GOLES.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36} />
                            </PieChart>
                        </ResponsiveContainer>
                        {/* Texto central */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pb-8">
                            <span className="text-3xl font-black text-navy">{stats.golesLocal + stats.golesVisitante}</span>
                            <span className="text-xs text-gray-400 uppercase font-bold">Goles Totales</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. LISTAS TOP PAÍSES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* TOP PAÍSES JUGADORES */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                        <MapPin size={20} className="text-purple-600" /> Top Países (Jugadores)
                    </h3>
                    <div className="space-y-3">
                        {topPaisesJugadores.map((pais, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className={`font-bold w-6 text-center ${idx < 3 ? 'text-orange-500' : 'text-gray-400'}`}>{idx + 1}</span>
                                    <img src={convertFileSrc(pais.bandera || "")} className="w-6 h-4 object-cover shadow-sm border border-gray-100" />
                                    <span className="text-sm font-medium text-navy">{pais.nombre}</span>
                                </div>
                                <div className="font-bold text-navy bg-gray-100 px-2 py-0.5 rounded text-xs">
                                    {pais.total}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* TOP PAÍSES EQUIPOS */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                    <h3 className="font-bold text-navy mb-4 flex items-center gap-2">
                        <Shield size={20} className="text-blue-600" /> Top Países (Equipos)
                    </h3>
                    <div className="space-y-3">
                        {topPaisesEquipos.map((pais, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className={`font-bold w-6 text-center ${idx < 3 ? 'text-orange-500' : 'text-gray-400'}`}>{idx + 1}</span>
                                    <img src={convertFileSrc(pais.bandera || "")} className="w-6 h-4 object-cover shadow-sm border border-gray-100" />
                                    <span className="text-sm font-medium text-navy">{pais.nombre}</span>
                                </div>
                                <div className="font-bold text-navy bg-gray-100 px-2 py-0.5 rounded text-xs">
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
function KPICard({ icon: Icon, title, value, color }: any) {
    return (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex items-center gap-4 hover:-translate-y-1 transition-transform duration-300">
            <div className={`p-4 rounded-full ${color} text-white shadow-lg`}>
                <Icon size={24} />
            </div>
            <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">{title}</p>
                <p className="text-3xl font-black text-navy">{value}</p>
            </div>
        </div>
    );
}