import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import {
    ArrowLeft, Plus, Trash2, Save, Crown, User, Globe,
    Gavel, MapPin, FileText
} from "lucide-react";
import Modal from "../components/Modal";
import { CampoFutsal } from "../components/CampoFutsal";
import { ModalEvento } from "../components/ModalEvento";
import { EstadisticasPartido } from "../components/EstadisticasPartido";
import { EstadisticasJugadorPartido } from "../components/EstadisticasJugadorPartido";
import { ValoracionesPartido } from "../components/ValoracionesPartido";
import { TandaPenaltisPartido } from "../components/TandaPenaltisPartido";
import { generarActaPartido } from "../utils/pdfGenerator";

// --- INTERFACES ---
interface PartidoDetalle {
    id: number;
    local_nombre: string; local_escudo: string;
    visitante_nombre: string; visitante_escudo: string;
    goles_local: number; goles_visitante: number;
    goles_descanso_local: number; goles_descanso_visitante: number;
    estado: string;
    local_id: number; visitante_id: number;
    edicion_id: number;
    estadio_nombre?: string;
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
}

interface Evento {
    id: number;
    minuto: number;
    tipo: string;
    subtipo: string | null;
    equipo_id: number;
    jugador_nombre: string;
    asistente_nombre?: string;
}

interface Bandera { id: number; path: string; }

// --- COMPONENTE AVATAR ---
const Avatar = ({ path, alt, className = "w-full h-full" }: { path: string | null, alt: string, className?: string }) => {
    if (!path) return <div className={`bg-navy-light flex items-center justify-center text-silver/40 ${className}`}><User size={14} /></div>;
    return <img src={convertFileSrc(path)} alt={alt} className={`object-cover ${className}`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('bg-navy-light'); }} />;
};

const TABS = [
    { id: "alineaciones", label: "Alineaciones" },
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

    // SCRAPING ESTADOS
    const [modalScrapeOpen, setModalScrapeOpen] = useState(false);
    const [ceroaceroUrl, setCeroaceroUrl] = useState("");
    const [isScraping, setIsScraping] = useState(false);
    const [scrapedLocal, setScrapedLocal] = useState<any[]>([]);
    const [scrapedVisitante, setScrapedVisitante] = useState<any[]>([]);
    const [mappingsLocal, setMappingsLocal] = useState<Record<string, string>>({});
    const [mappingsVisitante, setMappingsVisitante] = useState<Record<string, string>>({});
    const [modalMappingOpen, setModalMappingOpen] = useState(false);

    useEffect(() => {
        if (id) {
            cargarBanderas();
            cargarPartido();
            cargarEventos();
        }
    }, [id]);

    async function cargarBanderas() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Bandera[]>("SELECT id, bandera_path as path FROM Pais");
        setPaises(res);
    }

    async function cargarPartido() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.select<PartidoDetalle[]>(`
                SELECT p.*, l.nombre as local_nombre, l.escudo_path as local_escudo,
                       v.nombre as visitante_nombre, v.escudo_path as visitante_escudo,
                       est.nombre as estadio_nombre,
                       a1.nombre_deportivo as arbitro_nombre,
                       a2.nombre_deportivo as arbitro_2_nombre,
                       a3.nombre_deportivo as arbitro_3_nombre
                FROM Partido p 
                JOIN Equipo l ON p.local_id = l.id 
                JOIN Equipo v ON p.visitante_id = v.id
                LEFT JOIN Estadio est ON p.estadio_id = est.id
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
        } catch (e) { console.error(e); }
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
                    SELECT persona_id, titular, es_capitan
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
                    }

                    return { ...p, estado, es_capitan };
                });
            };

            setPlantillaLocal(await getPersonas(localId));
            setPlantillaVisitante(await getPersonas(visId));
        } catch (e) { console.error(e); }
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
        if (!ceroaceroUrl) return alert("Por favor introduce una URL válida");
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
            setModalScrapeOpen(false);
            setModalMappingOpen(true);
        } catch (e: any) {
            console.error(e);
            alert("Error al scrapear el partido: " + e.message);
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
                    await db.execute(`
                        INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan, entrenador_id)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    `, [id, eqId, dbPersonaId, p.isStarter ? 1 : 0, dorsal, posicion, 0, null]);
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
            alert("Partido importado y guardado correctamente.");
        } catch (e) {
            console.error(e);
            alert("Error al guardar la importación");
        }
    };

    // --- LÓGICA ALINEACIÓN ---
    const cambiarEstado = (esLocal: boolean, personaId: number, nuevoEstado: EstadoConvocatoria) => {
        const setLista = esLocal ? setPlantillaLocal : setPlantillaVisitante;
        setLista(prev => {
            const nueva = prev.map(p => p.persona_id === personaId ? { ...p, estado: nuevoEstado } : p);
            if (nuevoEstado === 'titular') {
                const titulares = nueva.filter(j => j.estado === 'titular' && !j.es_entrenador).length;
                if (titulares > 5) { alert("Máximo 5 titulares en futsal."); return prev; }
            }
            return nueva;
        });
    };

    const toggleCapitan = (esLocal: boolean, personaId: number) => {
        const setLista = esLocal ? setPlantillaLocal : setPlantillaVisitante;
        setLista(prev => prev.map(p => ({ ...p, es_capitan: p.persona_id === personaId ? !p.es_capitan : false })));
    };

    async function guardarAlineaciones() {
        if (!partido) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [id]);
            const guardarEquipo = async (lista: PersonaAlineada[], eqId: number) => {
                for (const persona of lista) {
                    if (persona.estado !== 'no_convocado') {
                        const titular = persona.estado === 'titular' ? 1 : (persona.estado === 'convocado' ? 2 : 0);
                        await db.execute(`
                            INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan)
                            VALUES ($1, $2, $3, $4, $5, $6, $7)
                        `, [id, eqId, persona.persona_id, titular, persona.dorsal, persona.posicion, persona.es_capitan ? 1 : 0]);
                    }
                }
            };
            await guardarEquipo(plantillaLocal, partido.local_id);
            await guardarEquipo(plantillaVisitante, partido.visitante_id);
            // Guardar formaciones
            await db.execute(
                "UPDATE Partido SET formacion_local = $1, formacion_visitante = $2 WHERE id = $3",
                [formacionLocal, formacionVisitante, id]
            );
            setPartido(prev => prev ? { ...prev, formacion_local: formacionLocal, formacion_visitante: formacionVisitante } : null);
            alert("Acta oficial guardada correctamente.");
        } catch (e) {
            console.error(e);
            alert("Error al guardar las alineaciones");
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
                SELECT e.id, e.minuto, e.tipo, e.subtipo, e.equipo_id, 
                       p1.nombre_deportivo as jugador_nombre, p2.nombre_deportivo as asistente_nombre
                FROM Evento e 
                LEFT JOIN Persona p1 ON e.jugador_id = p1.id 
                LEFT JOIN Persona p2 ON e.asistente_id = p2.id
                WHERE e.partido_id = $1 ORDER BY e.minuto ASC, e.id ASC
            `, [id]);
            setEventos(res);
        } catch (e) { console.error(e); }
    }

    async function onEventoGuardado() {
        setModalEventoOpen(false);
        setEventoAEditar(null);
        setDefaultTipoEvento(undefined);
        await cargarEventos();
        await cargarPartido();
    }

    async function borrarEvento(ev: Evento) {
        if (!confirm(`¿Eliminar evento del minuto ${ev.minuto}?`)) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Evento WHERE id = $1", [ev.id]);
            // Recalcular marcador si era gol
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
        } catch (e) { console.error(e); }
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
            <div className={`flex items-center gap-3 p-3 border rounded-xl shadow-sm mb-2 ${color} transition-all hover:scale-[1.01]`}>
                <span className="font-mono font-black text-sm w-10 text-center opacity-60">{ev.minuto}'</span>
                <span className="text-lg flex items-center justify-center w-6 shrink-0">{icono}</span>
                <span className="font-bold flex-1 text-sm">{texto}</span>
                <button onClick={() => borrarEvento(ev)} className="text-silver/30 hover:text-red p-1 rounded transition-colors">
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
            await generarActaPartido(partido, titularesLocal, titularesVisitante, eventos, {});
        } catch (e) {
            console.error(e);
            alert("Error al generar el PDF");
        }
    }

    const renderListaEquipo = (lista: PersonaAlineada[], esLocal: boolean) => {
        const entrenadores = lista.filter(p => p.es_entrenador);
        const jugadores = lista.filter(p => !p.es_entrenador);
        const scorePos = (pos: string) => { if (pos === 'Portero') return 1; if (pos === 'Cierre') return 2; if (pos === 'Ala' || pos === 'Ala Izquierdo' || pos === 'Ala Derecho') return 3; if (pos === 'Pívot' || pos === 'Pivot') return 4; return 5; };
        const scoreEstado = (s: string) => { if (s === 'titular') return 1; if (s === 'suplente') return 2; if (s === 'convocado') return 3; return 4; };
        const jugadoresOrdenados = [...jugadores].sort((a, b) => {
            if (scoreEstado(a.estado) !== scoreEstado(b.estado)) return scoreEstado(a.estado) - scoreEstado(b.estado);
            return scorePos(a.posicion) - scorePos(b.posicion);
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
                                <div className="w-10 h-10 rounded-full overflow-hidden border border-white/10 bg-navy shrink-0 shadow-inner"><Avatar path={jug.foto} alt="" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-white truncate text-sm">{jug.nombre}</span>
                                        {jug.es_capitan && <Crown size={12} className="text-orange animate-bounce" />}
                                    </div>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {renderFlags(jug.nacionalidad_id, jug.nacionalidad2_id)}
                                        <span className="text-[9px] text-silver/50 uppercase font-bold tracking-wider">{jug.posicion}</span>
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

    if (!partido) return <div className="flex h-screen items-center justify-center text-silver/40 animate-pulse font-display font-black">CARGANDO ACTA...</div>;

    return (
        <div className="flex flex-col h-screen bg-transparent text-white ml-0">
            {/* CABECERA */}
            <div className="glass-panel p-5 border border-white/5 shadow-2xl rounded-b-2xl flex items-center justify-between sticky top-0 z-20 bg-navy-dark/95 backdrop-blur-xl">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-silver/60 hover:text-orange font-bold transition-colors">
                    <ArrowLeft size={20} /> Volver
                </button>
                
                <div className="flex items-center gap-6">
                    <div className="text-right w-44 truncate font-display font-black text-lg text-white">{partido.local_nombre}</div>
                    <div className="w-12 h-12 bg-white border border-white/10 shadow-md rounded-xl overflow-hidden flex items-center justify-center p-1.5">
                        <Avatar path={partido.local_escudo} alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="bg-navy border border-white/10 px-8 py-2.5 rounded-2xl font-mono text-3xl font-black tracking-widest text-orange">
                        {partido.goles_local} - {partido.goles_visitante}
                    </div>
                    <div className="w-12 h-12 bg-white border border-white/10 shadow-md rounded-xl overflow-hidden flex items-center justify-center p-1.5">
                        <Avatar path={partido.visitante_escudo} alt="" className="w-full h-full object-contain" />
                    </div>
                    <div className="text-left w-44 truncate font-display font-black text-lg text-white">{partido.visitante_nombre}</div>
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
                {/* TAB: ALINEACIONES */}
                {tab === "alineaciones" && (
                    <div className="flex flex-col gap-4">
                        {/* Campo de Futsal con titulares */}
                        <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-xl bg-navy-dark/30">
                            <CampoFutsal
                                localNombre={partido.local_nombre}
                                visitanteNombre={partido.visitante_nombre}
                                localEscudo={partido.local_escudo}
                                visitanteEscudo={partido.visitante_escudo}
                                alineacionLocal={titularesLocal}
                                alineacionVisitante={titularesVisitante}
                                formacionLocalGuardada={formacionLocal}
                                formacionVisitanteGuardada={formacionVisitante}
                                onCambiarFormacion={(eq, f) => {
                                    if (eq === "local") setFormacionLocal(f);
                                    else setFormacionVisitante(f);
                                }}
                                fechaPartido={partido.fecha}
                            />
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => setModalScrapeOpen(true)}
                                className="bg-navy border border-white/10 hover:border-orange text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all text-xs uppercase tracking-wider"
                            >
                                <Globe size={16} className="text-orange" /> Importar de CeroaCero
                            </button>
                        </div>

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
                    <button onClick={guardarAlineaciones} className="bg-gradient-to-r from-orange to-orange-neon text-white px-8 py-3 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all text-sm">
                        <Save size={18} /> Guardar Acta
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

            {/* MODAL SCRAPE URL */}
            <Modal isOpen={modalScrapeOpen} onClose={() => setModalScrapeOpen(false)} title="Importar Partido desde CeroaCero">
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
                        <button onClick={() => setModalScrapeOpen(false)} className="px-4 py-2 text-silver/50 hover:text-white font-bold text-sm uppercase tracking-wider" disabled={isScraping}>
                            Cancelar
                        </button>
                        <button onClick={handleStartScraping} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2" disabled={isScraping}>
                            {isScraping ? "Descargando..." : "Siguiente"}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* MODAL MAPEO */}
            <Modal isOpen={modalMappingOpen} onClose={() => setModalMappingOpen(false)} title="Verificar y Mapear Plantillas">
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
                        <button onClick={() => setModalMappingOpen(false)} className="px-4 py-2 text-silver/50 hover:text-white font-bold text-sm uppercase tracking-wider">Cancelar</button>
                        <button onClick={handleConfirmImport} className="bg-gradient-to-r from-orange to-orange-neon text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange">Confirmar Importación</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}
