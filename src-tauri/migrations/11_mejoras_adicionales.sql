-- Migración 11: Mejoras adicionales
-- NOTA: el grupo de competición vive en Inscripcion.grupo (migración 3);
-- no existe tabla Participante en el esquema, así que no se toca aquí.

-- Equipo filial
ALTER TABLE Equipo ADD COLUMN equipo_principal_id INTEGER REFERENCES Equipo(id) ON DELETE SET NULL;

-- Colores de competición
ALTER TABLE Competicion ADD COLUMN color1 TEXT;
ALTER TABLE Competicion ADD COLUMN color2 TEXT;
ALTER TABLE Competicion ADD COLUMN ambito TEXT DEFAULT 'Clubes';

-- Detalles de estadio/pabellón
ALTER TABLE Estadio ADD COLUMN anio_construccion INTEGER;
ALTER TABLE Estadio ADD COLUMN dimensiones TEXT;
