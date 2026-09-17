import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { barrerBorradoresAntiguos } from "./utils/actaDraft";
import { registrarManejadoresGlobales } from "./utils/registroErrores";

// Captura global de errores (tarea 2.3): console.error, window.onerror y
// unhandledrejection alimentan el registro consultable desde la sidebar.
registrarManejadoresGlobales();

// Aplicar el tema ANTES del primer render para evitar destello de tema incorrecto:
// ThemeContext guarda en localStorage de forma síncrona, así que aquí basta con
// leerlo y poner la clase en <html> de inmediato (por defecto, oscuro).
(function aplicarTemaInicial() {
  try {
    const guardado = localStorage.getItem("theme");
    const tema = guardado === "light" || guardado === "dark" ? guardado : "dark";
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(tema);
  } catch {
    document.documentElement.classList.add("dark");
  }
})();

// Barrido de borradores de acta caducados (>7 días) o corruptos, ahora que viven
// en localStorage y sobreviven reinicios. Síncrono y barato: unas pocas claves.
barrerBorradoresAntiguos();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
