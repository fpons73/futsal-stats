import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
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
import Confederaciones from "./pages/Confederaciones"; // <--- ASEGURATE DE IMPORTAR ESTO
import CentroDatos from "./pages/CentroDatos";

function App() {
  return (
    <Router>
      <div className="flex min-h-screen bg-gray-50 text-gray-900 font-sans">

        <Sidebar />

        <main className="flex-1 ml-64 p-0 overflow-auto">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/centro-datos" element={<CentroDatos />} />

            {/* Gestión */}
            <Route path="/confederaciones" element={<Confederaciones />} /> {/* <--- AQUÍ ESTABA EL ERROR */}
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

            <Route path="*" element={<div className="p-10 text-gray-400">Página no encontrada</div>} />
          </Routes>
        </main>

      </div>
    </Router>
  );
}

export default App;