import { X } from "lucide-react";
import { useEffect } from "react";

interface ModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", handleEsc);
        return () => window.removeEventListener("keydown", handleEsc);
    }, [onClose]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            {/* HEMOS CAMBIADO max-w-md POR max-w-4xl PARA QUE SEA MAS ANCHO */}
            <div className="bg-white w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">

                {/* Cabecera */}
                <div className="bg-navy px-6 py-4 flex justify-between items-center border-b border-navy-light shrink-0">
                    <h3 className="text-white font-bold text-lg">{title}</h3>
                    <button onClick={onClose} className="text-silver hover:text-white hover:bg-white/10 p-1 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Cuerpo con Scroll si es necesario */}
                <div className="p-6 overflow-y-auto">
                    {children}
                </div>

            </div>
        </div>
    );
}