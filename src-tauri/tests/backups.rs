//! Test de integración del ciclo de copias de seguridad (tarea 1.3) contra una
//! BD real con todas las migraciones aplicadas: crear (VACUUM INTO) → listar →
//! rotación por retención → restaurar. Limpieza con el mismo estilo de guardián
//! Drop del arnés de migraciones (éxito y pánico).

use futsal_stats_lib::backups;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use std::path::PathBuf;
use std::str::FromStr;

/// Guardián del directorio temporal del test: lo borra en éxito y en pánico.
struct GuardiaDir {
    rutas: Vec<PathBuf>,
}

impl Drop for GuardiaDir {
    fn drop(&mut self) {
        for ruta in &self.rutas {
            let _ = std::fs::remove_dir_all(ruta);
        }
    }
}

/// BD migrada real en un directorio temporal propio (simula app_data_dir).
/// Devuelve (pool, directorio_datos, guardia).
async fn bd_migrada(nombre: &str) -> (sqlx::SqlitePool, PathBuf, GuardiaDir) {
    let dir = std::env::temp_dir().join(format!("futsal_bk_{}_{}", nombre, std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("crear dir temporal");
    let guardia = GuardiaDir { rutas: vec![dir.clone()] };

    let ruta_bd = dir.join("globalfutsal.db");
    let opciones = SqliteConnectOptions::from_str(&format!("sqlite://{}", ruta_bd.display()))
        .expect("URL sqlite válida")
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .connect_with(opciones)
        .await
        .expect("conectar BD de prueba");

    let migrator = sqlx::migrate!("./migrations");
    migrator
        .run(&mut pool.acquire().await.expect("conexión libre"))
        .await
        .expect("migraciones aplicadas");

    (pool, dir, guardia)
}

#[tokio::test]
async fn ciclo_completo_crear_listar_rotar_restaurar() {
    let (pool, dir_datos, _guardia) = bd_migrada("ciclo").await;

    // Dato canario que debe sobrevivir a la restauración.
    sqlx::query("INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('PaisCanarioBackup', 'PX', 'PXX')")
        .execute(&pool)
        .await
        .expect("insertar canario");

    // 1. Crear copia.
    let ruta = backups::crear_backup(&pool, &dir_datos, 3)
        .await
        .expect("crear backup");
    assert!(ruta.is_file(), "la copia debe existir: {}", ruta.display());

    // 2. Listar: la más nueva primero y con el nombre con fecha.
    let copias = backups::listar_backups(&dir_datos);
    assert_eq!(copias.len(), 1);
    assert_eq!(copias[0], ruta);

    // 3. Rotación: crear 2 más con retención 3 → siguen 3; una cuarta → borra la más vieja.
    //    Para generar nombres distintos sin esperar segundos, rotamos manualmente
    //    copias renombradas con fechas sintéticas.
    let carpeta = backups::carpeta_backups(&dir_datos).expect("carpeta backups");
    for sufijo in ["20250101_000001", "20250102_000001", "20250103_000001"] {
        std::fs::copy(&ruta, carpeta.join(format!("globalfutsal_{}.db", sufijo)))
            .expect("copiar sintética");
    }
    // Con retención 3 y 4 copias (la real de hoy + 3 sintéticas), rotar debe borrar 1.
    let borradas = backups::rotar_backups(&dir_datos, 3);
    assert_eq!(borradas, 1, "la más vieja (20250101) debe borrarse");
    assert!(!carpeta.join("globalfutsal_20250101_000001.db").exists());
    assert!(carpeta.join("globalfutsal_20250103_000001.db").exists());
    assert_eq!(backups::listar_backups(&dir_datos).len(), 3);

    // 4. Restaurar: dañar la BD real (borrar el canario) y recuperar la copia.
    sqlx::query("DELETE FROM Pais WHERE nombre = 'PaisCanarioBackup'")
        .execute(&pool)
        .await
        .expect("borrar canario");
    pool.close().await;

    // Integridad de la copia antes de tocar nada.
    backups::verificar_integridad(&ruta)
        .await
        .expect("la copia debe pasar integrity_check");

    let ruta_bd = dir_datos.join("globalfutsal.db");
    backups::restaurar_backup(&dir_datos, &ruta_bd, &ruta).expect("restaurar copia");

    // Reabrir y verificar que el canario volvió.
    let pool2 = SqlitePoolOptions::new()
        .connect_with(
            SqliteConnectOptions::from_str(&format!("sqlite://{}", ruta_bd.display()))
                .expect("URL válida"),
        )
        .await
        .expect("reabrir BD restaurada");
    let fila: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM Pais WHERE nombre = 'PaisCanarioBackup'")
        .fetch_one(&pool2)
        .await
        .expect("consultar canario");
    assert_eq!(fila.0, 1, "el canario debe sobrevivir a la restauración");
    let integridad: (String,) = sqlx::query_as("PRAGMA integrity_check")
        .fetch_one(&pool2)
        .await
        .expect("integrity_check");
    assert_eq!(integridad.0, "ok");
    pool2.close().await;
}

#[tokio::test]
async fn restaurar_rechaza_ficheros_que_no_son_copias() {
    let (pool, dir_datos, _guardia) = bd_migrada("rechazo").await;
    pool.close().await;

    // Fichero basura con nombre de copia válida: la cabecera SQLite lo delata.
    let carpeta = backups::carpeta_backups(&dir_datos).expect("carpeta");
    let basura = carpeta.join("globalfutsal_20250101_000000.db");
    std::fs::write(&basura, b"esto no es una base de datos").expect("escribir basura");

    assert!(backups::verificar_integridad(&basura).await.is_err());
    let ruta_bd = dir_datos.join("globalfutsal.db");
    assert!(backups::restaurar_backup(&dir_datos, &ruta_bd, &basura).is_err());
    // La BD real sigue intacta (no se llegó a tocar).
    assert!(ruta_bd.is_file());
}

#[tokio::test]
async fn rotacion_con_cero_no_borra_nada() {
    let (_pool, dir_datos, _guardia) = bd_migrada("cero").await;
    let carpeta = backups::carpeta_backups(&dir_datos).expect("carpeta");
    std::fs::write(carpeta.join("globalfutsal_20250101_000000.db"), b"x").expect("copia fake");
    assert_eq!(backups::rotar_backups(&dir_datos, 0), 0);
    assert_eq!(backups::listar_backups(&dir_datos).len(), 1);
}
