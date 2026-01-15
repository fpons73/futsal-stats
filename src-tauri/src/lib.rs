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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
