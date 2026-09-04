-- Migración 7: Estadísticas extendidas de partido

-- Añadir columnas a EstadisticaPartidoEquipo
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN pases_totales INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN pases_precisos INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN centros_totales INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN centros_buenos INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN entradas_totales INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN entradas_ganadas INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN despejes INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN intercepciones INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN recuperaciones INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN duelos_ganados INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN duelos_perdidos INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN paradas INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN saques_banda INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN faltas_recibidas INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN balones_perdidos INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN saques_puerta INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN punos INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN faltas_acumulativas INTEGER DEFAULT 0;
ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN puntos_sofa REAL DEFAULT 0.0;

-- Añadir columnas a Partido
ALTER TABLE Partido ADD COLUMN descuento_1 INTEGER DEFAULT 0;
ALTER TABLE Partido ADD COLUMN descuento_2 INTEGER DEFAULT 0;
ALTER TABLE Partido ADD COLUMN goles_1_prorroga_local INTEGER DEFAULT 0;
ALTER TABLE Partido ADD COLUMN goles_1_prorroga_visitante INTEGER DEFAULT 0;
ALTER TABLE Partido ADD COLUMN goles_2_prorroga_local INTEGER DEFAULT 0;
ALTER TABLE Partido ADD COLUMN goles_2_prorroga_visitante INTEGER DEFAULT 0;
ALTER TABLE Partido ADD COLUMN formacion_local TEXT DEFAULT '';
ALTER TABLE Partido ADD COLUMN formacion_visitante TEXT DEFAULT '';
ALTER TABLE Partido ADD COLUMN metadata TEXT;

-- Añadir rating a Alineacion
ALTER TABLE Alineacion ADD COLUMN rating REAL DEFAULT 0;

-- Añadir minuto_extra a Evento
ALTER TABLE Evento ADD COLUMN minuto_extra INTEGER DEFAULT 0;
