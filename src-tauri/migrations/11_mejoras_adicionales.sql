-- Migración 11: Mejoras adicionales

-- Equipo filial
ALTER TABLE Equipo ADD COLUMN equipo_principal_id INTEGER REFERENCES Equipo(id) ON DELETE SET NULL;

-- Colores de competición
ALTER TABLE Competicion ADD COLUMN color1 TEXT;
ALTER TABLE Competicion ADD COLUMN color2 TEXT;
ALTER TABLE Competicion ADD COLUMN ambito TEXT DEFAULT 'Clubes';

-- Grupo en Participante
ALTER TABLE Participante ADD COLUMN grupo TEXT;

-- Detalles de estadio/pabellón
ALTER TABLE Estadio ADD COLUMN anio_construccion INTEGER;
ALTER TABLE Estadio ADD COLUMN dimensiones TEXT;

-- Nacionalidad secundaria como FK (añadir columna si no existe)
-- En futsal usamos nacionalidades_secundarias TEXT, así que no añadimos FK
