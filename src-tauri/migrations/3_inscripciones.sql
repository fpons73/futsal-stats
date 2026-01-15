CREATE TABLE Inscripcion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edicion_id INTEGER NOT NULL,
  equipo_id INTEGER NOT NULL,
  grupo TEXT, -- Por si en el futuro quieres dividir por grupos A/B
  activo INTEGER DEFAULT 1,
  FOREIGN KEY(edicion_id) REFERENCES Edicion(id) ON DELETE CASCADE,
  FOREIGN KEY(equipo_id) REFERENCES Equipo(id) ON DELETE CASCADE
);