import { Link, useLocation } from "react-router-dom";
import { LayoutDashboard, Globe, Flag, Trophy, Users, Shirt, Calendar, Settings } from "lucide-react";
import logo from "../assets/logo.png";
import { Layers } from "lucide-react"; // <--- NO OLVIDES IMPORTAR EL ICONO ARRIBA
import { ListOrdered } from "lucide-react";
import { UserCog } from "lucide-react";
import { Gavel } from "lucide-react";
import { MapPin } from "lucide-react";
import { UserCheck } from "lucide-react";
import { UserPlus } from "lucide-react";
import { CalendarDays } from "lucide-react";
import { BarChart3 } from "lucide-react";

const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/" },
    { icon: Globe, label: "Confederaciones", path: "/confederaciones" }, // NUEVO
    { icon: Flag, label: "Países", path: "/paises" },                   // NUEVO
    { icon: Trophy, label: "Competiciones", path: "/competiciones" },
    { icon: Calendar, label: "Temporadas", path: "/temporadas" },
    { icon: ListOrdered, label: "Fases", path: "/fases" },
    { icon: Users, label: "Equipos", path: "/equipos" },
    { icon: Shirt, label: "Jugadores", path: "/jugadores" },
    { icon: UserCog, label: "Entrenadores", path: "/entrenadores" },
    { icon: Gavel, label: "Árbitros", path: "/arbitros" },
    { icon: MapPin, label: "Pabellones", path: "/pabellones" },
    { icon: Layers, label: "Ediciones", path: "/ediciones" },
    { icon: UserPlus, label: "Inscripción Equipos", path: "/inscripcion-equipos" },
    { icon: Shirt, label: "Plantillas", path: "/plantillas" },
    { icon: UserCheck, label: "Designaciones", path: "/designaciones" },
    { icon: CalendarDays, label: "Partidos", path: "/partidos" },
    { icon: BarChart3, label: "Centro de Datos", path: "/centro-datos" },
    { icon: Settings, label: "Configuración", path: "/configuracion" },


];

export default function Sidebar() {
    const location = useLocation();

    return (
        <aside className="w-64 bg-navy text-silver border-r border-navy-light h-screen flex flex-col fixed left-0 top-0 z-50 shadow-xl">
            {/* CABECERA */}
            <div className="h-20 flex items-center gap-3 px-6 border-b border-navy-light bg-navy-dark">
                <img src={logo} alt="Logo" className="w-9 h-9 object-contain bg-white rounded-full p-0.5" />
                <div>
                    <h1 className="font-bold text-white tracking-wide text-sm leading-none">GLOBAL FUTSAL</h1>
                    <span className="text-[10px] text-orange tracking-wider uppercase font-semibold">Stats System</span>
                </div>
            </div>

            {/* NAVEGACIÓN */}
            <nav className="flex-1 overflow-y-auto py-6">
                <ul className="space-y-2 px-3">
                    {menuItems.map((item) => {
                        const isActive = location.pathname === item.path;
                        const Icon = item.icon;
                        return (
                            <li key={item.path}>
                                <Link
                                    to={item.path}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 group ${isActive
                                        ? "bg-gradient-to-r from-blue-900 to-purple text-white shadow-lg border-l-4 border-orange"
                                        : "hover:bg-navy-light hover:text-white text-silver/80"
                                        }`}
                                >
                                    <Icon size={20} className={`transition-colors ${isActive ? "text-white" : "text-silver/60 group-hover:text-orange"}`} />
                                    {item.label}
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </nav>

            {/* FOOTER */}
            <div className="p-4 border-t border-navy-light bg-navy-dark/50 text-xs text-silver/40 text-center">
                v1.0.0 · Licencia Pro
            </div>
        </aside>
    );
}