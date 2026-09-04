import { createContext, useContext, useState, useEffect } from "react";
import { getPreferencia, setPreferencia } from "../db";

type Modo = "Clubes" | "Selecciones" | "Ambos" | null;

interface ModoContextType {
  modoSeleccionado: Modo;
  setModo: (modo: Modo) => void;
}

const ModoContext = createContext<ModoContextType | undefined>(undefined);

export function ModoProvider({ children }: { children: React.ReactNode }) {
  const [modoSeleccionado, setModoSeleccionado] = useState<Modo>(null);

  useEffect(() => {
    async function cargarModo() {
      const saved = await getPreferencia("modo_seleccionado");
      if (saved === "Clubes" || saved === "Selecciones" || saved === "Ambos") {
        setModoSeleccionado(saved as Modo);
      }
    }
    cargarModo();
  }, []);

  const setModo = (modo: Modo) => {
    setModoSeleccionado(modo);
    if (modo) {
      setPreferencia("modo_seleccionado", modo);
    }
  };

  return (
    <ModoContext.Provider value={{ modoSeleccionado, setModo }}>
      {children}
    </ModoContext.Provider>
  );
}

export const useModo = () => {
  const context = useContext(ModoContext);
  if (context === undefined) {
    throw new Error("useModo debe usarse dentro de un ModoProvider");
  }
  return context;
};
