import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Database from "@tauri-apps/plugin-sql";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ArrowLeft, Plus, Trash2, ArrowRightLeft, Save, Crown, User, Activity, Goal, XCircle, Minus } from "lucide-react";
import Modal from "../components/Modal";

// --- INTERFACES ---
interface PartidoDetalle {
    id: number;
    local_nombre: string; local_escudo: string;
    visitante_nombre: string; visitante_escudo: string;
    goles_local: number; goles_visitante: number;
    estado: string;
    local_id: number; visitante_id: number;
    edicion_id: number;
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

interface StatsEquipo {
    posesion: number;
    corners: number;
    faltas: number;
    amarillas: number;
    rojas: number;
}

// --- COMPONENTE AVATAR ---
const Avatar = ({ path, alt, className }: { path: string | null, alt: string, className?: string }) => {
    if (!path) return <div className={`bg-gray-200 flex items-center justify-center text-gray-400 ${className}`}><User size={14} /></div>;
    return <img src={convertFileSrc(path)} alt={alt} className={`object-cover ${className}`} loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement?.classList.add('bg-gray-200'); }} />;
};

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
    const [formEvento, setFormEvento] = useState({
        minuto: "", tipo: "GOL", subtipo: "JUGADA", equipo_id: "", jugador_id: "", extra_id: ""
    });

    // ESTADÍSTICAS
    const [statsLocal, setStatsLocal] = useState<StatsEquipo>({ posesion: 50, corners: 0, faltas: 0, amarillas: 0, rojas: 0 });
    const [statsVisitante, setStatsVisitante] = useState<StatsEquipo>({ posesion: 50, corners: 0, faltas: 0, amarillas: 0, rojas: 0 });

    useEffect(() => {
        if (id) {
            cargarBanderas();
            cargarPartido();
            cargarEventos();
            cargarEstadisticasDB();
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
                 v.nombre as visitante_nombre, v.escudo_path as visitante_escudo
          FROM Partido p JOIN Equipo l ON p.local_id = l.id JOIN Equipo v ON p.visitante_id = v.id
          WHERE p.id = $1
        `, [id]);

            if (res.length > 0) {
                setPartido(res[0]);
                if (plantillaLocal.length === 0) cargarPlantillas(res[0].edicion_id, res[0].local_id, res[0].visitante_id);
            }
        } catch (e) { console.error(e); }
    }

    async function cargarPlantillas(edicionId: number, localId: number, visId: number) {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            const getPersonas = async (eqId: number) => {
                // Cargar todas las personas de la plantilla
                const plantilla = await db.select<PersonaAlineada[]>(`
                    SELECT p.id as persona_id, p.nombre_deportivo as nombre, pl.dorsal, p.foto_path as foto,
                    p.posicion_principal as posicion,
                    p.nacionalidad_principal_id as nacionalidad_id,
                    p.nacionalidades_secundarias as nacionalidad2_id,
                    CASE WHEN pl.rol = 'Entrenador' THEN 1 ELSE 0 END as es_entrenador
                    FROM Plantilla pl
                    JOIN Persona p ON pl.persona_id = p.id
                    WHERE pl.edicion_id = $1 AND pl.equipo_id = $2
                    ORDER BY pl.rol DESC, pl.dorsal ASC 
                `, [edicionId, eqId]);

                // Cargar alineaciones guardadas para este partido
                const alineaciones = await db.select<any[]>(`
                    SELECT persona_id, titular, es_capitan
                    FROM Alineacion
                    WHERE partido_id = $1 AND equipo_id = $2
                `, [id, eqId]);

                // Crear un mapa de alineaciones para búsqueda rápida
                const alineacionMap = new Map(alineaciones.map(a => [a.persona_id, a]));

                // Combinar plantilla con alineaciones
                return plantilla.map(p => {
                    const alineacion = alineacionMap.get(p.persona_id);
                    let estado: EstadoConvocatoria = 'no_convocado';
                    let es_capitan = false;

                    if (alineacion) {
                        // Para entrenadores, siempre es 'convocado'
                        if (p.es_entrenador) {
                            estado = 'convocado';
                        } else {
                            // Para jugadores, titular o suplente
                            estado = alineacion.titular === 1 ? 'titular' : 'suplente';
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

    // --- LÓGICA ESTADÍSTICAS ---
    async function cargarEstadisticasDB() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.select<any[]>("SELECT * FROM EstadisticaPartidoEquipo WHERE partido_id = $1", [id]);

            if (res.length > 0) {
                res.forEach(row => {
                    const stats = {
                        posesion: row.posesion || 50,
                        corners: row.corners || 0,
                        faltas: row.faltas || 0,
                        amarillas: 0,
                        rojas: 0
                    };
                    if (row.equipo_id == partido?.local_id) setStatsLocal(prev => ({ ...prev, ...stats }));
                    else setStatsVisitante(prev => ({ ...prev, ...stats }));
                });
            }
        } catch (e) { console.error(e); }
    }

    async function guardarEstadisticas() {
        if (!partido) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const guardarEquipo = async (eqId: number, s: StatsEquipo) => {
                const existe = await db.select<any[]>("SELECT id FROM EstadisticaPartidoEquipo WHERE partido_id=$1 AND equipo_id=$2", [id, eqId]);
                if (existe.length > 0) {
                    await db.execute("UPDATE EstadisticaPartidoEquipo SET posesion=$1, corners=$2, faltas=$3 WHERE partido_id=$4 AND equipo_id=$5", [s.posesion, s.corners, s.faltas, id, eqId]);
                } else {
                    await db.execute("INSERT INTO EstadisticaPartidoEquipo (partido_id, equipo_id, posesion, corners, faltas) VALUES ($1, $2, $3, $4, $5)", [id, eqId, s.posesion, s.corners, s.faltas]);
                }
            };
            await guardarEquipo(partido.local_id, statsLocal);
            await guardarEquipo(partido.visitante_id, statsVisitante);
            alert("Estadísticas guardadas correctamente");
        } catch (e) { console.error(e); alert("Error al guardar"); }
    }

    // --- LÓGICA ALINEACIÓN ---
    const cambiarEstado = (esLocal: boolean, personaId: number, nuevoEstado: EstadoConvocatoria) => {
        const setLista = esLocal ? setPlantillaLocal : setPlantillaVisitante;
        setLista(prev => {
            const nueva = prev.map(p => p.persona_id === personaId ? { ...p, estado: nuevoEstado } : p);
            if (nuevoEstado === 'titular') {
                const titulares = nueva.filter(j => j.estado === 'titular' && !j.es_entrenador).length;
                if (titulares > 5) { alert("Máximo 5 titulares."); return prev; }
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

            // Eliminar alineaciones existentes de este partido
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [id]);

            // Guardar alineaciones del equipo local
            for (const persona of plantillaLocal) {
                if (persona.estado !== 'no_convocado') {
                    const titular = persona.estado === 'titular' ? 1 : 0;
                    await db.execute(`
                        INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [id, partido.local_id, persona.persona_id, titular, persona.dorsal, persona.posicion, persona.es_capitan ? 1 : 0]);
                }
            }

            // Guardar alineaciones del equipo visitante
            for (const persona of plantillaVisitante) {
                if (persona.estado !== 'no_convocado') {
                    const titular = persona.estado === 'titular' ? 1 : 0;
                    await db.execute(`
                        INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan)
                        VALUES ($1, $2, $3, $4, $5, $6, $7)
                    `, [id, partido.visitante_id, persona.persona_id, titular, persona.dorsal, persona.posicion, persona.es_capitan ? 1 : 0]);
                }
            }

            alert("Alineaciones guardadas correctamente ✅");
        } catch (e) {
            console.error(e);
            alert("Error al guardar las alineaciones");
        }
    }

    const getFlagSrc = (id: number) => {
        const f = paises.find(p => p.id === id);
        return f ? convertFileSrc(f.path) : null;
    };

    const renderListaEquipo = (lista: PersonaAlineada[], esLocal: boolean) => {
        const entrenadores = lista.filter(p => p.es_entrenador);
        const jugadores = lista.filter(p => !p.es_entrenador);

        const scorePos = (pos: string) => { if (pos === 'Portero') return 1; if (pos === 'Cierre') return 2; if (pos === 'Ala') return 3; if (pos === 'Pívot') return 4; return 5; };
        const scoreEstado = (s: string) => { if (s === 'titular') return 1; if (s === 'suplente') return 2; if (s === 'convocado') return 3; return 4; };

        const jugadoresOrdenados = [...jugadores].sort((a, b) => {
            if (scoreEstado(a.estado) !== scoreEstado(b.estado)) return scoreEstado(a.estado) - scoreEstado(b.estado);
            return scorePos(a.posicion) - scorePos(b.posicion);
        });

        return (
            <div className="flex-1 overflow-y-auto p-2 bg-gray-50/50">
                {entrenadores.length > 0 && (
                    <div className="mb-4 bg-white p-2 rounded border shadow-sm">
                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Cuerpo Técnico</div>
                        {entrenadores.map(ent => (
                            <div key={ent.persona_id} className="flex items-center gap-2 mb-1">
                                <div className="w-8 h-8 rounded-full overflow-hidden border bg-gray-200"><Avatar path={ent.foto} alt="" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-navy">{ent.nombre}</div>
                                    <div className="flex items-center gap-1 mt-0.5">
                                        {getFlagSrc(ent.nacionalidad_id) && <img src={getFlagSrc(ent.nacionalidad_id)!} className="w-3 h-2 shadow-sm" alt="nac" />}
                                        <span className="text-[9px] text-gray-500 uppercase font-semibold">Entrenador</span>
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button onClick={() => cambiarEstado(esLocal, ent.persona_id, 'convocado')} className={`px-2 py-0.5 text-[9px] font-bold rounded ${ent.estado === 'convocado' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-400'}`}>CON</button>
                                    <button onClick={() => cambiarEstado(esLocal, ent.persona_id, 'no_convocado')} className={`px-2 py-0.5 text-[9px] font-bold rounded ${ent.estado === 'no_convocado' ? 'bg-red-100 text-red-500' : 'bg-gray-100 text-gray-400'}`}>X</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                <div className="space-y-1">
                    {jugadoresOrdenados.map(jug => {
                        let bg = "bg-white opacity-60 grayscale";
                        if (jug.estado === 'titular') bg = "bg-yellow-50 border-yellow-300 opacity-100 shadow-sm";
                        if (jug.estado === 'suplente') bg = "bg-green-50 border-green-300 opacity-100";
                        if (jug.estado === 'convocado') bg = "bg-blue-50 border-blue-200 opacity-100";

                        return (
                            <div key={jug.persona_id} className={`flex items-center gap-2 p-1.5 rounded border ${bg} transition-all`}>
                                <div className="w-6 text-center font-black text-navy">{jug.dorsal}</div>
                                <div className="w-8 h-8 rounded-full overflow-hidden border bg-gray-200 shrink-0"><Avatar path={jug.foto} alt="" /></div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-navy truncate text-sm">{jug.nombre}</span>
                                        {jug.es_capitan && <Crown size={12} className="text-yellow-600 fill-yellow-400" />}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-0.5">
                                            {getFlagSrc(jug.nacionalidad_id) && <img src={getFlagSrc(jug.nacionalidad_id)!} className="w-3 h-2 shadow-sm" />}
                                        </div>
                                        <span className="text-[9px] text-gray-500 uppercase font-semibold">{jug.posicion}</span>
                                    </div>
                                </div>
                                <div className="flex gap-0.5">
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'titular')} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${jug.estado === 'titular' ? 'bg-yellow-400 text-black' : 'bg-gray-100 text-gray-400'}`}>TIT</button>
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'suplente')} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${jug.estado === 'suplente' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-400'}`}>SUP</button>
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'convocado')} className={`px-1.5 py-0.5 text-[9px] font-bold rounded ${jug.estado === 'convocado' ? 'bg-blue-400 text-white' : 'bg-gray-100 text-gray-400'}`}>CON</button>
                                    <button onClick={() => toggleCapitan(esLocal, jug.persona_id)} className={`p-1 rounded ${jug.es_capitan ? 'text-yellow-600' : 'text-gray-300 hover:text-yellow-600'}`}><Crown size={12} /></button>
                                    <button onClick={() => cambiarEstado(esLocal, jug.persona_id, 'no_convocado')} className="px-1.5 py-0.5 text-[9px] text-red-400 hover:bg-red-50 rounded">X</button>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        );
    };

    // --- EVENTOS ---
    async function cargarEventos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const res = await db.select<Evento[]>(`
            SELECT e.id, e.minuto, e.tipo, e.subtipo, e.equipo_id, p1.nombre_deportivo as jugador_nombre, p2.nombre_deportivo as asistente_nombre
            FROM Evento e LEFT JOIN Persona p1 ON e.jugador_id = p1.id LEFT JOIN Persona p2 ON e.asistente_id = p2.id
            WHERE e.partido_id = $1 ORDER BY e.minuto DESC, e.id DESC
        `, [id]);
            setEventos(res);
            calcularTarjetas(res);
        } catch (e) { console.error(e); }
    }

    function calcularTarjetas(listaEventos: Evento[]) {
        if (!partido) return;
        const amarillasL = listaEventos.filter(e => (e.tipo === 'TARJETA_AMARILLA' || e.tipo === 'DOBLE_AMARILLA') && e.equipo_id === partido.local_id).length;
        const rojasL = listaEventos.filter(e => (e.tipo === 'TARJETA_ROJA' || e.tipo === 'DOBLE_AMARILLA') && e.equipo_id === partido.local_id).length;
        const amarillasV = listaEventos.filter(e => (e.tipo === 'TARJETA_AMARILLA' || e.tipo === 'DOBLE_AMARILLA') && e.equipo_id === partido.visitante_id).length;
        const rojasV = listaEventos.filter(e => (e.tipo === 'TARJETA_ROJA' || e.tipo === 'DOBLE_AMARILLA') && e.equipo_id === partido.visitante_id).length;

        setStatsLocal(p => ({ ...p, amarillas: amarillasL, rojas: rojasL }));
        setStatsVisitante(p => ({ ...p, amarillas: amarillasV, rojas: rojasV }));
    }

    function abrirModalEvento() {
        if (!partido) return;
        setFormEvento({ minuto: "", tipo: "GOL", subtipo: "JUGADA", equipo_id: partido.local_id.toString(), jugador_id: "", extra_id: "" });
        setModalEventoOpen(true);
    }

    async function guardarEvento() {
        if (!formEvento.minuto || !formEvento.jugador_id) return alert("Faltan datos");
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const min = parseInt(formEvento.minuto);
            await db.execute(
                `INSERT INTO Evento (partido_id, minuto, tipo, subtipo, equipo_id, jugador_id, asistente_id) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [id, min, formEvento.tipo, formEvento.subtipo, formEvento.equipo_id, formEvento.jugador_id, formEvento.extra_id || null]
            );
            if (formEvento.tipo === "GOL") {
                const esLocal = formEvento.equipo_id == partido?.local_id.toString();
                const sumaAlLocal = (esLocal && formEvento.subtipo !== 'PROPIA_PUERTA') || (!esLocal && formEvento.subtipo === 'PROPIA_PUERTA');
                let q = "UPDATE Partido SET ";
                if (sumaAlLocal) { q += "goles_local = goles_local + 1"; if (min <= 20) q += ", goles_descanso_local = goles_descanso_local + 1"; }
                else { q += "goles_visitante = goles_visitante + 1"; if (min <= 20) q += ", goles_descanso_visitante = goles_descanso_visitante + 1"; }
                if (min > 40) q += ", prorroga = 1";
                q += " WHERE id = $1";
                await db.execute(q, [id]);
                cargarPartido();
            }
            setModalEventoOpen(false);
            cargarEventos();
        } catch (e) { console.error(e); }
    }

    async function borrarEvento(ev: Evento) {
        if (!confirm("¿Borrar evento?")) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Evento WHERE id = $1", [ev.id]);
            if (ev.tipo === "GOL") {
                const esLocal = ev.equipo_id === partido?.local_id;
                const restoAlLocal = (esLocal && ev.subtipo !== 'PROPIA_PUERTA') || (!esLocal && ev.subtipo === 'PROPIA_PUERTA');
                let q = "UPDATE Partido SET ";
                if (restoAlLocal) { q += "goles_local = goles_local - 1"; if (ev.minuto <= 20) q += ", goles_descanso_local = goles_descanso_local - 1"; }
                else { q += "goles_visitante = goles_visitante - 1"; if (ev.minuto <= 20) q += ", goles_descanso_visitante = goles_descanso_visitante - 1"; }
                q += " WHERE id = $1";
                await db.execute(q, [id]);
                cargarPartido();
            }
            cargarEventos();
        } catch (e) { console.error(e); }
    }

    const renderEvento = (ev: Evento) => {
        let icono = null; let color = ""; let texto = ev.jugador_nombre;
        switch (ev.tipo) {
            case "GOL": icono = <Goal size={18} />; color = "text-navy bg-blue-50 border-blue-100"; if (ev.subtipo === 'PROPIA_PUERTA') { texto += " (P.P.)"; color = "text-red-800 bg-red-50 border-red-100"; } else if (ev.subtipo) { texto += ` (${ev.subtipo.replace('_', ' ').toLowerCase()})`; } if (ev.asistente_nombre) texto += ` - Asist: ${ev.asistente_nombre}`; break;
            case "TARJETA_AMARILLA": icono = <div className="w-3 h-4 bg-yellow-400 rounded-sm border border-yellow-500"></div>; color = "text-yellow-700 bg-yellow-50 border-yellow-100"; break;
            case "DOBLE_AMARILLA": icono = <div className="flex"><div className="w-2 h-3 bg-yellow-400 -mr-1"></div><div className="w-2 h-3 bg-red-600 z-10"></div></div>; color = "text-orange-700 bg-orange-50 border-orange-100"; texto += " (2ª Amarilla)"; break;
            case "TARJETA_ROJA": icono = <div className="w-3 h-4 bg-red-600 rounded-sm border border-red-700"></div>; color = "text-red-700 bg-red-50 border-red-100"; break;
            case "CAMBIO": icono = <ArrowRightLeft size={16} className="text-green-600" />; color = "text-gray-600 bg-gray-50 border-gray-100"; texto = `Entra: ${ev.jugador_nombre} ⇆ Sale: ${ev.asistente_nombre}`; break;
            case "LESION": icono = <Plus size={18} className="text-red-500" />; color = "text-red-600 bg-red-50"; texto += " (Lesión)"; break;
            case "PENALTI_FALLADO": icono = <XCircle size={18} className="text-red-500" />; color = "text-gray-500 bg-gray-100"; texto += " (Falló Penalti)"; break;
            case "DOBLE_PENALTI_FALLADO": icono = <XCircle size={18} className="text-orange-500" />; color = "text-gray-500 bg-gray-100"; texto += " (Falló Doble Penalti)"; break;
        }
        return (
            <div className={`flex items-center gap-3 p-3 border rounded-lg shadow-sm ${color} mb-2`}>
                <div className="font-mono font-bold text-lg w-8 text-center">{ev.minuto}'</div>
                <div className="text-xl flex items-center justify-center w-6">{icono}</div>
                <div className="font-bold flex-1 text-sm">{texto}</div>
                <button onClick={() => borrarEvento(ev)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
            </div>
        );
    };

    const getJugadoresModal = () => {
        const listaRaw = formEvento.equipo_id == partido?.local_id.toString() ? plantillaLocal : plantillaVisitante;
        const hayAlguienConvocado = listaRaw.some(p => p.estado !== 'no_convocado');
        let listaFiltrada = listaRaw;
        if (hayAlguienConvocado) listaFiltrada = listaRaw.filter(p => p.estado !== 'no_convocado');
        if (["GOL", "CAMBIO", "LESION", "PENALTI_FALLADO", "DOBLE_PENALTI_FALLADO"].includes(formEvento.tipo)) {
            listaFiltrada = listaFiltrada.filter(p => !p.es_entrenador);
        }
        return listaFiltrada;
    };

    // --- RENDERIZADO ESTADÍSTICAS (MEJORADO) ---
    const renderStatRow = (label: string, field: keyof StatsEquipo) => {
        const isAuto = field === 'amarillas' || field === 'rojas';

        // Función unificada para cambio manual
        const handleManualChange = (esLocal: boolean, valor: string) => {
            let val = parseInt(valor);
            if (isNaN(val) || val < 0) val = 0;

            if (field === 'posesion') {
                val = Math.min(100, val);
                if (esLocal) { setStatsLocal(p => ({ ...p, posesion: val })); setStatsVisitante(p => ({ ...p, posesion: 100 - val })); }
                else { setStatsVisitante(p => ({ ...p, posesion: val })); setStatsLocal(p => ({ ...p, posesion: 100 - val })); }
            } else {
                if (esLocal) setStatsLocal(p => ({ ...p, [field]: val }));
                else setStatsVisitante(p => ({ ...p, [field]: val }));
            }
        };

        return (
            <div className="flex items-center py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group">
                {/* LOCAL */}
                <div className="flex-1 flex justify-end items-center gap-3 pr-4">
                    {!isAuto && (
                        <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleManualChange(true, (statsLocal[field] - 1).toString())} className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 hover:text-red-600 transition-colors"><Minus size={14} /></button>
                            <button onClick={() => handleManualChange(true, (statsLocal[field] + 1).toString())} className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-green-100 hover:text-green-600 transition-colors"><Plus size={14} /></button>
                        </div>
                    )}
                    {isAuto ? (
                        <span className="font-black text-2xl text-navy w-16 text-center">{statsLocal[field]}</span>
                    ) : (
                        <input
                            type="number"
                            value={statsLocal[field]}
                            onChange={e => handleManualChange(true, e.target.value)}
                            className="w-16 text-center font-black text-2xl text-navy bg-transparent border-b-2 border-transparent focus:border-navy outline-none"
                        />
                    )}
                </div>

                {/* LABEL */}
                <div className="w-40 text-center text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2">{label}</div>

                {/* VISITANTE */}
                <div className="flex-1 flex justify-start items-center gap-3 pl-4">
                    {isAuto ? (
                        <span className="font-black text-2xl text-navy w-16 text-center">{statsVisitante[field]}</span>
                    ) : (
                        <input
                            type="number"
                            value={statsVisitante[field]}
                            onChange={e => handleManualChange(false, e.target.value)}
                            className="w-16 text-center font-black text-2xl text-navy bg-transparent border-b-2 border-transparent focus:border-navy outline-none"
                        />
                    )}
                    {!isAuto && (
                        <div className="flex gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleManualChange(false, (statsVisitante[field] + 1).toString())} className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-green-100 hover:text-green-600 transition-colors"><Plus size={14} /></button>
                            <button onClick={() => handleManualChange(false, (statsVisitante[field] - 1).toString())} className="w-8 h-8 flex items-center justify-center rounded bg-gray-100 hover:bg-red-100 hover:text-red-600 transition-colors"><Minus size={14} /></button>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    if (!partido) return <div className="flex h-screen items-center justify-center text-gray-400 animate-pulse">Cargando...</div>;

    return (
        <div className="flex flex-col h-screen bg-gray-50 text-navy">
            {/* CABECERA */}
            <div className="bg-white border-b border-gray-200 shadow-sm p-4 flex items-center justify-between sticky top-0 z-10">
                <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-500 hover:text-navy font-bold"><ArrowLeft size={20} /> Volver</button>
                <div className="flex items-center gap-8">
                    <div className="text-right w-40 truncate font-black text-lg">{partido.local_nombre}</div>
                    <div className="w-12 h-12"><Avatar path={partido.local_escudo} alt="" /></div>
                    <div className="bg-navy text-white px-6 py-2 rounded-lg font-mono text-3xl font-black tracking-widest shadow-lg">{partido.goles_local} - {partido.goles_visitante}</div>
                    <div className="w-12 h-12"><Avatar path={partido.visitante_escudo} alt="" /></div>
                    <div className="text-left w-40 truncate font-black text-lg">{partido.visitante_nombre}</div>
                </div>
                <div className="text-right"><div className={`text-xs font-bold uppercase px-2 py-1 rounded ${partido.estado === 'en_juego' ? 'bg-green-100 text-green-700 animate-pulse' : 'bg-gray-100 text-gray-500'}`}>{partido.estado.replace('_', ' ')}</div></div>
            </div>

            <div className="flex justify-center bg-white border-b border-gray-200">
                {["Alineaciones", "Eventos", "Estadísticas"].map(t => (
                    <button key={t} onClick={() => setTab(t.toLowerCase())} className={`px-8 py-3 font-bold text-sm uppercase border-b-2 ${tab === t.toLowerCase() ? 'border-green-600 text-green-600' : 'border-transparent text-gray-400 hover:text-navy'}`}>{t}</button>
                ))}
            </div>

            <div className="flex-1 overflow-auto p-6">
                {tab === "alineaciones" && (
                    <div className="grid grid-cols-2 gap-6 h-full">
                        <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col"><h3 className="text-center font-bold mb-4">{partido.local_nombre}</h3>{renderListaEquipo(plantillaLocal, true)}</div>
                        <div className="bg-white rounded-xl shadow-sm border p-4 flex flex-col"><h3 className="text-center font-bold mb-4">{partido.visitante_nombre}</h3>{renderListaEquipo(plantillaVisitante, false)}</div>
                    </div>
                )}

                {tab === "eventos" && (
                    <div className="max-w-3xl mx-auto pb-20">
                        <div className="flex justify-end mb-4"><button onClick={abrirModalEvento} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-bold shadow-md flex items-center gap-2"><Plus size={20} /> Añadir Evento</button></div>
                        <div className="space-y-1">
                            {eventos.map(ev => (<div key={ev.id} className={`flex ${ev.equipo_id === partido.local_id ? 'justify-start' : 'justify-end'}`}><div className={`w-[85%] md:w-[48%] ${ev.equipo_id === partido.local_id ? '' : 'text-right'}`}>{renderEvento(ev)}</div></div>))}
                        </div>
                    </div>
                )}

                {tab === "estadísticas" && (
                    <div className="max-w-4xl mx-auto pb-20">
                        <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                            <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                                <div className="font-black text-navy">{partido.local_nombre}</div>
                                <div className="text-xs font-bold text-gray-400 uppercase tracking-widest"><Activity size={14} className="inline mr-1" /> Estadísticas del Partido</div>
                                <div className="font-black text-navy">{partido.visitante_nombre}</div>
                            </div>

                            <div className="p-4">
                                {renderStatRow("Posesión (%)", "posesion")}
                                {renderStatRow("Saques de Esquina", "corners")}
                                {renderStatRow("Faltas", "faltas")}

                                <div className="my-4 border-t border-gray-100"></div>
                                <div className="text-center text-[10px] text-gray-400 mb-2 uppercase font-bold">Disciplinario (Automático)</div>
                                {renderStatRow("Tarjetas Amarillas", "amarillas")}
                                {renderStatRow("Tarjetas Rojas", "rojas")}
                            </div>

                            <div className="bg-gray-50 px-6 py-4 border-t text-center">
                                <button onClick={guardarEstadisticas} className="bg-green-600 hover:bg-green-700 text-white px-8 py-2 rounded-full font-bold shadow-lg transition-transform hover:scale-105 active:scale-95 flex items-center gap-2 mx-auto">
                                    <Save size={18} /> Guardar Estadísticas
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white border-t p-4 flex justify-end sticky bottom-0 z-10 shadow-lg">
                {tab !== "estadísticas" && (
                    <button onClick={guardarAlineaciones} className="bg-green-600 text-white px-6 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 hover:bg-green-700"><Save size={20} /> Guardar Acta</button>
                )}
            </div>

            <Modal isOpen={modalEventoOpen} onClose={() => setModalEventoOpen(false)} title="Registrar Evento">
                <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="col-span-1"><label className="block text-xs font-bold text-navy mb-1">Minuto</label><input type="number" value={formEvento.minuto} onChange={e => setFormEvento({ ...formEvento, minuto: e.target.value })} className="w-full p-2 border rounded text-center text-xl font-black bg-gray-50" autoFocus /></div>
                        <div className="col-span-2"><label className="block text-xs font-bold text-navy mb-1">Tipo</label>
                            <select value={formEvento.tipo} onChange={e => setFormEvento({ ...formEvento, tipo: e.target.value })} className="w-full p-2 border rounded font-bold bg-white text-navy">
                                <option value="GOL">⚽ Gol</option>
                                <option value="TARJETA_AMARILLA">🟨 Tarjeta Amarilla</option>
                                <option value="DOBLE_AMARILLA">🟨🟥 2ª Amarilla</option>
                                <option value="TARJETA_ROJA">🟥 Tarjeta Roja</option>
                                <option value="CAMBIO">🔄 Cambio</option>
                                <option value="LESION">🚑 Lesión</option>
                                <option value="PENALTI_FALLADO">❌ Penalti Fallado</option>
                                <option value="DOBLE_PENALTI_FALLADO">❌ Doble Penalti Fallado</option>
                            </select>
                        </div>
                    </div>
                    {formEvento.tipo === 'GOL' && (
                        <div><label className="block text-xs font-bold text-navy mb-1">Detalle</label><select value={formEvento.subtipo || "JUGADA"} onChange={e => setFormEvento({ ...formEvento, subtipo: e.target.value })} className="w-full p-2 border rounded bg-blue-50 text-navy font-medium"><option value="JUGADA">Jugada</option><option value="FALTA">Falta</option><option value="PENALTI">Penalti</option><option value="DOBLE_PENALTI">Doble Penalti</option><option value="CABEZA">Cabeza</option><option value="DERECHA">Pie Derecho</option><option value="IZQUIERDA">Pie Izquierdo</option><option value="PROPIA_PUERTA">☠️ Propia Puerta</option></select></div>
                    )}
                    <div>
                        <label className="block text-xs font-bold text-navy mb-1">Equipo</label>
                        <div className="grid grid-cols-2 gap-2">
                            <button onClick={() => setFormEvento({ ...formEvento, equipo_id: partido.local_id.toString() })} className={`p-2 rounded border font-bold text-sm ${formEvento.equipo_id == partido.local_id.toString() ? 'bg-navy text-white border-navy' : 'bg-gray-50 text-gray-500'}`}>{partido.local_nombre}</button>
                            <button onClick={() => setFormEvento({ ...formEvento, equipo_id: partido.visitante_id.toString() })} className={`p-2 rounded border font-bold text-sm ${formEvento.equipo_id == partido.visitante_id.toString() ? 'bg-navy text-white border-navy' : 'bg-gray-50 text-gray-500'}`}>{partido.visitante_nombre}</button>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-navy mb-1">{formEvento.tipo === 'CAMBIO' ? 'Entra' : 'Protagonista'}</label>
                        <select value={formEvento.jugador_id} onChange={e => setFormEvento({ ...formEvento, jugador_id: e.target.value })} className="w-full p-2 border rounded bg-white text-navy"><option value="">-- Seleccionar --</option>{getJugadoresModal().map(j => (<option key={j.persona_id} value={j.persona_id}>{j.es_entrenador ? `(ENT) ${j.nombre}` : `#${j.dorsal} - ${j.nombre}`}</option>))}</select>
                    </div>
                    {(formEvento.tipo === 'GOL' || formEvento.tipo === 'CAMBIO') && (
                        <div><label className="block text-xs font-bold text-navy mb-1">{formEvento.tipo === 'CAMBIO' ? 'Sale' : 'Asistente'}</label><select value={formEvento.extra_id} onChange={e => setFormEvento({ ...formEvento, extra_id: e.target.value })} className="w-full p-2 border rounded bg-white text-navy"><option value="">-- Ninguno --</option>{getJugadoresModal().map(j => (<option key={j.persona_id} value={j.persona_id}>#{j.dorsal} - {j.nombre}</option>))}</select></div>
                    )}
                    <div className="flex justify-end gap-2 pt-4 border-t"><button onClick={() => setModalEventoOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button><button onClick={guardarEvento} className="bg-green-600 text-white px-6 py-2 rounded font-bold shadow hover:bg-green-700">Guardar</button></div>
                </div>
            </Modal>
        </div>
    );
}