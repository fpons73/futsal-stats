-- Migración 12: posición inicial real por jugador en el acta
--
-- Alineacion.posicion guarda la posición "ficha" del jugador (su perfil).
-- posicion_inicial guarda en qué posición empezó realmente el partido ese jugador.
-- fuente_posicion_inicial: manual | inferida | importada (procedencia del dato)

ALTER TABLE Alineacion ADD COLUMN posicion_inicial TEXT;
ALTER TABLE Alineacion ADD COLUMN fuente_posicion_inicial TEXT;

-- Backfill seguro: si ya había un titular guardado, su posición pasa a ser la inicial inferida.
-- Los suplentes/convocados quedan a NULL hasta que jueguen o se revise el acta.
UPDATE Alineacion
SET posicion_inicial = posicion,
    fuente_posicion_inicial = 'inferida'
WHERE titular = 1
  AND posicion IS NOT NULL
  AND posicion_inicial IS NULL;
