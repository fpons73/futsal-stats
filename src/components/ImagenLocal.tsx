import { convertFileSrc } from "@tauri-apps/api/core";
import { User } from "lucide-react";

interface Props {
    path: string | null;
    alt: string;
    className?: string;
}

export default function ImagenLocal({ path, alt, className }: Props) {

    // Si no hay ruta, mostramos un icono por defecto
    if (!path) {
        return (
            <div className={`flex items-center justify-center bg-gray-100 text-gray-400 select-none pointer-events-none ${className}`}>
                <User className="w-1/2 h-1/2 opacity-50" />
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
            onError={(e) => {
                // Si la imagen falla (ruta mal, movida, etc), ocultamos la imagen rota y mostramos un fondo gris
                e.currentTarget.style.display = 'none';
                // Buscamos el contenedor padre para ponerle un icono de error si queremos, o dejarlo gris
                if (e.currentTarget.parentElement) {
                    e.currentTarget.parentElement.classList.add('bg-gray-200', 'flex', 'items-center', 'justify-center');
                    e.currentTarget.parentElement.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image-off text-gray-400 w-1/2 h-1/2 opacity-50"><line x1="2" x2="22" y1="2" y2="22"/><path d="M10.41 10.41a2 2 0 1 1-2.83-2.83"/><line x1="13.5" x2="6" y1="13.5" y2="21"/><line x1="18" x2="21" y1="12" y2="15"/><path d="M3.59 3.59A1.99 1.99 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.052-.22 1.41-.59"/><path d="M21 15V5a2 2 0 0 0-2-2H9"/></svg>';
                }
            }}
        />
    );
}