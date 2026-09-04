import { useState, useEffect, useRef } from "react";
import Database from "@tauri-apps/plugin-sql";
import { useNavigate } from "react-router-dom";
import { Calendar, Plus, Edit, Trash2, Eye, Ticket, AlertCircle, Upload, Eraser } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";
import Papa from "papaparse";

// --- HELPERS PARA NORMALIZACIÓN Y SIMILITUD DE TEXTO ---
function normalizarTexto(texto: string): string {
    return texto
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Quitar tildes y diacríticos
        .replace(/[^a-z0-9\s]/g, "")     // Quitar caracteres no alfanuméricos
        .replace(/\s+/g, " ")            // Espacios múltiples a uno solo
        .trim();
}

function calcularLevenshtein(a: string, b: string): number {
    const tmp: number[][] = [];
    for (let i = 0; i <= a.length; i++) tmp[i] = [i];
    for (let j = 0; j <= b.length; j++) tmp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            tmp[i][j] = a[i - 1] === b[j - 1] 
                ? tmp[i - 1][j - 1] 
                : Math.min(tmp[i - 1][j] + 1, tmp[i][j - 1] + 1, tmp[i - 1][j - 1] + 1);
        }
    }
    return tmp[a.length][b.length];
}

function obtenerSimilitudTexto(a: string, b: string): number {
    const dist = calcularLevenshtein(a, b);
    const maxLen = Math.max(a.length, b.length);
    return maxLen === 0 ? 1.0 : 1.0 - (dist / maxLen);
}

interface Partido {
    id: number;
    edicion_id: number;
    fase_id: number | null;
    fase_nombre?: string; // Nombre traído por JOIN
    jornada: string;
    fecha_hora: string;
    estadio_nombre?: string;
    local_nombre: string; local_escudo: string | null;
    visitante_nombre: string; visitante_escudo: string | null;
    local_bandera?: string | null;
    visitante_bandera?: string | null;
    goles_local: number; goles_visitante: number;
    estado: string;
    local_id: number; visitante_id: number;
    estadio_id: number | null;
    arbitro_id: number | null;
    arbitro_2_id: number | null;
    arbitro_3_id: number | null;
    arbitro_nombre?: string;
    arbitro_2_nombre?: string;
    arbitro_3_nombre?: string;
    espectadores: number;
    goles_descanso_local: number; goles_descanso_visitante: number;
    prorroga: number;
    penaltis_local: number; penaltis_visitante: number;
    local_grupo?: string;
}

interface Selector { id: number; nombre: string; }

export default function Partidos() {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [partidoParaImportar, setPartidoParaImportar] = useState<Partido | null>(null);
    const [partidos, setPartidos] = useState<Partido[]>([]);

    // --- ESTADOS PARA IMPORTADOR DE CALENDARIO PDF ---
    const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
    const [calendarImportStep, setCalendarImportStep] = useState(1);
    const [calendarMatches, setCalendarMatches] = useState<any[]>([]);
    const [calendarUniqueTeams, setCalendarUniqueTeams] = useState<string[]>([]);
    const [teamMappings, setTeamMappings] = useState<Record<string, string>>({});
    const [todosLosEquiposDb, setTodosLosEquiposDb] = useState<Selector[]>([]);
    const [isImportingCalendar, setIsImportingCalendar] = useState(false);
    const [importProgress, setImportProgress] = useState(0);
    const [importSummary, setImportSummary] = useState("");
    const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
    const [idPartidoABorrar, setIdPartidoABorrar] = useState<number | null>(null);
    const [nombrePartidoABorrar, setNombrePartidoABorrar] = useState("");
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const [ediciones, setEdiciones] = useState<Selector[]>([]);
    const [fases, setFases] = useState<Selector[]>([]);
    const [equipos, setEquipos] = useState<Selector[]>([]);
    const [pabellones, setPabellones] = useState<Selector[]>([]);
    const [arbitros, setArbitros] = useState<Selector[]>([]);
    const [jornadasExistentes, setJornadasExistentes] = useState<string[]>([]);

    // Filtros UI
    const [filtroEdicion, setFiltroEdicion] = useState(() => sessionStorage.getItem("partidos_filtroEdicion") || "");
    const [filtroFase, setFiltroFase] = useState(() => sessionStorage.getItem("partidos_filtroFase") || "todas");
    const [filtroGrupo, setFiltroGrupo] = useState(() => sessionStorage.getItem("partidos_filtroGrupo") || "todos");
    const [grupos, setGrupos] = useState<string[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    // Micro-modals para creación rápida
    const [isStadiumModalOpen, setIsStadiumModalOpen] = useState(false);
    const [stadiumForm, setStadiumForm] = useState({ nombre: "", ciudad: "" });
    const [isRefereeModalOpen, setIsRefereeModalOpen] = useState(false);
    const [refereeForm, setRefereeForm] = useState({ nombre: "", apellidos: "", nombre_deportivo: "" });

    const [form, setForm] = useState({
        edicion: "", fase: "",
        local: "", visitante: "",
        fecha: "", hora: "20:00",
        pabellon: "", arbitro: "", arbitro_2: "", arbitro_3: "", espectadores: 0,
        estado: "programado",
        goles_local: 0, goles_visitante: 0,
        descanso_local: 0, descanso_visitante: 0,
        con_prorroga: false,
        penaltis_local: 0, penaltis_visitante: 0,
        jornada_texto: ""
    });

    // 1. Carga inicial
    useEffect(() => { cargarEdiciones(); cargarPabellones(); }, []);

    // 2. Al cambiar edición
    useEffect(() => {
        if (filtroEdicion) {
            cargarFasesYEquipos(filtroEdicion);
        }
    }, [filtroEdicion]);

    // 3. Al cambiar filtros
    useEffect(() => {
        if (filtroEdicion) {
            cargarPartidos();
        } else {
            setPartidos([]);
        }
    }, [filtroEdicion, filtroFase, filtroGrupo]);

    // Guardar filtros en sessionStorage al cambiar
    useEffect(() => {
        if (filtroEdicion) {
            sessionStorage.setItem("partidos_filtroEdicion", filtroEdicion);
        }
    }, [filtroEdicion]);

    useEffect(() => {
        sessionStorage.setItem("partidos_filtroFase", filtroFase);
    }, [filtroFase]);

    useEffect(() => {
        sessionStorage.setItem("partidos_filtroGrupo", filtroGrupo);
    }, [filtroGrupo]);

    const triggerFileInput = () => {
        fileInputRef.current?.click();
    };

    const abrirImportadorParaPartido = (p: Partido) => {
        setPartidoParaImportar(p);
        setTimeout(() => {
            triggerFileInput();
        }, 50);
    };

    const limpiarDatosPartido = async (p: Partido) => {
        if (!confirm(`¿Estás seguro de que deseas limpiar todos los datos del partido ${p.local_nombre} vs ${p.visitante_nombre}? Se eliminarán todas las alineaciones, eventos y estadísticas, y el marcador volverá a cero.`)) {
            return;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [p.id]);
            await db.execute("DELETE FROM Evento WHERE partido_id = $1", [p.id]);
            await db.execute("DELETE FROM EstadisticaPartidoEquipo WHERE partido_id = $1", [p.id]);
            await db.execute("DELETE FROM EstadisticaPartidoJugador WHERE partido_id = $1", [p.id]);
            await db.execute(`
                UPDATE Partido SET 
                goles_local = 0, goles_visitante = 0, 
                goles_descanso_local = 0, goles_descanso_visitante = 0, 
                estado = 'programado' 
                WHERE id = $1
            `, [p.id]);
            
            cargarPartidos();
            alert("¡Se han eliminado correctamente todas las alineaciones, eventos y estadísticas del encuentro! Su estado ha vuelto a 'Programado' ✅");
        } catch (err: any) {
            console.error(err);
            alert("Error al limpiar los datos del partido: " + err.message);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Papa.parse(file, {
            complete: async (results) => {
                const rows = results.data as string[][];
                await procesarEImportarCSV(rows);
            },
            error: (error) => {
                alert("Error al leer el archivo CSV: " + error.message);
            },
            skipEmptyLines: true,
            delimiter: ";"
        });

        // Limpiar el input
        e.target.value = "";
    };

    async function procesarEImportarCSV(rows: string[][]) {
        if (!partidoParaImportar) {
            return alert("No hay ningún partido seleccionado para la importación.");
        }

        const partidoId = partidoParaImportar.id;
        const localId = partidoParaImportar.local_id;
        const visitanteId = partidoParaImportar.visitante_id;
        const localNombreDb = partidoParaImportar.local_nombre;
        const visitanteNombreDb = partidoParaImportar.visitante_nombre;
        const edicionId = partidoParaImportar.edicion_id;

        try {
            // 1. Extraer y clasificar datos del CSV
            const info: Record<string, string> = {};
            const jugadores: { equipo: string; dorsal: number; nombre: string; rol: string; jugo: boolean }[] = [];
            const goles: { equipo: string; autor: string; minuto: number; tipo: string }[] = [];
            const tarjetas: { equipo: string; jugador: string; color: string; minuto: number }[] = [];

            for (const row of rows) {
                if (row.length < 2) continue;
                const seccion = row[0]?.trim();
                const equipo = row[1]?.trim();

                if (seccion === 'Info') {
                    const clave = row[2]?.trim();
                    const valor = row[3]?.trim();
                    if (clave && valor) {
                        info[clave] = valor;
                    }
                } else if (seccion === 'Jugador') {
                    const dorsal = parseInt(row[2]?.trim() || "0") || 0;
                    const nombre = row[3]?.trim();
                    const rol = row[4]?.trim(); // Titular / Suplente
                    const jugo = row[5]?.trim() === 'Sí';
                    if (nombre) {
                        jugadores.push({ equipo, dorsal, nombre, rol, jugo });
                    }
                } else if (seccion === 'Gol') {
                    const autor = row[2]?.trim();
                    const minutoStr = row[3]?.trim() || "0";
                    const minuto = parseInt(minutoStr.replace("'", "")) || 0;
                    const tipo = row[4]?.trim() || "Normal";
                    if (autor) {
                        goles.push({ equipo, autor, minuto, tipo });
                    }
                } else if (seccion === 'Tarjeta') {
                    const jugador = row[2]?.trim();
                    const color = row[3]?.trim(); // Amarilla / Roja
                    const minutoStr = row[4]?.trim() || "0";
                    const minuto = parseInt(minutoStr.replace("'", "")) || 0;
                    if (jugador) {
                        tarjetas.push({ equipo, jugador, color, minuto });
                    }
                }
            }

            const csvLocalNombre = info['Equipo Local'];
            const csvVisitanteNombre = info['Equipo Visitante'];
            if (!csvLocalNombre || !csvVisitanteNombre) {
                return alert("El archivo CSV no contiene información válida de los equipos local o visitante en la sección 'Info'.");
            }

            const db = await Database.load("sqlite:globalfutsal.db");

            // Llevar el conteo de entidades creadas de forma automática
            const entidadesCreadas: string[] = [];

            // 2. Obtener o crear país por defecto (España)
            let paisId = 1;
            const paisesDb = await db.select<{ id: number }[]>("SELECT id FROM Pais LIMIT 1");
            if (paisesDb.length > 0) {
                paisId = paisesDb[0].id;
            } else {
                const resPais = await db.execute(
                    "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('España', 'ES', 'ESP')"
                );
                paisId = resPais.lastInsertId!;
                entidadesCreadas.push("País por defecto: España");
            }

            // Mapeador del nombre del equipo en el CSV a la base de datos
            // Mapeamos directamente por posición local/visitante, así no hay duda si cambia el nombre
            const mapearEquipoId = (nombreCSV: string) => {
                if (nombreCSV === csvLocalNombre) return localId;
                if (nombreCSV === csvVisitanteNombre) return visitanteId;
                // Si no coincide exacto, buscamos coincidencia parcial
                if (nombreCSV.toLowerCase().includes(csvLocalNombre.toLowerCase()) || csvLocalNombre.toLowerCase().includes(nombreCSV.toLowerCase())) return localId;
                return visitanteId;
            };

            const mapearEquipoNombreDb = (nombreCSV: string) => {
                return mapearEquipoId(nombreCSV) === localId ? localNombreDb : visitanteNombreDb;
            };

            // 3. Obtener o crear Estadio (Pabellón)
            let estadioId: number | null = null;
            const estadioNombre = info['Estadio'];
            if (estadioNombre) {
                const estDb = await db.select<{ id: number }[]>("SELECT id FROM Estadio WHERE nombre = $1", [estadioNombre]);
                if (estDb.length > 0) {
                    estadioId = estDb[0].id;
                } else {
                    const resEst = await db.execute(
                        "INSERT INTO Estadio (nombre, pais_id) VALUES ($1, $2)",
                        [estadioNombre, paisId]
                    );
                    estadioId = resEst.lastInsertId!;
                    entidadesCreadas.push(`Pabellón CREADO: ${estadioNombre}`);
                }
            }

            // 4. Actualizar Partido en la Base de Datos
            // Convertir Fecha de DD/MM/YYYY a YYYY-MM-DD
            const fechaRaw = info['Fecha'] || "";
            let fecha = new Date().toISOString().split('T')[0];
            if (fechaRaw) {
                const partes = fechaRaw.split("/");
                if (partes.length === 3) {
                    fecha = `${partes[2]}-${partes[1]}-${partes[0]}`;
                }
            }
            const hora = info['Hora'] || "20:00";
            const fechaHora = `${fecha} ${hora}`;

            const resultadoFinal = info['Resultado Final'] || "0-0";
            const [golesLoc, golesVis] = resultadoFinal.split("-").map(x => parseInt(x) || 0);

            const resultadoDescanso = info['Resultado Descanso'] || "0-0";
            const [golesDescansoLoc, golesDescansoVis] = resultadoDescanso.split("-").map(x => parseInt(x) || 0);

            await db.execute(`
                UPDATE Partido SET 
                fecha_hora = $1, estadio_id = $2, 
                goles_local = $3, goles_visitante = $4, 
                goles_descanso_local = $5, goles_descanso_visitante = $6, estado = 'finalizado'
                WHERE id = $7
            `, [fechaHora, estadioId, golesLoc, golesVis, golesDescansoLoc, golesDescansoVis, partidoId]);

            // 5. Procesar Personas (Entrenadores y Jugadores) con Fuzzy Matching Inteligente


            const NOMBRES_COMUNES = new Set([
                "gabriel", "ivan", "david", "ruben", "gonzalo", "diogo", "matias", "alex", "xavier", 
                "dennis", "niko", "jon", "adrian", "jorge", "pablo", "cristian", "manu", "victor", 
                "lucas", "tiago", "leo", "hugo", "bruno", "caio", "diego", "danilo", "felipe", 
                "matheus", "pedro", "joao", "santiago", "alejandro", "daniel", "mateo", "luis", 
                "carlos", "marcos", "miguel", "jose", "antonio", "francisco", "manuel"
            ]);

            const registrarPersonaYPlantillaInteligente = async (
                nombreCSV: string, 
                dorsalCSV: number, 
                eqId: number, 
                eqNombre: string, 
                esEntrenador: boolean
            ) => {
                const rolPlantilla = esEntrenador ? 'Entrenador' : 'Jugador';
                const nombreCSVNorm = normalizarTexto(nombreCSV);
                const palabrasCSV = nombreCSVNorm.split(" ").filter(p => p.length > 2); // palabras clave del CSV

                // A. Buscar coincidencia en la plantilla actual de este equipo en esta edición
                const plantillaDb = await db.select<any[]>(`
                    SELECT p.id as persona_id, p.nombre, p.nombre_deportivo, pl.dorsal, pl.id as plantilla_id
                    FROM Plantilla pl
                    JOIN Persona p ON pl.persona_id = p.id
                    WHERE pl.edicion_id = $1 AND pl.equipo_id = $2 AND pl.rol = $3
                `, [edicionId, eqId, rolPlantilla]);

                // 1. INTENTAR MATCH EXACTO O POR SIMILITUD LEVENSHTEIN DE ALTA FIDELIDAD EN PLANTILLA (MÁXIMA PRIORIDAD)
                for (const p of plantillaDb) {
                    const nombreDbNorm = normalizarTexto(p.nombre || "");
                    const depoDbNorm = normalizarTexto(p.nombre_deportivo || "");

                    // Match exacto normalizado de nombre completo o nombre deportivo (100% seguro)
                    if (nombreDbNorm === nombreCSVNorm || depoDbNorm === nombreCSVNorm) {
                        if (p.dorsal !== dorsalCSV && !esEntrenador) {
                            await db.execute("UPDATE Plantilla SET dorsal = $1 WHERE id = $2", [dorsalCSV, p.plantilla_id]);
                            entidadesCreadas.push(`Dorsal de ${p.nombre_deportivo || p.nombre} actualizado a ${dorsalCSV} en la plantilla de ${eqNombre}`);
                        }
                        return p.persona_id;
                    }

                    // Match por Levenshtein de alta fidelidad (>= 0.85 similitud)
                    const simNombre = obtenerSimilitudTexto(nombreCSVNorm, nombreDbNorm);
                    const simDepo = obtenerSimilitudTexto(nombreCSVNorm, depoDbNorm);
                    if (simNombre >= 0.85 || simDepo >= 0.85) {
                        if (p.dorsal !== dorsalCSV && !esEntrenador) {
                            await db.execute("UPDATE Plantilla SET dorsal = $1 WHERE id = $2", [dorsalCSV, p.plantilla_id]);
                            entidadesCreadas.push(`Dorsal de ${p.nombre_deportivo || p.nombre} actualizado a ${dorsalCSV} en la plantilla de ${eqNombre}`);
                        }
                        return p.persona_id;
                    }
                }

                // 2. INTENTAR MATCH POR DORSAL EXACTO + COMPARTIR PALABRA CLAVE EN PLANTILLA
                for (const p of plantillaDb) {
                    const nombreDbNorm = normalizarTexto(p.nombre || "");
                    const depoDbNorm = normalizarTexto(p.nombre_deportivo || "");

                    if (!esEntrenador && p.dorsal === dorsalCSV && p.dorsal > 0) {
                        const compartePalabra = palabrasCSV.some(pal => nombreDbNorm.includes(pal) || depoDbNorm.includes(pal));
                        if (compartePalabra) {
                            return p.persona_id;
                        }
                    }
                }

                // 3. INTENTAR MATCH POR CONTENCION INTELIGENTE EN PLANTILLA
                for (const p of plantillaDb) {
                    const depoDbNorm = normalizarTexto(p.nombre_deportivo || "");

                    const csvContieneDb = nombreCSVNorm.includes(depoDbNorm) && depoDbNorm.length > 2;
                    const dbContieneCsv = depoDbNorm.includes(nombreCSVNorm) && nombreCSVNorm.length > 2;

                    if (csvContieneDb || dbContieneCsv) {
                        const parteComun = csvContieneDb ? depoDbNorm : nombreCSVNorm;
                        // Evitamos emparejamientos por nombres de pila comunes de una sola palabra
                        if (NOMBRES_COMUNES.has(parteComun) && parteComun.split(" ").length === 1) {
                            continue;
                        }
                        if (p.dorsal !== dorsalCSV && !esEntrenador) {
                            await db.execute("UPDATE Plantilla SET dorsal = $1 WHERE id = $2", [dorsalCSV, p.plantilla_id]);
                            entidadesCreadas.push(`Dorsal de ${p.nombre_deportivo || p.nombre} actualizado a ${dorsalCSV} en la plantilla de ${eqNombre}`);
                        }
                        return p.persona_id;
                    }
                }

                // B. Si no está en la plantilla, buscar en toda la base de datos de Persona (global)
                const rolStr = esEntrenador ? 'entrenador' : 'jugador';
                const personasGlobalDb = await db.select<any[]>(`
                    SELECT id, nombre, nombre_deportivo FROM Persona WHERE roles LIKE $1
                `, [`%${rolStr}%`]);

                // 1. Match exacto global o por Levenshtein de alta fidelidad global
                for (const p of personasGlobalDb) {
                    const nombreDbNorm = normalizarTexto(p.nombre || "");
                    const depoDbNorm = normalizarTexto(p.nombre_deportivo || "");

                    if (nombreDbNorm === nombreCSVNorm || depoDbNorm === nombreCSVNorm) {
                        await db.execute(
                            "INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, dorsal, rol) VALUES ($1, $2, $3, $4, $5)",
                            [edicionId, eqId, p.id, dorsalCSV, rolPlantilla]
                        );
                        entidadesCreadas.push(`Jugador existente [${p.nombre_deportivo || p.nombre}] incorporado a plantilla de ${eqNombre} con Dorsal ${dorsalCSV}`);
                        return p.id;
                    }

                    const simNombre = obtenerSimilitudTexto(nombreCSVNorm, nombreDbNorm);
                    const simDepo = obtenerSimilitudTexto(nombreCSVNorm, depoDbNorm);
                    if (simNombre >= 0.85 || simDepo >= 0.85) {
                        await db.execute(
                            "INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, dorsal, rol) VALUES ($1, $2, $3, $4, $5)",
                            [edicionId, eqId, p.id, dorsalCSV, rolPlantilla]
                        );
                        entidadesCreadas.push(`Jugador existente [${p.nombre_deportivo || p.nombre}] incorporado a plantilla de ${eqNombre} con Dorsal ${dorsalCSV}`);
                        return p.id;
                    }
                }

                // 2. Match global por contención inteligente
                for (const p of personasGlobalDb) {
                    const depoDbNorm = normalizarTexto(p.nombre_deportivo || "");

                    const csvContieneDb = nombreCSVNorm.includes(depoDbNorm) && depoDbNorm.length > 2;
                    const dbContieneCsv = depoDbNorm.includes(nombreCSVNorm) && nombreCSVNorm.length > 2;

                    if (csvContieneDb || dbContieneCsv) {
                        const parteComun = csvContieneDb ? depoDbNorm : nombreCSVNorm;
                        if (NOMBRES_COMUNES.has(parteComun) && parteComun.split(" ").length === 1) {
                            continue;
                        }
                        await db.execute(
                            "INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, dorsal, rol) VALUES ($1, $2, $3, $4, $5)",
                            [edicionId, eqId, p.id, dorsalCSV, rolPlantilla]
                        );
                        entidadesCreadas.push(`Jugador existente [${p.nombre_deportivo || p.nombre}] incorporado a plantilla de ${eqNombre} con Dorsal ${dorsalCSV}`);
                        return p.id;
                    }
                }

                // C. Si no existe de ninguna forma, la creamos desde cero
                const resPers = await db.execute(
                    "INSERT INTO Persona (nombre, apellidos, nombre_deportivo, roles, nacionalidad_principal_id) VALUES ($1, '', $2, $3, $4)",
                    [nombreCSV, nombreCSV, rolStr, paisId]
                );
                const nuevaPersonaId = resPers.lastInsertId!;
                entidadesCreadas.push(`Jugador CREADO: ${nombreCSV} (Dorsal ${dorsalCSV}) en ${eqNombre}`);

                // Inscribir en la plantilla
                await db.execute(
                    "INSERT INTO Plantilla (edicion_id, equipo_id, persona_id, dorsal, rol) VALUES ($1, $2, $3, $4, $5)",
                    [edicionId, eqId, nuevaPersonaId, dorsalCSV, rolPlantilla]
                );

                return nuevaPersonaId;
            };

            let entrenadorLocalId: number | null = null;
            const entrenadorLocalNombre = info['Entrenador Local'];
            if (entrenadorLocalNombre) {
                entrenadorLocalId = await registrarPersonaYPlantillaInteligente(entrenadorLocalNombre, 0, localId, localNombreDb, true);
            }

            let entrenadorVisitanteId: number | null = null;
            const entrenadorVisitanteNombre = info['Entrenador Visitante'];
            if (entrenadorVisitanteNombre) {
                entrenadorVisitanteId = await registrarPersonaYPlantillaInteligente(entrenadorVisitanteNombre, 0, visitanteId, visitanteNombreDb, true);
            }

            // 6. Limpiar alineaciones y eventos anteriores del partido
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [partidoId]);
            await db.execute("DELETE FROM Evento WHERE partido_id = $1", [partidoId]);

            // 7. Procesar Jugadores y Convocatorias
            const personasMap: Record<string, number> = {};

            for (const jug of jugadores) {
                const eqId = mapearEquipoId(jug.equipo);
                const eqNombreDb = mapearEquipoNombreDb(jug.equipo);
                const personaId = await registrarPersonaYPlantillaInteligente(jug.nombre, jug.dorsal, eqId, eqNombreDb, false);
                personasMap[jug.nombre] = personaId;

                const titularVal = jug.rol === 'Titular' ? 1 : (jug.jugo ? 0 : 2);
                const entrenadorId = eqId === localId ? entrenadorLocalId : entrenadorVisitanteId;
                await db.execute(`
                    INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan, entrenador_id)
                    VALUES ($1, $2, $3, $4, $5, 'Jugador', 0, $6)
                `, [partidoId, eqId, personaId, titularVal, jug.dorsal, entrenadorId]);
            }

            // Guardar entrenadores en la alineación también como convocados
            if (entrenadorLocalId) {
                await db.execute(`
                    INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan)
                    VALUES ($1, $2, $3, 0, 0, 'Entrenador', 0)
                `, [partidoId, localId, entrenadorLocalId]);
            }
            if (entrenadorVisitanteId) {
                await db.execute(`
                    INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan)
                    VALUES ($1, $2, $3, 0, 0, 'Entrenador', 0)
                `, [partidoId, visitanteId, entrenadorVisitanteId]);
            }

            // 8. Procesar Goles
            for (const gol of goles) {
                const eqId = mapearEquipoId(gol.equipo);
                const jugadorId = personasMap[gol.autor] || null;

                let subtipo = 'JUGADA';
                if (gol.tipo === 'Penalti') subtipo = 'PENALTI';
                else if (gol.tipo === 'Propia puerta') subtipo = 'PROPIA_PUERTA';

                await db.execute(`
                    INSERT INTO Evento (partido_id, minuto, tipo, subtipo, equipo_id, jugador_id)
                    VALUES ($1, $2, 'GOL', $3, $4, $5)
                `, [partidoId, gol.minuto, subtipo, eqId, jugadorId]);
            }

            // 9. Procesar Tarjetas
            for (const tar of tarjetas) {
                const eqId = mapearEquipoId(tar.equipo);
                const jugadorId = personasMap[tar.jugador] || null;

                let tipo = 'TARJETA_AMARILLA';
                if (tar.color === 'Roja') tipo = 'TARJETA_ROJA';
                else if (tar.color === 'Doble amarilla') tipo = 'DOBLE_AMARILLA';

                await db.execute(`
                    INSERT INTO Evento (partido_id, minuto, tipo, subtipo, equipo_id, jugador_id)
                    VALUES ($1, $2, $3, NULL, $4, $5)
                `, [partidoId, tar.minuto, tipo, eqId, jugadorId]);
            }

            // 10. Inicializar / Actualizar Estadísticas de Equipo
            const inicializarStatsEquipo = async (eqId: number, tarjetasAmarillas: number, tarjetasRojas: number) => {
                const sDb = await db.select<{ id: number }[]>(
                    "SELECT id FROM EstadisticaPartidoEquipo WHERE partido_id = $1 AND equipo_id = $2",
                    [partidoId, eqId]
                );
                const paramsStats = [
                    partidoId, eqId, 50.0, 0.0, 0, 0, 0, 0, 0, 0, tarjetasAmarillas, tarjetasRojas, 0, 0
                ];
                if (sDb.length === 0) {
                    await db.execute(`
                        INSERT INTO EstadisticaPartidoEquipo (
                            partido_id, equipo_id, posesion, xG, tiros, tiros_puerta, tiros_palo, corners, faltas, fueras_juego,
                            tarjetas_amarillas, tarjetas_rojas, penaltis_cometidos, penaltis_concedidos
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                    `, paramsStats);
                } else {
                    await db.execute(`
                        UPDATE EstadisticaPartidoEquipo SET
                        posesion = $3, xG = $4, tiros = $5, tiros_puerta = $6, tiros_palo = $7, corners = $8, faltas = $9, fueras_juego = $10,
                        tarjetas_amarillas = $11, tarjetas_rojas = $12, penaltis_cometidos = $13, penaltis_concedidos = $14
                        WHERE partido_id = $1 AND equipo_id = $2
                    `, paramsStats);
                }
            };

            const countTarjetas = (eqNom: string, col: string) => tarjetas.filter(t => mapearEquipoId(t.equipo) === (eqNom === csvLocalNombre ? localId : visitanteId) && t.color === col).length;

            await inicializarStatsEquipo(localId, countTarjetas(csvLocalNombre, 'Amarilla'), countTarjetas(csvLocalNombre, 'Roja'));
            await inicializarStatsEquipo(visitanteId, countTarjetas(csvVisitanteNombre, 'Amarilla'), countTarjetas(csvVisitanteNombre, 'Roja'));

            // 11. Recargar partidos
            cargarPartidos();

            // Mensaje de éxito al usuario detallando lo creado automáticamente de forma Fiel
            let mensajeExito = `¡Partido ${localNombreDb} vs ${visitanteNombreDb} importado correctamente con todas sus alineaciones y eventos! ⚽🚀`;
            if (entidadesCreadas.length > 0) {
                mensajeExito += `\n\n⚠️ NOTA: Se realizaron automáticamente las siguientes ${entidadesCreadas.length} acciones/creaciones en la base de datos:\n` + entidadesCreadas.map(e => "• " + e).join("\n");
            } else {
                mensajeExito += `\n\n✅ Todos los jugadores, entrenadores y el estadio ya existían en la base de datos de forma correcta.`;
            }
            alert(mensajeExito);

        } catch (err: any) {
            console.error(err);
            alert("Error al procesar e importar el partido: " + err.message);
        } finally {
            setPartidoParaImportar(null);
        }
    }

    // --- FUNCIONES PARA IMPORTACIÓN DE CALENDARIO PDF ---
    const loadPdfJs = (): Promise<any> => {
        return new Promise<any>((resolve, reject) => {
            if ((window as any).pdfjsLib) {
                resolve((window as any).pdfjsLib);
                return;
            }

            const script = document.createElement("script");
            script.src = "/js/pdf.min.js";
            script.onload = () => {
                const pdfjsLib = (window as any).pdfjsLib;
                pdfjsLib.GlobalWorkerOptions.workerSrc = "/js/pdf.worker.min.js";
                resolve(pdfjsLib);
            };
            script.onerror = () => {
                reject(new Error("No se pudo cargar la librería PDF.js local."));
            };
            document.head.appendChild(script);
        });
    };

    const abrirImportarCalendario = async () => {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.select<Selector[]>("SELECT id, nombre FROM Equipo ORDER BY nombre ASC");
            setTodosLosEquiposDb(res);
            setCalendarImportStep(1);
            setCalendarMatches([]);
            setCalendarUniqueTeams([]);
            setTeamMappings({});
            setImportProgress(0);
            setImportSummary("");
            setIsCalendarModalOpen(true);
        } catch (err: any) {
            console.error(err);
            alert("Error al cargar equipos globales: " + err.message);
        }
    };

    const handleCalendarPdfChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setCalendarImportStep(1);
            setIsImportingCalendar(true);
            setImportProgress(10);
            
            // Cargar PDF.js
            const pdfjsLib = await loadPdfJs();
            
            // Leer el archivo como ArrayBuffer
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const arrayBuffer = reader.result as ArrayBuffer;
                    setImportProgress(30);
                    
                    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
                    const pdf = await loadingTask.promise;
                    
                    let fullText = "";
                    const totalPages = pdf.numPages;
                    
                    for (let i = 1; i <= totalPages; i++) {
                        const page = await pdf.getPage(i);
                        const textContent = await page.getTextContent();
                        
                        // Reconstruir el texto preservando saltos de línea por coordenada vertical Y
                        let pageText = "";
                        let lastY = null;
                        for (const item of textContent.items as any[]) {
                            const currentY = item.transform[5];
                            if (lastY !== null && Math.abs(currentY - lastY) > 2) {
                                pageText += "\n";
                            } else if (lastY !== null) {
                                pageText += " ";
                            }
                            pageText += item.str;
                            lastY = currentY;
                        }
                        
                        fullText += pageText + "\n";
                        
                        // Actualizar progreso de extracción de 30% a 70%
                        const progress = 30 + Math.round((i / totalPages) * 40);
                        setImportProgress(progress);
                    }
                    
                    setImportProgress(75);
                    parsearTextoCalendario(fullText);
                } catch (err: any) {
                    console.error(err);
                    alert("Error al parsear el PDF: " + err.message);
                    setIsImportingCalendar(false);
                    setCalendarImportStep(1);
                }
            };
            
            reader.readAsArrayBuffer(file);
            
        } catch (err: any) {
            console.error(err);
            alert("Error al cargar PDF.js: " + err.message);
            setIsImportingCalendar(false);
            setCalendarImportStep(1);
        } finally {
            // Limpiar el input
            e.target.value = "";
        }
    };

    const encontrarMejorCoincidenciaEquipo = (pdfTeam: string): string | null => {
        if (todosLosEquiposDb.length === 0) return null;
        
        const pdfNorm = normalizarTexto(pdfTeam);
        let mejorId: string | null = null;
        let mejorSimilitud = 0.0;

        for (const dbTeam of todosLosEquiposDb) {
            const dbNorm = normalizarTexto(dbTeam.nombre);
            
            // 1. Coincidencia exacta de texto normalizado
            if (pdfNorm === dbNorm) {
                return dbTeam.id.toString();
            }

            // 2. Coincidencia de subcadena
            if (pdfNorm.includes(dbNorm) || dbNorm.includes(pdfNorm)) {
                const sim = Math.max(dbNorm.length, pdfNorm.length) > 0 
                    ? Math.min(dbNorm.length, pdfNorm.length) / Math.max(dbNorm.length, pdfNorm.length)
                    : 0.0;
                const simAjustada = 0.8 + (sim * 0.15); // Entre 0.8 y 0.95
                if (simAjustada > mejorSimilitud) {
                    mejorSimilitud = simAjustada;
                    mejorId = dbTeam.id.toString();
                }
            }

            // 3. Levenshtein
            const sim = obtenerSimilitudTexto(pdfNorm, dbNorm);
            if (sim > mejorSimilitud) {
                mejorSimilitud = sim;
                mejorId = dbTeam.id.toString();
            }
        }

        // Solo retornar si supera un umbral mínimo de similitud (ej. 0.55)
        return mejorSimilitud >= 0.55 ? mejorId : null;
    };

    const parsearTextoCalendario = (text: string) => {
        const lines = text.split("\n");
        let currentFaseNombre = "Primera Vuelta"; // Default inicial
        let currentJornada = "";
        let currentDate = "";
        const parsedMatches: any[] = [];
        const uniqueTeams = new Set<string>();

        for (let rawLine of lines) {
            let line = rawLine.trim();
            if (!line) continue;

            // Detectar cambio de fase/vuelta
            if (line.toLowerCase().includes("primera vuelta")) {
                currentFaseNombre = "Primera Vuelta";
                continue;
            }
            if (line.toLowerCase().includes("segunda vuelta")) {
                currentFaseNombre = "Segunda Vuelta";
                continue;
            }

            // Detectar jornada (p. ej. "Jornada 1 (06-09-2025)" o "Jornada 1  ( 06-09-2025 )")
            const jMatch = line.match(/Jornada\s+(\d+)\s*\(([^)]+)\)/i);
            if (jMatch) {
                currentJornada = jMatch[1];
                currentDate = jMatch[2].trim();
                continue;
            }

            // Ignorar cabeceras, pies y otras líneas basura
            if (
                line.includes("Real Federación Española de Fútbol") ||
                line.includes("Página:") ||
                line.includes("Calendario de Competiciones") ||
                line.includes("Temporada") ||
                line.includes("Equipos Participantes") ||
                line.match(/^\s*\d+\.-/) // Ignora la lista de participantes tipo "1.- CA Osasuna Magna..."
            ) {
                continue;
            }

            // Si contiene guion y hay una jornada activa, asumimos que es un partido
            if (line.includes("-") && currentJornada) {
                const parts = line.split("-");
                if (parts.length >= 2) {
                    const localRaw = parts[0].trim();
                    const visitanteRaw = parts.slice(1).join("-").trim(); // Por seguridad

                    // Validaciones rápidas del nombre
                    if (
                        localRaw.length > 2 && 
                        visitanteRaw.length > 2 && 
                        !localRaw.includes("Primera División") && 
                        !visitanteRaw.includes("Primera División")
                    ) {
                        parsedMatches.push({
                            local: localRaw,
                            visitante: visitanteRaw,
                            jornada: currentJornada,
                            fecha: currentDate,
                            faseNombre: currentFaseNombre
                        });
                        uniqueTeams.add(localRaw);
                        uniqueTeams.add(visitanteRaw);
                    }
                }
            }
        }

        if (parsedMatches.length === 0) {
            alert("No se pudo detectar ningún partido en el PDF. Por favor verifica que el formato sea el correcto.");
            setIsImportingCalendar(false);
            setCalendarImportStep(1);
            return;
        }

        // Proceder al Paso 2: Mapear equipos
        const teamsArray = Array.from(uniqueTeams).sort();
        setCalendarMatches(parsedMatches);
        setCalendarUniqueTeams(teamsArray);
        
        // Inicializar el mapeo de equipos con fuzzy logic
        const initialMappings: Record<string, string> = {};
        for (const pdfTeam of teamsArray) {
            const matchId = encontrarMejorCoincidenciaEquipo(pdfTeam);
            initialMappings[pdfTeam] = matchId || "__new__";
        }
        setTeamMappings(initialMappings);
        
        setImportProgress(100);
        setIsImportingCalendar(false);
        setCalendarImportStep(2);
    };

    const procesarEImportarCalendarioPDF = async () => {
        setIsImportingCalendar(true);
        setImportProgress(0);
        setCalendarImportStep(3);

        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const edicionId = parseInt(filtroEdicion);

            // 1. Obtener o crear país por defecto (España)
            let paisId = 1;
            const paisesDb = await db.select<{ id: number }[]>("SELECT id FROM Pais LIMIT 1");
            if (paisesDb.length > 0) {
                paisId = paisesDb[0].id;
            } else {
                const resPais = await db.execute(
                    "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('España', 'ES', 'ESP')"
                );
                paisId = resPais.lastInsertId!;
            }

            // 2. Resolver/Crear Equipos e Inscribirlos
            const mappedTeamIds: Record<string, number> = {};
            const totalSteps = calendarUniqueTeams.length + calendarMatches.length;
            let currentStep = 0;

            for (const pdfTeam of calendarUniqueTeams) {
                const mapValue = teamMappings[pdfTeam];
                let teamId = 0;

                if (mapValue === "__new__") {
                    // Crear nuevo equipo
                    const palabras = pdfTeam.split(" ").filter(w => w.length > 1);
                    let abreviatura = "NEW";
                    if (palabras.length >= 3) {
                        abreviatura = (palabras[0][0] + palabras[1][0] + palabras[2][0]).toUpperCase();
                    } else if (palabras.length > 0) {
                        abreviatura = palabras[0].substring(0, 3).toUpperCase();
                    }
                    
                    const resEq = await db.execute(
                        "INSERT INTO Equipo (nombre, abreviatura, pais_id, categoria, activo) VALUES ($1, $2, $3, 'Senior', 1)",
                        [pdfTeam, abreviatura, paisId]
                    );
                    teamId = resEq.lastInsertId!;
                } else {
                    teamId = parseInt(mapValue);
                }

                mappedTeamIds[pdfTeam] = teamId;

                // Asegurar inscripción en la edición activa
                const inscDb = await db.select<any[]>(
                    "SELECT 1 FROM Inscripcion WHERE edicion_id = $1 AND equipo_id = $2",
                    [edicionId, teamId]
                );
                if (inscDb.length === 0) {
                    await db.execute(
                        "INSERT INTO Inscripcion (edicion_id, equipo_id) VALUES ($1, $2)",
                        [edicionId, teamId]
                    );
                }

                currentStep++;
                setImportProgress(Math.round((currentStep / totalSteps) * 50));
            }

            // 3. Crear Fases ("Primera Vuelta" y "Segunda Vuelta") si no existen
            const fasesMapeadas: Record<string, number> = {};
            
            const buscarOCrearFase = async (nombreFase: string, orden: number) => {
                const faseDb = await db.select<{ id: number }[]>(
                    "SELECT id FROM Fase WHERE edicion_id = $1 AND nombre = $2",
                    [edicionId, nombreFase]
                );
                if (faseDb.length > 0) {
                    return faseDb[0].id;
                } else {
                    const resF = await db.execute(
                        "INSERT INTO Fase (edicion_id, nombre, tipo, orden) VALUES ($1, $2, 'Liga', $3)",
                        [edicionId, nombreFase, orden]
                    );
                    return resF.lastInsertId!;
                }
            };

            fasesMapeadas["Primera Vuelta"] = await buscarOCrearFase("Primera Vuelta", 1);
            fasesMapeadas["Segunda Vuelta"] = await buscarOCrearFase("Segunda Vuelta", 2);

            // 4. Procesar y guardar cada partido
            let partidosCreados = 0;
            let partidosActualizados = 0;
            let partidosOmitidos = 0;

            for (const match of calendarMatches) {
                const localId = mappedTeamIds[match.local];
                const visitanteId = mappedTeamIds[match.visitante];
                const faseId = fasesMapeadas[match.faseNombre];

                // Convertir fecha
                const partesFecha = match.fecha.split("-");
                let fechaHora = "";
                if (partesFecha.length === 3) {
                    fechaHora = `${partesFecha[2]}-${partesFecha[1]}-${partesFecha[0]} 20:00`;
                } else {
                    fechaHora = `${new Date().toISOString().split("T")[0]} 20:00`;
                }

                // Verificar si ya existe el partido entre ambos equipos en la misma edición
                const partidoExistente = await db.select<{ id: number, estado: string }[]>(
                    "SELECT id, estado FROM Partido WHERE edicion_id = $1 AND local_id = $2 AND visitante_id = $3",
                    [edicionId, localId, visitanteId]
                );

                if (partidoExistente.length > 0) {
                    const p = partidoExistente[0];
                    if (p.estado === "programado") {
                        await db.execute(
                            "UPDATE Partido SET fase_id = $1, jornada = $2, fecha_hora = $3 WHERE id = $4",
                            [faseId, match.jornada, fechaHora, p.id]
                        );
                        partidosActualizados++;
                    } else {
                        partidosOmitidos++;
                    }
                } else {
                    await db.execute(
                        `INSERT INTO Partido (edicion_id, fase_id, jornada, fecha_hora, local_id, visitante_id, estado, goles_local, goles_visitante, goles_descanso_local, goles_descanso_visitante)
                         VALUES ($1, $2, $3, $4, $5, $6, 'programado', 0, 0, 0, 0)`,
                        [edicionId, faseId, match.jornada, fechaHora, localId, visitanteId]
                    );
                    partidosCreados++;
                }

                currentStep++;
                setImportProgress(50 + Math.round((currentStep / totalSteps) * 50));
            }

            setImportSummary(
                `¡Importación completada con éxito! Se han registrado ${partidosCreados} partidos nuevos y actualizado ${partidosActualizados} partidos ya existentes. Se omitieron ${partidosOmitidos} partidos finalizados o en juego para proteger sus actas.`
            );
            
            // Recargar datos
            await cargarFasesYEquipos(filtroEdicion);
            await cargarPartidos();

        } catch (err: any) {
            console.error(err);
            alert("Error durante la importación del calendario: " + err.message);
            setCalendarImportStep(2);
        } finally {
            setIsImportingCalendar(false);
        }
    };

    const solicitarResetearEdicion = () => {
        setIsResetConfirmOpen(true);
    };

    const ejecutarResetearEdicion = async () => {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const edicionId = parseInt(filtroEdicion);
            if (!edicionId) return;

            // Limpiar datos en cascada
            await db.execute("DELETE FROM Alineacion WHERE partido_id IN (SELECT id FROM Partido WHERE edicion_id = $1)", [edicionId]);
            await db.execute("DELETE FROM Evento WHERE partido_id IN (SELECT id FROM Partido WHERE edicion_id = $1)", [edicionId]);
            await db.execute("DELETE FROM EstadisticaPartidoEquipo WHERE partido_id IN (SELECT id FROM Partido WHERE edicion_id = $1)", [edicionId]);
            await db.execute("DELETE FROM EstadisticaPartidoJugador WHERE partido_id IN (SELECT id FROM Partido WHERE edicion_id = $1)", [edicionId]);
            await db.execute("DELETE FROM Partido WHERE edicion_id = $1", [edicionId]);

            // Recargar datos
            await cargarFasesYEquipos(filtroEdicion);
            await cargarPartidos();
            setIsResetConfirmOpen(false);
            alert("Se han eliminado todos los partidos y actas de esta edición correctamente. La edición está lista para importar el calendario PDF de nuevo. ✅");
        } catch (err: any) {
            console.error(err);
            alert("Error al resetear la edición: " + err.message);
        }
    };

    // --- FUNCIONES DB ---
    async function cargarEdiciones() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>(`
      SELECT e.id, c.nombre || ' (' || t.nombre || ')' || COALESCE(' - ' || e.nombre, '') as nombre
      FROM Edicion e JOIN Competicion c ON e.competicion_id = c.id JOIN Temporada t ON e.temporada_id = t.id
      ORDER BY t.fecha_inicio DESC
    `);
        setEdiciones(res);
        if (res.length > 0 && !filtroEdicion) setFiltroEdicion(res[0].id.toString());
    }

    async function cargarPabellones() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>("SELECT id, nombre FROM Estadio ORDER BY nombre ASC");
        setPabellones(res);
    }

    async function cargarFasesYEquipos(edicionId: string) {
        const db = await Database.load("sqlite:globalfutsal.db");
        // Fases
        const res = await db.select<Selector[]>("SELECT id, nombre FROM Fase WHERE edicion_id = $1 ORDER BY orden ASC", [edicionId]);
        setFases(res);

        // Jornadas únicas existentes en los partidos de esta edición
        const resJor = await db.select<{ jornada: string }[]>("SELECT DISTINCT jornada FROM Partido WHERE edicion_id = $1 AND jornada IS NOT NULL AND jornada != '' ORDER BY jornada ASC", [edicionId]);
        
        // Ordenar numéricamente usando localeCompare con la opción 'numeric'
        const sortedJornadas = resJor
            .map(j => j.jornada)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
            
        setJornadasExistentes(sortedJornadas);

        // Grupos existentes en las inscripciones de esta edición
        const resG = await db.select<{ grupo: string }[]>("SELECT DISTINCT grupo FROM Inscripcion WHERE edicion_id = $1 AND grupo IS NOT NULL AND grupo != '' ORDER BY grupo ASC", [edicionId]);
        setGrupos(resG.map(g => g.grupo));

        const resEq = await db.select<Selector[]>(`SELECT e.id, e.nombre FROM Equipo e JOIN Inscripcion i ON e.id = i.equipo_id WHERE i.edicion_id = $1 ORDER BY e.nombre ASC`, [edicionId]);
        setEquipos(resEq);
        const resArb = await db.select<Selector[]>(`SELECT p.id, p.nombre_deportivo as nombre FROM Persona p JOIN Designacion d ON p.id = d.persona_id WHERE d.edicion_id = $1 ORDER BY p.nombre_deportivo ASC`, [edicionId]);
        setArbitros(resArb);
    }

    async function cargarPartidos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            let query = `
                SELECT p.*, 
                       l.nombre as local_nombre, l.escudo_path as local_escudo, 
                       v.nombre as visitante_nombre, v.escudo_path as visitante_escudo, 
                       est.nombre as estadio_nombre,
                       f.nombre as fase_nombre,
                       a1.nombre_deportivo as arbitro_nombre,
                       a2.nombre_deportivo as arbitro_2_nombre,
                       a3.nombre_deportivo as arbitro_3_nombre,
                       pl.bandera_path as local_bandera,
                       pv.bandera_path as visitante_bandera,
                       insL.grupo as local_grupo
                FROM Partido p
                JOIN Equipo l ON p.local_id = l.id
                JOIN Equipo v ON p.visitante_id = v.id
                LEFT JOIN Inscripcion insL ON p.local_id = insL.equipo_id AND p.edicion_id = insL.edicion_id
                LEFT JOIN Pais pl ON l.pais_id = pl.id
                LEFT JOIN Pais pv ON v.pais_id = pv.id
                LEFT JOIN Estadio est ON p.estadio_id = est.id
                LEFT JOIN Fase f ON p.fase_id = f.id
                LEFT JOIN Persona a1 ON p.arbitro_id = a1.id
                LEFT JOIN Persona a2 ON p.arbitro_2_id = a2.id
                LEFT JOIN Persona a3 ON p.arbitro_3_id = a3.id
                WHERE p.edicion_id = $1
            `;

            const params: any[] = [parseInt(filtroEdicion)];

            if (filtroFase && filtroFase !== "todas") {
                const paramIdx = params.length + 1;
                if (filtroFase.startsWith("f-")) {
                    query += ` AND p.fase_id = $${paramIdx}`;
                    params.push(parseInt(filtroFase.replace("f-", "")));
                } else if (filtroFase.startsWith("j-")) {
                    query += ` AND p.jornada = $${paramIdx}`;
                    params.push(filtroFase.replace("j-", ""));
                }
            }

            if (filtroGrupo && filtroGrupo !== "todos") {
                query += ` AND insL.grupo = $${params.length + 1}`;
                params.push(filtroGrupo);
            }

            query += " ORDER BY p.fecha_hora ASC";

            const res = await db.select<Partido[]>(query, params);
            setPartidos(res);
        } catch (e) { console.error(e); }
    }

    // --- CRUD ---
    function abrirProgramar() {
        setEditingId(null);
        setForm({
            edicion: filtroEdicion,
            fase: filtroFase !== "todas" ? filtroFase : "",
            local: "", visitante: "", fecha: new Date().toISOString().split('T')[0], hora: "20:00",
            pabellon: "", arbitro: "", arbitro_2: "", arbitro_3: "", espectadores: 0, estado: "programado",
            goles_local: 0, goles_visitante: 0, descanso_local: 0, descanso_visitante: 0,
            con_prorroga: false, penaltis_local: 0, penaltis_visitante: 0,
            jornada_texto: ""
        });
        setIsModalOpen(true);
    }

    function abrirEditar(p: Partido) {
        setEditingId(p.id);
        const [fecha, hora] = p.fecha_hora ? p.fecha_hora.split(" ") : ["", ""];
        setForm({
            edicion: p.edicion_id.toString(),
            fase: p.fase_id?.toString() || "",
            local: p.local_id.toString(),
            visitante: p.visitante_id.toString(),
            fecha: fecha, hora: hora,
            pabellon: p.estadio_id?.toString() || "",
            arbitro: p.arbitro_id?.toString() || "",
            arbitro_2: p.arbitro_2_id?.toString() || "",
            arbitro_3: p.arbitro_3_id?.toString() || "",
            espectadores: p.espectadores || 0,
            estado: p.estado,
            goles_local: p.goles_local || 0,
            goles_visitante: p.goles_visitante || 0,
            descanso_local: p.goles_descanso_local || 0,
            descanso_visitante: p.goles_descanso_visitante || 0,
            con_prorroga: p.prorroga === 1,
            penaltis_local: p.penaltis_local || 0,
            penaltis_visitante: p.penaltis_visitante || 0,
            jornada_texto: p.jornada || ""
        });
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!form.local || !form.visitante || !form.fecha) return alert("Faltan datos básicos");
        if (form.local === form.visitante) return alert("El local y visitante no pueden ser el mismo");

        const fechaHora = `${form.fecha} ${form.hora}`;
        const parseId = (val: string) => val ? parseInt(val) : null;

        const faseObj = fases.find(f => f.id.toString() === form.fase);
        const nombreJornada = form.jornada_texto || (faseObj ? faseObj.nombre : "");

        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            const params = [
                parseId(form.fase),
                nombreJornada,
                fechaHora,
                parseId(form.pabellon),
                parseId(form.local),
                parseId(form.visitante),
                parseId(form.arbitro),
                parseId(form.arbitro_2),
                parseId(form.arbitro_3),
                form.espectadores,
                form.estado,
                form.goles_local, form.goles_visitante,
                form.descanso_local, form.descanso_visitante,
                form.con_prorroga ? 1 : 0,
                form.penaltis_local, form.penaltis_visitante
            ];

            if (editingId) {
                await db.execute(`
                UPDATE Partido SET 
                fase_id=$1, jornada=$2, fecha_hora=$3, estadio_id=$4, local_id=$5, visitante_id=$6, arbitro_id=$7, arbitro_2_id=$8, arbitro_3_id=$9, espectadores=$10, estado=$11,
                goles_local=$12, goles_visitante=$13, goles_descanso_local=$14, goles_descanso_visitante=$15, prorroga=$16, penaltis_local=$17, penaltis_visitante=$18
                WHERE id=$19
            `, [...params, editingId]);
            } else {
                await db.execute(`
                INSERT INTO Partido (edicion_id, fase_id, jornada, fecha_hora, estadio_id, local_id, visitante_id, arbitro_id, arbitro_2_id, arbitro_3_id, espectadores, estado,
                goles_local, goles_visitante, goles_descanso_local, goles_descanso_visitante, prorroga, penaltis_local, penaltis_visitante)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
            `, [parseInt(filtroEdicion), ...params]);
            }
            setIsModalOpen(false);
            cargarPartidos();
        } catch (e) { console.error(e); alert("Error al guardar"); }
    }

    // --- CREACIÓN RÁPIDA ---
    async function guardarEstadioRapido() {
        if (!stadiumForm.nombre) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.execute("INSERT INTO Estadio (nombre, ciudad) VALUES ($1, $2)", [stadiumForm.nombre, stadiumForm.ciudad]);
            const newId = res.lastInsertId;
            if (newId) {
                await cargarPabellones();
                setForm(prev => ({ ...prev, pabellon: newId.toString() }));
            }
            setIsStadiumModalOpen(false);
            setStadiumForm({ nombre: "", ciudad: "" });
        } catch (e) { console.error(e); }
    }

    async function guardarArbitroRapido() {
        if (!refereeForm.nombre_deportivo) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const resP = await db.execute(
                "INSERT INTO Persona (nombre, apellidos, nombre_deportivo, cargo) VALUES ($1, $2, $3, 'arbitro')",
                [refereeForm.nombre, refereeForm.apellidos, refereeForm.nombre_deportivo]
            );
            const personaId = resP.lastInsertId;
            if (personaId) {
                await db.execute("INSERT INTO Designacion (edicion_id, persona_id) VALUES ($1, $2)", [filtroEdicion, personaId]);
                await cargarFasesYEquipos(filtroEdicion);
                if (!form.arbitro) setForm(prev => ({ ...prev, arbitro: personaId.toString() }));
                else if (!form.arbitro_2) setForm(prev => ({ ...prev, arbitro_2: personaId.toString() }));
                else if (!form.arbitro_3) setForm(prev => ({ ...prev, arbitro_3: personaId.toString() }));
                else setForm(prev => ({ ...prev, arbitro: personaId.toString() }));
            }
            setIsRefereeModalOpen(false);
            setRefereeForm({ nombre: "", apellidos: "", nombre_deportivo: "" });
        } catch (e) { console.error(e); }
    }

    function solicitarBorrarPartido(id: number, local: string, visitante: string) {
        setIdPartidoABorrar(id);
        setNombrePartidoABorrar(`${local} vs ${visitante}`);
        setIsDeleteConfirmOpen(true);
    }

    async function ejecutarBorradoPartido() {
        if (!idPartidoABorrar) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [idPartidoABorrar]);
            await db.execute("DELETE FROM Evento WHERE partido_id = $1", [idPartidoABorrar]);
            await db.execute("DELETE FROM EstadisticaPartidoEquipo WHERE partido_id = $1", [idPartidoABorrar]);
            await db.execute("DELETE FROM EstadisticaPartidoJugador WHERE partido_id = $1", [idPartidoABorrar]);
            await db.execute("DELETE FROM Partido WHERE id = $1", [idPartidoABorrar]);
            cargarPartidos();
            setIsDeleteConfirmOpen(false);
            setIdPartidoABorrar(null);
            alert("Partido eliminado correctamente ✅");
        } catch (e) { 
            console.error(e); 
            alert("Error al borrar el partido"); 
        }
    }

    const getEstadoBadge = (estado: string) => {
        switch (estado) {
            case 'finalizado': return <span className="bg-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded font-bold">FINALIZADO</span>;
            case 'en_juego': return <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded font-bold animate-pulse">EN JUEGO</span>;
            default: return <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded font-bold">PROGRAMADO</span>;
        }
    };

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">
            
            {/* CABECERA */}
            <div className="flex justify-between items-center mb-6 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><Calendar className="text-orange text-glow-orange animate-pulse" /> Partidos</h1>
                <div className="flex gap-3">
                    <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".csv" className="hidden" />
                    
                    {/* INPUT OCULTO PARA CALENDARIO PDF */}
                    <input type="file" id="calendar-pdf-upload" onChange={handleCalendarPdfChange} accept=".pdf" className="hidden" />
                    
                    <button onClick={abrirImportarCalendario} className="bg-navy border border-white/10 hover:border-orange/30 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                        <Upload size={18} className="text-orange" /> <span>Importar Calendario PDF</span>
                    </button>
                    
                    <button onClick={solicitarResetearEdicion} className="bg-navy border border-red/20 hover:border-red/40 text-red px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                        <Eraser size={18} className="text-red" /> <span>Resetear Edición</span>
                    </button>
                    
                    <button onClick={abrirProgramar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                        <Plus size={20} /> <span>Programar</span>
                    </button>
                </div>
            </div>

            {/* BARRA DE FILTROS */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[200px]">
                    <label className="text-[10px] uppercase font-black tracking-wider text-silver/40 mb-1 block">Edición</label>
                    <select value={filtroEdicion} onChange={e => {
                        setFiltroEdicion(e.target.value);
                        setFiltroFase("todas");
                        setFiltroGrupo("todos");
                    }} className="w-full p-2.5 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold">
                        {ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                </div>
                <div className="w-64">
                    <label className="text-[10px] uppercase font-black tracking-wider text-silver/40 mb-1 block">Jornada / Fase</label>
                    <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} className="w-full p-2.5 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold">
                        <option value="todas">Todas</option>
                        <optgroup label="Fases">
                            {fases.map(f => <option key={`f-${f.id}`} value={`f-${f.id}`}>{f.nombre}</option>)}
                        </optgroup>
                        <optgroup label="Jornadas">
                            {jornadasExistentes.map(j => <option key={`j-${j}`} value={`j-${j}`}>Jornada {j}</option>)}
                        </optgroup>
                    </select>
                </div>
                <div className="w-48">
                    <label className="text-[10px] uppercase font-black tracking-wider text-silver/40 mb-1 block">Grupo</label>
                    <select value={filtroGrupo} onChange={e => setFiltroGrupo(e.target.value)} className="w-full p-2.5 border border-white/10 rounded-xl bg-navy-light text-sm focus:ring-1 focus:ring-orange outline-none text-white cursor-pointer font-bold">
                        <option value="todos">Todos los grupos</option>
                        {grupos.map(g => <option key={g} value={g}>Grupo {g}</option>)}
                    </select>
                </div>
            </div>

            {/* LISTA DE PARTIDOS */}
            <div className="space-y-4">
                {partidos.map(p => (
                    <div key={p.id} className="glass-panel p-5 rounded-2xl border border-white/5 flex items-center justify-between hover:border-white/10 hover:shadow-2xl transition-all duration-300 group">
                        <div className="w-44 text-center border-r border-white/5 pr-4 flex-shrink-0">
                            <div className="text-sm font-display font-black text-white">{p.fecha_hora?.split(" ")[0]}</div>
                            <div className="text-xs text-silver/40 font-bold mb-1.5">{p.fecha_hora?.split(" ")[1]}</div>
                            <div className="mb-2">{getEstadoBadge(p.estado)}</div>
                            <div className="text-[10px] text-silver/50 font-medium truncate">{p.estadio_nombre || "Pabellón por definir"}</div>
                            <div className="text-[9px] text-silver/30 font-medium mt-0.5 opacity-80 italic">
                                {[p.arbitro_nombre, p.arbitro_2_nombre, p.arbitro_3_nombre].filter(Boolean).join(", ")}
                            </div>
                            <div className="mt-2 text-[10px] uppercase font-black flex flex-wrap gap-1 justify-center tracking-wider">
                                <span className="bg-orange/10 text-orange border border-orange/20 rounded px-1.5 py-0.5">
                                    {p.jornada || p.fase_nombre || <span className="flex items-center gap-1 text-red"><AlertCircle size={10} /> Sin Fase</span>}
                                </span>
                                {p.local_grupo && (
                                    <span className="bg-accent-blue/10 text-accent-blue border border-accent-blue/20 rounded px-1.5 py-0.5">
                                        Grupo {p.local_grupo}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 flex items-center justify-center gap-8 px-4">
                            <div className="flex items-center gap-4 w-1/3 justify-end">
                                <div className="flex flex-col items-end">
                                    <span className="font-display font-black text-lg text-right leading-tight text-white group-hover:text-orange transition-colors">{p.local_nombre}</span>
                                    {p.local_bandera && <div className="w-5 h-3 border border-white/10 rounded-sm shadow-sm mt-1 overflow-hidden"><ImagenLocal path={p.local_bandera} alt="" className="w-full h-full object-cover" /></div>}
                                </div>
                                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-white p-1.5 rounded-xl border border-white/10 shadow-sm"><ImagenLocal path={p.local_escudo} alt="" className="max-w-full max-h-full object-contain filter drop-shadow-md" /></div>
                            </div>
                            <div className="bg-navy-dark/80 px-5 py-2.5 rounded-2xl font-display font-black text-2xl tracking-widest min-w-[120px] text-center border border-white/5 shadow-2xl text-orange text-glow-orange">
                                {p.estado === 'programado' ? "VS" : `${p.goles_local} - ${p.goles_visitante}`}
                            </div>
                            <div className="flex items-center gap-4 w-1/3 justify-start">
                                <div className="w-12 h-12 flex-shrink-0 flex items-center justify-center bg-white p-1.5 rounded-xl border border-white/10 shadow-sm"><ImagenLocal path={p.visitante_escudo} alt="" className="max-w-full max-h-full object-contain filter drop-shadow-md" /></div>
                                <div className="flex flex-col items-start">
                                    <span className="font-display font-black text-lg text-left leading-tight text-white group-hover:text-orange transition-colors">{p.visitante_nombre}</span>
                                    {p.visitante_bandera && <div className="w-5 h-3 border border-white/10 rounded-sm shadow-sm mt-1 overflow-hidden"><ImagenLocal path={p.visitante_bandera} alt="" className="w-full h-full object-cover" /></div>}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 pl-4 border-l border-white/5 flex-shrink-0 transition-opacity duration-300">
                            <button onClick={() => abrirImportadorParaPartido(p)} title="Importar acta CSV" className="p-2 text-success hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors flex items-center justify-center hover:scale-[1.05] active:scale-[0.95]"><Upload size={18} /></button>
                            <button onClick={() => limpiarDatosPartido(p)} title="Limpiar alineaciones, eventos y marcadores" className="p-2 text-warning hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors flex items-center justify-center hover:scale-[1.05] active:scale-[0.95]"><Eraser size={18} /></button>
                            <button onClick={() => navigate(`/partido/${p.id}`)} className="p-2 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors flex items-center justify-center hover:scale-[1.05] active:scale-[0.95]"><Eye size={18} /></button>
                            <button onClick={() => abrirEditar(p)} className="p-2 text-orange hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors flex items-center justify-center hover:scale-[1.05] active:scale-[0.95]"><Edit size={18} /></button>
                            <button onClick={() => solicitarBorrarPartido(p.id, p.local_nombre, p.visitante_nombre)} className="p-2 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors flex items-center justify-center hover:scale-[1.05] active:scale-[0.95]"><Trash2 size={18} /></button>
                        </div>
                    </div>
                ))}
                {partidos.length === 0 && <div className="text-center py-12 text-silver/40 font-medium">No se encontraron partidos.</div>}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Datos del Partido">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 bg-navy-dark/40 p-3 rounded-xl border border-white/5">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">LOCAL</label>
                            <select value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">Seleccionar...</option>
                                {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">VISITANTE</label>
                            <select value={form.visitante} onChange={e => setForm({ ...form, visitante: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">Seleccionar...</option>
                                {equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-4 gap-3">
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Fase / Tipo</label>
                            <select value={form.fase} onChange={e => setForm({ ...form, fase: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Sin Fase --</option>
                                {fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                            </select>
                        </div>
                        <div className="col-span-1">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Jornada (nº)</label>
                            <input type="text" placeholder="Ej: 1, 2..." value={form.jornada_texto} onChange={e => setForm({ ...form, jornada_texto: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold text-center" />
                        </div>
                        <div className="col-span-2">
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider flex justify-between">Pabellón <button onClick={() => setIsStadiumModalOpen(true)} className="text-orange hover:underline text-[10px] font-black">+ NUEVO</button></label>
                            <select value={form.pabellon} onChange={e => setForm({ ...form, pabellon: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Por definir --</option>
                                {pabellones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Fecha</label>
                            <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Hora</label>
                            <input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Estado</label>
                            <select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="programado">Programado</option>
                                <option value="en_juego">En Juego</option>
                                <option value="finalizado">Finalizado</option>
                            </select>
                        </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider flex justify-between">Árbitro 1 <button onClick={() => setIsRefereeModalOpen(true)} className="text-orange hover:underline text-[10px] font-black">+ NUEVO</button></label>
                            <select value={form.arbitro} onChange={e => setForm({ ...form, arbitro: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Por definir --</option>
                                {arbitros.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Árbitro 2</label>
                            <select value={form.arbitro_2} onChange={e => setForm({ ...form, arbitro_2: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Por definir --</option>
                                {arbitros.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Árbitro 3</label>
                            <select value={form.arbitro_3} onChange={e => setForm({ ...form, arbitro_3: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Por definir --</option>
                                {arbitros.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider"><Ticket size={12} className="inline mr-1 text-orange" />Espectadores</label>
                        <input type="number" value={form.espectadores} onChange={e => setForm({ ...form, espectadores: parseInt(e.target.value) || 0 })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold text-center font-display" />
                    </div>

                    <div className="border-t border-white/5 pt-4 mt-2">
                        <h4 className="text-xs font-black text-silver/40 uppercase mb-2 tracking-wider">Marcadores Detallados</h4>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-[10px] uppercase font-bold text-silver/50 mb-1">Descanso</div>
                                <div className="flex gap-1 justify-center">
                                    <input type="number" value={form.descanso_local} onChange={e => setForm({ ...form, descanso_local: parseInt(e.target.value) })} className="w-12 p-1 bg-navy border border-white/10 rounded-xl text-center text-white font-display font-bold outline-none" />
                                    <span className="pt-1 text-silver/40 font-bold">-</span>
                                    <input type="number" value={form.descanso_visitante} onChange={e => setForm({ ...form, descanso_visitante: parseInt(e.target.value) })} className="w-12 p-1 bg-navy border border-white/10 rounded-xl text-center text-white font-display font-bold outline-none" />
                                </div>
                            </div>
                            <div>
                                <div className="text-[10px] uppercase font-bold text-silver/50 mb-1">Final</div>
                                <div className="flex gap-1 justify-center">
                                    <input type="number" value={form.goles_local} onChange={e => setForm({ ...form, goles_local: parseInt(e.target.value) })} className="w-12 p-1 bg-navy border border-white/15 rounded-xl text-center text-orange text-glow-orange font-display font-black outline-none" />
                                    <span className="pt-1 text-silver/40 font-bold">-</span>
                                    <input type="number" value={form.goles_visitante} onChange={e => setForm({ ...form, goles_visitante: parseInt(e.target.value) })} className="w-12 p-1 bg-navy border border-white/15 rounded-xl text-center text-orange text-glow-orange font-display font-black outline-none" />
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-center gap-2 mb-1">
                                    <input type="checkbox" checked={form.con_prorroga} onChange={e => setForm({ ...form, con_prorroga: e.target.checked })} id="chkProrroga" className="text-orange focus:ring-orange cursor-pointer" />
                                    <label htmlFor="chkProrroga" className="text-[10px] uppercase font-bold text-silver/50 cursor-pointer">Prórroga</label>
                                </div>
                                <div className="flex gap-1 justify-center opacity-50">
                                    <input type="number" disabled className="w-12 p-1 bg-navy/40 border border-white/5 rounded-xl text-center text-white font-display font-bold" />
                                    <span className="pt-1 text-silver/40">-</span>
                                    <input type="number" disabled className="w-12 p-1 bg-navy/40 border border-white/5 rounded-xl text-center text-white font-display font-bold" />
                                </div>
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-4 bg-navy-dark/20 p-2.5 rounded-xl border border-dashed border-white/10">
                            <span className="text-xs font-bold uppercase tracking-wider text-silver/50">Penaltis:</span>
                            <input type="number" value={form.penaltis_local} onChange={e => setForm({ ...form, penaltis_local: parseInt(e.target.value) })} className="w-12 p-1.5 bg-navy border border-white/10 rounded-xl text-center text-white font-display font-bold outline-none" placeholder="L" />
                            <span className="text-silver/40">-</span>
                            <input type="number" value={form.penaltis_visitante} onChange={e => setForm({ ...form, penaltis_visitante: parseInt(e.target.value) })} className="w-12 p-1.5 bg-navy border border-white/10 rounded-xl text-center text-white font-display font-bold outline-none" placeholder="V" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={() => setIsModalOpen(false)} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar Partido</button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={isStadiumModalOpen} onClose={() => setIsStadiumModalOpen(false)} title="Crear Pabellón rápido">
                <div className="space-y-4 p-2">
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre del Pabellón</label>
                        <input value={stadiumForm.nombre} onChange={e => setStadiumForm({ ...stadiumForm, nombre: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" placeholder="Ej: Municipal de Nicosia" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Ciudad (Opcional)</label>
                        <input value={stadiumForm.ciudad} onChange={e => setStadiumForm({ ...stadiumForm, ciudad: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" placeholder="Ej: Nicosia" />
                    </div>
                    <button onClick={guardarEstadioRapido} className="w-full bg-orange hover:bg-orange-hover text-white p-2.5 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] mt-2">Crear y Seleccionar</button>
                </div>
            </Modal>

            <Modal isOpen={isRefereeModalOpen} onClose={() => setIsRefereeModalOpen(false)} title="Crear Árbitro rápido">
                <div className="space-y-4 p-2">
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre Deportivo (Apodo)</label>
                        <input value={refereeForm.nombre_deportivo} onChange={e => setRefereeForm({ ...refereeForm, nombre_deportivo: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl font-bold text-white outline-none focus:border-orange transition-colors" placeholder="Ej: Perona" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                            <input value={refereeForm.nombre} onChange={e => setRefereeForm({ ...refereeForm, nombre: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Apellidos</label>
                            <input value={refereeForm.apellidos} onChange={e => setRefereeForm({ ...refereeForm, apellidos: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors" />
                        </div>
                    </div>
                    <button onClick={guardarArbitroRapido} className="w-full bg-orange hover:bg-orange-hover text-white p-2.5 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] mt-2">Crear y Seleccionar</button>
                    <p className="text-[10px] text-silver/40 font-medium italic text-center">Nota: Al crearlo se vinculará automáticamente a la edición actual.</p>
                </div>
            </Modal>
            {isDeleteConfirmOpen && idPartidoABorrar && (
                <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Eliminar Partido">
                    <div className="space-y-4 text-white">
                        <p className="text-sm text-silver/80">
                            ¿Estás seguro de que deseas eliminar permanentemente el partido <strong className="text-orange">{nombrePartidoABorrar}</strong>?
                        </p>
                        <p className="text-xs text-red bg-red/10 border border-red/25 p-3 rounded-xl">
                            ⚠️ Esta acción es irreversible. Se eliminarán permanentemente todas las alineaciones, actas, eventos y estadísticas asociadas a este partido en la base de datos.
                        </p>
                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button onClick={() => setIsDeleteConfirmOpen(false)} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                            <button onClick={ejecutarBorradoPartido} className="bg-red hover:bg-red/80 text-white px-6 py-2 rounded-xl font-bold shadow-md transition-all">Eliminar permanentemente</button>
                        </div>
                    </div>
                </Modal>
            )}

            {/* MODAL PARA IMPORTAR CALENDARIO PDF */}
            {isCalendarModalOpen && (
                <Modal isOpen={isCalendarModalOpen} onClose={() => !isImportingCalendar && setIsCalendarModalOpen(false)} title="Importar Calendario de Competición">
                    {calendarImportStep === 1 && (
                        <div className="space-y-4">
                            <p className="text-sm text-silver/80">
                                Sube el archivo PDF del calendario oficial de la competición para generar automáticamente todas las jornadas y programar todos los partidos.
                            </p>
                            <div 
                                onClick={() => !isImportingCalendar && document.getElementById("calendar-pdf-upload")?.click()}
                                className="border-2 border-dashed border-white/10 hover:border-orange/40 bg-navy-dark/40 hover:bg-navy-dark/60 p-8 rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group gap-3 text-center"
                            >
                                <div className="w-16 h-16 rounded-full bg-orange/10 flex items-center justify-center border border-orange/20 group-hover:scale-110 group-hover:bg-orange/20 transition-all duration-300">
                                    <Upload className="text-orange text-glow-orange" size={28} />
                                </div>
                                <div>
                                    <span className="font-bold text-white group-hover:text-orange transition-colors">Selecciona o arrastra el archivo PDF</span>
                                    <p className="text-xs text-silver/40 mt-1">Soporta formato oficial RFEF de Primera División</p>
                                </div>
                            </div>
                            
                            {isImportingCalendar && (
                                <div className="space-y-2 mt-4 bg-navy-dark/30 p-4 rounded-xl border border-white/5">
                                    <div className="flex justify-between text-xs font-bold text-silver/50">
                                        <span>Procesando PDF...</span>
                                        <span>{importProgress}%</span>
                                    </div>
                                    <div className="w-full bg-navy h-2 rounded-full overflow-hidden border border-white/5">
                                        <div className="bg-orange h-full transition-all duration-300 shadow-neon-orange" style={{ width: `${importProgress}%` }}></div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {calendarImportStep === 2 && (
                        <div className="space-y-4 flex flex-col max-h-[70vh]">
                            <p className="text-xs text-silver/70">
                                Hemos detectado <strong className="text-white font-bold">{calendarUniqueTeams.length} equipos</strong> y <strong className="text-white font-bold">{calendarMatches.length} enfrentamientos</strong> en el calendario de la edición activa. Asocia cada equipo del PDF con su correspondiente en la base de datos para evitar duplicados:
                            </p>
                            
                            <div className="flex-1 overflow-y-auto pr-1 space-y-2 max-h-[45vh] custom-scrollbar border border-white/5 p-3 rounded-xl bg-navy-dark/20">
                                {calendarUniqueTeams.map((pdfTeam) => (
                                    <div key={pdfTeam} className="flex items-center justify-between gap-4 p-2.5 bg-navy-light/40 border border-white/5 rounded-xl hover:border-white/10 transition-colors">
                                        <div className="flex-1 min-w-[200px]">
                                            <span className="text-[10px] font-black uppercase text-silver/30 tracking-wider block mb-0.5">Nombre en PDF</span>
                                            <span className="text-sm font-bold text-white truncate block">{pdfTeam}</span>
                                        </div>
                                        <div className="w-64">
                                            <span className="text-[10px] font-black uppercase text-silver/30 tracking-wider block mb-0.5">Asociar en Base de Datos</span>
                                            <select 
                                                value={teamMappings[pdfTeam] || "__new__"} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setTeamMappings(prev => ({ ...prev, [pdfTeam]: val }));
                                                }}
                                                className="w-full p-2 border border-white/10 rounded-lg bg-navy text-xs text-white cursor-pointer font-bold outline-none focus:border-orange focus:ring-1 focus:ring-orange"
                                            >
                                                <option value="__new__" className="text-orange font-bold">+ Crear Nuevo Equipo "{pdfTeam}"</option>
                                                {todosLosEquiposDb.map((dbTeam) => (
                                                    <option key={dbTeam.id} value={dbTeam.id.toString()}>
                                                        {dbTeam.nombre}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            
                            <div className="flex justify-between items-center pt-4 border-t border-white/5">
                                <button 
                                    onClick={() => setCalendarImportStep(1)} 
                                    className="px-5 py-2 text-silver/50 hover:text-white font-bold text-sm transition-colors"
                                >
                                    Atrás
                                </button>
                                <button 
                                    onClick={procesarEImportarCalendarioPDF} 
                                    className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm"
                                >
                                    Confirmar e Importar {calendarMatches.length} Partidos
                                </button>
                            </div>
                        </div>
                    )}

                    {calendarImportStep === 3 && (
                        <div className="space-y-4 text-center py-6">
                            {isImportingCalendar ? (
                                <div className="space-y-4">
                                    <div className="w-12 h-12 border-4 border-orange border-t-transparent rounded-full animate-spin mx-auto shadow-neon-orange"></div>
                                    <div>
                                        <h3 className="text-lg font-bold text-white">Importando partidos en la base de datos...</h3>
                                        <p className="text-xs text-silver/40 mt-1">Por favor no cierres la ventana, esto puede tomar unos segundos.</p>
                                    </div>
                                    <div className="space-y-2 max-w-sm mx-auto bg-navy-dark/30 p-4 rounded-xl border border-white/5">
                                        <div className="flex justify-between text-xs font-bold text-silver/50">
                                            <span>Procesando...</span>
                                            <span>{importProgress}%</span>
                                        </div>
                                        <div className="w-full bg-navy h-2 rounded-full overflow-hidden border border-white/5">
                                            <div className="bg-orange h-full transition-all duration-300 shadow-neon-orange" style={{ width: `${importProgress}%` }}></div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4 max-w-md mx-auto">
                                    <div className="w-16 h-16 bg-green-500/10 text-green-500 border border-green-500/20 rounded-full flex items-center justify-center mx-auto animate-bounce">
                                        <Plus size={36} className="text-glow-success" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-display font-black text-white">¡Calendario Importado!</h3>
                                        <p className="text-sm text-silver/70 mt-3 leading-relaxed bg-navy-dark/40 border border-white/5 p-4 rounded-2xl">
                                            {importSummary}
                                        </p>
                                    </div>
                                    <div className="pt-4 flex justify-center">
                                        <button 
                                            onClick={() => setIsCalendarModalOpen(false)}
                                            className="bg-orange hover:bg-orange-hover text-white px-8 py-2.5 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                                        >
                                            Aceptar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </Modal>
            )}
            {isResetConfirmOpen && (
                <Modal isOpen={isResetConfirmOpen} onClose={() => setIsResetConfirmOpen(false)} title="Resetear Edición de Competición">
                    <div className="space-y-4 text-white">
                        <p className="text-sm text-silver/80">
                            ¿Estás completamente seguro de que deseas eliminar <strong className="text-red">TODOS los partidos</strong>, alineaciones y actas de esta edición?
                        </p>
                        <p className="text-xs text-red bg-red/10 border border-red/25 p-3 rounded-xl">
                            ⚠️ Esta acción borrará absolutamente todos los partidos del calendario (tanto programados como jugados) y sus estadísticas asociadas de forma irreversible en esta edición.
                        </p>
                        <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                            <button onClick={() => setIsResetConfirmOpen(false)} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                            <button onClick={ejecutarResetearEdicion} className="bg-red hover:bg-red/80 text-white px-6 py-2.5 rounded-xl font-bold shadow-md transition-all">Eliminar Todo y Resetear</button>
                        </div>
                    </div>
                </Modal>
            )}
        </div>
    );
}