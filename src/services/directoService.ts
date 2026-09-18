// Servicio del partido en directo (B2 del roadmap): cronómetro de tiempo
// jugado con periodos de 20 min y registro de acciones por jugador que
// escribe EstadisticaPartidoJugador (acumulador) + Evento (con minuto).
//
// El minuto actual se DERIVA: segundos guardados + (ahora − marca de
// reanudación). Nunca hay un ticker escribiendo en la BD: al pausar se
// consolidan los segundos y se limpia la marca; `consolidarSiExcedePeriodo`
// recorta el reloj al tope del periodo (20 min, 15 en prórroga) sin
// minutos imposibles.
//
// Degradación elegante: fuera de Tauri (tests) los métodos devuelven su
// resultado neutro en vez de lanzar; los fallos reales van al registro de
// errores.
import Database from "@tauri-apps/plugin-sql";
import { registroErrores } from "../utils/registroErrores";

export interface EstadoCrono {
    estado: "parado" | "primer_tiempo" | "descanso" | "segundo_tiempo" | "prorroga" | "finalizado";
    /** Segundos jugados consolidados (sin contar el tramo en marcha). */
    segundos: number;
    /** ISO del instante de reanudación; null si el reloj está parado. */
    reanudado_en: string | null;
}

/** Segundos jugados totales ahora mismo (consolidados + tramo en marcha). */
export function segundosActuales(c: EstadoCrono): number {
    if (!c.reanudado_en) return c.segundos;
    const tramo = Math.max(0, Date.now() - new Date(c.reanudado_en).getTime());
    return c.segundos + Math.floor(tramo / 1000);
}

/** Minuto de partido para eventos/estadísticas (0-based: 0 = primer minuto). */
export function minutoActual(c: EstadoCrono): number {
    return Math.floor(segundosActuales(c) / 60);
}

export const DURACION_PERIODO = 20 * 60;
export const DURACION_PRORROGA = 15 * 60;

/** Formato de pizarra MM:SS. */
export function formatearCrono(segundos: number): string {
    const m = Math.floor(segundos / 60);
    const s = segundos % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
}

async function db(): Promise<InstanceType<typeof Database> | null> {
    try {
        return await Database.load("sqlite:globalfutsal.db");
    } catch (e) {
        registroErrores.añadir("warning", "directo", "No se pudo abrir la BD", e instanceof Error ? e.message : String(e));
        return null;
    }
}

/** Lee el estado del cronómetro de un partido (parado a 0 si nunca se usó). */
export async function obtenerCrono(partidoId: number): Promise<EstadoCrono> {
    const d = await db();
    if (!d) return { estado: "parado", segundos: 0, reanudado_en: null };
    try {
        const res = await d.select<Array<{ crono_estado: string | null; crono_segundos: number | null; crono_actualizado_en: string | null }>>(
            `SELECT crono_estado, crono_segundos, crono_actualizado_en FROM Partido WHERE id = $1`, [partidoId],
        );
        if (!res.length) return { estado: "parado", segundos: 0, reanudado_en: null };
        return {
            estado: (res[0].crono_estado as EstadoCrono["estado"]) ?? "parado",
            segundos: res[0].crono_segundos ?? 0,
            reanudado_en: res[0].crono_actualizado_en,
        };
    } catch (e) {
        registroErrores.añadir("warning", "directo", "No se pudo leer el cronómetro", e instanceof Error ? e.message : String(e));
        return { estado: "parado", segundos: 0, reanudado_en: null };
    }
}

async function guardarCrono(partidoId: number, c: EstadoCrono): Promise<void> {
    const d = await db();
    if (!d) return;
    await d.execute(
        `UPDATE Partido SET crono_estado = $1, crono_segundos = $2, crono_actualizado_en = $3 WHERE id = $4`,
        [c.estado === "parado" ? null : c.estado, c.segundos, c.reanudado_en, partidoId],
    );
}

/** Transición: pausa (parado/descanso/finalizado) consolida; arranque/reanudación pone la marca. */
export async function cambiarEstado(partidoId: number, nuevo: EstadoCrono["estado"]): Promise<EstadoCrono> {
    const actual = await obtenerCrono(partidoId);
    const segundos = segundosActuales(actual);

    if (nuevo === "parado" || nuevo === "descanso" || nuevo === "finalizado") {
        const estado: EstadoCrono = { estado: nuevo, segundos, reanudado_en: null };
        await guardarCrono(partidoId, estado);
        return estado;
    }
    const estado: EstadoCrono = { estado: nuevo, segundos, reanudado_en: new Date().toISOString() };
    await guardarCrono(partidoId, estado);
    return estado;
}

/**
 * Recorte del reloj al tope del periodo. La UI la llama desde el ticker:
 * solo escribe si el tramo en marcha desborda el tope, y deja la marca de
 * reanudación en el instante del recorte (el reloj no sigue subiendo).
 */
export async function consolidarSiExcedePeriodo(partidoId: number, c: EstadoCrono): Promise<EstadoCrono> {
    if (!c.reanudado_en) return c;
    if (c.estado === "parado" || c.estado === "descanso" || c.estado === "finalizado") return c;
    const tope = c.estado === "prorroga" ? DURACION_PRORROGA : DURACION_PERIODO;
    const total = segundosActuales(c);
    if (total <= tope) return c;
    const consolidado: EstadoCrono = { ...c, segundos: tope, reanudado_en: new Date().toISOString() };
    await guardarCrono(partidoId, consolidado);
    return consolidado;
}

// --- Acciones por jugador ---------------------------------------------------

export interface AccionRegistrada {
    personaId: number;
    /** Id de la fila EstadisticaPartidoJugador afectada. */
    epjId: number;
    campo: string;
    delta: number;
    /** Evento creado, si la acción lo genera (gol, falta, tarjetas). */
    eventoId: number | null;
    minuto: number;
}

export type CampoDirecto =
    | "goles" | "asistencias" | "tiros" | "tiros_puerta"
    | "faltas_cometidas" | "tarjetas_amarillas" | "tarjetas_rojas";

const EVENTO_POR_ACCION: Partial<Record<CampoDirecto, { tipo: string; subtipo?: string }>> = {
    goles: { tipo: "GOL" },
    faltas_cometidas: { tipo: "FALTA" },
    tarjetas_amarillas: { tipo: "TARJETA", subtipo: "Amarilla" },
    tarjetas_rojas: { tipo: "TARJETA", subtipo: "Roja" },
};

/**
 * Registra +1/−1 de una métrica para un jugador. Upsert del acumulador en
 * EstadisticaPartidoJugador y, para métricas con narrativa (gol, falta,
 * tarjetas) solo en +1, creación del Evento con el minuto actual.
 */
export async function registrarAccion(
    partidoId: number,
    personaId: number,
    equipoId: number,
    campo: CampoDirecto,
    delta: 1 | -1,
    crono: EstadoCrono,
): Promise<AccionRegistrada | null> {
    const d = await db();
    if (!d) return null;
    try {
        const existente = await d.select<Array<{ id: number } & Record<string, number | null>>>(
            `SELECT * FROM EstadisticaPartidoJugador WHERE partido_id = $1 AND persona_id = $2`, [partidoId, personaId],
        );
        const valorPrevio = existente.length ? (existente[0][campo] as number | null) ?? 0 : 0;
        // Suelo 0: el −1 sobre 0 es no-op (la UI deshabilita; esto es red de seguridad).
        if (delta < 0 && valorPrevio <= 0) return null;

        let epjId: number;
        if (existente.length) {
            epjId = existente[0].id;
            await d.execute(`UPDATE EstadisticaPartidoJugador SET ${campo} = $1 WHERE id = $2`, [valorPrevio + delta, epjId]);
        } else {
            await d.execute(
                `INSERT INTO EstadisticaPartidoJugador (partido_id, persona_id, equipo_id, ${campo}) VALUES ($1, $2, $3, $4)`,
                [partidoId, personaId, equipoId, delta],
            );
            const creada = await d.select<Array<{ id: number }>>(
                `SELECT id FROM EstadisticaPartidoJugador WHERE partido_id = $1 AND persona_id = $2`, [partidoId, personaId],
            );
            epjId = creada.length ? creada[0].id : 0;
        }

        let eventoId: number | null = null;
        const ev = EVENTO_POR_ACCION[campo];
        if (ev && delta > 0) {
            await d.execute(
                `INSERT INTO Evento (partido_id, tipo, subtipo, minuto, jugador_id, equipo_id, metadata)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [partidoId, ev.tipo, ev.subtipo ?? null, minutoActual(crono), personaId, equipoId, JSON.stringify({ origen: "directo" })],
            );
            const creado = await d.select<Array<{ id: number }>>(
                `SELECT id FROM Evento WHERE partido_id = $1 AND jugador_id = $2 AND tipo = $3 ORDER BY id DESC LIMIT 1`,
                [partidoId, personaId, ev.tipo],
            );
            eventoId = creado.length ? creado[0].id : null;
        }

        return { personaId, epjId, campo, delta, eventoId, minuto: minutoActual(crono) };
    } catch (e) {
        registroErrores.añadir("warning", "directo", "No se pudo registrar la acción", e instanceof Error ? e.message : String(e));
        return null;
    }
}

/**
 * Deshace una acción: delta inverso al acumulador (suelo 0) y borrado del
 * evento asociado. Solo toca la fila identificada por epjId.
 */
export async function deshacerAccion(accion: AccionRegistrada): Promise<boolean> {
    const d = await db();
    if (!d) return false;
    try {
        await d.execute(
            `UPDATE EstadisticaPartidoJugador SET ${accion.campo} = MAX(0, COALESCE(${accion.campo}, 0) - $1) WHERE id = $2`,
            [accion.delta, accion.epjId],
        );
        if (accion.eventoId) {
            await d.execute(`DELETE FROM Evento WHERE id = $1`, [accion.eventoId]);
        }
        return true;
    } catch (e) {
        registroErrores.añadir("warning", "directo", "No se pudo deshacer la acción", e instanceof Error ? e.message : String(e));
        return false;
    }
}

/**
 * Marca el partido como finalizado desde el directo: consolida el reloj y,
 * si el marcador está a cero pero hay eventos de gol, lo rellena desde los
 * eventos (PROPIA_PUERTA suma al equipo contrario del evento).
 */
export async function finalizarPartido(partidoId: number, crono: EstadoCrono): Promise<boolean> {
    const d = await db();
    if (!d) return false;
    try {
        const segundos = segundosActuales(crono);
        await d.execute(
            `UPDATE Partido SET estado = 'finalizado', crono_estado = 'finalizado',
                    crono_segundos = $1, crono_actualizado_en = NULL WHERE id = $2`,
            [segundos, partidoId],
        );

        const marcador = await d.select<Array<{ local_id: number; goles_local: number | null; goles_visitante: number | null }>>(
            `SELECT local_id, goles_local, goles_visitante FROM Partido WHERE id = $1`, [partidoId],
        );
        if (!marcador.length) return true;
        const { local_id, goles_local, goles_visitante } = marcador[0];
        if ((goles_local ?? 0) + (goles_visitante ?? 0) > 0) return true;

        const goles = await d.select<Array<{ equipo_id: number; tipo: string; n: number }>>(
            `SELECT equipo_id, tipo, COUNT(*) AS n FROM Evento
             WHERE partido_id = $1 AND equipo_id IS NOT NULL
               AND (tipo LIKE 'GOL%' OR tipo = 'PROPIA_PUERTA')
             GROUP BY equipo_id, tipo`, [partidoId],
        );
        let gl = 0, gv = 0;
        for (const g of goles) {
            const esLocal = g.equipo_id === local_id;
            const contra = g.tipo === "PROPIA_PUERTA";
            const sumaLocal = contra ? !esLocal : esLocal;
            if (sumaLocal) gl += g.n; else gv += g.n;
        }
        if (gl + gv > 0) {
            await d.execute(`UPDATE Partido SET goles_local = $1, goles_visitante = $2 WHERE id = $3`, [gl, gv, partidoId]);
        }
        return true;
    } catch (e) {
        registroErrores.añadir("warning", "directo", "No se pudo finalizar el partido", e instanceof Error ? e.message : String(e));
        return false;
    }
}
