import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
    ArrowLeft, Plus, Trash2, Save, Crown, User, Globe,
    Gavel, MapPin, FileText, Pencil, AlertTriangle
} from "lucide-react";
import Modal from "../components/Modal";
import { UndoToast, useUndoToast } from "../components/UndoToast";
import { toast } from "../components/Toast";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";
import { CampoFutsal } from "../components/CampoFutsal";
import { ModalEvento } from "../components/ModalEvento";
import { EstadisticasPartido } from "../components/EstadisticasPartido";
import { EstadisticasJugadorPartido } from "../components/EstadisticasJugadorPartido";
import { ValoracionesPartido } from "../components/ValoracionesPartido";
import { TandaPenaltisPartido } from "../components/TandaPenaltisPartido";
import { generarActaPartido } from "../utils/pdfGenerator";
import { POSICIONES_INICIALES, inferirPosicionInicial, normalizarPosicion } from "../utils/posiciones";
import { serializarBorrador, guardarBorrador, leerBorrador, borrarBorrador, fusionarBorrador, BorradorActa } from "../utils/actaDraft";

// --- INTERFACES ---
interface PartidoDetalle {
    id: number;
    local_nombre: string; local_escudo: string;
    local_bandera?: string | null; local_pais_id?: number | null; local_pais_nombre?: string | null;
    visitante_nombre: string; visitante_escudo: string;
    visitante_bandera?: string | null; visitante_pais_id?: number | null; visitante_pais_nombre?: string | null;
    goles_local: number; goles_visitante: number;
    goles_descanso_local: number; goles_descanso_visitante: number;
    estado: string;
    local_id: number; visitante_id: number;
    edicion_id: number;
    estadio_nombre?: string;
    competicion_nombre?: string;
    temporada_nombre?: string;
    edicion_nombre?: string | null;
    jornada?: string | null;
    arbitro_nombre?: string;
    arbitro_2_nombre?: string;
    arbitro_3_nombre?: string;
    fecha?: string;
    formacion_local?: string;
    formacion_visitante?: string;
}

type EstadoConvocatoria = 'titular' | 'suplente' | 'convocado' | 'no_convocado';

interface PersonaAlineada {
    persona_id: number;
    nombre: string;
    dorsal: string | number;
    foto: string;
    posicion: string;
    nacionalidad_id: number;
    nacionalidad2_id: string;
    estado: EstadoConvocatoria;
    es_capitan: boolean;
    es_entrenador: boolean;
    fecha_nacimiento?: string;
    posicion_inicial?: string | null;
    fuente_posicion_inicial?: string | null;
}

interface Evento {
    id: number;
    minuto: number;
    tipo: string;
    subtipo: string | null;
    equipo_id: number;
    jugador_id?: number | null;
    asistente_id?: number | null;
    descripcion?: string | null;
    metadata?: string | null;
    jugador_nombre: string;
    asistente_nombre?: string;
}

interface Bandera { id: number; nombre: string; path: string; }

// --- COMPONENTE AVATAR ---
const Avatar = ({ path, alt, className = "w-full h-full" }: { path: string | null, alt: string, className?: string }) => {
    if (!path) return <div className={`bg-navy-light flex items-center justify-center text-silver/40 ${className}`}><User size={14} /></div>;
    return <img src={convertFileSrc(path)} alt={alt} className={`object-cover ${className}`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('bg-navy-light'); }} />;
};

const TABS = [
    { id: "alineaciones", label: "Alineaciones" },
    { id: "pizarra", label: "Pizarra" },
    { id: "eventos", label: "Eventos" },
    { id: "estadisticas", label: "Estadísticas" },
    { id: "jugadores", label: "Por Jugador" },
    { id: "valoraciones", label: "Valoraciones" },
    { id: "penaltis", label: "Tanda Penaltis" },
];

export default function DetallePartido() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [partido, setPartido] = useState<PartidoDetalle | null>(null);
    const [paises, setPaises] = useState<Bandera[]>([]);
    const [tab, setTab] = useState("alineaciones");

    // Listas
    const [plantillaLocal, setPlantillaLocal] = useState<PersonaAlineada[]>([]);
    const [plantillaVisitante, setPlantillaVisitante] = useState<PersonaAlineada[]>([]);

    // Eventos
    const [eventos, setEventos] = useState<Evento[]>([]);
    const [modalEventoOpen, setModalEventoOpen] = useState(false);
    const [eventoAEditar, setEventoAEditar] = useState<any>(null);
    const [defaultTipoEvento, setDefaultTipoEvento] = useState<string | undefined>(undefined);

    // Formaciones
    const [formacionLocal, setFormacionLocal] = useState<string>("1-3-1");
    const [formacionVisitante, setFormacionVisitante] = useState<string>("1-3-1");

    // --- CAMBIOS SIN GUARDAR (acta sucia) ---
    // Se marca en cada mutación de convocatorias/formaciones; se limpia tras guardar
    // o tras (re)cargar el acta. La guarda de navegación/cierre vive en el effect de abajo.
    const [actaSucia, setActaSucia] = useState(false);
    const actaSuciaRef = useRef(false);
    const marcarActaSucia = useCallback(() => {
        actaSuciaRef.current = true;
        setActaSucia(true);
    }, []);
    const limpiarActaSucia = useCallback(() => {
        actaSuciaRef.current = false;
        setActaSucia(false);
    }, []);

    // --- AUTOGUARDADO DEL BORRADOR DEL ACTA (localStorage, sobrevive reinicios) ---
    // Mientras el acta esté sucia se escribe un borrador por partido; si la app se
    // cierra o se sale sin guardar, al reabrir se ofrece recuperarlo. El borrador NO
    // se borra al salir sin guardar: ese es justo el caso que permite recuperar.
    const draftKey = `acta_draft_${id}`;

    useEffect(() => {
        if (!actaSucia) return;
        guardarBorrador(draftKey, serializarBorrador(plantillaLocal, plantillaVisitante, formacionLocal, formacionVisitante));
    }, [actaSucia, plantillaLocal, plantillaVisitante, formacionLocal, formacionVisitante, draftKey]);

    // SCRAPING ESTADOS
    const [modalScrapeOpen, setModalScrapeOpen] = useState(false);
    const [ceroaceroUrl, setCeroaceroUrl] = useState("");
    const [isScraping, setIsScraping] = useState(false);
    const [isGuardando, setIsGuardando] = useState(false);
    const [scrapedLocal, setScrapedLocal] = useState<any[]>([]);
    const [scrapedVisitante, setScrapedVisitante] = useState<any[]>([]);
    const [mappingsLocal, setMappingsLocal] = useState<Record<string, string>>({});
    const [mappingsVisitante, setMappingsVisitante] = useState<Record<string, string>>({});
    const [modalMappingOpen, setModalMappingOpen] = useState(false);

    // --- GUARDA DE LOS MODALES DE IMPORTACIÓN (scrape + mapeo) ---
    // Diálogo de DOS botones (seguir editando / descartar): no existe "guardado"
    // parcial — la única acción persistente es confirmar la importación completa.
    const { iniciar: iniciarImport, cerrarSeguro: cerrarSeguroImport, dialogo: dialogoImportacion } = useFormGuard();
    const abrirModalScrape = () => {
        iniciarImport({ url: ceroaceroUrl });
        setModalScrapeOpen(true);
    };
    const cerrarScrapeSeguro = async () => {
        if (isScraping) return; // no abandonar durante la descarga
        if (await cerrarSeguroImport({ url: ceroaceroUrl })) setModalScrapeOpen(false);
    };
    const cerrarMappingSeguro = async () => {
        if (await cerrarSeguroImport({
            mappingsLocal: JSON.stringify(mappingsLocal),
            mappingsVisitante: JSON.stringify(mappingsVisitante),
        })) setModalMappingOpen(false);
    };

    useEffect(() => {
        if (id) {
            cargarBanderas();
            cargarPartido();
            cargarEventos();
        }
    }, [id]);

    // --- GUARDA DE SALIDA CON CAMBIOS SIN GUARDAR ---
    // Cobertura triple: (1) botón Volver, (2) enlaces de la sidebar (interceptados en
    // fase de captura, antes de que React Router navegue), (3) cierre de la ventana
    // (onCloseRequested de Tauri). Todos pasan por el ConfirmDialog del tema.
    const { confirmar, dialogo: dialogoActaSucia } = useConfirm();
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    // El guarda vive en listeners de larga vida: sin este ref, guardarían el estado
    // de las convocatorias congelado en el render en que se montaron.
    const ejecutarGuardadoRef = useRef<() => Promise<boolean>>(async () => false);

    useEffect(() => {
        if (!actaSucia) return;

        let cancelado = false;
        const PREGUNTA = {
            titulo: "Cambios sin guardar",
            mensaje: "Hay cambios sin guardar en el acta. ¿Qué quieres hacer antes de salir?",
            textoConfirmar: "Salir sin guardar",
            textoGuardarSalir: "Guardar y salir",
        };

        const intentarSalir = async (accion: () => void): Promise<boolean> => {
            const r = await confirmar(PREGUNTA);
            if (cancelado) return false;
            if (r === "guardar") {
                // Solo se sale si el guardado triunfó; si falla, el error ya se mostró
                // y el usuario sigue en la pantalla con sus cambios.
                if (!(await ejecutarGuardadoRef.current())) return false;
            } else if (r === true) {
                limpiarActaSucia();
            } else {
                return false; // cancelado
            }
            accion();
            return true;
        };

        // (1) Enlaces internos (sidebar y otros <a>): captura antes del Router.
        const onClickCaptura = (ev: MouseEvent) => {
            if (ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
            const a = (ev.target as HTMLElement | null)?.closest("a[href]") as HTMLAnchorElement | null;
            if (!a) return;
            const href = a.getAttribute("href") || "";
            if (!href.startsWith("#/") || a.target === "_blank") return;
            ev.preventDefault();
            ev.stopPropagation();
            intentarSalir(() => navigateRef.current(href.slice(1)));
        };
        document.addEventListener("click", onClickCaptura, true);

        // (2) Cierre de la ventana de Tauri.
        let promesaUnlisten: Promise<() => void> | null = null;
        try {
            const win = getCurrentWindow();
            promesaUnlisten = win.onCloseRequested(async (event) => {
                event.preventDefault(); // siempre retenemos el cierre para preguntar
                const r = await confirmar(PREGUNTA);
                if (r === "guardar") {
                    // Cierra solo si el guardado triunfó.
                    if (await ejecutarGuardadoRef.current()) win.destroy();
                } else if (r === true) {
                    // Segunda señal: la primera fue cancelada por la guarda.
                    (window as any).__salirSinGuardar = true;
                    win.destroy();
                }
            });
        } catch { /* fuera de Tauri (tests/navegador): sin guarda de ventana */ }

        return () => {
            cancelado = true;
            document.removeEventListener("click", onClickCaptura, true);
            promesaUnlisten?.then(un => un()).catch(() => {});
        };
    }, [actaSucia, confirmar, limpiarActaSucia]);

    // --- ATAJO: Ctrl+S / Cmd+S guarda el acta desde cualquier pestaña ---
    // Usa ejecutarGuardadoRef para invocar siempre la última versión del guardado
    // (mismo patrón que la guarda de salida). Se ignora si hay un modal/diálogo
    // abierto (overlay .fixed.inset-0: su teclado manda, p.ej. Enter guarda el
    // evento) y si la tecla se mantiene pulsada (e.repeat). El propio
    // ejecutarGuardado ya es no-op si no hay partido o ya se está guardando.
    useEffect(() => {
        const onKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === "s" || e.key === "S")) {
                e.preventDefault();
                if (e.repeat) return;
                if (document.querySelector(".fixed.inset-0")) return;
                ejecutarGuardadoRef.current();
            }
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    async function cargarBanderas() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Bandera[]>("SELECT id, nombre, bandera_path as path FROM Pais");
        setPaises(res);
    }

    async function cargarPartido() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.select<PartidoDetalle[]>(`
                SELECT p.*, l.nombre as local_nombre, l.escudo_path as local_escudo,
                       lp.bandera_path as local_bandera, lp.id as local_pais_id, lp.nombre as local_pais_nombre,
                       v.nombre as visitante_nombre, v.escudo_path as visitante_escudo,
                       vp.bandera_path as visitante_bandera, vp.id as visitante_pais_id, vp.nombre as visitante_pais_nombre,
                       c.nombre as competicion_nombre, t.nombre as temporada_nombre, e.nombre as edicion_nombre,
                       est.nombre as estadio_nombre,
                       a1.nombre_deportivo as arbitro_nombre,
                       a2.nombre_deportivo as arbitro_2_nombre,
                       a3.nombre_deportivo as arbitro_3_nombre
                FROM Partido p 
                JOIN Equipo l ON p.local_id = l.id 
                JOIN Equipo v ON p.visitante_id = v.id
                LEFT JOIN Pais lp ON l.pais_id = lp.id
                LEFT JOIN Pais vp ON v.pais_id = vp.id
                LEFT JOIN Estadio est ON p.estadio_id = est.id
                JOIN Edicion e ON p.edicion_id = e.id
                JOIN Competicion c ON e.competicion_id = c.id
                JOIN Temporada t ON e.temporada_id = t.id
                LEFT JOIN Persona a1 ON p.arbitro_id = a1.id
                LEFT JOIN Persona a2 ON p.arbitro_2_id = a2.id
                LEFT JOIN Persona a3 ON p.arbitro_3_id = a3.id
                WHERE p.id = $1
            `, [id]);

            if (res.length > 0) {
                const p = res[0];
                setPartido(p);
                if (p.formacion_local) setFormacionLocal(p.formacion_local);
                if (p.formacion_visitante) setFormacionVisitante(p.formacion_visitante);
                if (plantillaLocal.length === 0) cargarPlantillas(p.edicion_id, p.local_id, p.visitante_id);
            }
        } catch (e) {
            console.error(e);
            toast.error("Error al cargar el partido");
        }
    }

    async function cargarPlantillas(edicionId: number, localId: number, visId: number) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            const getPersonas = async (eqId: number) => {
                const plantilla = await db.select<PersonaAlineada[]>(`
                    SELECT p.id as persona_id, p.nombre_deportivo as nombre, pl.dorsal, p.foto_path as foto,
                    p.posicion_principal as posicion,
                    p.nacionalidad_principal_id as nacionalidad_id,
                    p.nacionalidades_secundarias as nacionalidad2_id,
                    p.fecha_nacimiento,
                    CASE WHEN pl.rol = 'Entrenador' THEN 1 ELSE 0 END as es_entrenador
                    FROM Plantilla pl
                    JOIN Persona p ON pl.persona_id = p.id
                    WHERE pl.edicion_id = $1 AND pl.equipo_id = $2
                    ORDER BY pl.rol DESC, pl.dorsal ASC 
                `, [edicionId, eqId]);

                const alineaciones = await db.select<any[]>(`
                    SELECT persona_id, titular, es_capitan, posicion_inicial, fuente_posicion_inicial
                    FROM Alineacion
                    WHERE partido_id = $1 AND equipo_id = $2
                `, [id, eqId]);

                const alineacionMap = new Map(alineaciones.map(a => [a.persona_id, a]));

                return plantilla.map(p => {
                    const alineacion = alineacionMap.get(p.persona_id);
                    let estado: EstadoConvocatoria = 'no_convocado';
                    let es_capitan = false;

                    if (alineacion) {
                        if (p.es_entrenador) {
                            estado = 'convocado';
                        } else {
                            estado = alineacion.titular === 1 ? 'titular' : (alineacion.titular === 2 ? 'convocado' : 'suplente');
                        }
                        es_capitan = alineacion.es_capitan === 1;
                        p.posicion_inicial = alineacion.posicion_inicial;
                        p.fuente_posicion_inicial = alineacion.fuente_posicion_inicial;
                    }

                    return { ...p, estado, es_capitan };
                });
            };

            setPlantillaLocal(await getPersonas(localId));
            setPlantillaVisitante(await getPersonas(visId));
            limpiarActaSucia(); // el estado en pantalla vuelve a ser el de la BD
            revisarBorrador(); // primera carga: ¿hay un borrador sin guardar de otra sesión?
        } catch (e) {
            console.error(e);
            toast.error("Error al cargar las plantillas del partido");
        }
    }

    // --- RECUPERACIÓN DEL BORRADOR ---
    const borradorRevisadoRef = useRef(false);
    const [borradorRecuperado, setBorradorRecuperado] = useState(false);

    function revisarBorrador() {
        if (borradorRevisadoRef.current) return;
        borradorRevisadoRef.current = true;
        const d = leerBorrador(draftKey); // null si no hay, corrupto (lo elimina) o inválido
        if (!d) return;
        const fecha = d.ts ? new Date(d.ts).toLocaleString() : "sesión anterior";
        confirmar({
            titulo: "Borrador sin guardar",
            mensaje: `Se encontró un borrador del acta de este partido (guardado el ${fecha}) que no llegó a guardarse en la base de datos. ¿Quieres recuperarlo?`,
            textoConfirmar: "Descartar borrador",
            textoGuardarSalir: "Recuperar cambios",
        }).then(r => {
            if (r === "guardar") {
                aplicarBorrador(d);
            } else if (r === true) {
                borrarBorrador(draftKey);
            }
            // r === false: dejar el borrador por si se sale y vuelve a entrar
        });
    }

    /** Aplica el borrador sobre las plantillas cargadas (fusiona por persona_id). */
    function aplicarBorrador(d: BorradorActa) {
        const fusion = fusionarBorrador(d, plantillaLocal, plantillaVisitante);
        setPlantillaLocal(fusion.local);
        setPlantillaVisitante(fusion.visitante);
        if (d.formacionLocal) setFormacionLocal(d.formacionLocal);
        if (d.formacionVisitante) setFormacionVisitante(d.formacionVisitante);
        setBorradorRecuperado(true); // badge en la cabecera hasta guardar
        marcarActaSucia(); // lo recuperado difiere de la BD: sigue pendiente de guardar
        toast.info("Borrador recuperado. Recuerda guardar el acta.");
    }

    // --- LÓGICA DE SCRAPING DE CEROACERO ---
    const normalizeName = (name: string) => {
        return name.toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/[^a-z0-9\s]/g, "")
            .trim();
    };

    const findBestMatch = (scrapedName: string, dbList: PersonaAlineada[]) => {
        const cleanScraped = normalizeName(scrapedName);
        const exact = dbList.find(p => normalizeName(p.nombre) === cleanScraped);
        if (exact) return exact.persona_id.toString();
        const partial = dbList.find(p => {
            const cleanDb = normalizeName(p.nombre);
            return cleanDb.includes(cleanScraped) || cleanScraped.includes(cleanDb);
        });
        if (partial) return partial.persona_id.toString();
        const parts = cleanScraped.split(/\s+/);
        const wordMatch = dbList.find(p => {
            const cleanDb = normalizeName(p.nombre);
            return parts.some(part => part.length > 3 && cleanDb.includes(part));
        });
        if (wordMatch) return wordMatch.persona_id.toString();
        return "";
    };

    const handleStartScraping = async () => {
        if (!ceroaceroUrl) return toast.warning("Introduce una URL válida");
        setIsScraping(true);
        try {
            const html = await invoke<string>("fetch_html", { url: ceroaceroUrl });
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, "text/html");
            const columns = doc.querySelectorAll('.zz-tpl-col');
            if (columns.length < 4) {
                throw new Error("No se pudo detectar la estructura de alineaciones.");
            }
            const parsePlayers = (col: Element, isStarter: boolean, isCoach: boolean) => {
                if (!col) return [];
                const players: any[] = [];
                const playerElements = col.querySelectorAll('.player');
                playerElements.forEach(el => {
                    const numEl = el.querySelector('.number');
                    const nameLink = el.querySelector('.name a');
                    if (nameLink) {
                        const name = nameLink.textContent?.trim() || "";
                        const numberStr = numEl?.textContent?.replace(/\u00a0/g, '').trim() || "";
                        const number = parseInt(numberStr) || 0;
                        const eventsDiv = el.querySelector('.events');
                        const events: any[] = [];
                        if (eventsDiv) {
                            const spans = eventsDiv.querySelectorAll('span');
                            spans.forEach(span => {
                                const title = span.getAttribute('title') || "";
                                const nextDiv = span.nextElementSibling;
                                if (nextDiv && nextDiv.tagName.toLowerCase() === 'div') {
                                    const minStr = nextDiv.textContent || "";
                                    const regex = /(\d+)'\s*(?:\((p|p\.|p\.p\.)\))?/gi;
                                    let match;
                                    while ((match = regex.exec(minStr)) !== null) {
                                        const minute = parseInt(match[1]);
                                        const mod = match[2];
                                        let type = "GOL";
                                        let subtipo: string | null = "JUGADA";
                                        if (title.toLowerCase().includes('amarilla') || span.classList.contains('yellow')) {
                                            type = "TARJETA_AMARILLA"; subtipo = null;
                                        } else if (title.toLowerCase().includes('roja') || span.classList.contains('red')) {
                                            type = "TARJETA_ROJA"; subtipo = null;
                                        } else if (title.toLowerCase().includes('doble') || title.toLowerCase().includes('segunda')) {
                                            type = "DOBLE_AMARILLA"; subtipo = null;
                                        } else if (mod === 'p.' || mod === 'p') {
                                            type = "GOL"; subtipo = "PENALTI";
                                        } else if (mod === 'p.p.') {
                                            type = "GOL"; subtipo = "PROPIA_PUERTA";
                                        }
                                        events.push({ minute, type, subtipo });
                                    }
                                }
                            });
                        }
                        players.push({ name, number, isStarter, isCoach, events });
                    }
                });
                return players;
            };
            const scrapedLocStarters = parsePlayers(columns[0], true, false);
            const scrapedVisStarters = parsePlayers(columns[1], true, false);
            const scrapedLocSubs = parsePlayers(columns[2], false, false);
            const scrapedVisSubs = parsePlayers(columns[3], false, false);
            const scrapedLocCoaches = columns[4] ? parsePlayers(columns[4], false, true) : [];
            const scrapedVisCoaches = columns[5] ? parsePlayers(columns[5], false, true) : [];
            const localAll = [...scrapedLocStarters, ...scrapedLocSubs, ...scrapedLocCoaches];
            const visitanteAll = [...scrapedVisStarters, ...scrapedVisSubs, ...scrapedVisCoaches];
            setScrapedLocal(localAll);
            setScrapedVisitante(visitanteAll);
            const mapL: Record<string, string> = {};
            localAll.forEach(p => { mapL[p.name] = findBestMatch(p.name, plantillaLocal); });
            setMappingsLocal(mapL);
            const mapV: Record<string, string> = {};
            visitanteAll.forEach(p => { mapV[p.name] = findBestMatch(p.name, plantillaVisitante); });
            setMappingsVisitante(mapV);
            // Instantánea base del mapeo = el automapeo recién calculado:
            // solo se considerará "sucio" lo que el usuario reasigne a mano.
            iniciarImport({ mappingsLocal: JSON.stringify(mapL), mappingsVisitante: JSON.stringify(mapV) });
            setModalScrapeOpen(false);
            setModalMappingOpen(true);
        } catch (e: any) {
            console.error(e);
            toast.error("Error al scrapear el partido: " + e.message);
        } finally {
            setIsScraping(false);
        }
    };

    const handleConfirmImport = async () => {
        if (!partido) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [id]);
            await db.execute("DELETE FROM Evento WHERE partido_id = $1", [id]);
            let golesLoc = 0, golesVis = 0, golesDescansoLoc = 0, golesDescansoVis = 0;
            const importarEquipo = async (scraped: any[], mappings: Record<string, string>, plantilla: PersonaAlineada[], eqId: number) => {
                for (const p of scraped) {
                    const dbPersonaIdStr = mappings[p.name];
                    if (!dbPersonaIdStr) continue;
                    const dbPersonaId = parseInt(dbPersonaIdStr);
                    const dbPersona = plantilla.find(x => x.persona_id === dbPersonaId);
                    const dorsal = dbPersona ? dbPersona.dorsal : p.number;
                    const posicion = dbPersona ? dbPersona.posicion : 'Jugador';
                    // Posición inicial real: para titulares se infiere de la posición registrada.
                    const posicionInicial = p.isStarter ? inferirPosicionInicial(posicion) : null;
                    const fuenteInicial = p.isStarter ? 'inferida' : null;
                    await db.execute(`
                        INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan, entrenador_id, posicion_inicial, fuente_posicion_inicial)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    `, [id, eqId, dbPersonaId, p.isStarter ? 1 : 0, dorsal, posicion, 0, null, posicionInicial, fuenteInicial]);
                    for (const ev of p.events) {
                        await db.execute(`
                            INSERT INTO Evento (partido_id, minuto, tipo, subtipo, equipo_id, jugador_id, asistente_id)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [id, ev.minute, ev.type, ev.subtipo, eqId, dbPersonaId, null]);
                        if (ev.type === "GOL") {
                            if (ev.subtipo === "PROPIA_PUERTA") {
                                golesVis++; if (ev.minute <= 20) golesDescansoVis++;
                            } else {
                                golesLoc++; if (ev.minute <= 20) golesDescansoLoc++;
                            }
                        }
                    }
                }
            };
            await importarEquipo(scrapedLocal, mappingsLocal, plantillaLocal, partido.local_id);
            // For visitante, GOL increments golesLoc (wrong) — fix by tracking separately
            const golesVisAntes = golesVis;
            const golesDescansoVisAntes = golesDescansoVis;
            const golesLocAntes = golesLoc;
            const golesDescansoLocAntes = golesDescansoLoc;
            await importarEquipo(scrapedVisitante, mappingsVisitante, plantillaVisitante, partido.visitante_id);
            // After visitante import, golesLoc has visitante's goals added incorrectly
            // Correct: visitante goals = golesLoc - golesLocAntes, local goals stay as golesLocAntes
            const visitanteGoles = golesLoc - golesLocAntes;
            const visitanteDescanso = golesDescansoLoc - golesDescansoLocAntes;
            const totalGolesLoc = golesLocAntes;
            const totalGolesVis = golesVisAntes + visitanteGoles;
            const totalDescansoLoc = golesDescansoLocAntes;
            const totalDescansoVis = golesDescansoVisAntes + visitanteDescanso;
            await db.execute(`
                UPDATE Partido SET 
                goles_local = $1, goles_visitante = $2, 
                goles_descanso_local = $3, goles_descanso_visitante = $4,
                estado = 'finalizado'
                WHERE id = $5
            `, [totalGolesLoc, totalGolesVis, totalDescansoLoc, totalDescansoVis, id]);
            setModalMappingOpen(false);
            await cargarPartido();
            await cargarEventos();
            if (partido) await cargarPlantillas(partido.edicion_id, partido.local_id, partido.visitante_id);
            toast.success("Partido importado y guardado correctamente.");
        } catch (e) {
            console.error(e);
            toast.error("Error al guardar la importación");
        }
    };

    // --- LÓGICA ALINEACIÓN ---
    // Posición inicial real: al marcar titular se infiere de la posición registrada;
    // el usuario puede sobrescribirla con el selector (fuente = manual).
    const cambiarPosicionInicial = (esLocal: boolean, personaId: number, nuevaPosicion: string) => {
        marcarActaSucia();
        const setLista = esLocal ? setPlantillaLocal : setPlantillaVisitante;
        setLista(prev => prev.map(p =>
            p.persona_id === personaId
                ? { ...p, posicion_inicial: nuevaPosicion, fuente_posicion_inicial: 'manual' }
                : p
        ));
    };

    const cambiarEstado = (esLocal: boolean, personaId: number, nuevoEstado: EstadoConvocatoria) => {
        marcarActaSucia();
        const setLista = esLocal ? setPlantillaLocal : setPlantillaVisitante;
        // Snapshot para deshacer si se excluye a alguien de la convocatoria.
        const listaActual = esLocal ? plantillaLocal : plantillaVisitante;
        const personaAntes = listaActual.find(p => p.persona_id === personaId);
        if (nuevoEstado === 'no_convocado' && personaAntes && personaAntes.estado !== 'no_convocado') {
            pushCambioEstado({ personaId, esLocal, estadoAnterior: personaAntes.estado, nombre: personaAntes.nombre });
        }
        setLista(prev => {
            const nueva = prev.map(p => {
                if (p.persona_id !== personaId) return p;
                if (nuevoEstado === 'titular') {
                    // Al convertirse en titular, la posición inicial por defecto se infiere del perfil.
                    return { ...p, estado: nuevoEstado, posicion_inicial: inferirPosicionInicial(p.posicion), fuente_posicion_inicial: 'inferida' };
                }
                if (p.estado === 'titular') {
                    // Al dejar de ser titular se limpia la posición inicial.
                    return { ...p, estado: nuevoEstado, posicion_inicial: null, fuente_posicion_inicial: null };
                }
                return { ...p, estado: nuevoEstado };
            });
            if (nuevoEstado === 'titular') {
                const titulares = nueva.filter(j => j.estado === 'titular' && !j.es_entrenador).length;
                if (titulares > 5) { toast.warning("Máximo 5 titulares en futsal."); return prev; }
            }
            return nueva;
        });
    };

    const toggleCapitan = (esLocal: boolean, personaId: number) => {
        marcarActaSucia();
        const setLista = esLocal ? setPlantillaLocal : setPlantillaVisitante;
        setLista(prev => prev.map(p => ({ ...p, es_capitan: p.persona_id === personaId ? !p.es_capitan : false })));
    };

    /** Validaciones no bloqueantes del acta, para resumirlas en un único aviso al guardar. */
    const avisosActa = (): string[] => {
        if (!partido) return [];
        const avisos: string[] = [];
        for (const [nombre, lista] of [[partido.local_nombre, plantillaLocal], [partido.visitante_nombre, plantillaVisitante]] as const) {
            const jugadores = lista.filter(p => !p.es_entrenador);
            const titulares = jugadores.filter(p => p.estado === 'titular');
            if (titulares.length === 0) avisos.push(`${nombre}: sin titulares`);
            else if (titulares.length < 5) avisos.push(`${nombre}: solo ${titulares.length} titulares`);
            if (!lista.some(p => p.es_capitan)) avisos.push(`${nombre}: sin capitán`);
            if (!lista.some(p => p.es_entrenador)) avisos.push(`${nombre}: sin entrenador`);
        }
        return avisos;
    };

    /** Convierte una persona de la convocatoria a la fila que espera el comando Rust. */
    const aFilaActa = (persona: PersonaAlineada) => ({
        persona_id: persona.persona_id,
        titular: persona.estado === 'titular' ? 1 : (persona.estado === 'convocado' ? 2 : 0),
        dorsal: persona.dorsal ?? null,
        posicion: persona.posicion ?? null,
        es_capitan: !!persona.es_capitan,
        // Posición inicial real: solo aplica a titulares; el resto queda a null.
        posicion_inicial: persona.estado === 'titular'
            ? normalizarPosicion(persona.posicion_inicial || persona.posicion)
            : null,
        fuente_posicion_inicial: persona.estado === 'titular'
            ? (persona.fuente_posicion_inicial || 'inferida')
            : null,
    });

    async function ejecutarGuardado(): Promise<boolean> {
        if (!partido || isGuardando) return false;
        setIsGuardando(true);
        try {
            // La escritura completa (DELETE + INSERTs + formaciones) es UNA transacción
            // en Rust: si falla a mitad, se hace ROLLBACK y el acta queda como estaba.
            const filasL = plantillaLocal.filter(p => p.estado !== 'no_convocado').map(aFilaActa);
            const filasV = plantillaVisitante.filter(p => p.estado !== 'no_convocado').map(aFilaActa);

            // Snapshot del acta actual en BD para poder deshacer el guardado (UndoToast).
            // Se lee justo antes del DELETE dentro de la transacción.
            let snapshot: SnapshotActa | null = null;
            try {
                const dbSnap = await Database.load("sqlite:globalfutsal.db");
                const [filasPrevias, formPrev] = await Promise.all([
                    dbSnap.select<FilaAlineacionBD[]>(
                        `SELECT persona_id, equipo_id, titular, dorsal, posicion, es_capitan, posicion_inicial, fuente_posicion_inicial
                         FROM Alineacion WHERE partido_id = $1 ORDER BY equipo_id, persona_id`, [id]
                    ),
                    dbSnap.select<{ formacion_local: string | null; formacion_visitante: string | null }[]>(
                        `SELECT formacion_local, formacion_visitante FROM Partido WHERE id = $1`, [id]
                    ),
                ]);
                if (formPrev.length > 0) {
                    snapshot = {
                        formacionLocal: formPrev[0].formacion_local || "",
                        formacionVisitante: formPrev[0].formacion_visitante || "",
                        filas: filasPrevias,
                    };
                }
            } catch (e) { console.error("No se pudo tomar snapshot para deshacer:", e); }

            await invoke("guardar_acta_transaccion", {
                partidoId: id,
                equipoLocal: partido.local_id,
                equipoVisitante: partido.visitante_id,
                formacionLocal: formacionLocal,
                formacionVisitante: formacionVisitante,
                filasLocal: filasL,
                filasVisitante: filasV,
            });
            setPartido(prev => prev ? { ...prev, formacion_local: formacionLocal, formacion_visitante: formacionVisitante } : null);
            limpiarActaSucia(); // guardado: pantalla y BD sincronizadas
            setBorradorRecuperado(false); // guardado: el badge de borrador deja de ser relevante
            borrarBorrador(draftKey); // el borrador (localStorage) ya no hace falta
            // Resumen único: un solo toast con lo guardado; los avisos de validación
            // (sin titulares completos, sin capitán, sin entrenador) van en el mismo mensaje.
            const avisos = avisosActa();
            const resumenAvisos = avisos.length
                ? " — Avisos: " + avisos.slice(0, 3).join(" · ") + (avisos.length > 3 ? ` · +${avisos.length - 3} más` : "")
                : "";
            const titularesL = plantillaLocal.filter(p => p.estado === 'titular' && !p.es_entrenador).length;
            const titularesV = plantillaVisitante.filter(p => p.estado === 'titular' && !p.es_entrenador).length;
            const convocadosL = plantillaLocal.filter(p => p.estado !== 'no_convocado' && !p.es_entrenador).length;
            const convocadosV = plantillaVisitante.filter(p => p.estado !== 'no_convocado' && !p.es_entrenador).length;
            if (avisos.length) {
                toast.warning(`Acta guardada${resumenAvisos}`);
            } else {
                toast.success(`Acta guardada: ${titularesL}+${titularesV} titulares, ${convocadosL + convocadosV} convocados`);
            }
            // Ofrecer deshacer solo si había un acta previa en BD que restaurar.
            if (snapshot) pushActaAnterior(snapshot);
            return true;
        } catch (e) {
            console.error(e);
            toast.error("Error al guardar las alineaciones");
            return false;
        } finally {
            setIsGuardando(false);
        }
    }

    /** Botón Guardar Acta: guarda y muestra el resumen (toasts dentro de ejecutarGuardado). */
    async function guardarAlineaciones() {
        await ejecutarGuardado();
    }
    // Los listeners de la guarda de salida siempre invocan la última versión.
    ejecutarGuardadoRef.current = ejecutarGuardado;

    /** Deshacer guardado: repone el snapshot (alineaciones + formaciones) con la
        misma transacción atómica del guardado, y recarga el estado en pantalla. */
    async function deshacerGuardadoActa(snap: SnapshotActa) {
        if (!partido) return;
        try {
            const aFila = (f: FilaAlineacionBD) => ({
                persona_id: f.persona_id,
                titular: f.titular,
                dorsal: f.dorsal,
                posicion: f.posicion,
                es_capitan: f.es_capitan === 1,
                posicion_inicial: f.posicion_inicial,
                fuente_posicion_inicial: f.fuente_posicion_inicial,
            });
            const esLocal = (filaEquipoId: number) => filaEquipoId === partido.local_id;
            await invoke("guardar_acta_transaccion", {
                partidoId: id,
                equipoLocal: partido.local_id,
                equipoVisitante: partido.visitante_id,
                formacionLocal: snap.formacionLocal,
                formacionVisitante: snap.formacionVisitante,
                filasLocal: snap.filas.filter(f => esLocal(f.equipo_id)).map(aFila),
                filasVisitante: snap.filas.filter(f => !esLocal(f.equipo_id)).map(aFila),
            });
            setFormacionLocal(snap.formacionLocal || "1-3-1");
            setFormacionVisitante(snap.formacionVisitante || "1-3-1");
            await cargarPlantillas(partido.edicion_id, partido.local_id, partido.visitante_id);
            toast.info("Guardado deshecho: acta restaurada al estado anterior.");
        } catch (e) {
            console.error(e);
            toast.error("Error al deshacer el guardado");
        }
    }

    const getFlagSrc = (natId: number) => {
        const f = paises.find(p => p.id === natId);
        return f ? convertFileSrc(f.path) : null;
    };

    const renderFlags = (nacionalidad_id: number, nacionalidad2_id?: string) => {
        const flagIds: number[] = [nacionalidad_id];
        if (nacionalidad2_id) {
            const trimmed = nacionalidad2_id.trim();
            if (trimmed.startsWith('[')) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (Array.isArray(parsed)) {
                        parsed.forEach(x => {
                            const num = parseInt(x);
                            if (!isNaN(num) && !flagIds.includes(num)) flagIds.push(num);
                        });
                    }
                } catch {}
            } else {
                const num = parseInt(trimmed);
                if (!isNaN(num) && !flagIds.includes(num)) flagIds.push(num);
            }
        }
        return (
            <div className="flex gap-1 shrink-0">
                {flagIds.map(fid => {
                    const src = getFlagSrc(fid);
                    return src ? (
                        <img key={fid} src={src} className="w-3.5 h-2.5 rounded-sm shadow-sm border border-white/5 object-cover" alt="flag" />
                    ) : null;
                })}
            </div>
        );
    };

    // --- EVENTOS ---
    async function cargarEventos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.select<Evento[]>(`
                SELECT e.id, e.minuto, e.tipo, e.subtipo, e.equipo_id, e.jugador_id, e.asistente_id, e.descripcion, e.metadata,
                       p1.nombre_deportivo as jugador_nombre, p2.nombre_deportivo as asistente_nombre
                FROM Evento e 
                LEFT JOIN Persona p1 ON e.jugador_id = p1.id 
                LEFT JOIN Persona p2 ON e.asistente_id = p2.id
                WHERE e.partido_id = $1 ORDER BY e.minuto ASC, e.id ASC
            `, [id]);
            setEventos(res);
        } catch (e) {
            console.error(e);
            toast.error("Error al cargar los eventos del partido");
        }
    }

    async function onEventoGuardado() {
        setModalEventoOpen(false);
        setEventoAEditar(null);
        setDefaultTipoEvento(undefined);
        await cargarEventos();
        await cargarPartido();
    }

    // --- UNDO DE BORRADO DE EVENTOS (componente reutilizable) ---
    const { pendiente: eventoBorrado, push: pushEventoBorrado, clear: clearEventoBorrado } = useUndoToast<Evento>();

    // --- UNDO DE EXCLUSIÓN DE CONVOCADOS (botón X de la plantilla) ---
    interface CambioEstadoPendiente { personaId: number; esLocal: boolean; estadoAnterior: EstadoConvocatoria; nombre: string; }
    const { pendiente: cambioEstadoPend, push: pushCambioEstado, clear: clearCambioEstado } = useUndoToast<CambioEstadoPendiente>();

    // --- UNDO DE GUARDADO DEL ACTA (snapshot del estado previo en BD) ---
    interface FilaAlineacionBD {
        persona_id: number; equipo_id: number; titular: number; dorsal: number | null;
        posicion: string | null; es_capitan: number; posicion_inicial: string | null; fuente_posicion_inicial: string | null;
    }
    interface SnapshotActa {
        formacionLocal: string;
        formacionVisitante: string;
        filas: FilaAlineacionBD[];
    }
    const { pendiente: actaAnterior, push: pushActaAnterior } = useUndoToast<SnapshotActa>();

    /** Deshacer exclusión: devuelve al jugador al estado que tenía. */
    const deshacerCambioEstado = (c: CambioEstadoPendiente) => {
        cambiarEstado(c.esLocal, c.personaId, c.estadoAnterior);
        clearCambioEstado();
    };

    /** Suma al marcador el gol de un evento restaurado. */
    async function sumarGol(ev: Evento, db: any) {
        if (!partido) return;
        const esLocal = ev.equipo_id === partido.local_id;
        const sumaAlLocal = (esLocal && ev.subtipo !== 'PROPIA_PUERTA') || (!esLocal && ev.subtipo === 'PROPIA_PUERTA');
        let q = "UPDATE Partido SET ";
        if (sumaAlLocal) {
            q += "goles_local = goles_local + 1";
            if (ev.minuto <= 20) q += ", goles_descanso_local = goles_descanso_local + 1";
        } else {
            q += "goles_visitante = goles_visitante + 1";
            if (ev.minuto <= 20) q += ", goles_descanso_visitante = goles_descanso_visitante + 1";
        }
        q += " WHERE id = $1";
        await db.execute(q, [id]);
    }

    /** Deshacer: re-inserta el evento con su id original y re-suma su gol si procede. */
    async function restaurarEvento() {
        if (!eventoBorrado || !partido) return;
        const ev = eventoBorrado.data;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute(
                `INSERT INTO Evento (id, partido_id, tipo, subtipo, minuto, jugador_id, asistente_id, equipo_id, descripcion, metadata)
                 SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
                 WHERE NOT EXISTS (SELECT 1 FROM Evento WHERE id = $1)`,
                [ev.id, partido.id, ev.tipo, ev.subtipo, ev.minuto, (ev as any).jugador_id ?? null, (ev as any).asistente_id ?? null, ev.equipo_id, (ev as any).descripcion ?? null, (ev as any).metadata ?? null]
            );
            if (ev.tipo === "GOL") await sumarGol(ev, db);
            clearEventoBorrado();
            await cargarEventos();
            await cargarPartido();
        } catch (e) {
            console.error(e);
            toast.error("No se pudo restaurar el evento");
        }
    }

    async function borrarEvento(ev: Evento) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Evento WHERE id = $1", [ev.id]);

            // Restar del marcador si era gol
            if (ev.tipo === "GOL" && partido) {
                const esLocal = ev.equipo_id === partido.local_id;
                const sumaAlLocal = (esLocal && ev.subtipo !== 'PROPIA_PUERTA') || (!esLocal && ev.subtipo === 'PROPIA_PUERTA');
                let q = "UPDATE Partido SET ";
                if (sumaAlLocal) {
                    q += "goles_local = MAX(0, goles_local - 1)";
                    if (ev.minuto <= 20) q += ", goles_descanso_local = MAX(0, goles_descanso_local - 1)";
                } else {
                    q += "goles_visitante = MAX(0, goles_visitante - 1)";
                    if (ev.minuto <= 20) q += ", goles_descanso_visitante = MAX(0, goles_descanso_visitante - 1)";
                }
                q += " WHERE id = $1";
                await db.execute(q, [id]);
                await cargarPartido();
            }
            await cargarEventos();
            pushEventoBorrado(ev);
        } catch (e) {
            console.error(e);
            toast.error("No se pudo eliminar el evento");
        }
    }

    const renderEvento = (ev: Evento) => {
        let icono = <span className="text-base">•</span>;
        let color = "text-silver bg-white/5 border-white/10";
        let texto = ev.jugador_nombre || "";
        const esLocal = partido && ev.equipo_id === partido.local_id;
        const equipoNombre = esLocal ? partido?.local_nombre : partido?.visitante_nombre;

        switch (ev.tipo) {
            case "GOL":
                icono = <span className="text-lg">⚽</span>;
                color = "text-white bg-accent-blue/10 border-accent-blue/30";
                if (ev.subtipo === "PROPIA_PUERTA") { texto += " (P.P.)"; color = "text-red bg-red/10 border-red/30"; }
                else if (ev.subtipo === "PENALTI") texto += " (Penalti)";
                else if (ev.subtipo === "DOBLE_PENALTI") texto += " (Doble Penalti)";
                else if (ev.subtipo) texto += ` (${ev.subtipo.replace(/_/g, ' ').toLowerCase()})`;
                if (ev.asistente_nombre) texto += ` — Asis: ${ev.asistente_nombre}`;
                break;
            case "TARJETA":
                if (ev.subtipo === "Amarilla") { icono = <span className="text-base">🟨</span>; color = "text-yellow-400 bg-yellow-400/10 border-yellow-400/30"; }
                else if (ev.subtipo === "2ª Amarilla") { icono = <span className="text-base">🟨🟨</span>; color = "text-orange bg-orange/10 border-orange/30"; texto += " (2ª Amarilla)"; }
                else if (ev.subtipo === "Roja") { icono = <span className="text-base">🟥</span>; color = "text-red bg-red/10 border-red/30"; }
                else if (ev.subtipo === "Azul") { icono = <span className="text-base">🟦</span>; color = "text-blue-400 bg-blue-400/10 border-blue-400/30"; texto += " (Azul)"; }
                break;
            case "CAMBIO":
                icono = <span className="text-base">🔄</span>;
                color = "text-silver bg-white/5 border-white/10";
                texto = `Entra: ${ev.jugador_nombre} ⇆ Sale: ${ev.asistente_nombre || "—"}`;
                break;
            case "TIEMPO_MUERTO":
                icono = <span className="text-base">⏱️</span>;
                color = "text-orange bg-orange/10 border-orange/30";
                texto = `Tiempo muerto — ${equipoNombre || ""}`;
                break;
            case "FALTA_ACUM":
                icono = <span className="text-base">📊</span>;
                color = "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
                texto = `Falta acumulativa (${ev.minuto}') — ${equipoNombre || ""}`;
                break;
            case "LESION":
                icono = <span className="text-base">🚑</span>;
                color = "text-red bg-red/5 border-red/20";
                texto += " (Lesión)";
                break;
            case "GOL_ANULADO":
                icono = <span className="text-base">⛔</span>;
                color = "text-silver bg-white/5 border-white/10";
                texto += " (Gol Anulado)";
                break;
            case "TANDA_PENALTI":
                icono = <span className="text-base">🎯</span>;
                color = "text-orange bg-orange/10 border-orange/30";
                texto = `Penalti: ${ev.jugador_nombre} — ${ev.subtipo || ""}`;
                break;
        }

        return (
            <div className={`flex items-center gap-3 p-3 border rounded-xl shadow-sm mb-2 ${color} transition-all hover:scale-[1.01] cursor-pointer hover:border-orange/40`} onClick={() => { setEventoAEditar(ev); setModalEventoOpen(true); }} title="Clic para editar el evento">
                <span className="font-mono font-black text-sm w-10 text-center opacity-60">{ev.minuto}'</span>
                <span className="text-lg flex items-center justify-center w-6 shrink-0">{icono}</span>
                <span className="font-bold flex-1 text-sm">{texto}</span>
                <button onClick={(e) => { e.stopPropagation(); setEventoAEditar(ev); setModalEventoOpen(true); }} className="text-silver/30 hover:text-accent-blue p-1 rounded transition-colors" title="Editar evento">
                    <Pencil size={14} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); borrarEvento(ev); }} className="text-silver/30 hover:text-red p-1 rounded transition-colors" title="Eliminar evento">
                    <Trash2 size={14} />
                </button>
            </div>
        );
    };

    // --- PDF ---
    async function handleGenerarPDF() {
        if (!partido) return;
        try {
            const titularesLocal = plantillaLocal.filter(p => p.estado === 'titular');
            const titularesVisitante = plantillaVisitante.filter(p => p.estado === 'titular');
            const entrenadoresLocal = plantillaLocal.filter(p => p.es_entrenador);
            const entrenadoresVisitante = plantillaVisitante.filter(p => p.es_entrenador);
            await generarActaPartido(partido, titularesLocal, titularesVisitante, eventos, {}, paises, entrenadoresLocal, entrenadoresVisitante);
        } catch (e) {
            console.error(e);
            toast.error("Error al generar el PDF");
        }
    }

    const renderListaEquipo = (lista: PersonaAlineada[], esLocal: boolean) => {
        const entrenadores = lista.filter(p => p.es_entrenador);
        const jugadores = lista.filter(p => !p.es_entrenador);
        const scorePos = (pos: string) => { if (pos === 'Portero') return 1; if (pos === 'Cierre') return 2; if (pos === 'Ala' || pos === 'Ala Izquierdo' || pos === 'Ala Derecho' || pos === 'Ala izquierda' || pos === 'Ala derecha') return 3; if (pos === 'Pívot' || pos === 'Pivot') return 4; return 5; };
        const scoreEstado = (s: string) => { if (s === 'titular') return 1; if (s === 'suplente') return 2; if (s === 'convocado') return 3; return 4; };
        const jugadoresOrdenados = [...jugadores].sort((a, b) => {
            if (scoreEstado(a.estado) !== scoreEstado(b.estado)) return scoreEstado(a.estado) - scoreEstado(b.estado);
            const posA = a.estado === 'titular' ? (a.posicion_inicial || a.posicion) : a.posicion;
            const posB = b.estado === 'titular' ? (b.posicion_inicial || b.posicion) : b.posicion;
            return scorePos(posA) - scorePos(posB);
        });

        return (
            <div className="flex-1 overflow-y-auto p-3 pb-24 space-y-3">
                {entrenadores.length > 0 && (
                    <div className="bg-white/5 p-3 rounded-xl border border-white/5">
                        <div className="text-[10px] font-black text-silver/40 uppercase tracking-widest mb-2">Cuerpo Técnico</div>
                        <div className="space-y-2">
                            {entrenadores.map(ent => (
                                <div key={ent.persona_id} className="flex items-center gap-3 p-2 bg-navy/40 border border-white/5 rounded-xl">
                                    <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-navy shrink-0"><Avatar path={ent.foto} alt="" /></div>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-bold text-white truncate">{ent.nombre}</div>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                            {renderFlags(ent.nacionalidad_id, ent.nacionalidad2_id)}
                                            <span className="text-[9px] text-silver/50 uppercase font-bold tracking-wider">Entrenador</span>
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                        <button onClick={() => cambiarEstado(esLocal, ent.persona_id, 'convocado')} className={`px-2.5 py-1 text-[9px] font-black rounded-lg transition-all ${ent.estado === 'convocado' ? 'bg-orange text-white' : 'bg-white/5 text-silver/40 hover:bg-white/10'}`}>CON</button>
                                        <button onClick={() => cambiarEstado(esLocal, ent.persona_id, 'no_convocado')} className={`px-2.5 py-1 text-[9px] font-black rounded-lg transition-all ${ent.estado === 'no_convocado' ? 'bg-red/20 text-red' : 'bg-white/5 text-silver/40 hover:bg-white/10'}`}>X</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                <div className="space-y-1.5">
                    {jugadoresOrdenados.map(jug => {
                        let bg = "bg-white/5 opacity-60 border-white/5";
                        if (jug.estado === 'titular') bg = "bg-orange/10 border-orange/40 opacity-100 shadow-md";
                        if (jug.estado === 'suplente') bg = "bg-success/10 border-success/30 opacity-100";
                        if (jug.estado === 'convocado') bg = "bg-accent-blue/10 border-accent-blue/30 opacity-100";
                        return (
                            <div key={jug.persona_id} className={`flex items-center gap-3 p-2.5 rounded-xl border ${bg} transition-all group hover:opacity-100`}>
                                <div className="w-6 text-center font-mono font-black text-white text-base">{jug.dorsal}</div>
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-navy shrink-0 shadow-inner"><Avatar path={jug.foto} alt="" /></div>                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white truncate text-sm">{jug.nombre}</span>
                                            {jug.es_capitan && <Crown size={12} className="text-orange animate-bounce" />}
                                        </div>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {renderFlags(jug.nacionalidad_id, jug.nacionalidad2_id)}
                                            {jug.estado === 'titular' ? (
                                                <select
                                                    value={normalizarPosicion(jug.posicion_inicial || jug.posicion)}
                                                    onChange={(e) => cambiarPosicionInicial(esLocal, jug.persona_id, e.target.value)}
                                                    title="Posición real de inicio en este partido"
                                                    className={`text-[9px] uppercase font-black tracking-wider rounded px-1 py-0.5 outline-none cursor-pointer border ${jug.fuente_posicion_inicial === 'manual'
                                                        ? 'bg-orange/15 text-orange border-orange/40'
                                                        : 'bg-white/5 text-silver/60 border-white/10 hover:border-orange/40'}`}
                                                >
                                                    {POSICIONES_INICIALES.map(pos => (
                                                        <option key={pos} value={pos} className="bg-navy text-white">{pos}</option>
                                                    ))}
                                                </select>
                                            ) : (
                                                <span className="text-[9px] text-silver/50 uppercase font-bold tracking-wider">{jug.posicion}</span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'titular')} className={`px-2 py-1 text-[9px] font-black rounded-lg transition-all ${jug.estado === 'titular' ? 'bg-orange text-white' : 'bg-white/5 text-silver/40 hover:bg-white/10 hover:text-white'}`}>TIT</button>
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'suplente')} className={`px-2 py-1 text-[9px] font-black rounded-lg transition-all ${jug.estado === 'suplente' ? 'bg-success text-white' : 'bg-white/5 text-silver/40 hover:bg-white/10 hover:text-white'}`}>SUP</button>
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'convocado')} className={`px-2 py-1 text-[9px] font-black rounded-lg transition-all ${jug.estado === 'convocado' ? 'bg-accent-blue text-white' : 'bg-white/5 text-silver/40 hover:bg-white/10 hover:text-white'}`}>CON</button>
                                    <button onClick={() => toggleCapitan(esLocal, jug.persona_id)} className={`p-1.5 rounded-lg transition-all ${jug.es_capitan ? 'text-orange bg-orange/10' : 'text-silver/30 hover:text-orange hover:bg-white/5'}`}><Crown size={12} /></button>
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'no_convocado')} className="p-1.5 text-silver/40 hover:text-red hover:bg-red/10 rounded-lg transition-colors">X</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    const titularesLocal = plantillaLocal.filter(p => p.estado === 'titular' && !p.es_entrenador);
    const titularesVisitante = plantillaVisitante.filter(p => p.estado === 'titular' && !p.es_entrenador);

    // Convocatoria completa (todos los jugadores convocados, sin entrenadores ni descartados)
    // para el % de extranjeros global del panel de la pizarra.
    const convocatoriaLocal = plantillaLocal.filter(p => !p.es_entrenador && p.estado !== 'no_convocado');
    const convocatoriaVisitante = plantillaVisitante.filter(p => !p.es_entrenador && p.estado !== 'no_convocado');

    // Adaptar los titulares al formato que espera la pista: usar la posición inicial REAL
    // (posicion_inicial) en lugar de la registrada, y mapear foto/bandera.
    const adaptarParaPista = (lista: PersonaAlineada[]) => lista.map(p => ({
        ...p,
        posicion_partido: normalizarPosicion(p.posicion_inicial || p.posicion),
        foto_path: p.foto,
        bandera1: getFlagSrc(p.nacionalidad_id) || undefined,
    }));

    // El entrenador llega con el campo `foto`; la pista espera `foto_path`.
    const entrenadorDe = (lista: PersonaAlineada[]) => {
        const ent = lista.find(p => p.es_entrenador && p.estado !== 'no_convocado');
        return ent ? { ...ent, foto_path: ent.foto } : undefined;
    };

    if (!partido) return <div className="flex h-screen items-center justify-center text-silver/40 animate-pulse font-display font-black">CARGANDO ACTA...</div>;

    // Avisos de validación del acta calculados en vivo sobre el estado actual de las
    // convocatorias; el banner de la pestaña Alineaciones y el resumen del toast al
    // guardar salen de esta misma lista.
    const avisosActaActuales = avisosActa();

    /** Salida segura: ofrece Guardar y salir / Salir sin guardar / Cancelar. */
    const volverSeguro = async () => {
        if (actaSuciaRef.current) {
            const r = await confirmar({
                titulo: "Cambios sin guardar",
                mensaje: "Hay cambios sin guardar en el acta. ¿Qué quieres hacer antes de salir?",
                textoConfirmar: "Salir sin guardar",
                textoGuardarSalir: "Guardar y salir",
            });
            if (r === "guardar") {
                if (!(await ejecutarGuardado())) return; // fallo al guardar: quedarse
            } else if (r === true) {
                limpiarActaSucia();
            } else {
                return; // cancelado
            }
        }
        navigate(-1);
    };

    return (
        <div className="flex flex-col h-screen bg-transparent text-white ml-0">
            {/* CABECERA */}
            <div className="glass-panel p-5 border border-white/5 shadow-2xl rounded-b-2xl flex items-center justify-between sticky top-0 z-20 bg-navy-dark/95 backdrop-blur-xl">
                <button onClick={volverSeguro} title={actaSucia ? "Cambios sin guardar en el acta" : "Volver"} className="relative flex items-center gap-2 text-silver/60 hover:text-orange font-bold transition-colors">
                    <ArrowLeft size={20} /> Volver
                    {actaSucia && (
                        <span className="absolute -top-1 -right-2 w-2.5 h-2.5 rounded-full bg-warning animate-pulse ring-2 ring-navy-dark" />
                    )}
                </button>
                
                <div className="flex items-center gap-6">
                    <div className="flex flex-col items-end gap-1 w-44">
                        <div className="truncate font-display font-black text-lg text-white max-w-full">{partido.local_nombre}</div>
                        {partido.local_bandera && (
                            <div className="relative group/flag cursor-help">
                                <img src={convertFileSrc(partido.local_bandera)} className="w-8 h-auto rounded-[2px] shadow-sm border border-white/15" />
                                {partido.local_pais_nombre && (
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap bg-gray-950/95 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg border border-white/10 shadow-xl opacity-0 invisible group-hover/flag:opacity-100 group-hover/flag:visible transition-all duration-150 z-[70] pointer-events-none">
                                        {partido.local_pais_nombre}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="w-12 h-12 bg-white border border-white/10 shadow-md rounded-xl overflow-hidden flex items-center justify-center p-1.5">
                        <Avatar path={partido.local_escudo} alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-silver/50 font-black whitespace-nowrap">
                            <span className="truncate max-w-[220px]">{[partido.competicion_nombre, partido.temporada_nombre, partido.edicion_nombre].filter(Boolean).join(" · ")}</span>
                            {partido.jornada && <span className="text-orange/80">· J{partido.jornada}</span>}
                        </div>
                        {borradorRecuperado && (
                            <span
                                title="Se restauró un borrador sin guardar. Desaparecerá al guardar el acta."
                                className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-warning bg-warning/10 border border-warning/30 rounded-full px-2.5 py-0.5 animate-in fade-in duration-200"
                            >
                                <FileText size={10} /> Borrador recuperado
                            </span>
                        )}
                        <div className="bg-navy border border-white/10 px-8 py-2.5 rounded-2xl font-mono text-3xl font-black tracking-widest text-orange">
                            {partido.goles_local} - {partido.goles_visitante}
                        </div>
                    </div>
                    <div className="w-12 h-12 bg-white border border-white/10 shadow-md rounded-xl overflow-hidden flex items-center justify-center p-1.5">
                        <Avatar path={partido.visitante_escudo} alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="flex flex-col items-start gap-1 w-44">
                        <div className="truncate font-display font-black text-lg text-white max-w-full">{partido.visitante_nombre}</div>
                        {partido.visitante_bandera && (
                            <div className="relative group/flag cursor-help">
                                <img src={convertFileSrc(partido.visitante_bandera)} className="w-8 h-auto rounded-[2px] shadow-sm border border-white/15" />
                                {partido.visitante_pais_nombre && (
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1.5 whitespace-nowrap bg-gray-950/95 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-1 rounded-lg border border-white/10 shadow-xl opacity-0 invisible group-hover/flag:opacity-100 group-hover/flag:visible transition-all duration-150 z-[70] pointer-events-none">
                                        {partido.visitante_pais_nombre}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <button onClick={handleGenerarPDF} className="bg-navy border border-white/10 hover:border-orange text-white px-4 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all text-xs uppercase tracking-wider" title="Generar acta PDF">
                        <FileText size={16} className="text-orange" /> PDF
                    </button>
                    <div className="text-right flex flex-col items-end">
                        <div className={`text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full border ${partido.estado === 'en_juego' ? 'bg-green-500/10 text-success border-success/30 animate-pulse' : 'bg-white/5 text-silver/60 border-white/5'}`}>
                            {partido.estado.replace(/_/g, ' ')}
                        </div>
                        {partido.arbitro_nombre && (
                            <div className="text-[9px] text-silver/40 mt-1.5 font-bold flex items-center gap-1">
                                <Gavel size={12} className="text-orange" />
                                {[partido.arbitro_nombre, partido.arbitro_2_nombre, partido.arbitro_3_nombre].filter(Boolean).join(", ")}
                            </div>
                        )}
                        {partido.estadio_nombre && (
                            <div className="text-[9px] text-silver/40 font-bold flex items-center gap-1 mt-0.5">
                                <MapPin size={12} className="text-accent-blue" />
                                {partido.estadio_nombre}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* BARRA DE TABS */}
            <div className="flex justify-center bg-transparent my-4">
                <div className="flex gap-1 glass-panel p-1.5 rounded-xl border border-white/5 w-fit overflow-x-auto">
                    {TABS.map(t => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`px-5 py-2.5 rounded-lg text-xs uppercase tracking-wider font-black transition-all whitespace-nowrap ${tab === t.id ? 'bg-gradient-to-r from-orange to-orange-neon text-white shadow-neon-orange' : 'text-silver/50 hover:bg-white/5 hover:text-white'}`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* CONTENIDO PRINCIPAL */}
            <div className="flex-1 overflow-auto px-8 pb-24">
                {/* TAB: PIZARRA (campo a pantalla completa) */}
                {tab === "pizarra" && (
                    <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-xl bg-navy-dark/30 h-[calc(100vh-260px)] min-h-[420px]">
                        <CampoFutsal
                            localNombre={partido.local_nombre}
                            visitanteNombre={partido.visitante_nombre}
                            localEscudo={partido.local_escudo}
                            visitanteEscudo={partido.visitante_escudo}
                            localBandera={partido.local_bandera || undefined}
                            visitanteBandera={partido.visitante_bandera || undefined}
                            localPaisId={partido.local_pais_id || undefined}
                            visitantePaisId={partido.visitante_pais_id || undefined}
                            paises={paises}
                            alineacionLocal={adaptarParaPista(titularesLocal)}
                            alineacionVisitante={adaptarParaPista(titularesVisitante)}
                            convocatoriaLocal={adaptarParaPista(convocatoriaLocal)}
                            convocatoriaVisitante={adaptarParaPista(convocatoriaVisitante)}
                            entrenadorLocal={entrenadorDe(plantillaLocal)}
                            entrenadorVisitante={entrenadorDe(plantillaVisitante)}
                            formacionLocalGuardada={formacionLocal}
                            formacionVisitanteGuardada={formacionVisitante}
                        onCambiarFormacion={(eq, f) => {
                            marcarActaSucia();
                            if (eq === "local") setFormacionLocal(f);
                            else setFormacionVisitante(f);
                        }}
                            fechaPartido={partido.fecha}
                        />
                    </div>
                )}

                {/* TAB: ALINEACIONES */}
                {tab === "alineaciones" && (
                    <div className="flex flex-col gap-4">
                        <div className="flex justify-end">
                            <button
                                onClick={abrirModalScrape}
                                className="bg-navy border border-white/10 hover:border-orange text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all text-xs uppercase tracking-wider"
                            >
                                <Globe size={16} className="text-orange" /> Importar de CeroaCero
                            </button>
                        </div>

                        {/* BANNER DE AVISOS DEL ACTA: persistente mientras haya incidencias.
                            Mismos avisos que resume el toast al guardar, calculados en vivo. */}
                        {avisosActaActuales.length > 0 && (
                            <div className="bg-warning/10 border border-warning/30 rounded-xl p-3.5 flex items-start gap-3">
                                <AlertTriangle size={18} className="text-warning shrink-0 mt-0.5" />
                                <div className="flex-1 min-w-0">
                                    <div className="text-xs font-black uppercase tracking-wider text-warning mb-1.5">
                                        Acta incompleta · {avisosActaActuales.length} aviso{avisosActaActuales.length > 1 ? "s" : ""}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {avisosActaActuales.map(a => (
                                            <span key={a} className="text-[11px] font-semibold bg-warning/15 text-warning border border-warning/25 rounded-lg px-2 py-0.5">
                                                {a}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="glass-panel rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-xl bg-navy-dark/30">
                                <h3 className="text-center font-display font-black p-4 border-b border-white/5 uppercase text-xs tracking-widest text-silver/80">{partido.local_nombre}</h3>
                                {renderListaEquipo(plantillaLocal, true)}
                            </div>
                            <div className="glass-panel rounded-2xl border border-white/5 flex flex-col overflow-hidden shadow-xl bg-navy-dark/30">
                                <h3 className="text-center font-display font-black p-4 border-b border-white/5 uppercase text-xs tracking-widest text-silver/80">{partido.visitante_nombre}</h3>
                                {renderListaEquipo(plantillaVisitante, false)}
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: EVENTOS */}
                {tab === "eventos" && (
                    <div className="max-w-3xl mx-auto">
                        <div className="flex justify-end gap-3 mb-5">
                            <button
                                onClick={() => { setEventoAEditar(null); setDefaultTipoEvento(undefined); setModalEventoOpen(true); }}
                                className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all text-sm"
                            >
                                <Plus size={18} /> Añadir Evento
                            </button>
                        </div>
                        <div className="space-y-1">
                            {eventos.map(ev => (
                                <div key={ev.id} className={`flex ${ev.equipo_id === partido.local_id ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`w-[85%] md:w-[60%]`}>{renderEvento(ev)}</div>
                                </div>
                            ))}
                            {eventos.length === 0 && (
                                <div className="text-center py-16 text-silver/30 font-semibold border border-dashed border-white/5 rounded-2xl">
                                    No se han registrado eventos en este partido.
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* TAB: ESTADÍSTICAS DE EQUIPO */}
                {tab === "estadisticas" && (
                    <EstadisticasPartido
                        partidoId={partido.id}
                        localId={partido.local_id}
                        visitanteId={partido.visitante_id}
                        localNombre={partido.local_nombre}
                        visitanteNombre={partido.visitante_nombre}
                    />
                )}

                {/* TAB: ESTADÍSTICAS POR JUGADOR */}
                {tab === "jugadores" && (
                    <EstadisticasJugadorPartido
                        partidoId={partido.id}
                        localId={partido.local_id}
                        visitanteId={partido.visitante_id}
                        localNombre={partido.local_nombre}
                        visitanteNombre={partido.visitante_nombre}
                    />
                )}

                {/* TAB: VALORACIONES */}
                {tab === "valoraciones" && (
                    <ValoracionesPartido
                        partidoId={partido.id}
                        localId={partido.local_id}
                        visitanteId={partido.visitante_id}
                        localNombre={partido.local_nombre}
                        visitanteNombre={partido.visitante_nombre}
                    />
                )}

                {/* TAB: TANDA DE PENALTIS */}
                {tab === "penaltis" && (
                    <TandaPenaltisPartido
                        partido={partido}
                        localId={partido.local_id}
                        visitanteId={partido.visitante_id}
                    />
                )}
            </div>

            {/* BOTÓN INFERIOR FIJO */}
            <div className="fixed bottom-0 left-0 right-0 glass-panel border-t border-white/5 p-4 flex justify-end bg-navy-dark/90 backdrop-blur-xl z-20">
                {tab === "alineaciones" && (
                    <button
                        onClick={guardarAlineaciones}
                        disabled={isGuardando}
                        title={actaSucia && !isGuardando ? "Hay cambios sin guardar · Ctrl+S para guardar" : "Guardar acta (Ctrl+S)"}
                        className="relative bg-gradient-to-r from-orange to-orange-neon text-white px-8 py-3 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all text-sm disabled:opacity-60 disabled:cursor-wait"
                    >
                        <Save size={18} className={isGuardando ? "animate-pulse" : ""} />
                        {isGuardando ? "Guardando…" : "Guardar Acta"}
                        {actaSucia && !isGuardando && (
                            <span className="absolute -top-1.5 -right-1.5 w-3 h-3 rounded-full bg-white shadow-md animate-pulse" title="Cambios sin guardar" />
                        )}
                    </button>
                )}
            </div>

            {/* MODAL EVENTO (nuevo componente) */}
            {modalEventoOpen && (
                <ModalEvento
                    isOpen={modalEventoOpen}
                    onClose={() => { setModalEventoOpen(false); setEventoAEditar(null); setDefaultTipoEvento(undefined); }}
                    onSave={onEventoGuardado}
                    partido={partido}
                    localId={partido.local_id}
                    visitanteId={partido.visitante_id}
                    eventoAEditar={eventoAEditar}
                    defaultTipoEvento={defaultTipoEvento}
                />
            )}

            {/* TOASTS DE DESHACER (componente reutilizable) */}
            <UndoToast
                pendiente={eventoBorrado}
                onUndo={restaurarEvento}
                mensaje={(ev) => `Evento del minuto ${ev.minuto}' eliminado`}
            />
            <UndoToast
                pendiente={cambioEstadoPend}
                onUndo={deshacerCambioEstado}
                mensaje={(c) => `${c.nombre} excluido de la convocatoria`}
            />
            <UndoToast
                pendiente={actaAnterior}
                onUndo={deshacerGuardadoActa}
                mensaje={() => "Acta guardada — puedes deshacer"}
            />

            {/* MODAL SCRAPE URL */}
            <Modal isOpen={modalScrapeOpen} onClose={cerrarScrapeSeguro} title="Importar Partido desde CeroaCero">
                <div className="space-y-4 text-white">
                    <p className="text-xs text-silver/60">
                        Introduce la dirección web del partido en ceroacero.es. La aplicación descargará el acta oficial automáticamente.
                    </p>
                    <div>
                        <label className="block text-xs font-black text-silver/45 uppercase tracking-wider mb-2">URL de CeroaCero</label>
                        <input
                            type="text"
                            value={ceroaceroUrl}
                            onChange={e => setCeroaceroUrl(e.target.value)}
                            placeholder="https://www.ceroacero.es/partido/..."
                            className="w-full p-3 bg-navy border border-white/10 rounded-xl outline-none focus:border-orange text-sm font-medium"
                            disabled={isScraping}
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarScrapeSeguro} className="px-4 py-2 text-silver/50 hover:text-white font-bold text-sm uppercase tracking-wider" disabled={isScraping}>
                            Cancelar
                        </button>
                        <button onClick={handleStartScraping} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2" disabled={isScraping}>
                            {isScraping ? "Descargando..." : "Siguiente"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL MAPEO */}
            <Modal isOpen={modalMappingOpen} onClose={cerrarMappingSeguro} title="Verificar y Mapear Plantillas">
                <div className="space-y-6 text-white max-h-[80vh] overflow-y-auto pr-2">
                    <div className="p-4 bg-orange/10 border border-orange/20 rounded-2xl flex items-start gap-3">
                        <Globe className="text-orange shrink-0 animate-pulse" size={20} />
                        <div>
                            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Mapeo Inteligente Activo</h4>
                            <p className="text-xs text-silver/70">Revisa las asignaciones automáticas y ajusta manualmente si es necesario.</p>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="font-display font-black text-sm uppercase tracking-widest text-orange border-b border-white/5 pb-2">{partido?.local_nombre}</h3>
                            <div className="space-y-2.5">
                                {scrapedLocal.map((p, idx) => (
                                    <div key={idx} className="bg-navy-dark/40 border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-xs font-mono font-black text-silver/40">#{p.number}</span>
                                                <span className="text-sm font-bold text-white truncate">{p.name}</span>
                                                {p.isStarter && <span className="text-[9px] bg-orange/25 text-orange border border-orange/30 px-1 py-0.2 rounded font-black uppercase">Titular</span>}
                                                {p.isCoach && <span className="text-[9px] bg-accent-blue/25 text-accent-blue border border-accent-blue/30 px-1 py-0.2 rounded font-black uppercase">DT</span>}
                                            </div>
                                        </div>
                                        <select
                                            value={mappingsLocal[p.name] || ""}
                                            onChange={e => setMappingsLocal({ ...mappingsLocal, [p.name]: e.target.value })}
                                            className={`w-full p-2 text-xs bg-navy border rounded-lg outline-none font-bold cursor-pointer ${mappingsLocal[p.name] ? 'border-success text-success bg-success/5' : 'border-red/40 text-red bg-red/5'}`}
                                        >
                                            <option value="">-- No Asociar --</option>
                                            {plantillaLocal.map(x => (
                                                <option key={x.persona_id} value={x.persona_id}>
                                                    {x.es_entrenador ? `(DT) ${x.nombre}` : `#${x.dorsal} - ${x.nombre} (${x.posicion})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-display font-black text-sm uppercase tracking-widest text-accent-blue border-b border-white/5 pb-2">{partido?.visitante_nombre}</h3>
                            <div className="space-y-2.5">
                                {scrapedVisitante.map((p, idx) => (
                                    <div key={idx} className="bg-navy-dark/40 border border-white/5 rounded-xl p-3 flex flex-col gap-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-xs font-mono font-black text-silver/40">#{p.number}</span>
                                                <span className="text-sm font-bold text-white truncate">{p.name}</span>
                                                {p.isStarter && <span className="text-[9px] bg-orange/25 text-orange border border-orange/30 px-1 py-0.2 rounded font-black uppercase">Titular</span>}
                                                {p.isCoach && <span className="text-[9px] bg-accent-blue/25 text-accent-blue border border-accent-blue/30 px-1 py-0.2 rounded font-black uppercase">DT</span>}
                                            </div>
                                        </div>
                                        <select
                                            value={mappingsVisitante[p.name] || ""}
                                            onChange={e => setMappingsVisitante({ ...mappingsVisitante, [p.name]: e.target.value })}
                                            className={`w-full p-2 text-xs bg-navy border rounded-lg outline-none font-bold cursor-pointer ${mappingsVisitante[p.name] ? 'border-success text-success bg-success/5' : 'border-red/40 text-red bg-red/5'}`}
                                        >
                                            <option value="">-- No Asociar --</option>
                                            {plantillaVisitante.map(x => (
                                                <option key={x.persona_id} value={x.persona_id}>
                                                    {x.es_entrenador ? `(DT) ${x.nombre}` : `#${x.dorsal} - ${x.nombre} (${x.posicion})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5 sticky bottom-0 bg-navy-dark/95 backdrop-blur p-4 -mx-2 rounded-xl">
                        <button onClick={cerrarMappingSeguro} className="px-4 py-2 text-silver/50 hover:text-white font-bold text-sm uppercase tracking-wider">Cancelar</button>
                        <button onClick={handleConfirmImport} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange">Confirmar Importación</button>
                    </div>
                </div>
            </Modal>

            {/* DIÁLOGO DE CAMBIOS SIN GUARDAR (compartido por Volver y la guarda de enlaces) */}
            {dialogoActaSucia}
            {/* Diálogo de la guarda de los modales de importación (scrape/mapeo) */}
            {dialogoImportacion}
        </div>
    );
}
