import { createContext, useContext, useState, useCallback, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { getPreferencia, setPreferencia } from "../db";

interface EdicionInfo {
  id: number;
  nombre: string;
  competicion_nombre: string;
  temporada_nombre: string;
}

interface EdicionContextType {
  edicionActiva: EdicionInfo | null;
  ediciones: EdicionInfo[];
  setEdicionActiva: (ed: EdicionInfo | null) => void;
  refrescar: () => Promise<void>;
  cargando: boolean;
}

const EdicionContext = createContext<EdicionContextType | undefined>(undefined);

export function EdicionProvider({ children }: { children: React.ReactNode }) {
  const [edicionActiva, setEdicionActivaState] = useState<EdicionInfo | null>(null);
  const [ediciones, setEdiciones] = useState<EdicionInfo[]>([]);
  const [cargando, setCargando] = useState(true);

  const refrescar = useCallback(async () => {
    setCargando(true);
    try {
      const db = await Database.load("sqlite:globalfutsal.db");
      // Cargar todas las ediciones
      const todas = await db.select<any[]>(`
        SELECT ed.id, ed.nombre, c.nombre as competicion_nombre, t.nombre as temporada_nombre
        FROM Edicion ed
        JOIN Competicion c ON ed.competicion_id = c.id
        JOIN Temporada t ON ed.temporada_id = t.id
        ORDER BY t.nombre DESC, c.nombre ASC
      `);
      const mapped = todas.map(r => ({
        id: r.id,
        nombre: r.nombre || `${r.competicion_nombre} ${r.temporada_nombre}`,
        competicion_nombre: r.competicion_nombre,
        temporada_nombre: r.temporada_nombre,
      }));
      setEdiciones(mapped);

      // Cargar edición activa guardada
      const savedId = await getPreferencia("edicion_activa_id");
      if (savedId) {
        const found = mapped.find(e => e.id === parseInt(savedId));
        if (found) setEdicionActivaState(found);
      }
    } catch (e) {
      console.error("Error al cargar ediciones:", e);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    refrescar();
  }, [refrescar]);

  const setEdicionActiva = useCallback((ed: EdicionInfo | null) => {
    setEdicionActivaState(ed);
    if (ed) {
      setPreferencia("edicion_activa_id", String(ed.id));
    }
  }, []);

  return (
    <EdicionContext.Provider value={{ edicionActiva, ediciones, setEdicionActiva, refrescar, cargando }}>
      {children}
    </EdicionContext.Provider>
  );
}

export const useEdicion = () => {
  const context = useContext(EdicionContext);
  if (context === undefined) {
    throw new Error("useEdicion debe usarse dentro de un EdicionProvider");
  }
  return context;
};
