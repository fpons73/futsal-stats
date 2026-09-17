import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { inicialesDeNombre, tonoDeNombre } from "./ImagenSegura";

interface Props {
    path: string | null;
    alt: string;
    className?: string;
}

/** Imagen local de persona con red de seguridad (tarea 2.4 del hito 1.0).
 *  Ruta ausente, muerta (fichero movido/borrado, otra máquina) o fuera de
 *  scope → iniciales del nombre con tono determinista, nunca una imagen rota.
 *  Antes escondía el <img> e inyectaba un SVG por innerHTML (mutación fuera
 *  de React); ahora el fallback es estado del componente. */
export default function ImagenLocal({ path, alt, className }: Props) {
    const [rota, setRota] = useState(false);

    useEffect(() => {
        setRota(false);
    }, [path]);

    if (!path || rota) {
        const h = tonoDeNombre(alt);
        return (
            <div
                className={`flex items-center justify-center font-black select-none pointer-events-none ${className}`}
                style={{ background: `hsl(${h} 38% 20%)`, color: `hsl(${h} 75% 74%)` }}
                title={alt}
                aria-label={`Sin foto: ${alt}`}
            >
                <span className="leading-none">{inicialesDeNombre(alt)}</span>
            </div>
        );
    }

    // Usamos el método NATIVO que ya configuraste y funciona
    return (
        <img
            src={convertFileSrc(path)}
            alt={alt}
            className={`select-none pointer-events-none object-cover ${className}`}
            loading="lazy"
            onError={() => setRota(true)}
        />
    );
}