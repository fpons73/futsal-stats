-- Migración 8: Tabla de formaciones de futsal

CREATE TABLE IF NOT EXISTS Formacion (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL
);

-- Insertar formaciones de futsal (5 jugadores: 1 portero + 4 campo)
INSERT INTO Formacion (nombre) VALUES ('1-3-1');
INSERT INTO Formacion (nombre) VALUES ('1-2-1-1');
INSERT INTO Formacion (nombre) VALUES ('1-1-2-1');
INSERT INTO Formacion (nombre) VALUES ('1-3-1-0');
INSERT INTO Formacion (nombre) VALUES ('1-2-2');
INSERT INTO Formacion (nombre) VALUES ('1-1-3');
INSERT INTO Formacion (nombre) VALUES ('1-4-0');
INSERT INTO Formacion (nombre) VALUES ('1-0-4');
