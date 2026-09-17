import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

// Imágenes con red de seguridad (tarea 2.4 del hito 1.0).
//
// En la BD no hay URLs remotas: hay rutas locales que pueden estar muertas
// (carpeta movida, otra máquina, fichero borrado) — convertFileSrc las sirve
// igual y el <img> rompe sin decir nada. Estos componentes muestran, en su
// lugar, las iniciales del nombre con un tono determinista (mismo nombre →
// mismo color, estable entre sesiones y páginas).

/** Iniciales representativas: 1ª letra de las dos primeras palabras ("CP Ferro"
 *  → "CF"), o las 2 primeras de la palabra única ("Barcelona" → "BA"). */
export function inicialesDeNombre(nombre: string | null | undefined): string {
    const limpio = String(nombre ?? "").replace(/\(.*?\)/g, " ").trim();
    const palabras = limpio.split(/[\s\-_/.,]+/).filter(Boolean);
    if (palabras.length === 0) return "?";
    if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase();
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
}

/** Tono HSL determinista a partir del nombre (0-359): mismo nombre, mismo color. */
export function tonoDeNombre(nombre: string | null | undefined): number {
    let h = 0;
    for (const c of String(nombre ?? "?")) {
        h = (h * 31 + c.charCodeAt(0)) % 360;
    }
    return h;
}

function srcDeRuta(ruta: string): string {
    // Rutas remotas https se usan tal cual (la CSP las permite); todo lo
    // demás se trata como fichero local vía convertFileSrc.
    return /^https:\/\//i.test(ruta) ? ruta : convertFileSrc(ruta);
}

type Estado = "pendiente" | "ok" | "error";

/** Hook común: resetea el estado si cambia la ruta y escucha el fallo de carga. */
function useImagen(ruta: string | null | undefined) {
    const [estado, setEstado] = useState<Estado>(ruta ? "pendiente" : "error");
    useEffect(() => {
        setEstado(ruta ? "pendiente" : "error");
    }, [ruta]);
    return { estado, alFallar: () => setEstado("error"), alCargar: () => setEstado("ok") };
}

function PlaceholderIniciales({
    nombre, className = "", cuadradas = false,
}: { nombre: string | null | undefined; className?: string; cuadradas?: boolean }) {
    const h = tonoDeNombre(nombre);
    return (
        <div
            className={`flex items-center justify-center font-black select-none ${cuadradas ? "rounded-lg" : ""} ${className}`}
            style={{
                background: `hsl(${h} 38% 20%)`,
                color: `hsl(${h} 75% 74%)`,
            }}
            title={nombre ?? undefined}
            aria-label={nombre ? `Sin imagen: ${nombre}` : "Sin imagen"}
        >
            <span className="leading-none">{inicialesDeNombre(nombre)}</span>
        </div>
    );
}

/** Escudo/logo de equipo o competición. Ruta muerta o ausente → iniciales. */
export function Escudo({
    ruta, nombre, className = "",
}: { ruta: string | null | undefined; nombre: string; className?: string }) {
    const { estado, alFallar, alCargar } = useImagen(ruta);
    if (!ruta || estado === "error") {
        return <PlaceholderIniciales nombre={nombre} className={`w-full h-full ${className}`} cuadradas />;
    }
    return (
        <img
            src={srcDeRuta(ruta)}
            alt={nombre}
            loading="lazy"
            onError={alFallar}
            onLoad={alCargar}
            className={`object-contain ${className}`}
        />
    );
}

/** Bandera de país. En tamaños pequeños (w-6 h-4) las iniciales no caben:
 *  un chip del tono del país basta para saber que falta la imagen sin romper
 *  la línea. `etiqueta` alimenta el title. */
export function Bandera({
    ruta, nombre, className = "",
}: { ruta: string | null | undefined; nombre: string | null | undefined; className?: string }) {
    const { estado, alFallar, alCargar } = useImagen(ruta);
    if (!ruta || estado === "error") {
        const h = tonoDeNombre(nombre);
        return (
            <span
                className={`inline-block rounded-sm border border-white/10 ${className}`}
                style={{ background: `hsl(${h} 30% 30%)` }}
                title={nombre ? `${nombre} (sin bandera)` : "Sin bandera"}
                aria-label={nombre ? `Sin bandera: ${nombre}` : "Sin bandera"}
            />
        );
    }
    return (
        <img
            src={srcDeRuta(ruta)}
            alt={nombre ?? "bandera"}
            loading="lazy"
            onError={alFallar}
            onLoad={alCargar}
            className={`object-cover ${className}`}
        />
    );
}

/** Foto de persona (jugador, entrenador, árbitro). Sin foto o rota → iniciales
 *  de nombre deportivo o nombre+apellidos. */
export function AvatarPersona({
    ruta, nombre, className = "",
}: { ruta: string | null | undefined; nombre: string; className?: string }) {
    const { estado, alFallar, alCargar } = useImagen(ruta);
    if (!ruta || estado === "error") {
        return <PlaceholderIniciales nombre={nombre} className={`w-full h-full ${className}`} />;
    }
    return (
        <img
            src={srcDeRuta(ruta)}
            alt={nombre}
            loading="lazy"
            onError={alFallar}
            onLoad={alCargar}
            className={`object-cover ${className}`}
        />
    );
}
