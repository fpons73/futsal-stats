use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Definimos las migraciones (tu base de datos)
    let migrations = vec![
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
    ];

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
        .invoke_handler(tauri::generate_handler![fetch_html])
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

