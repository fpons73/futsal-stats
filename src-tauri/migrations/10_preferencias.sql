-- Migración 10: Tabla de preferencias de usuario

CREATE TABLE IF NOT EXISTS Preferencia (
  clave TEXT PRIMARY KEY,
  valor TEXT
);
