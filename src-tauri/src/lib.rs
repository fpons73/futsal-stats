use tauri::Manager;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

pub mod backups;

/// Nombre del fichero de base de datos (misma cadena que el plugin SQL).
const NOMBRE_BD: &str = "globalfutsal.db";
/// Preferencia con el número de copias a conservar (0 = rotación desactivada).
const CLAVE_PREF_RETENCION_BACKUPS: &str = "backups_retencion";
/// Preferencia con la fecha (YYYY-MM-DD) del último backup automático diario.
const CLAVE_PREF_ULTIMO_BACKUP: &str = "backups_ultimo_dia";
/// Retención por defecto si la preferencia no existe o es inválida.
const RETENCION_DEFECTO: usize = 7;

/// Retención configurada (con tope sanitario 1..=365).
fn retencion_desde_pref(valor: Option<&str>) -> usize {
    valor
        .and_then(|v| v.parse::<usize>().ok())
        .filter(|n| (1..=365).contains(n))
        .unwrap_or(RETENCION_DEFECTO)
}

/// Lee una preferencia de texto desde el pool del plugin SQL.
async fn leer_pref(pool: &sqlx::SqlitePool, clave: &str) -> Option<String> {
    let fila: Option<(Option<String>,)> =
        sqlx::query_as("SELECT valor FROM Preferencia WHERE clave = ?1")
            .bind(clave)
            .fetch_optional(pool)
            .await
            .ok()?;
    fila.and_then(|(v,)| v)
}

/// Escribe una preferencia de texto en el pool del plugin SQL.
async fn escribir_pref(pool: &sqlx::SqlitePool, clave: &str, valor: &str) -> Result<(), String> {
    sqlx::query("INSERT OR REPLACE INTO Preferencia (clave, valor) VALUES (?1, ?2)")
        .bind(clave)
        .bind(valor)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Backup automático diario en el arranque (tarea 1.3 del hito 1.0).
/// Silencioso: si algo falla, solo log — nunca bloquea el arranque.
async fn backup_diario_si_toca(pool: sqlx::SqlitePool, dir_datos: std::path::PathBuf) {
    let hoy = time::OffsetDateTime::now_utc().date().to_string(); // YYYY-MM-DD
    let ultimo = leer_pref(&pool, CLAVE_PREF_ULTIMO_BACKUP).await;
    if ultimo.as_deref() == Some(hoy.as_str()) {
        return; // ya hay copia hoy
    }
    let retencion = retencion_desde_pref(
        leer_pref(&pool, CLAVE_PREF_RETENCION_BACKUPS).await.as_deref(),
    );
    match backups::crear_backup(&pool, &dir_datos, retencion).await {
        Ok(ruta) => {
            if let Err(e) = escribir_pref(&pool, CLAVE_PREF_ULTIMO_BACKUP, &hoy).await {
                eprintln!("[backups] copia creada ({}) pero no se pudo registrar el día: {e}", ruta.display());
            } else {
                eprintln!("[backups] copia diaria creada: {}", ruta.display());
            }
        }
        Err(e) => eprintln!("[backups] no se pudo crear la copia diaria: {e}"),
    }
}

/// Carpeta de datos por defecto SOLO en compilaciones de desarrollo (`npm run tauri dev`).
/// En producción no existe: el usuario configura su carpeta en Configuración y queda
/// guardada en la tabla Preferencia; el arranque la aplica si existe.
#[cfg(debug_assertions)]
const CARPETA_DATOS_DEV: &str = env!("CARGO_MANIFEST_DIR"); // src-tauri → se normaliza a la raíz del proyecto en setup

/// Clave de la preferencia donde vive la carpeta de datos configurada.
pub const CLAVE_PREF_CARPETA_DATOS: &str = "carpeta_datos";

/// Añade la carpeta (recursiva) al alcance fs del plugin-fs y al del protocolo de
/// assets (fotos/banderas/escudos mostrados vía convertFileSrc). Idempotente.
fn extender_alcances<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    carpeta: &std::path::Path,
) -> Result<(), String> {
    use tauri_plugin_fs::FsExt;

    validar_carpeta(carpeta)?;

    app.fs_scope()
        .allow_directory(carpeta, true)
        .map_err(|e| format!("No se pudo ampliar el alcance fs: {e}"))?;

    // El protocolo de assets (fotos/banderas/escudos vía convertFileSrc) está
    // siempre activo en esta app (feature protocol-asset de tauri en Cargo.toml).
    app.asset_protocol_scope()
        .allow_directory(carpeta, true)
        .map_err(|e| format!("No se pudo ampliar el alcance del protocolo de assets: {e}"))?;

    Ok(())
}

/// Valida que la carpeta configurable exista y sea un directorio.
fn validar_carpeta(carpeta: &std::path::Path) -> Result<(), String> {
    if !carpeta.is_dir() {
        return Err(format!("La carpeta no existe: {}", carpeta.display()));
    }
    Ok(())
}

/// ¿Puede el scope actual leer esta ruta? (diagnóstico desde la UI)
#[tauri::command]
fn es_carpeta_alcanzable(app: tauri::AppHandle, ruta: String) -> bool {
    use tauri_plugin_fs::FsExt;
    app.fs_scope().is_allowed(std::path::Path::new(&ruta))
}

/// Amplía el alcance fs/assets con la carpeta indicada desde la UI (Configuración).
#[tauri::command]
fn extender_alcance_fs(app: tauri::AppHandle, carpeta: String) -> Result<(), String> {
    extender_alcances(&app, std::path::Path::new(&carpeta))
}

// --- Copias de seguridad (tarea 1.3 del hito 1.0) ---

/// Ruta de la BD real del plugin SQL (app_data_dir/globalfutsal.db).
fn ruta_bd_real(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join(NOMBRE_BD))
}

/// Crea una copia ahora (VACUUM INTO) y aplica la rotación. Devuelve la ruta.
#[tauri::command]
async fn crear_backup_bd(
    app: tauri::AppHandle,
    db_instances: State<'_, DbInstances>,
) -> Result<String, String> {
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get("sqlite:globalfutsal.db") {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("No se encontró la base de datos activa".to_string()),
        }
    };
    let dir_datos = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let retencion = retencion_desde_pref(
        leer_pref(&pool, CLAVE_PREF_RETENCION_BACKUPS).await.as_deref(),
    );
    let ruta = backups::crear_backup(&pool, &dir_datos, retencion).await?;
    Ok(ruta.display().to_string())
}

/// Lista las copias disponibles: { ruta, nombre, bytes, fecha }.
#[tauri::command]
async fn listar_backups_bd(app: tauri::AppHandle) -> Result<Vec<BackupInfo>, String> {
    let dir_datos = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(backups::listar_backups(&dir_datos)
        .into_iter()
        .filter_map(|ruta| {
            let nombre = ruta.file_name()?.to_string_lossy().to_string();
            let meta = std::fs::metadata(&ruta).ok()?;
            // globalfutsal_YYYYMMDD_HHMMSS.db → YYYY-MM-DD HH:MM:SS
            // ("globalfutsal_" = 13 chars; luego fecha 8, '_', hora 6, ".db")
            let seg = |a: usize, b: usize| nombre.get(a..b).unwrap_or("??").to_string();
            let fecha = format!(
                "{}-{}-{} {}:{}:{}",
                seg(13, 17), seg(17, 19), seg(19, 21), seg(22, 24), seg(24, 26), seg(26, 28)
            );
            Some(BackupInfo {
                ruta: ruta.display().to_string(),
                nombre,
                bytes: meta.len(),
                fecha,
            })
        })
        .collect())
}

/// Copia de seguridad disponible en la lista.
#[derive(serde::Serialize)]
struct BackupInfo {
    ruta: String,
    nombre: String,
    bytes: u64,
    fecha: String,
}

/// Restaura una copia tras verificar su integridad completa (async).
/// El frontend reinicia la app después: el pool del plugin debe reabrir la BD.
#[tauri::command]
async fn restaurar_backup_bd(
    app: tauri::AppHandle,
    db_instances: State<'_, DbInstances>,
    ruta_copia: String,
) -> Result<(), String> {
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get("sqlite:globalfutsal.db") {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("No se encontró la base de datos activa".to_string()),
        }
    };
    let copia = std::path::PathBuf::from(&ruta_copia);
    // Solo se restauran copias firmadas por la propia app (nombre con fecha).
    let nombre = copia
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("Ruta de copia inválida")?;
    if !nombre.starts_with("globalfutsal_") || !nombre.ends_with(".db") {
        return Err("El fichero no es una copia de esta aplicación".to_string());
    }
    backups::verificar_integridad(&copia).await?;
    // Cerrar el pool ANTES de sobrescribir la BD (en Windows el fichero está agarrado).
    pool.close().await;
    let bd_real = ruta_bd_real(&app)?;
    backups::restaurar_backup(
        bd_real.parent().ok_or("sin directorio de datos")?,
        &bd_real,
        &copia,
    )
}

/// Diagnóstico de la BD real (tarea 1.4): ¿abre? ¿integrity_check ok? ¿esquema
/// presente? Lo llama el frontend cuando iniciarBaseDeDatos falla, para decidir
/// si ofrece restaurar la última copia. No requiere el pool del plugin (que es
/// justo lo que falla): abre la BD directamente en solo lectura.
#[tauri::command]
async fn diagnosticar_bd(app: tauri::AppHandle) -> Result<DiagnosticoBd, String> {
    let bd_real = ruta_bd_real(&app)?;
    if !bd_real.is_file() {
        return Ok(DiagnosticoBd {
            existe: false,
            integridad: "fichero-ausente".to_string(),
            esquema_ok: false,
            ultima_copia: backups::listar_backups(
                bd_real.parent().ok_or("sin directorio de datos")?,
            )
            .first()
            .map(|p| p.display().to_string()),
        });
    }
    let (integridad, esquema_ok) = match backups::verificar_integridad(&bd_real).await {
        Ok(()) => ("ok".to_string(), true),
        Err(e) => (e, false),
    };
    Ok(DiagnosticoBd {
        existe: true,
        integridad,
        esquema_ok,
        ultima_copia: backups::listar_backups(
            bd_real.parent().ok_or("sin directorio de datos")?,
        )
        .first()
        .map(|p| p.display().to_string()),
    })
}

/// Resultado del diagnóstico de la BD real.
#[derive(serde::Serialize)]
struct DiagnosticoBd {
    existe: bool,
    integridad: String,
    esquema_ok: bool,
    /// Ruta de la copia más reciente, si la hay (para ofrecer restauración).
    ultima_copia: Option<String>,
}

/// Guarda la retención de copias (1..=365; 0 no permitido aquí) y rota al momento.
#[tauri::command]
async fn guardar_retencion_backups(
    app: tauri::AppHandle,
    db_instances: State<'_, DbInstances>,
    retener: i64,
) -> Result<usize, String> {
    if !(1..=365).contains(&retener) {
        return Err("La retención debe estar entre 1 y 365".to_string());
    }
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get("sqlite:globalfutsal.db") {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("No se encontró la base de datos activa".to_string()),
        }
    };
    escribir_pref(&pool, CLAVE_PREF_RETENCION_BACKUPS, &retener.to_string()).await?;
    let dir_datos = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(backups::rotar_backups(&dir_datos, retener as usize))
}

/// Lee la carpeta de datos configurada (Preferencia.carpeta_datos).
#[tauri::command]
async fn leer_carpeta_datos(
    db_instances: State<'_, DbInstances>,
) -> Result<Option<String>, String> {
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get("sqlite:globalfutsal.db") {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("No se encontró la base de datos activa".to_string()),
        }
    };
    let fila: Option<(String,)> = sqlx::query_as("SELECT valor FROM Preferencia WHERE clave = ?1")
        .bind(CLAVE_PREF_CARPETA_DATOS)
        .fetch_optional(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(fila.map(|(v,)| v))
}

/// Persiste la carpeta de datos en Preferencia y amplía los alcances al momento.
#[tauri::command]
async fn guardar_carpeta_datos(
    app: tauri::AppHandle,
    db_instances: State<'_, DbInstances>,
    carpeta: String,
) -> Result<(), String> {
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get("sqlite:globalfutsal.db") {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("No se encontró la base de datos activa".to_string()),
        }
    };
    // Validar y extender ANTES de persistir: una carpeta inválida o inexistente
    // nunca debe quedar guardada en Preferencia (antes se persistía primero y
    // una carpeta mala quedaba en la BD aunque el comando devolviera error).
    extender_alcances(&app, std::path::Path::new(&carpeta))?;

    sqlx::query("INSERT OR REPLACE INTO Preferencia (clave, valor) VALUES (?1, ?2)")
        .bind(CLAVE_PREF_CARPETA_DATOS)
        .bind(&carpeta)
        .execute(&pool)
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Lista única de migraciones de la app. La usa `run()` para el arranque real
/// y el test de integración `tests/migraciones.rs` para aplicarlas a una BD
/// virgen y detectar migraciones rotas antes de llegar a producción.
pub fn migraciones() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_initial_tables",
            sql: include_str!("../migrations/1_init.sql"),
            kind: MigrationKind::Up,
        },
        // --- AÑADE ESTO ---
        Migration {
            version: 2,
            description: "create_designaciones",
            sql: include_str!("../migrations/2_designaciones.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "create_inscripciones",
            sql: include_str!("../migrations/3_inscripciones.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "create_plantillas",
            sql: include_str!("../migrations/4_plantillas.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "add_edicion_nombre",
            sql: include_str!("../migrations/5_edicion_nombre.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add_partido_arbitros",
            sql: include_str!("../migrations/6_partido_arbitros.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "estadisticas_partido",
            sql: include_str!("../migrations/7_estadisticas_partido.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "formaciones_futsal",
            sql: include_str!("../migrations/8_formaciones_futsal.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "estadistica_jugador",
            sql: include_str!("../migrations/9_estadistica_jugador.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "preferencias",
            sql: include_str!("../migrations/10_preferencias.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "mejoras_adicionales",
            sql: include_str!("../migrations/11_mejoras_adicionales.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "posicion_inicial_alineacion",
            sql: include_str!("../migrations/12_posicion_inicial.sql"),
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "normalizar_roles_persona",
            sql: include_str!("../migrations/13_normalizar_roles.sql"),
            kind: MigrationKind::Up,
        },
    ]
}

pub fn run() {
    let migrations = migraciones();

    tauri::Builder::default()
        // 1. Plugin de Base de Datos
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:globalfutsal.db", migrations)
                .build(),
        )
        // 2. Plugin de Archivos (FS) <-- NUEVO
        .plugin(tauri_plugin_fs::init())
        // 3. Plugin de Diálogos (Abrir archivos) <-- NUEVO
        .plugin(tauri_plugin_dialog::init())
        // 4. Plugin base
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_html,
            guardar_acta_transaccion,
            leer_carpeta_datos,
            guardar_carpeta_datos,
            extender_alcance_fs,
            es_carpeta_alcanzable,
            crear_backup_bd,
            listar_backups_bd,
            restaurar_backup_bd,
            guardar_retencion_backups,
            diagnosticar_bd
        ])
        .setup(|app| {
            // En desarrollo, la raíz del proyecto (donde vive Futsal_Data/) está
            // permitida de serie para que la app "solo funcione" al hacer npm run tauri dev.
            // En producción, la carpeta configurada por el usuario se aplica desde el
            // frontend justo tras iniciar la BD (ver src/utils/carpetaDatos.ts).
            #[cfg(debug_assertions)]
            {
                let raiz = std::path::Path::new(CARPETA_DATOS_DEV)
                    .parent()
                    .expect("src-tauri tiene carpeta padre");
                if let Err(e) = extender_alcances(app.handle(), raiz) {
                    eprintln!("[dev] No se pudo permitir la carpeta del proyecto: {e}");
                }
            }

            // Backup automático diario (tarea 1.3): una vez el plugin SQL haya
            // registrado la BD y ejecutado las migraciones. Se lanza en segundo
            // plano y reintenta unos segundos hasta ver la BD activa.
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut pool = None;
                for _ in 0..15 {
                    let db_instances = handle.state::<DbInstances>();
                    let instances = db_instances.0.read().await;
                    if let Some(DbPool::Sqlite(p)) = instances.get("sqlite:globalfutsal.db") {
                        pool = Some(p.clone());
                    }
                    drop(instances);
                    if pool.is_some() {
                        break;
                    }
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                }
                let Some(p) = pool else {
                    eprintln!("[backups] BD no disponible al arrancar; sin copia diaria");
                    return;
                };
                let dir_datos = match handle.path().app_data_dir() {
                    Ok(d) => d,
                    Err(e) => {
                        eprintln!("[backups] sin app_data_dir: {e}");
                        return;
                    }
                };
                backup_diario_si_toca(p, dir_datos).await;
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn fetch_html(url: String) -> Result<String, String> {
    let client = reqwest::blocking::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url)
        .send()
        .map_err(|e| e.to_string())?;

    let body = response.text().map_err(|e| e.to_string())?;
    Ok(body)
}

/// Fila del acta que el frontend envía por cada convocado.
#[derive(serde::Deserialize)]
struct FilaActa {
    persona_id: i64,
    titular: i64,
    dorsal: Option<i64>,
    posicion: Option<String>,
    es_capitan: bool,
    posicion_inicial: Option<String>,
    fuente_posicion_inicial: Option<String>,
}

/// Inserta las filas de un equipo dentro de la transacción del acta.
async fn insertar_equipo_acta(
    tx: &mut sqlx::SqliteConnection,
    partido_id: i64,
    equipo_id: i64,
    filas: &[FilaActa],
) -> Result<(), String> {
    for f in filas {
        sqlx::query(
            "INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, dorsal, posicion, es_capitan, posicion_inicial, fuente_posicion_inicial) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        )
        .bind(partido_id)
        .bind(equipo_id)
        .bind(f.persona_id)
        .bind(f.titular)
        .bind(f.dorsal)
        .bind(&f.posicion)
        .bind(f.es_capitan as i64)
        .bind(&f.posicion_inicial)
        .bind(&f.fuente_posicion_inicial)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Guarda el acta de un partido de forma atómica: borra las alineaciones previas y
/// reinserta las nuevas más las formaciones dentro de UNA transacción SQL. Si
/// cualquier paso falla, se hace ROLLBACK y las alineaciones quedan como estaban.
/// Usa el MISMO pool de conexiones que el plugin SQL (DbInstances), de modo que no
/// hay segunda conexión ni segunda base de datos en juego.
#[tauri::command]
async fn guardar_acta_transaccion(
    db_instances: State<'_, DbInstances>,
    partido_id: i64,
    equipo_local: i64,
    equipo_visitante: i64,
    formacion_local: String,
    formacion_visitante: String,
    filas_local: Vec<FilaActa>,
    filas_visitante: Vec<FilaActa>,
) -> Result<usize, String> {
    // El accessor sqlite() del plugin está comentado en su fuente, pero el enum
    // DbPool es público: matcheamos la variante para clonar el pool subyacente.
    let pool = {
        let instances = db_instances.0.read().await;
        match instances.get("sqlite:globalfutsal.db") {
            Some(DbPool::Sqlite(p)) => p.clone(),
            _ => return Err("No se encontró la base de datos activa".to_string()),
        }
    };

    let resultado = async {
        let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

        sqlx::query("DELETE FROM Alineacion WHERE partido_id = ?1")
            .bind(partido_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        insertar_equipo_acta(&mut tx, partido_id, equipo_local, &filas_local).await?;
        insertar_equipo_acta(&mut tx, partido_id, equipo_visitante, &filas_visitante).await?;

        sqlx::query("UPDATE Partido SET formacion_local = ?1, formacion_visitante = ?2 WHERE id = ?3")
            .bind(&formacion_local)
            .bind(&formacion_visitante)
            .bind(partido_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;

        let filas_totales = filas_local.len() + filas_visitante.len();
        tx.commit().await.map_err(|e| e.to_string())?;
        Ok(filas_totales)
    }
    .await;

    // Si resultado es Err, tx se dropeó sin commit => ROLLBACK automático de sqlx.
    resultado
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    /// Reproduce la coincidencia EXACTA del Scope fs de Tauri: tauri::fs::Scope
    /// compila los globs con glob::Pattern y compara con require_literal_separator
    /// (para que /dir/* no entre en subcarpetas) tras normalizar components().
    /// Sin mock_app: el binario de test con MockRuntime no arranca en este entorno
    /// (STATUS_ENTRYPOINT_NOT_FOUND del loader de WebView2), así que probamos la
    /// capa de patrones que es donde vive la política de esta app.
    fn coincide(glob_str: &str, ruta: &std::path::Path) -> bool {
        let patron = glob::Pattern::new(glob_str).expect("glob válido");
        let normalizada: PathBuf = ruta.components().collect();
        patron.matches_path_with(
            &normalizada,
            glob::MatchOptions {
                require_literal_separator: true,
                // Windows no trata el punto inicial como oculto por defecto.
                require_literal_leading_dot: false,
                case_sensitive: false,
            },
        )
    }

    /// Los globs de perfil de la capability (resueltos a rutas concretas como hace
    /// Scope::new vía manager.path().parse). HOME se resuelve del entorno.
    fn globs_perfil() -> Vec<PathBuf> {
        let home = std::env::var("USERPROFILE")
            .or_else(|_| std::env::var("HOME"))
            .expect("entorno con HOME");
        vec![
            PathBuf::from(&home),
            PathBuf::from(&home).join("Desktop"),
            PathBuf::from(&home).join("Downloads"),
            PathBuf::from(&home).join("Documents"),
        ]
    }

    /// Ruta del repositorio (raíz del proyecto), tanto en dev Windows como en CI Linux.
    fn raiz_proyecto() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
    }

    /// ¿Está la raíz del proyecto dentro del HOME del usuario? En CI Linux el
    /// checkout vive bajo /home/runner, así que los asertos negativos que
    /// suponen "el proyecto está fuera del perfil" deben evitar ese caso.
    fn proyecto_bajo_home() -> bool {
        let home = std::env::var("USERPROFILE").or_else(|_| std::env::var("HOME")).unwrap_or_default();
        raiz_proyecto().starts_with(home)
    }

    fn permitido_por(globs: &[PathBuf], ruta: &std::path::Path) -> bool {
        globs.iter().any(|g| coincide(&format!("{}/**", g.display()), ruta))
    }

    #[test]
    fn la_carpeta_configurable_extiende_el_alcance_a_futsal_data() {
        // Simula lo que hace extender_alcances: añadir el glob de la carpeta.
        let proyecto = raiz_proyecto();
        let mut globs = globs_perfil();
        globs.push(proyecto.to_path_buf());

        let csv = proyecto.join("src-tauri/tests/fixtures/equipos_fixture.csv");
        assert!(csv.exists(), "el CSV de prueba debe existir: {}", csv.display());
        assert!(permitido_por(&globs, &csv), "el CSV de la carpeta de datos debe quedar permitido tras configurar la carpeta");
        assert!(permitido_por(&globs, &proyecto.join("datos/sub/nuevo.csv")), "la extensión es recursiva (**)");

        // Sin extender, la carpeta del proyecto NO está permitida (solo el perfil)
        // — salvo que el checkout viva dentro del HOME (CI), donde el perfil ya la cubre.
        if !proyecto_bajo_home() {
            let solo_perfil = globs_perfil();
            assert!(!permitido_por(&solo_perfil, &csv), "sin configurar la carpeta, la carpeta de datos está denegada");
        }
    }

    #[test]
    fn el_scope_base_sigue_denegando_lo_que_la_capability_no_cubre() {
        let globs = globs_perfil();
        // Ruta fuera del perfil del usuario, sin atravesarlo (el helper es léxico
        // y no resuelve `..`; Tauri canonicaliza las rutas antes de comparar).
        let externa = if cfg!(windows) {
            PathBuf::from(r"C:\futsal_stats_test\externo\datos.csv")
        } else {
            PathBuf::from("/tmp/futsal_stats_test/externo/datos.csv")
        };
        assert!(!permitido_por(&globs, &externa), "fuera del perfil denegada");
        if cfg!(windows) {
            assert!(!permitido_por(&globs, std::path::Path::new("D:/secreto/datos.csv")), "otra unidad denegada");
            assert!(!permitido_por(&globs, std::path::Path::new("C:/Windows/System32/config.sys")), "sistema denegado");
        }
    }

    #[test]
    fn validar_carpeta_rechaza_rutas_que_no_existen() {
        let err = validar_carpeta(std::path::Path::new("Z:/no/existe/para/nada"))
            .expect_err("una carpeta inexistente debe fallar");
        assert!(err.contains("no existe"), "mensaje inesperado: {err}");
        // Y acepta una carpeta real (la raíz del proyecto).
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        validar_carpeta(manifest.parent().unwrap()).expect("la raíz del proyecto es una carpeta");
    }

    #[test]
    fn el_csv_de_datos_es_legible_y_tiene_cabecera_de_equipos() {
        // Extremo a extremo del lado datos: el fichero que el scope permite leer es
        // exactamente el que el importador de equipos espera parsear. Usa un fixture
        // versionado (Futsal_Data está gitignoreada y no existe en CI).
        let csv = raiz_proyecto().join("src-tauri/tests/fixtures/equipos_fixture.csv");
        let contenido = std::fs::read_to_string(&csv).expect("el CSV debe poder leerse del disco");

        let primera_linea = contenido
            .lines()
            .next()
            .expect("el CSV no está vacío")
            .trim_start_matches('\u{feff}'); // BOM UTF-8
        let columnas: Vec<&str> = primera_linea.split(';').map(|c| c.trim()).collect();

        assert!(columnas.contains(&"nombre"), "falta la columna 'nombre': {primera_linea}");
        assert!(columnas.contains(&"pais"), "falta la columna 'pais': {primera_linea}");
        assert!(contenido.lines().count() > 1, "el CSV debe tener filas de datos");
    }
}
