import { useState, useEffect } from "react";
import { HashRouter as Router, Routes, Route } from "react-router-dom";
import Onboarding from "./components/Onboarding";
import { PantallaRecuperacion } from "./components/PantallaRecuperacion";
import { ThemeProvider } from "./context/ThemeContext";
import { EdicionProvider } from "./context/EdicionContext";
import { ModoProvider } from "./context/ModoContext";
import { iniciarBaseDeDatos, esBaseVacia, getPreferencia } from "./db";
import { aplicarCarpetaDatosAlArranque } from "./utils/carpetaDatos";
import Sidebar from "./components/Sidebar";
import PanelErrores from "./components/PanelErrores";
import { ToastContainer } from "./components/Toast";
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
  // Asistente de primera ejecución: solo con BD vacía y sin completar antes.
  const [onboarding, setOnboarding] = useState(false);
  // Recuperación de BD corrupta (tarea 1.4): diagnóstico y oferta de restaurar.
  const [recuperacion, setRecuperacion] = useState(false);
  // Registro global de errores (tarea 2.3): panel deslizante desde la sidebar.
  const [panelErrores, setPanelErrores] = useState(false);

  useEffect(() => {
    iniciarBaseDeDatos()
      // Tras iniciar la BD, aplicar la carpeta de datos configurada (si la hay)
      // para que fs y el protocolo de assets la permitan desde el primer render.
      .then(() => aplicarCarpetaDatosAlArranque())
      .then(async () => {
        // Comprobación PROACTIVA (tarea 1.4): SQLite es resiliente y la app puede
        // arrancar "bien" con páginas dañadas hasta que una consulta las pisa.
        // El integrity_check sobre ~7 MB tarda milisegundos: se hace en cada
        // arranque y, si detecta corrupción, se ofrece restaurar la última copia
        // ANTES de que el usuario trabaje sobre una BD herida.
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const diag = await invoke<{
            existe: boolean; integridad: string; esquema_ok: boolean; ultima_copia: string | null;
          }>("diagnosticar_bd");
          if (diag.existe && (!diag.esquema_ok || diag.integridad !== "ok")) {
            setError(diag.integridad.slice(0, 200));
            setRecuperacion(true);
            return; // no marcar dbReady: la pantalla de recuperación manda
          }
        } catch {
          // Si el diagnóstico falla (comando ausente, etc.) seguimos como siempre.
        }
        try {
          const completado = await getPreferencia("onboarding_completado");
          if (!completado && (await esBaseVacia())) setOnboarding(true);
        } catch {
          // Sin onboarding no bloqueamos el arranque normal.
        }
      })
      .then(() => setDbReady(true))
      .catch(async (e) => {
        console.error("Error iniciando DB:", e);
        setError(e?.message || "Error al inicializar la base de datos");
        // Camino reactivo: si iniciarBaseDeDatos revienta, mismo diagnóstico.
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const diag = await invoke<{
            existe: boolean; integridad: string; esquema_ok: boolean; ultima_copia: string | null;
          }>("diagnosticar_bd");
          if (diag.existe && (!diag.esquema_ok || diag.integridad !== "ok")) {
            setRecuperacion(true);
          }
        } catch {
          // Sin diagnóstico nos quedamos en la pantalla de error clásica.
        }
      });
  }, []);

  // La recuperación va ANTES que la pantalla de error clásica: cuando el
  // diagnóstico confirma corrupción, la oferta de restaurar manda.
  if (recuperacion) {
    return (
      <ThemeProvider>
        <PantallaRecuperacion
          error={error}
          onRestaurado={() => {
            setError(null);
            setRecuperacion(false);
            window.location.reload();
          }}
        />
      </ThemeProvider>
    );
  }

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

  if (onboarding) {
    return (
      <ThemeProvider>
        <Onboarding onSaltar={() => setOnboarding(false)} />
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ModoProvider>
        <EdicionProvider>
          <Router>
            <div className="flex min-h-screen bg-transparent text-white font-sans">
              <Sidebar alAbrirErrores={() => setPanelErrores(true)} />
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
              <PanelErrores abierto={panelErrores} onCerrar={() => setPanelErrores(false)} />
              <ToastContainer />
            </div>
          </Router>
        </EdicionProvider>
      </ModoProvider>
    </ThemeProvider>
  );
}

export default App;
