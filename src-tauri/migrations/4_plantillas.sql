CREATE TABLE Plantilla (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edicion_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  persona_id INTEGER NOT NULL,
  dorsal INTEGER,
  rol TEXT NOT NULL, -- 'Jugador' o 'Entrenador'
  activo INTEGER DEFAULT 1,
  FOREIGN KEY(edicion_id) REFERENCES Edicion(id) ON DELETE CASCADE,
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id) ON DELETE CASCADE,
  FOREIGN KEY(persona_id) REFERENCES Persona(id) ON DELETE CASCADE
);