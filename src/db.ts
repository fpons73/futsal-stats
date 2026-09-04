import Database from "@tauri-apps/plugin-sql";

const DB_NAME = "sqlite:globalfutsal.db";

export async function iniciarBaseDeDatos() {
  try {
    const db = await Database.load(DB_NAME);

    // Migraciones ALTER TABLE que pueden fallar si ya existen (idempotentes)
    const migraciones = [
      // Columnas de tiempo
      "ALTER TABLE Partido ADD COLUMN descuento_1 INTEGER DEFAULT 0",
      "ALTER TABLE Partido ADD COLUMN descuento_2 INTEGER DEFAULT 0",
      "ALTER TABLE Evento ADD COLUMN minuto_extra INTEGER DEFAULT 0",
      // Estadisticas extendidas de equipo
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN pases_totales INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN pases_precisos INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN centros_totales INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN centros_buenos INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN entradas_totales INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN entradas_ganadas INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN despejes INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN intercepciones INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN recuperaciones INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN duelos_ganados INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN duelos_perdidos INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN paradas INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN saques_banda INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN faltas_recibidas INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN balones_perdidos INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN saques_puerta INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN punos INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN faltas_acumulativas INTEGER DEFAULT 0",
      "ALTER TABLE EstadisticaPartidoEquipo ADD COLUMN puntos_sofa REAL DEFAULT 0.0",
      // Partido extendido
      "ALTER TABLE Partido ADD COLUMN goles_1_prorroga_local INTEGER DEFAULT 0",
      "ALTER TABLE Partido ADD COLUMN goles_1_prorroga_visitante INTEGER DEFAULT 0",
      "ALTER TABLE Partido ADD COLUMN goles_2_prorroga_local INTEGER DEFAULT 0",
      "ALTER TABLE Partido ADD COLUMN goles_2_prorroga_visitante INTEGER DEFAULT 0",
      "ALTER TABLE Partido ADD COLUMN formacion_local TEXT DEFAULT ''",
      "ALTER TABLE Partido ADD COLUMN formacion_visitante TEXT DEFAULT ''",
      "ALTER TABLE Partido ADD COLUMN metadata TEXT",
      // Rating en alineacion
      "ALTER TABLE Alineacion ADD COLUMN rating REAL DEFAULT 0",
      // Mejoras adicionales
      "ALTER TABLE Equipo ADD COLUMN equipo_principal_id INTEGER",
      "ALTER TABLE Competicion ADD COLUMN color1 TEXT",
      "ALTER TABLE Competicion ADD COLUMN color2 TEXT",
      "ALTER TABLE Competicion ADD COLUMN ambito TEXT DEFAULT 'Clubes'",
      "ALTER TABLE Estadio ADD COLUMN anio_construccion INTEGER",
      "ALTER TABLE Estadio ADD COLUMN dimensiones TEXT",
    ];

    for (const sql of migraciones) {
      try {
        await db.execute(sql);
      } catch (e) {
        // Ignorar si la columna ya existe
      }
    }

    // Crear tabla Formacion si no existe e insertar formaciones de futsal
    try {
      await db.execute("CREATE TABLE IF NOT EXISTS Formacion (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL)");
      const conteo = await db.select<any[]>("SELECT count(*) as c FROM Formacion");
      if (conteo[0].c === 0) {
        const tacticas = ["1-3-1", "1-2-1-1", "1-1-2-1", "1-3-1-0", "1-2-2", "1-1-3", "1-4-0", "1-0-4"];
        for (const t of tacticas) {
          await db.execute("INSERT INTO Formacion (nombre) VALUES (?)", [t]);
        }
      }
    } catch (e) {
      console.error("Error al crear/insertar formaciones:", e);
    }

    // Crear tabla Preferencia si no existe
    try {
      await db.execute("CREATE TABLE IF NOT EXISTS Preferencia (clave TEXT PRIMARY KEY, valor TEXT)");
    } catch (e) {
      console.error("Error al crear tabla Preferencia:", e);
    }

    // Auto-catalogar competiciones por ambito (Clubes/Selecciones)
    try {
      await db.execute("UPDATE Competicion SET ambito = 'Clubes' WHERE ambito IS NULL");
      const palabrasSeleccion = [
        "Mundial", "Eurocopa", "Euro Futsal", "Copa America", "Copa América",
        "Nations League", "Asian Cup", "Gold Cup", "Confederaciones",
        "Juegos Olimpicos", "Juegos Olímpicos", "Selecciones", "Eliminatorias"
      ];
      for (const p of palabrasSeleccion) {
        await db.execute("UPDATE Competicion SET ambito = 'Selecciones' WHERE nombre LIKE ?", [`%${p}%`]);
      }
    } catch (e) {
      // Ignorar
    }

    console.log("Base de datos iniciada correctamente.");
    return db;
  } catch (error) {
    console.error("Error al iniciar la BD:", error);
    throw error;
  }
}

export async function getPreferencia(clave: string, valorDefecto: string = ""): Promise<string> {
  try {
    const db = await Database.load(DB_NAME);
    await db.execute("CREATE TABLE IF NOT EXISTS Preferencia (clave TEXT PRIMARY KEY, valor TEXT)");
    const rows = await db.select<{ valor: string }[]>("SELECT valor FROM Preferencia WHERE clave = ?", [clave]);
    if (rows && rows.length > 0 && rows[0].valor !== null && rows[0].valor !== undefined) {
      return rows[0].valor;
    }
    const localVal = typeof window !== "undefined" ? localStorage.getItem(clave) : null;
    if (localVal !== null && localVal !== "") {
      await db.execute("INSERT OR REPLACE INTO Preferencia (clave, valor) VALUES (?, ?)", [clave, localVal]);
      return localVal;
    }
    return valorDefecto;
  } catch (e) {
    console.error(`Error al obtener preferencia ${clave}:`, e);
    return typeof window !== "undefined" ? (localStorage.getItem(clave) || valorDefecto) : valorDefecto;
  }
}

export async function setPreferencia(clave: string, valor: string): Promise<void> {
  try {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(clave, valor);
      } catch {}
    }
    const db = await Database.load(DB_NAME);
    await db.execute("CREATE TABLE IF NOT EXISTS Preferencia (clave TEXT PRIMARY KEY, valor TEXT)");
    await db.execute("INSERT OR REPLACE INTO Preferencia (clave, valor) VALUES (?, ?)", [clave, valor]);
  } catch (e) {
    console.error(`Error al guardar preferencia ${clave}:`, e);
  }
}
