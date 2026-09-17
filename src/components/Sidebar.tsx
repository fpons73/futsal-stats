import { Link, useLocation } from "react-router-dom";
import {
    LayoutDashboard, Globe, Flag, Trophy, Users, Shirt, Calendar,
    Settings, Layers, ListOrdered, UserCog, Gavel, MapPin,
    UserPlus, UserCheck, CalendarDays, BarChart3, Sun, Moon,
    Download, Star, Shield, AlertOctagon
} from "lucide-react";
import { registroErrores } from "../utils/registroErrores";
import { useEffect, useState } from "react";
import logo from "../assets/logo.png";
import { useTheme } from "../context/ThemeContext";
import { useEdicion } from "../context/EdicionContext";

/* Navegación agrupada por secciones para escaneo rápido. */
const secciones: { titulo: string; items: { icon: typeof LayoutDashboard; label: string; path: string }[] }[] = [
    {
        titulo: "Principal",
        items: [
            { icon: LayoutDashboard, label: "Dashboard", path: "/" },
            { icon: CalendarDays, label: "Partidos", path: "/partidos" },
            { icon: Star, label: "Rankings", path: "/rankings" },
            { icon: BarChart3, label: "Centro Datos", path: "/centro-datos" },
        ],
    },
    {
        titulo: "Competición",
        items: [
            { icon: Globe, label: "Confederaciones", path: "/confederaciones" },
            { icon: Flag, label: "Países", path: "/paises" },
            { icon: Trophy, label: "Competiciones", path: "/competiciones" },
            { icon: Calendar, label: "Temporadas", path: "/temporadas" },
            { icon: ListOrdered, label: "Fases", path: "/fases" },
            { icon: Layers, label: "Ediciones", path: "/ediciones" },
        ],
    },
    {
        titulo: "Clubes y personas",
        items: [
            { icon: Users, label: "Equipos", path: "/equipos" },
            { icon: UserPlus, label: "Inscripción", path: "/inscripcion-equipos" },
            { icon: Shirt, label: "Jugadores", path: "/jugadores" },
            { icon: UserCog, label: "Entrenadores", path: "/entrenadores" },
            { icon: Gavel, label: "Árbitros", path: "/arbitros" },
            { icon: UserCheck, label: "Designaciones", path: "/designaciones" },
        ],
    },
    {
        titulo: "Sistema",
        items: [
            { icon: MapPin, label: "Pabellones", path: "/pabellones" },
            { icon: Download, label: "Importar", path: "/importar" },
            { icon: Settings, label: "Configuración", path: "/configuracion" },
        ],
    },
];

interface SidebarProps {
    /** Abre el panel del registro de errores (tarea 2.3). */
    alAbrirErrores?: () => void;
}

export default function Sidebar({ alAbrirErrores }: SidebarProps) {
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { edicionActiva, setEdicionActiva, ediciones } = useEdicion();
    // Badge del registro de errores: nº de entradas no vistas (se refresca al suscribirse).
    const [noVistos, setNoVistos] = useState(registroErrores.noVistos());
    useEffect(() => registroErrores.suscribir(() => setNoVistos(registroErrores.noVistos())), []);

    const isDark = theme === "dark";

    return (
        <aside className="w-64 bg-navy-dark/90 backdrop-blur-xl border-r border-white/10 h-screen flex flex-col fixed left-0 top-0 z-50 shadow-glass">
            {/* CABECERA DE MARCA */}
            <div className="h-20 shrink-0 flex items-center gap-3 px-5 border-b border-white/10 bg-gradient-to-r from-orange/10 via-transparent to-transparent">
                <div className="relative shrink-0">
                    <img src={logo} alt="Logo" className="w-10 h-10 object-contain bg-white rounded-full p-0.5 border-2 border-orange shadow-neon-orange" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-success border-2 border-navy-dark rounded-full" title="Sistema activo" />
                </div>
                <div className="leading-tight">
                    <h1 className="font-display font-black text-white tracking-wide text-sm">GLOBAL FUTSAL</h1>
                    <span className="text-[9px] text-orange tracking-[0.2em] uppercase font-black">Stats System</span>
                </div>
            </div>

            {/* SELECTOR DE EDICIÓN */}
            {ediciones.length > 0 && (
                <div className="px-3 py-3 border-b border-white/10 shrink-0">
                    <label className="flex items-center gap-1.5 text-[9px] font-black text-silver/40 uppercase tracking-widest mb-1.5 px-1">
                        <Shield size={10} /> Edición activa
                    </label>
                    <select
                        value={edicionActiva?.id || ""}
                        onChange={e => {
                            const ed = ediciones.find(x => x.id === parseInt(e.target.value));
                            if (ed) setEdicionActiva(ed);
                        }}
                        className="w-full p-2 text-xs font-bold bg-navy-light/60 border border-white/10 rounded-lg text-white outline-none cursor-pointer focus:border-orange focus:ring-1 focus:ring-orange/40 transition-all"
                    >
                        {ediciones.map(ed => (
                            <option key={ed.id} value={ed.id}>{ed.nombre}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* NAVEGACIÓN AGRUPADA */}
            <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
                {secciones.map(seccion => (
                    <div key={seccion.titulo}>
                        <div className="text-[9px] font-black text-silver/30 uppercase tracking-[0.18em] px-2 mb-1">{seccion.titulo}</div>
                        <ul className="space-y-0.5">
                            {seccion.items.map(item => {
                                const isActive = location.pathname === item.path;
                                const Icon = item.icon;
                                return (
                                    <li key={item.path}>
                                        <Link
                                            to={item.path}
                                            className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-semibold transition-all duration-200 group
                                                ${isActive
                                                    ? "bg-gradient-to-r from-orange/25 via-orange/10 to-transparent text-white shadow-neon-orange/50"
                                                    : "text-silver/70 hover:bg-white/5 hover:text-white hover:translate-x-0.5"}`}
                                        >
                                            {/* Indicador activo */}
                                            <span className={`absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-r-full bg-orange transition-all duration-200 ${isActive ? "opacity-100 shadow-neon-orange" : "opacity-0"}`} />
                                            <Icon size={17} className={`shrink-0 transition-colors duration-200 ${isActive ? "text-orange" : "text-silver/40 group-hover:text-orange"}`} />
                                            <span className="truncate">{item.label}</span>
                                        </Link>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </nav>

            {/* REGISTRO DE ERRORES (tarea 2.3) */}
            <div className="px-3 pt-3 shrink-0">
                <button
                    onClick={alAbrirErrores}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold text-silver/70 hover:bg-white/5 hover:text-white transition-all"
                    title="Registro de errores de la aplicación"
                >
                    <span className="flex items-center gap-2">
                        <AlertOctagon size={16} className="text-silver/40" />
                        Registro de errores
                    </span>
                    {noVistos > 0 && (
                        <span className="min-w-5 h-5 px-1.5 rounded-full bg-red text-white text-[10px] font-black flex items-center justify-center shadow">
                            {noVistos > 99 ? "99+" : noVistos}
                        </span>
                        )}
                </button>
            </div>

            {/* TOGGLE TEMA */}
            <div className="p-3 border-t border-white/10 shrink-0">
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-semibold text-silver/70 hover:bg-white/5 hover:text-white transition-all"
                >
                    <span className="flex items-center gap-2">
                        {isDark ? <Moon size={16} className="text-orange" /> : <Sun size={16} className="text-warning" />}
                        {isDark ? "Modo Oscuro" : "Modo Claro"}
                    </span>
                    <span className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isDark ? "bg-orange" : "bg-silver/30"}`}>
                        <span className={`block w-4 h-4 rounded-full bg-white shadow transition-transform ${isDark ? "translate-x-4" : "translate-x-0"}`} />
                    </span>
                </button>
            </div>

            {/* FOOTER */}
            <div className="px-4 pb-3 shrink-0 text-[10px] text-silver/30 text-center font-bold uppercase tracking-widest">
                v2.0.0 · GlobalFutsal
            </div>
        </aside>
    );
}
