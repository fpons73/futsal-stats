use tauri_plugin_sql::{Builder, Migration, MigrationKind};

#[tauri::command]
async fn check_player_positions(app: tauri::AppHandle) -> Result<String, String> {
    let db = app.state::<tauri_plugin_sql::DbPool>();
    let result = db.get("sqlite:globalfutsal.db")
        .ok_or("Database not found")?
        .query("SELECT id, nombre_deportivo, posicion_principal, posiciones_secundarias FROM Persona WHERE nombre_deportivo LIKE '%Pablo%' OR nombre_deportivo LIKE '%Otero%'")
        .await
        .map_err(|e| e.to_string())?;
    
    Ok(format!("{:?}", result))
}

fn main() {
    println!("Check player data");
}
