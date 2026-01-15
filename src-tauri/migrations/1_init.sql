-- 1. Confederación
CREATE TABLE Confederacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  codigo TEXT NOT NULL,
  logo_path TEXT
);

-- 2. País
CREATE TABLE Pais (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  codigo_iso2 TEXT NOT NULL,
  codigo_iso3 TEXT NOT NULL,
  confederacion_id INTEGER,
  bandera_path TEXT,
  FOREIGN KEY(confederacion_id) REFERENCES Confederacion(id) ON UPDATE CASCADE ON DELETE RESTRICT
);

-- 3. Estadio
CREATE TABLE Estadio (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  ciudad TEXT,
  pais_id INTEGER NOT NULL,
  capacidad INTEGER,
  superficie TEXT,
  coordenadas_lat REAL,
  coordenadas_lng REAL,
  club_id INTEGER,
  ano_fundacion INTEGER,
  foto_path TEXT,
  FOREIGN KEY(pais_id) REFERENCES Pais(id) ON UPDATE CASCADE
);

-- 4. Equipo
CREATE TABLE Equipo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  abreviatura TEXT NOT NULL,
  pais_id INTEGER NOT NULL,
  escudo_path TEXT,
  categoria TEXT NOT NULL,
  color1 TEXT,
  color2 TEXT,
  activo INTEGER DEFAULT 1,
  FOREIGN KEY(pais_id) REFERENCES Pais(id) ON UPDATE CASCADE
);

-- 5. Persona
CREATE TABLE Persona (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  apellidos TEXT NOT NULL,
  nombre_deportivo TEXT NOT NULL,
  fecha_nacimiento TEXT,
  nacionalidad_principal_id INTEGER,
  nacionalidades_secundarias TEXT,
  foto_path TEXT,
  perfil TEXT,
  roles TEXT NOT NULL,
  posicion_principal TEXT,
  posiciones_secundarias TEXT,
  meta TEXT,
  FOREIGN KEY(nacionalidad_principal_id) REFERENCES Pais(id)
);

-- 6. Contrato / Afiliación
CREATE TABLE Afiliacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  persona_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  inicio TEXT,
  fin TEXT,
  tipo TEXT,
  dorsal INTEGER,
  activo INTEGER DEFAULT 1,
  FOREIGN KEY(persona_id) REFERENCES Persona(id),
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id)
);

-- 7. Temporada
CREATE TABLE Temporada (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  fecha_inicio TEXT,
  fecha_fin TEXT
);

-- 8. Competición
CREATE TABLE Competicion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  pais_id INTEGER,
  confederacion_id INTEGER,
  logo_path TEXT,
  trofeo_path TEXT,
  FOREIGN KEY(pais_id) REFERENCES Pais(id),
  FOREIGN KEY(confederacion_id) REFERENCES Confederacion(id)
);

-- 9. Edición
CREATE TABLE Edicion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  competicion_id INTEGER NOT NULL,
  temporada_id INTEGER NOT NULL,
  reglas_json TEXT,
  puntos_victoria INTEGER DEFAULT 3,
  puntos_empate INTEGER DEFAULT 1,
  puntos_derrota INTEGER DEFAULT 0,
  desempates_json TEXT,
  FOREIGN KEY(competicion_id) REFERENCES Competicion(id),
  FOREIGN KEY(temporada_id) REFERENCES Temporada(id)
);

-- 10. Fase
CREATE TABLE Fase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edicion_id INTEGER NOT NULL,
  nombre TEXT NOT NULL,
  tipo TEXT NOT NULL,
  orden INTEGER,
  ida_vuelta INTEGER DEFAULT 0,
  FOREIGN KEY(edicion_id) REFERENCES Edicion(id)
);

-- 11. Partido
CREATE TABLE Partido (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edicion_id INTEGER NOT NULL,
  fase_id INTEGER,
  jornada TEXT,
  fecha_hora TEXT,
  estadio_id INTEGER,
  local_id INTEGER NOT NULL,
  visitante_id INTEGER NOT NULL,
  arbitro_id INTEGER,
  espectadores INTEGER,
  minutos_juego INTEGER,
  goles_local INTEGER DEFAULT 0,
  goles_visitante INTEGER DEFAULT 0,
  goles_descanso_local INTEGER DEFAULT 0,
  goles_descanso_visitante INTEGER DEFAULT 0,
  prorroga INTEGER DEFAULT 0,
  penaltis_local INTEGER,
  penaltis_visitante INTEGER,
  estado TEXT DEFAULT 'programado',
  FOREIGN KEY(edicion_id) REFERENCES Edicion(id),
  FOREIGN KEY(fase_id) REFERENCES Fase(id),
  FOREIGN KEY(estadio_id) REFERENCES Estadio(id),
  FOREIGN KEY(local_id) REFERENCES Equipo(id),
  FOREIGN KEY(visitante_id) REFERENCES Equipo(id),
  FOREIGN KEY(arbitro_id) REFERENCES Persona(id)
);

-- 12. Alineación
CREATE TABLE Alineacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partido_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  persona_id INTEGER NOT NULL,
  titular INTEGER DEFAULT 0,
  dorsal INTEGER,
  posicion TEXT,
  es_capitan INTEGER DEFAULT 0,
  entrenador_id INTEGER,
  minuto_entrada INTEGER,
  minuto_salida INTEGER,
  FOREIGN KEY(partido_id) REFERENCES Partido(id),
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id),
  FOREIGN KEY(persona_id) REFERENCES Persona(id),
  FOREIGN KEY(entrenador_id) REFERENCES Persona(id)
);

-- 13. Evento
CREATE TABLE Evento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partido_id INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  subtipo TEXT,
  minuto INTEGER,
  jugador_id INTEGER,
  asistente_id INTEGER,
  equipo_id INTEGER,
  descripcion TEXT,
  metadata TEXT,
  FOREIGN KEY(partido_id) REFERENCES Partido(id),
  FOREIGN KEY(jugador_id) REFERENCES Persona(id),
  FOREIGN KEY(asistente_id) REFERENCES Persona(id),
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id)
);

-- 14. Estadísticas por Equipo
CREATE TABLE EstadisticaPartidoEquipo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partido_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  posesion REAL,
  xG REAL,
  tiros INTEGER,
  tiros_puerta INTEGER,
  tiros_palo INTEGER,
  corners INTEGER,
  faltas INTEGER,
  fueras_juego INTEGER,
  tarjetas_amarillas INTEGER,
  tarjetas_rojas INTEGER,
  penaltis_cometidos INTEGER,
  penaltis_concedidos INTEGER,
  FOREIGN KEY(partido_id) REFERENCES Partido(id),
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id)
);

-- 15. Estadísticas por Jugador
CREATE TABLE EstadisticaPartidoJugador (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partido_id INTEGER NOT NULL,
  persona_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  minutos INTEGER,
  goles INTEGER,
  asistencias INTEGER,
  penaltis_marcados INTEGER,
  penaltis_fallados INTEGER,
  tarjetas INTEGER,
  lesiones INTEGER,
  tiros INTEGER,
  pases_clave INTEGER,
  duelos_ganados INTEGER,
  rating REAL,
  FOREIGN KEY(partido_id) REFERENCES Partido(id),
  FOREIGN KEY(persona_id) REFERENCES Persona(id),
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id)
);

-- 16. Alertas
CREATE TABLE Alerta (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL,
  parametro INTEGER,
  activo INTEGER DEFAULT 1,
  mensaje TEXT
);

-- 17. Logs
CREATE TABLE Log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fecha TEXT,
  accion TEXT,
  usuario TEXT,
  path TEXT
);