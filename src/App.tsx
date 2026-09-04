import { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "./context/ThemeContext";
import { EdicionProvider } from "./context/EdicionContext";
import { ModoProvider } from "./context/ModoContext";
import { iniciarBaseDeDatos } from "./db";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Competiciones from "./pages/Competiciones";
import Temporadas from "./pages/Temporadas";
import Ediciones from "./pages/Ediciones";
import Fases from "./pages/Fases";
import Partidos from "./pages/Partidos";
import DetallePartido from "./pages/DetallePartido";
import Equipos from "./pages/Equipos";
import InscripcionEquipos from "./pages/InscripcionEquipos";
import Plantillas from "./pages/Plantillas";
import Jugadores from "./pages/Jugadores";
import Entrenadores from "./pages/Entrenadores";
import Arbitros from "./pages/Arbitros";
import DesignacionArbitros from "./pages/DesignacionArbitros";
import Pabellones from "./pages/Pabellones";
import Paises from "./pages/Paises";
import Confederaciones from "./pages/Confederaciones";
import CentroDatos from "./pages/CentroDatos";
import Rankings from "./pages/Rankings";
import Importar from "./pages/Importar";
import Configuracion from "./pages/Configuracion";

function App() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    iniciarBaseDeDatos()
      .then(() => setDbReady(true))
      .catch((e) => {
        console.error("Error iniciando DB:", e);
        setError(e?.message || "Error al inicializar la base de datos");
      });
  }, []);

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center text-white">
        <div className="text-center max-w-md p-8">
          <div className="text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-black mb-2">Error de Base de Datos</h1>
          <p className="text-silver/60 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!dbReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-12 h-12 border-4 border-orange/20 border-t-orange rounded-full animate-spin mb-4"></div>
          <h2 className="text-white font-display font-black text-lg tracking-widest uppercase">
            Inicializando GlobalFutsal...
          </h2>
          <p className="text-silver/40 text-xs mt-2">Cargando base de datos y configuración</p>
        </div>
      </div>
    );
  }

  return (
    <ThemeProvider>
      <ModoProvider>
        <EdicionProvider>
          <Router>
            <div className="flex min-h-screen bg-transparent text-white font-sans">
              <Sidebar />
              <main className="flex-1 ml-64 p-0 overflow-auto">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/centro-datos" element={<CentroDatos />} />
                  <Route path="/rankings" element={<Rankings />} />
                  <Route path="/importar" element={<Importar />} />
                  <Route path="/configuracion" element={<Configuracion />} />

                  {/* Gestión */}
                  <Route path="/confederaciones" element={<Confederaciones />} />
                  <Route path="/paises" element={<Paises />} />
                  <Route path="/competiciones" element={<Competiciones />} />
                  <Route path="/temporadas" element={<Temporadas />} />
                  <Route path="/ediciones" element={<Ediciones />} />
                  <Route path="/fases" element={<Fases />} />

                  {/* Partidos */}
                  <Route path="/partidos" element={<Partidos />} />
                  <Route path="/partido/:id" element={<DetallePartido />} />

                  {/* Equipos y Personas */}
                  <Route path="/equipos" element={<Equipos />} />
                  <Route path="/inscripcion-equipos" element={<InscripcionEquipos />} />
                  <Route path="/plantillas" element={<Plantillas />} />
                  <Route path="/jugadores" element={<Jugadores />} />
                  <Route path="/entrenadores" element={<Entrenadores />} />
                  <Route path="/arbitros" element={<Arbitros />} />
                  <Route path="/designaciones" element={<DesignacionArbitros />} />

                  {/* Datos Maestros */}
                  <Route path="/pabellones" element={<Pabellones />} />

                  <Route path="*" element={<div className="p-10 text-silver/40">Página no encontrada</div>} />
                </Routes>
              </main>
            </div>
          </Router>
        </EdicionProvider>
      </ModoProvider>
    </ThemeProvider>
  );
}

export default App;
