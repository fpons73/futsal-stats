import Database from "@tauri-apps/plugin-sql";

const DB_NAME = "sqlite:globalfutsal.db";

export async function iniciarBaseDeDatos() {
  try {
    const db = await Database.load(DB_NAME);

    // NOTA: el esquema lo gestionan EXCLUSIVAMENTE las migraciones Rust
    // (src-tauri/migrations/*.sql, ejecutadas por tauri-plugin-sql en el load).
    // No añadir ALTER TABLE aquí: duplicar DDL entre frontend y migraciones
    // provoca deriva de esquema y fallos de checksum al arrancar.

    // Crear tabla Formacion si no existe e insertar formaciones de futsal
    // (red de seguridad idempotente; la vía canónica es la migración 8)
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

/** ¿Base de datos recién creada? True si no hay ni una Persona ni un Equipo.
 *  Decide si la app muestra el asistente de primera ejecución (Onboarding). */
export async function esBaseVacia(): Promise<boolean> {
  try {
    const db = await Database.load(DB_NAME);
    const rows = await db.select<{ p: number; e: number }[]>(
      "SELECT (SELECT COUNT(*) FROM Persona) AS p, (SELECT COUNT(*) FROM Equipo) AS e"
    );
    return (rows[0]?.p ?? 0) === 0 && (rows[0]?.e ?? 0) === 0;
  } catch (e) {
    // Si no podemos consultar, no bloqueamos el arranque con el onboarding.
    console.error("Error comprobando si la BD está vacía:", e);
    return false;
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
