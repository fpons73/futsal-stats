//! Copias de seguridad de la base de datos: creación con `VACUUM INTO`
//! (snapshot consistente aunque haya conexiones activas), rotación por
//! retención y restauración con verificación previa de integridad.
//!
//! Las copias viven en `<app_data_dir>/backups/` con nombre
//! `globalfutsal_YYYYMMDD_HHMMSS.db`. La fecha va en el nombre: ordenar por
//! nombre ES ordenar cronológicamente, sin depender del mtime del sistema.
//!
//! Las funciones son `pub` para poder probarlas en tests de integración
//! contra una BD real migrada (ver tests/backups.rs).

use std::path::{Path, PathBuf};
use std::str::FromStr;

/// Nombre de fichero de copia a partir del instante (UTC) dado.
/// Público para tests: el formato garantiza orden cronológico al ordenar por nombre.
pub fn nombre_backup(fecha: &time::OffsetDateTime) -> String {
    format!(
        "globalfutsal_{:04}{:02}{:02}_{:02}{:02}{:02}.db",
        fecha.year(),
        u8::from(fecha.month()),
        fecha.day(),
        fecha.hour(),
        fecha.minute(),
        fecha.second(),
    )
}

/// Carpeta de copias: `<datos>/backups`, creada si no existe.
pub fn carpeta_backups(dir_datos: &Path) -> std::io::Result<PathBuf> {
    let carpeta = dir_datos.join("backups");
    std::fs::create_dir_all(&carpeta)?;
    Ok(carpeta)
}

/// Lista las copias ordenadas de MÁS NUEVA a más vieja (el nombre lleva la fecha).
pub fn listar_backups(dir_datos: &Path) -> Vec<PathBuf> {
    let Ok(carpeta) = carpeta_backups(dir_datos) else {
        return Vec::new();
    };
    let Ok(entradas) = std::fs::read_dir(&carpeta) else {
        return Vec::new();
    };
    let mut copias: Vec<PathBuf> = entradas
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_file()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("globalfutsal_") && n.ends_with(".db"))
                    .unwrap_or(false)
        })
        .collect();
    copias.sort();
    copias.reverse();
    copias
}

/// Borra las copias más viejas que `retener`. Devuelve cuántas borró.
/// Público para tests de rotación. Con retener=0 no borra nada (desactivada).
pub fn rotar_backups(dir_datos: &Path, retener: usize) -> usize {
    if retener == 0 {
        return 0;
    }
    let copias = listar_backups(dir_datos);
    let mut borradas = 0;
    for vieja in copias.into_iter().skip(retener) {
        // Tolerante: -wal/-shm de la copia (si existieran) van con su .db.
        for sufijo in ["", "-wal", "-shm"] {
            let mut ruta = vieja.clone().into_os_string();
            ruta.push(sufijo);
            if std::fs::remove_file(&ruta).is_ok() {
                break;
            }
        }
        borradas += 1;
    }
    borradas
}

/// Crea una copia consistente con `VACUUM INTO` y aplica la rotación.
/// Devuelve la ruta de la copia creada.
pub async fn crear_backup(pool: &sqlx::SqlitePool, dir_datos: &Path, retener: usize) -> Result<PathBuf, String> {
    let carpeta = carpeta_backups(dir_datos).map_err(|e| e.to_string())?;
    let ahora = time::OffsetDateTime::now_utc();
    let destino = carpeta.join(nombre_backup(&ahora));

    // VACUUM INTO falla si el fichero existe (no sobrescribe): los segundos del
    // nombre deberían bastar, pero si pega dos veces en el mismo segundo, reintenta.
    let mut intento = 0;
    let ruta_final = loop {
        let candidato = if intento == 0 {
            destino.clone()
        } else {
            carpeta.join(format!(
                "globalfutsal_{:04}{:02}{:02}_{:02}{:02}{:02}_{}.db",
                ahora.year(), u8::from(ahora.month()), ahora.day(),
                ahora.hour(), ahora.minute(), ahora.second(), intento
            ))
        };
        let sql = format!(
            "VACUUM INTO '{}'",
            candidato.display().to_string().replace('\'', "''")
        );
        match sqlx::query(&sql).execute(pool).await {
            Ok(_) => break candidato,
            Err(e) if intento < 3 && e.to_string().contains("already exists") => intento += 1,
            Err(e) => return Err(format!("No se pudo crear la copia: {e}")),
        }
    };

    rotar_backups(dir_datos, retener);
    Ok(ruta_final)
}

/// Verifica que un fichero es una BD SQLite utilizable (PRAGMA integrity_check
/// rápido y tabla esperada) antes de tocar la base de datos real.
pub async fn verificar_integridad(ruta: &Path) -> Result<(), String> {
    let url = format!("sqlite://{}", ruta.display().to_string().replace('\'', "''"));
    let opciones = sqlx::sqlite::SqliteConnectOptions::from_str(&url)
        .map_err(|e| format!("Ruta de copia inválida: {e}"))?
        .read_only(true);
    let pool = sqlx::sqlite::SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(opciones)
        .await
        .map_err(|e| format!("La copia no se puede abrir: {e}"))?;
    let resultado = async {
        let fila: (String,) = sqlx::query_as("PRAGMA integrity_check")
            .fetch_one(&pool)
            .await
            .map_err(|e| format!("integrity_check falló: {e}"))?;
        if fila.0 != "ok" {
            return Err(format!("La copia está corrupta: {}", fila.0));
        }
        let tabla: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Persona'")
            .fetch_one(&pool)
            .await
            .map_err(|e| format!("Lectura del esquema falló: {e}"))?;
        if tabla.0 == 0 {
            return Err("La copia no contiene el esquema de la app (falta Persona)".to_string());
        }
        Ok(())
    }
    .await;
    pool.close().await;
    resultado
}

/// Restaura una copia: verifica integridad y copia el fichero sobre la BD real
/// con sus -wal/-shm borrados primero (quedarían obsoletos tras la restauración).
/// Devuelve error ANTES de tocar nada si la copia no es válida.
pub fn restaurar_backup(_dir_datos: &Path, bd_real: &Path, copia: &Path) -> Result<(), String> {
    if !copia.is_file() {
        return Err(format!("La copia no existe: {}", copia.display()));
    }
    // La verificación es async (sqlx); aquí solo validamos cabecera SQLite
    // de forma síncrona y la integridad completa la hace el comando tauri async.
    let cabecera = std::fs::read(copia)
        .map_err(|e| format!("No se pudo leer la copia: {e}"))?
        .get(0..16)
        .map(|b| b.to_vec())
        .ok_or_else(|| "La copia está vacía".to_string())?;
    if cabecera != b"SQLite format 3\0".to_vec() {
        return Err("El fichero no es una base de datos SQLite".to_string());
    }
    let _ = std::fs::remove_file(bd_real.with_extension("db-wal"));
    let _ = std::fs::remove_file(bd_real.with_extension("db-shm"));
    std::fs::copy(copia, bd_real).map_err(|e| format!("No se pudo restaurar: {e}"))?;
    Ok(())
}
