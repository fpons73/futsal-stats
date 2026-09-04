/**
 * Generador de calendario round-robin para futsal
 * Soporta ida y vuelta, grupos, y distribución de pabellones
 */

export interface EquipoCalendario {
  id: number;
  nombre: string;
  pabellon_id?: number;
}

export interface PartidoCalendario {
  jornada: number;
  local_id: number;
  visitante_id: number;
  fecha?: string;
  pabellon_id?: number;
}

/**
 * Genera un calendario round-robin (todos contra todos)
 * Usa el algoritmo círculo para generar jornadas
 */
export function generarRoundRobin(equipos: EquipoCalendario[], idaYVuelta: boolean = true): PartidoCalendario[] {
  const n = equipos.length;
  if (n < 2) return [];

  const partidos: PartidoCalendario[] = [];
  const equiposRotacion = [...equipos];

  // Si es impar, añadir un "ghost" (descanso)
  if (n % 2 !== 0) {
    equiposRotacion.push({ id: -1, nombre: "DESCANSO" });
  }

  const total = equiposRotacion.length;
  const jornadas = total - 1;
  const mitad = total / 2;

  for (let j = 0; j < jornadas; j++) {
    for (let i = 0; i < mitad; i++) {
      const local = equiposRotacion[i];
      const visitante = equiposRotacion[total - 1 - i];

      if (local.id !== -1 && visitante.id !== -1) {
        // Alternar local/visitante según jornada para equilibrar
        if (j % 2 === 0) {
          partidos.push({ jornada: j + 1, local_id: local.id, visitante_id: visitante.id });
        } else {
          partidos.push({ jornada: j + 1, local_id: visitante.id, visitante_id: local.id });
        }
      }
    }
    // Rotar (mantener fijo el primero)
    const fijo = equiposRotacion[0];
    const resto = equiposRotacion.slice(1);
    resto.unshift(resto.pop()!);
    equiposRotacion.splice(0, equiposRotacion.length, fijo, ...resto);
  }

  // Vuelta (invertir local/visitante)
  if (idaYVuelta) {
    const vuelta = partidos.map(p => ({
      jornada: p.jornada + jornadas,
      local_id: p.visitante_id,
      visitante_id: p.local_id,
    }));
    partidos.push(...vuelta);
  }

  return partidos;
}

/**
 * Distribuye pabellones a los partidos del calendario
 * (asigna el pabellón del equipo local)
 */
export function asignarPabellones(partidos: PartidoCalendario[], equipos: EquipoCalendario[]): PartidoCalendario[] {
  const pabellonesMap = new Map(equipos.map(e => [e.id, e.pabellon_id]));
  return partidos.map(p => ({
    ...p,
    pabellon_id: pabellonesMap.get(p.local_id),
  }));
}

/**
 * Genera fechas automáticas para un calendario
 * (una jornada por semana, empezando desde una fecha dada)
 */
export function asignarFechas(partidos: PartidoCalendario[], fechaInicio: string, diasEntreJornadas: number = 7): PartidoCalendario[] {
  const inicio = new Date(fechaInicio);
  const jornadas = [...new Set(partidos.map(p => p.jornada))].sort((a, b) => a - b);
  const fechaPorJornada = new Map<number, string>();

  jornadas.forEach((j, i) => {
    const fecha = new Date(inicio);
    fecha.setDate(fecha.getDate() + (i * diasEntreJornadas));
    fechaPorJornada.set(j, fecha.toISOString().split("T")[0] + "T18:00:00");
  });

  return partidos.map(p => ({
    ...p,
    fecha: fechaPorJornada.get(p.jornada),
  }));
}
