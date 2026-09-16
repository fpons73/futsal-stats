use tauri::Manager;
use tauri::State;
use tauri_plugin_sql::{DbInstances, DbPool, Migration, MigrationKind};

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
            es_carpeta_alcanzable
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

        insertar_equipo_acta(&mut *tx, partido_id, equipo_local, &filas_local).await?;
        insertar_equipo_acta(&mut *tx, partido_id, equipo_visitante, &filas_visitante).await?;

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

    fn permitido_por(globs: &[PathBuf], ruta: &std::path::Path) -> bool {
        globs.iter().any(|g| coincide(&format!("{}/**", g.display()), ruta))
    }

    #[test]
    fn la_carpeta_configurable_extiende_el_alcance_a_futsal_data() {
        // Simula lo que hace extender_alcances: añadir el glob de la carpeta.
        let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let proyecto = manifest.parent().unwrap();
        let mut globs = globs_perfil();
        globs.push(proyecto.to_path_buf());

        let csv = proyecto.join("Futsal_Data/Enciclopedia_Futsal_Equipas_Masculino1.csv");
        assert!(csv.exists(), "el CSV de prueba debe existir: {}", csv.display());
        assert!(permitido_por(&globs, &csv), "el CSV de Futsal_Data debe quedar permitido tras configurar la carpeta");
        assert!(permitido_por(&globs, &proyecto.join("Futsal_Data/sub/nuevo.csv")), "la extensión es recursiva (**)");

        // Y sin extender, la carpeta del proyecto NO está permitida (solo el perfil).
        let solo_perfil = globs_perfil();
        assert!(!permitido_por(&solo_perfil, &csv), "sin configurar la carpeta, Futsal_Data está denegada");
    }

    #[test]
    fn el_scope_base_sigue_denegando_lo_que_la_capability_no_cubre() {
        let globs = globs_perfil();
        assert!(!permitido_por(&globs, std::path::Path::new("D:/secreto/datos.csv")), "otra unidad denegada");
        assert!(!permitido_por(&globs, std::path::Path::new("C:/Windows/System32/config.sys")), "sistema denegado");
        assert!(!permitido_por(&globs, std::path::Path::new("C:/Proyectos/otro-proyecto/datos.csv")), "otros proyectos denegados");
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
    fn el_csv_de_futsal_data_es_legible_y_tiene_cabecera_de_equipos() {
        // Extremo a extremo del lado datos: el fichero que el scope permite leer es
        // exactamente el que el importador de equipos espera parsear.
        let csv = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .join("Futsal_Data/Enciclopedia_Futsal_Equipas_Masculino1.csv");
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
