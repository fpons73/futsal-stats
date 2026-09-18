-- Migración 14: cronómetro del partido en directo (B2 del roadmap).
--
-- El cronómetro guarda tiempo JUGADO efectivo (no reloj real): los periodos
-- de futsal son de 20 min y el reloj se detiene en cada sustitución/saque,
-- así que lo que persistimos es el acumulado de segundos en juego más una
-- marca de cuándo se reanudó (para derivar el minuto actual sin un ticker
-- escribiendo en la BD cada segundo).
--
-- Todas las columnas son NULL-able: los partidos históricos y los creados
-- desde importaciones no participan del directo y quedan intactos.

ALTER TABLE Partido ADD COLUMN crono_estado TEXT;          -- NULL | 'primer_tiempo' | 'descanso' | 'segundo_tiempo' | 'prorroga' | 'finalizado'
ALTER TABLE Partido ADD COLUMN crono_segundos INTEGER;     -- segundos acumulados en juego en el momento del último cambio de estado
ALTER TABLE Partido ADD COLUMN crono_actualizado_en TEXT;  -- instante ISO del último inicio/reanudación (NULL si parado)
