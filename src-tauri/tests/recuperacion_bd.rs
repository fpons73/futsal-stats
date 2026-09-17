//! Test de integración de la recuperación de BD corrupta (tarea 1.4):
//! una BD migrada se corrompe a mano, `verificar_integridad` la delata y la
//! restauración de la última copia devuelve el esquema y los datos.

use futsal_stats_lib::backups;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use sqlx::Executor;
use std::path::PathBuf;
use std::str::FromStr;

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

#[tokio::test]
async fn bd_corrupta_se_detecta_y_se_recupera_desde_copia() {
    let dir = std::env::temp_dir().join(format!("futsal_rec_{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("dir temporal");
    let _guardia = GuardiaDir { rutas: vec![dir.clone()] };

    // 1. BD real migrada con un dato canario.
    let ruta_bd = dir.join("globalfutsal.db");
    let opciones = SqliteConnectOptions::from_str(&format!("sqlite://{}", ruta_bd.display()))
        .expect("URL válida")
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);
    let pool = SqlitePoolOptions::new()
        .connect_with(opciones)
        .await
        .expect("conectar");
    sqlx::migrate!("./migrations")
        .run(&mut pool.acquire().await.expect("conexión libre"))
        .await
        .expect("migraciones");
    sqlx::query("INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('CanarioRecuperacion', 'QX', 'QXX')")
        .execute(&pool)
        .await
        .expect("canario");

    // 2. Copia de seguridad del estado sano (como haría la copia diaria),
    //    con el pool todavía vivo; después ya se puede cerrar.
    let copia = backups::crear_backup(&pool, &dir, 3).await.expect("crear copia");
    assert!(copia.is_file());
    backups::verificar_integridad(&copia).await.expect("copia sana");
    pool.close().await;

    // 3. Corromper la BD real: machacar bytes centrales del fichero (respetando
    //    la cabecera de 16 bytes para que siga "pareciendo" SQLite, como en los
    //    casos reales de corrupción por corte de luz/disco lleno).
    {
        let mut bytes = std::fs::read(&ruta_bd).expect("leer bd");
        assert!(bytes.len() > 4096, "bd con contenido suficiente");
        for byte in bytes[512..4096].iter_mut() {
            *byte = 0xDE;
        }
        std::fs::write(&ruta_bd, bytes).expect("escribir bd corrupta");
    }

    // 4. El diagnóstico (lo que hace el comando diagnosticar_bd) la delata.
    assert!(
        backups::verificar_integridad(&ruta_bd).await.is_err(),
        "la BD dañada debe fallar el integrity_check"
    );

    // 5. Restauración de la última copia (borrando -wal/-shm obsoletos, como el comando).
    let _ = std::fs::remove_file(ruta_bd.with_extension("db-wal"));
    let _ = std::fs::remove_file(ruta_bd.with_extension("db-shm"));
    backups::restaurar_backup(&dir, &ruta_bd, &copia).expect("restaurar");

    // 6. La BD recuperada abre, integrity_check ok y el canario sobrevive.
    let pool2 = SqlitePoolOptions::new()
        .connect_with(
            SqliteConnectOptions::from_str(&format!("sqlite://{}", ruta_bd.display()))
                .expect("URL válida"),
        )
        .await
        .expect("reabrir BD recuperada");
    let ok: (String,) = sqlx::query_as("PRAGMA integrity_check")
        .fetch_one(&pool2)
        .await
        .expect("integrity_check");
    assert_eq!(ok.0, "ok");
    let canario: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM Pais WHERE nombre = 'CanarioRecuperacion'",
    )
    .fetch_one(&pool2)
    .await
    .expect("contar canario");
    assert_eq!(canario.0, 1, "el canario debe sobrevivir a la recuperación");
    let esquema: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='Persona'",
    )
    .fetch_one(&pool2)
    .await
    .expect("esquema");
    assert_eq!(esquema.0, 1);
    pool2.close().await;
}
