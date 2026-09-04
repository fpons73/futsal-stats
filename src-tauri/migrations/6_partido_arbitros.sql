-- Añadir arbitro 2 y arbitro 3 a los partidos
ALTER TABLE Partido ADD COLUMN arbitro_2_id INTEGER;
ALTER TABLE Partido ADD COLUMN arbitro_3_id INTEGER;
