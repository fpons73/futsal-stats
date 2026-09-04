import { createContext, useContext, useEffect, useState } from "react";
import { getPreferencia, setPreferencia } from "../db";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("theme") : null;
    return (saved as Theme) || "dark";
  });

  useEffect(() => {
    async function cargarTemaInicial() {
      const saved = await getPreferencia("theme");
      if (saved === "dark" || saved === "light") {
        setTheme(saved as Theme);
      }
    }
    cargarTemaInicial();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    setPreferencia("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme debe usarse dentro de un ThemeProvider");
  }
  return context;
};
