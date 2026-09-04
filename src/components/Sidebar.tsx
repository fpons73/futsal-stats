import { Link, useLocation } from "react-router-dom";
import {
    LayoutDashboard, Globe, Flag, Trophy, Users, Shirt, Calendar,
    Settings, Layers, ListOrdered, UserCog, Gavel, MapPin,
    UserPlus, UserCheck, CalendarDays, BarChart3, Sun, Moon,
    Download, Star
} from "lucide-react";
import logo from "../assets/logo.png";
import { useTheme } from "../context/ThemeContext";
import { useEdicion } from "../context/EdicionContext";

const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Globe, label: "Confederaciones", path: "/confederaciones" },
    { icon: Flag, label: "Países", path: "/paises" },
    { icon: Trophy, label: "Competiciones", path: "/competiciones" },
    { icon: Calendar, label: "Temporadas", path: "/temporadas" },
    { icon: ListOrdered, label: "Fases", path: "/fases" },
    { icon: Layers, label: "Ediciones", path: "/ediciones" },
    { icon: Users, label: "Equipos", path: "/equipos" },
    { icon: UserPlus, label: "Inscripción", path: "/inscripcion-equipos" },
    { icon: Shirt, label: "Jugadores", path: "/jugadores" },
    { icon: UserCog, label: "Entrenadores", path: "/entrenadores" },
    { icon: Gavel, label: "Árbitros", path: "/arbitros" },
    { icon: UserCheck, label: "Designaciones", path: "/designaciones" },
    { icon: MapPin, label: "Pabellones", path: "/pabellones" },
    { icon: CalendarDays, label: "Partidos", path: "/partidos" },
    { icon: Star, label: "Rankings", path: "/rankings" },
    { icon: BarChart3, label: "Centro Datos", path: "/centro-datos" },
    { icon: Download, label: "Importar", path: "/importar" },
    { icon: Settings, label: "Configuración", path: "/configuracion" },
];

export default function Sidebar() {
    const location = useLocation();
    const { theme, toggleTheme } = useTheme();
    const { edicionActiva, setEdicionActiva, ediciones } = useEdicion();

    const isDark = theme === "dark";

    return (
        <aside className={`w-64 ${isDark ? 'bg-navy-dark/85' : 'bg-slate-800/95'} backdrop-blur-xl border-r border-white/5 h-screen flex flex-col fixed left-0 top-0 z-50 shadow-glass`}>
            {/* CABECERA */}
            <div className="h-20 flex items-center gap-3 px-6 border-b border-white/5 bg-navy-dark/60">
                <div className="relative flex items-center justify-center">
                    <img src={logo} alt="Logo" className="w-9 h-9 object-contain bg-white rounded-full p-0.5 border border-orange/40 shadow-neon-orange" />
                    <div className="absolute inset-0 rounded-full bg-orange/10 animate-pulse pointer-events-none"></div>
                </div>
                <div>
                    <h1 className="font-display font-extrabold text-white tracking-wide text-sm leading-none text-glow-orange">GLOBAL FUTSAL</h1>
                    <span className="text-[9px] text-orange tracking-widest uppercase font-black">Stats System</span>
                </div>
            </div>

            {/* SELECTOR DE EDICIÓN */}
            {ediciones.length > 0 && (
                <div className="px-3 py-3 border-b border-white/5">
                    <label className="block text-[9px] font-black text-silver/40 uppercase tracking-widest mb-1.5 px-2">Edición Activa</label>
                    <select
                        value={edicionActiva?.id || ""}
                        onChange={e => {
                            const ed = ediciones.find(x => x.id === parseInt(e.target.value));
                            if (ed) setEdicionActiva(ed);
                        }}
                        className="w-full p-2 text-xs font-bold bg-navy border border-white/10 rounded-lg text-white outline-none cursor-pointer focus:border-orange"
                    >
                        {ediciones.map(ed => (
                            <option key={ed.id} value={ed.id}>{ed.nombre}</option>
                        ))}
                    </select>
                </div>
            )}

            {/* NAVEGACIÓN */}
            <nav className="flex-1 overflow-y-auto py-4">
                <ul className="space-y-1 px-3">
                    {menuItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        const Icon = item.icon;
                        return (
                            <li key={item.path}>
                                <Link
                                    to={item.path}
                                    className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-300 group hover:scale-[1.02] active:scale-[0.98] ${isActive
                                        ? "bg-gradient-to-r from-navy-light/85 to-navy/40 text-white shadow-neon-orange border-l-[3px] border-orange"
                                        : "hover:bg-white/5 hover:text-white text-silver/70"
                                        }`}
                                >
                                    <Icon size={18} className={`transition-colors duration-300 ${isActive ? "text-orange animate-pulse" : "text-silver/40 group-hover:text-orange"}`} />
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* TOGGLE THEME */}
            <div className="p-3 border-t border-white/5">
                <button
                    onClick={toggleTheme}
                    className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg text-sm font-medium text-silver/70 hover:bg-white/5 hover:text-white transition-all"
                >
                    <span className="flex items-center gap-2">
                        {isDark ? <Moon size={16} className="text-orange" /> : <Sun size={16} className="text-yellow-400" />}
                        {isDark ? "Modo Oscuro" : "Modo Claro"}
                    </span>
                    <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${isDark ? 'bg-orange' : 'bg-slate-500'}`}>
                        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${isDark ? 'translate-x-4' : 'translate-x-0'}`}></div>
                    </div>
                </button>
            </div>

            {/* FOOTER */}
            <div className="p-4 border-t border-white/5 bg-navy-dark/40 text-[10px] text-silver/30 text-center font-semibold uppercase tracking-wider">
                v2.0.0 · GlobalFutsal
            </div>
        </aside>
    );
}
