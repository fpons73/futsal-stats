-- Migración 13: normalizar Persona.roles al formato plano canónico.
--
-- Historia: las seeds y pantallas antiguas escribían arrays JSON
-- (["Jugador"], ["Arbitro"], ...) y alguna ruta escribía en minúscula
-- ('jugador'). Las queries de la app filtran con LIKE '%Entrenador%'
-- (insensible a caso), así que funcionaba, pero el dato quedaba
-- inconsistente y cualquier comparación exacta se rompía.
--
-- Canónico: 'Jugador' | 'Entrenador' | 'Arbitro' (texto plano, sin JSON).
-- La columna es NOT NULL en el esquema (no hay NULL que preservar); las
-- sentencias son idempotentes y tolerantes a NULL por si el esquema cambia.
--
-- 1) Arrays JSON: extrae el rol y canoniciza. En arrays de varios elementos
--    (caso histórico raro) se conserva el rol de mayor jerarquía conocido.
UPDATE Persona
SET roles = CASE
    WHEN TRIM(roles) LIKE '%","%' THEN
        CASE
            WHEN TRIM(roles) LIKE '%Entrenador%' THEN 'Entrenador'
            WHEN TRIM(roles) LIKE '%Arbitro%'    THEN 'Arbitro'
            WHEN TRIM(roles) LIKE '%Jugador%'    THEN 'Jugador'
            ELSE TRIM(roles) -- contenido desconocido: no tocar (visible para auditoría)
        END
    ELSE REPLACE(REPLACE(REPLACE(TRIM(roles), '[', ''), ']', ''), '"', '')
END
WHERE TRIM(roles) LIKE '[%' AND TRIM(roles) LIKE '%]';

-- 2) Variantes de caso (incluye lo que el paso 1 pudo dejar en minúscula).
UPDATE Persona SET roles = 'Jugador'
WHERE LOWER(TRIM(roles)) = 'jugador' AND roles <> 'Jugador';

UPDATE Persona SET roles = 'Entrenador'
WHERE LOWER(TRIM(roles)) = 'entrenador' AND roles <> 'Entrenador';

UPDATE Persona SET roles = 'Arbitro'
WHERE (LOWER(TRIM(roles)) = 'arbitro' OR TRIM(roles) IN ('Árbitro', 'árbitro', 'ÁRBITRO'))
  AND roles <> 'Arbitro';
