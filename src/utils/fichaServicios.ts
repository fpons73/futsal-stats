// Servicios de datos para las fichas enriquecidas (B1 del roadmap):
// ficha de equipo (resultados, clasificación, plantilla) y ficha de jugador
// (trayectoria, estadísticas acumuladas, últimos partidos).
//
// Las consultas de partidos/estadísticas filtran por la edición activa cuando
// se pasa edicionId; la trayectoria (Afiliacion) es histórica y no depende de
// ella. Todas las funciones devuelven null ante error (y lo apuntan al
// registro de errores): las fichas nunca deben romper la navegación.
import Database from "@tauri-apps/plugin-sql";
import { registroErrores } from "./registroErrores";

export interface PartidoFicha {
    id: number;
    fecha: string | null;
    jornada: string | null;
    rival: string;
    en_casa: boolean;
    gf: number;
    gc: number;
    resultado: "V" | "E" | "D";
}

export interface FichaEquipo {
    equipo: {
        id: number; nombre: string; abreviatura: string | null; categoria: string | null;
        escudo: string | null; pais_nombre: string | null; pais_bandera: string | null;
    };
    /** Últimos 10 partidos de la edición activa (o globales si no hay edición). */
    partidos: PartidoFicha[];
    forma: Array<"V" | "E" | "D">;
    resumen: { pj: number; v: number; e: number; d: number; gf: number; gc: number };
    /** Fila de este equipo en la clasificación de la edición activa, si participa. */
    clasificacion: {
        posicion: number; total: number; puntos: number; pj: number;
        pg: number; pe: number; pp: number; gf: number; gc: number; dg: number; forma: string[];
    } | null;
    /** Plantilla por Afiliacion activa (limitada: equipos masivos importados). */
    plantilla: Array<{ id: number; nombre: string; posicion: string | null; foto: string | null; roles: string | null }>;
}

export interface TrayectoriaEtapa {
    equipo_id: number;
    equipo_nombre: string;
    inicio: string | null;
    fin: string | null;
    activo: boolean;
    dorsal: number | null;
}

export interface FichaJugador {
    persona: {
        id: number; nombre: string; apellidos: string; nombre_deportivo: string;
        foto: string | null; posicion: string | null; fecha_nacimiento: string | null;
        pais_nombre: string | null; pais_bandera: string | null;
    };
    trayectoria: TrayectoriaEtapa[];
    /** Acumulado de la edición activa (null si no hay estadísticas registradas). */
    acumulado: {
        partidos: number; titular: number; minutos: number; goles: number; asistencias: number;
        tiros: number; tiros_puerta: number; rating_medio: number | null;
    } | null;
    /** Últimos partidos con estadística registrada de la edición activa. */
    ultimos: Array<{
        partido_id: number; fecha: string | null; rival: string; gf: number; gc: number;
        goles: number; asistencias: number; minutos: number; rating: number | null;
    }>;
}

function resultadoDe(gf: number, gc: number): "V" | "E" | "D" {
    return gf > gc ? "V" : gf < gc ? "D" : "E";
}

/** Carga todos los datos de la ficha de un equipo. Devuelve null si no existe o falla. */
export async function obtenerFichaEquipo(equipoId: number, edicionId: number | null): Promise<FichaEquipo | null> {
    try {
        const db = await Database.load("sqlite:globalfutsal.db");

        const eqRes = await db.select<Array<{
            id: number; nombre: string; abreviatura: string | null; categoria: string | null;
            escudo_path: string | null; pais_nombre: string | null; pais_bandera: string | null;
        }>>(`
            SELECT e.id, e.nombre, e.abreviatura, e.categoria, e.escudo_path,
                   p.nombre AS pais_nombre, p.bandera_path AS pais_bandera
            FROM Equipo e LEFT JOIN Pais p ON p.id = e.pais_id
            WHERE e.id = $1
        `, [equipoId]);
        if (eqRes.length === 0) return null;
        const eq = eqRes[0];

        const filtros = edicionId ? "AND p.edicion_id = $2" : "";
        const params: number[] = edicionId ? [equipoId, edicionId] : [equipoId];
        const partidosRes = await db.select<Array<{
            id: number; fecha_hora: string | null; jornada: string | null;
            rival: string; en_casa: number; gf: number; gc: number;
        }>>(`
            SELECT p.id, p.fecha_hora, p.jornada,
                   CASE WHEN p.local_id = $1 THEN ev.nombre ELSE el.nombre END AS rival,
                   CASE WHEN p.local_id = $1 THEN 1 ELSE 0 END AS en_casa,
                   CASE WHEN p.local_id = $1 THEN p.goles_local ELSE p.goles_visitante END AS gf,
                   CASE WHEN p.local_id = $1 THEN p.goles_visitante ELSE p.goles_local END AS gc
            FROM Partido p
            JOIN Equipo el ON el.id = p.local_id
            JOIN Equipo ev ON ev.id = p.visitante_id
            WHERE (p.local_id = $1 OR p.visitante_id = $1)
              AND p.estado = 'finalizado'
              ${filtros}
            ORDER BY p.fecha_hora DESC, p.id DESC
            LIMIT 10
        `, params);

        const partidos: PartidoFicha[] = partidosRes.map(p => ({
            id: p.id,
            fecha: p.fecha_hora,
            jornada: p.jornada,
            rival: p.rival,
            en_casa: p.en_casa === 1,
            gf: p.gf,
            gc: p.gc,
            resultado: resultadoDe(p.gf, p.gc),
        }));

        const resumen = {
            pj: partidos.length,
            v: partidos.filter(p => p.resultado === "V").length,
            e: partidos.filter(p => p.resultado === "E").length,
            d: partidos.filter(p => p.resultado === "D").length,
            gf: partidos.reduce((s, p) => s + p.gf, 0),
            gc: partidos.reduce((s, p) => s + p.gc, 0),
        };

        // Clasificación (solo con edición activa): reutiliza la calculadora del
        // proyecto y localiza la fila de este equipo.
        let clasificacion: FichaEquipo["clasificacion"] = null;
        if (edicionId) {
            const { calcularClasificacion } = await import("./calculadoraLiga");
            const tabla = await calcularClasificacion(edicionId);
            const total = tabla.length;
            const fila = tabla.find(f => f.equipo_id === equipoId);
            if (fila) {
                clasificacion = {
                    posicion: fila.posicion, total, puntos: fila.puntos, pj: fila.pj,
                    pg: fila.pg, pe: fila.pe, pp: fila.pp, gf: fila.gf, gc: fila.gc,
                    dg: fila.dg, forma: fila.forma,
                };
            }
        }

        // Plantilla activa (Afiliacion). Limitada a 50: en equipos importados en
        // bloque puede haber miles de filas y la ficha debe seguir fluida.
        const plantilla = await db.select<Array<{
            id: number; nombre: string; posicion: string | null;
            foto: string | null; roles: string | null;
        }>>(`
            SELECT pe.id, COALESCE(NULLIF(pe.nombre_deportivo, ''), pe.nombre || ' ' || pe.apellidos) AS nombre,
                   pe.posicion_principal AS posicion, pe.foto_path AS foto, pe.roles
            FROM Afiliacion a
            JOIN Persona pe ON pe.id = a.persona_id
            WHERE a.equipo_id = $1 AND a.activo = 1
            ORDER BY nombre
            LIMIT 50
        `, [equipoId]);

        return {
            equipo: {
                id: eq.id, nombre: eq.nombre, abreviatura: eq.abreviatura,
                categoria: eq.categoria, escudo: eq.escudo_path,
                pais_nombre: eq.pais_nombre, pais_bandera: eq.pais_bandera,
            },
            partidos,
            forma: partidos.map(p => p.resultado).reverse().slice(-5),
            resumen,
            clasificacion,
            plantilla,
        };
    } catch (e) {
        registroErrores.añadir("warning", "ficha-equipo", "No se pudo cargar la ficha del equipo", e instanceof Error ? e.message : String(e));
        return null;
    }
}

/** Carga todos los datos de la ficha de un jugador. Devuelve null si no existe o falla. */
export async function obtenerFichaJugador(personaId: number, edicionId: number | null): Promise<FichaJugador | null> {
    try {
        const db = await Database.load("sqlite:globalfutsal.db");

        const peRes = await db.select<Array<{
            id: number; nombre: string; apellidos: string; nombre_deportivo: string;
            foto_path: string | null; posicion_principal: string | null;
            fecha_nacimiento: string | null; pais_nombre: string | null; pais_bandera: string | null;
        }>>(`
            SELECT pe.id, pe.nombre, pe.apellidos, pe.nombre_deportivo, pe.foto_path,
                   pe.posicion_principal, pe.fecha_nacimiento,
                   pa.nombre AS pais_nombre, pa.bandera_path AS pais_bandera
            FROM Persona pe LEFT JOIN Pais pa ON pa.id = pe.nacionalidad_principal_id
            WHERE pe.id = $1
        `, [personaId]);
        if (peRes.length === 0) return null;
        const pe = peRes[0];

        // Trayectoria histórica: etapas de Afiliacion con su equipo, la más reciente primero.
        const trayectoriaRes = await db.select<Array<{
            equipo_id: number; equipo_nombre: string; inicio: string | null;
            fin: string | null; activo: number; dorsal: number | null;
        }>>(`
            SELECT a.equipo_id, e.nombre AS equipo_nombre, a.inicio, a.fin, a.activo, a.dorsal
            FROM Afiliacion a
            JOIN Equipo e ON e.id = a.equipo_id
            WHERE a.persona_id = $1
            ORDER BY COALESCE(a.fin, '9999-12-31') DESC, a.inicio DESC
            LIMIT 25
        `, [personaId]);

        // Acumulado de la edición activa, sobre la tabla real de migración 9
        // (minutos_jugados, no minutos). "partidos" = partidos con estadística.
        let acumulado: FichaJugador["acumulado"] = null;
        let ultimos: FichaJugador["ultimos"] = [];
        if (edicionId) {
            const acu = await db.select<Array<{
                partidos: number; titular: number; minutos: number; goles: number;
                asistencias: number; tiros: number; tiros_puerta: number; rating: number | null;
            }>>(`
                SELECT COUNT(*) AS partidos,
                       SUM(CASE WHEN al.titular = 1 THEN 1 ELSE 0 END) AS titular,
                       SUM(epj.minutos_jugados) AS minutos,
                       SUM(epj.goles) AS goles,
                       SUM(epj.asistencias) AS asistencias,
                       SUM(epj.tiros) AS tiros,
                       SUM(epj.tiros_puerta) AS tiros_puerta,
                       AVG(epj.rating) AS rating
                FROM EstadisticaPartidoJugador epj
                LEFT JOIN Alineacion al
                       ON al.partido_id = epj.partido_id AND al.persona_id = epj.persona_id
                JOIN Partido pa ON pa.id = epj.partido_id
                WHERE epj.persona_id = $1 AND pa.edicion_id = $2
            `, [personaId, edicionId]);
            if (acu.length > 0 && acu[0].partidos > 0) {
                const a = acu[0];
                acumulado = {
                    partidos: a.partidos, titular: a.titular || 0, minutos: a.minutos || 0,
                    goles: a.goles || 0, asistencias: a.asistencias || 0,
                    tiros: a.tiros || 0, tiros_puerta: a.tiros_puerta || 0,
                    rating_medio: a.rating,
                };
            }

            // Últimos partidos con estadística: rival y resultado del equipo del jugador.
            const ult = await db.select<Array<{
                partido_id: number; fecha: string | null; rival: string;
                gf: number; gc: number; goles: number; asistencias: number;
                minutos: number; rating: number | null;
            }>>(`
                SELECT epj.partido_id, pa.fecha_hora AS fecha,
                       CASE WHEN pa.local_id = epj.equipo_id THEN ev.nombre ELSE el.nombre END AS rival,
                       CASE WHEN pa.local_id = epj.equipo_id THEN pa.goles_local ELSE pa.goles_visitante END AS gf,
                       CASE WHEN pa.local_id = epj.equipo_id THEN pa.goles_visitante ELSE pa.goles_local END AS gc,
                       epj.goles, epj.asistencias, epj.minutos_jugados AS minutos, epj.rating
                FROM EstadisticaPartidoJugador epj
                JOIN Partido pa ON pa.id = epj.partido_id
                JOIN Equipo el ON el.id = pa.local_id
                JOIN Equipo ev ON ev.id = pa.visitante_id
                WHERE epj.persona_id = $1 AND pa.edicion_id = $2
                ORDER BY pa.fecha_hora DESC, epj.partido_id DESC
                LIMIT 8
            `, [personaId, edicionId]);
            ultimos = ult;
        }

        return {
            persona: {
                id: pe.id, nombre: pe.nombre, apellidos: pe.apellidos,
                nombre_deportivo: pe.nombre_deportivo, foto: pe.foto_path,
                posicion: pe.posicion_principal, fecha_nacimiento: pe.fecha_nacimiento,
                pais_nombre: pe.pais_nombre, pais_bandera: pe.pais_bandera,
            },
            trayectoria: trayectoriaRes.map(t => ({
                equipo_id: t.equipo_id,
                equipo_nombre: t.equipo_nombre,
                inicio: t.inicio,
                fin: t.fin,
                activo: t.activo === 1,
                dorsal: t.dorsal,
            })),
            acumulado,
            ultimos,
        };
    } catch (e) {
        registroErrores.añadir("warning", "ficha-jugador", "No se pudo cargar la ficha del jugador", e instanceof Error ? e.message : String(e));
        return null;
    }
}
