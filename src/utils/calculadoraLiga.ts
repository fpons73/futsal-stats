import Database from "@tauri-apps/plugin-sql";

export interface FilaClasificacion {
  posicion: number;
  equipo_id: number;
  nombre: string;
  escudo: string;
  puntos: number;
  pj: number;
  pg: number;
  pe: number;
  pp: number;
  gf: number;
  gc: number;
  dg: number;
  forma: string[];
}

export async function calcularClasificacion(edicionId: number, faseId?: number, jornada?: string): Promise<FilaClasificacion[]> {
  const db = await Database.load("sqlite:globalfutsal.db");
  const edicion = await db.select<any[]>("SELECT * FROM Edicion WHERE id = ?", [edicionId]);
  if (edicion.length === 0) return [];

  const ptsV = edicion[0].puntos_victoria || 3;
  const ptsE = edicion[0].puntos_empate || 1;

  let equiposQuery = `SELECT DISTINCT e.id, e.nombre, e.escudo_path
    FROM Equipo e
    JOIN Inscripcion i ON i.equipo_id = e.id
    WHERE i.edicion_id = ? AND i.activo = 1`;
  let equiposParams: any[] = [edicionId];

  if (faseId) {
    equiposQuery = `
      SELECT DISTINCT e.id, e.nombre, e.escudo_path
      FROM Equipo e
      JOIN Partido p ON (p.local_id = e.id OR p.visitante_id = e.id)
      WHERE p.edicion_id = ? AND p.fase_id = ?
    `;
    equiposParams = [edicionId, faseId];
  }

  const equipos = await db.select<any[]>(equiposQuery, equiposParams);

  let queryPartidos = `SELECT * FROM Partido WHERE edicion_id = ? AND estado = 'finalizado'`;
  let paramsPartidos: any[] = [edicionId];

  if (faseId) {
    queryPartidos += ` AND fase_id = ?`;
    paramsPartidos.push(faseId);
  }
  if (jornada) {
    queryPartidos += ` AND jornada = ?`;
    paramsPartidos.push(jornada);
  }

  queryPartidos += ` ORDER BY fecha_hora ASC, id ASC`;
  const partidos = await db.select<any[]>(queryPartidos, paramsPartidos);

  let tabla: { [key: number]: FilaClasificacion } = {};
  equipos.forEach(eq => {
    tabla[eq.id] = {
      posicion: 0, equipo_id: eq.id, nombre: eq.nombre, escudo: eq.escudo_path,
      puntos: 0, pj: 0, pg: 0, pe: 0, pp: 0, gf: 0, gc: 0, dg: 0, forma: []
    };
  });

  partidos.forEach(p => {
    const local = tabla[p.local_id];
    const visit = tabla[p.visitante_id];
    if (!local || !visit) return;

    local.pj++; visit.pj++;
    local.gf += p.goles_local || 0; local.gc += p.goles_visitante || 0;
    visit.gf += p.goles_visitante || 0; visit.gc += p.goles_local || 0;

    if (p.goles_local > p.goles_visitante) {
      local.puntos += ptsV; local.pg++; local.forma.unshift("G");
      visit.puntos += 0; visit.pp++; visit.forma.unshift("P");
    } else if (p.goles_local < p.goles_visitante) {
      visit.puntos += ptsV; visit.pg++; visit.forma.unshift("G");
      local.puntos += 0; local.pp++; local.forma.unshift("P");
    } else {
      local.puntos += ptsE; visit.puntos += ptsE; local.pe++; visit.pe++;
      local.forma.unshift("E"); visit.forma.unshift("E");
    }
    local.forma = local.forma.slice(0, 5);
    visit.forma = visit.forma.slice(0, 5);
  });

  const filas = Object.values(tabla);
  filas.forEach(f => { f.dg = f.gf - f.gc; });
  filas.sort((a, b) => {
    if (b.puntos !== a.puntos) return b.puntos - a.puntos;
    if (b.dg !== a.dg) return b.dg - a.dg;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.nombre.localeCompare(b.nombre);
  });
  filas.forEach((f, i) => { f.posicion = i + 1; });

  return filas;
}

export async function obtenerEstadisticasJugadores(edicionId: number): Promise<any[]> {
  const db = await Database.load("sqlite:globalfutsal.db");
  const res = await db.select<any[]>(`
    SELECT
      p.id, p.nombre_deportivo, p.foto_path, p.posicion_principal,
      eq.nombre as equipo_nombre, eq.escudo_path as equipo_escudo,
      COUNT(DISTINCT al.partido_id) as partidos,
      SUM(CASE WHEN al.titular = 1 THEN 1 ELSE 0 END) as titular,
      SUM(epj.goles) as goles_total,
      SUM(epj.asistencias) as asistencias,
      SUM(epj.tiros) as tiros,
      SUM(epj.tiros_puerta) as tiros_puerta,
      SUM(epj.pases_totales) as pases_totales,
      SUM(epj.pases_precisos) as pases_precisos,
      SUM(epj.entradas) as entradas,
      SUM(epj.intercepciones) as intercepciones,
      SUM(epj.recuperaciones) as recuperaciones,
      SUM(epj.faltas_cometidas) as faltas_cometidas,
      SUM(epj.dobles_penaltis_marcados) as dobles_penaltis,
      AVG(epj.rating) as rating_medio,
      SUM(epj.minutos_jugados) as minutos
    FROM EstadisticaPartidoJugador epj
    JOIN Alineacion al ON al.partido_id = epj.partido_id AND al.persona_id = epj.persona_id
    JOIN Persona p ON epj.persona_id = p.id
    JOIN Equipo eq ON epj.equipo_id = eq.id
    JOIN Partido part ON epj.partido_id = part.id
    WHERE part.edicion_id = ?
    GROUP BY p.id
    ORDER BY goles_total DESC, asistencias DESC
  `, [edicionId]);
  return res;
}

export async function obtenerEstadisticasEquipos(edicionId: number): Promise<any[]> {
  const db = await Database.load("sqlite:globalfutsal.db");
  const res = await db.select<any[]>(`
    SELECT
      eq.id, eq.nombre, eq.escudo_path,
      COUNT(DISTINCT epe.partido_id) as partidos,
      AVG(epe.posesion) as posesion_media,
      SUM(epe.tiros) as tiros_total,
      SUM(epe.tiros_puerta) as tiros_puerta,
      SUM(epe.corners) as corners_total,
      SUM(epe.faltas) as faltas_total,
      SUM(epe.faltas_acumulativas) as faltas_acumulativas,
      AVG(epe.puntos_sofa) as sofa_media
    FROM EstadisticaPartidoEquipo epe
    JOIN Equipo eq ON epe.equipo_id = eq.id
    JOIN Partido p ON epe.partido_id = p.id
    WHERE p.edicion_id = ?
    GROUP BY eq.id
    ORDER BY tiros_total DESC
  `, [edicionId]);
  return res;
}

export async function obtenerEstadisticasEntrenadores(edicionId: number): Promise<any[]> {
  const db = await Database.load("sqlite:globalfutsal.db");
  const res = await db.select<any[]>(`
    SELECT
      per.id, per.nombre_deportivo, per.foto_path,
      eq.nombre as equipo_nombre, eq.escudo_path as equipo_escudo,
      COUNT(DISTINCT p.id) as partidos,
      SUM(CASE WHEN p.goles_local > p.goles_visitante AND p.local_id = eq.id THEN 1
               WHEN p.goles_visitante > p.goles_local AND p.visitante_id = eq.id THEN 1 ELSE 0 END) as victorias,
      SUM(CASE WHEN p.goles_local = p.goles_visitante THEN 1 ELSE 0 END) as empates,
      SUM(CASE WHEN p.goles_local < p.goles_visitante AND p.local_id = eq.id THEN 1
               WHEN p.goles_visitante < p.goles_local AND p.visitante_id = eq.id THEN 1 ELSE 0 END) as derrotas
    FROM Alineacion al
    JOIN Persona per ON al.persona_id = per.id
    JOIN Equipo eq ON al.equipo_id = eq.id
    JOIN Partido p ON al.partido_id = p.id
    WHERE p.edicion_id = ? AND per.roles LIKE '%Entrenador%' AND al.es_entrenador = 1
    GROUP BY per.id
    ORDER BY victorias DESC
  `, [edicionId]);
  return res;
}

export async function obtenerReglasClasificacion(edicionId: number): Promise<any> {
  const db = await Database.load("sqlite:globalfutsal.db");
  const res = await db.select<any[]>("SELECT desempates_json FROM Edicion WHERE id = ?", [edicionId]);
  if (res.length > 0 && res[0].desempates_json) {
    try {
      return JSON.parse(res[0].desempates_json);
    } catch (e) {
      return null;
    }
  }
  return null;
}

export async function obtenerCincoIdeal(edicionId: number, jornada?: string): Promise<any[]> {
  const db = await Database.load("sqlite:globalfutsal.db");
  let query = `
    SELECT
      p.id, p.nombre_deportivo, p.foto_path, p.posicion_principal,
      eq.nombre as equipo_nombre, eq.escudo_path as equipo_escudo,
      AVG(epj.rating) as rating_medio,
      SUM(epj.goles) as goles,
      SUM(epj.asistencias) as asistencias,
      COUNT(DISTINCT epj.partido_id) as partidos
    FROM EstadisticaPartidoJugador epj
    JOIN Persona p ON epj.persona_id = p.id
    JOIN Equipo eq ON epj.equipo_id = eq.id
    JOIN Partido part ON epj.partido_id = part.id
    WHERE part.edicion_id = ?
  `;
  let params: any[] = [edicionId];
  if (jornada) {
    query += ` AND part.jornada = ?`;
    params.push(jornada);
  }
  query += ` GROUP BY p.id HAVING partidos > 0 ORDER BY rating_medio DESC`;

  const res = await db.select<any[]>(query, params);

  const cincoIdeal: any[] = [];
  const usados = new Set<number>();

  // Portero
  const portero = res.find(j => j.posicion_principal === "Portero" && !usados.has(j.id));
  if (portero) { cincoIdeal.push(portero); usados.add(portero.id); }

  // Cierre
  const cierre = res.find(j => j.posicion_principal === "Cierre" && !usados.has(j.id));
  if (cierre) { cincoIdeal.push(cierre); usados.add(cierre.id); }

  // Ala (mejor ala disponible)
  const ala1 = res.find(j => j.posicion_principal === "Ala" && !usados.has(j.id));
  if (ala1) { cincoIdeal.push(ala1); usados.add(ala1.id); }

  // Segundo Ala o Universal
  const ala2 = res.find(j => (j.posicion_principal === "Ala" || j.posicion_principal === "Universal") && !usados.has(j.id));
  if (ala2) { cincoIdeal.push(ala2); usados.add(ala2.id); }

  // Pivot
  const pivot = res.find(j => (j.posicion_principal === "Pivot" || j.posicion_principal === "Pívot" || j.posicion_principal === "Universal") && !usados.has(j.id));
  if (pivot) { cincoIdeal.push(pivot); usados.add(pivot.id); }

  // Si no tenemos 5, rellenar con los mejores disponibles
  if (cincoIdeal.length < 5) {
    for (const j of res) {
      if (cincoIdeal.length >= 5) break;
      if (!usados.has(j.id)) { cincoIdeal.push(j); usados.add(j.id); }
    }
  }

  return cincoIdeal;
}
