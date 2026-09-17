//! Test de integración: aplica todas las migraciones del app (1–13) a una base
//! de datos SQLite **virgen** con el runner real de sqlx (`Migrator::new`) — el
//! mismo motor que `tauri-plugin-sql` ejecuta en el arranque — y comprueba que
//! el esquema resultante es completo y utilizable.
//!
//! Contexto: la migración 11 llegó a producción conteniendo un
//! `ALTER TABLE Participante ...` sobre una tabla que no existe en el esquema.
//! Fallaba en cualquier BD recién creada (y en las legadas por columnas
//! duplicadas). Este test existe para que una migración rota reviente aquí,
//! en `cargo test`, y no en el arranque del usuario.
//!
//! Limpieza: todos los temporales (volcado de migraciones, BD, -wal/-shm) se
//! liberan con un guardián `Drop` que se ejecuta también durante el unwinding
//! de un pánico — un test que falle no deja restos en %TEMP%.

use futsal_stats_lib::migraciones;
use sqlx::migrate::Migrator;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions};
use std::str::FromStr;/// Guardián del pool de test: posee un handle (clone) del SqlitePool y las
/// rutas temporales de su fichero. En el Drop cierra el pool DE VERDAD y luego
/// borra el .db/-wal/-shm, funcionando también durante el unwinding de un pánico.
///
/// ¿Por qué no basta con soltar el pool? El Drop de sqlx cierra las conexiones
/// en una tarea de fondo (necesita un ejecutor), así que en Windows los
/// ficheros siguen agarrados al llegar la limpieza. Y ¿por qué un hilo aparte
/// para el cierre? Durante el unwinding seguimos dentro del contexto del
/// runtime tokio del test: un `block_on` directo paniquearía con "Cannot start
/// a runtime from within a runtime".
struct GuardiaPool {
    pool: Option<sqlx::SqlitePool>,
    rutas: Vec<std::path::PathBuf>,
}

impl GuardiaPool {
    /// Guardia para un pool sobre un fichero de BD SQLite (limpia -wal/-shm).
    /// Recibe un clone: los pool de sqlx son handles Arc baratos y comparten
    /// el estado interno (cerrar el clone cierra el pool compartido).
    fn para_bd(pool: sqlx::SqlitePool, base: &std::path::Path) -> Self {
        let mut rutas = vec![base.to_path_buf()];
        for sufijo in ["-wal", "-shm"] {
            let mut p = base.as_os_str().to_os_string();
            p.push(sufijo);
            rutas.push(std::path::PathBuf::from(p));
        }
        Self {
            pool: Some(pool),
            rutas,
        }
    }
}

impl Drop for GuardiaPool {
    fn drop(&mut self) {
        if let Some(pool) = self.pool.take() {
            if !pool.is_closed() {
                // Cierre con timeout en un hilo sin contexto tokio: en éxito el
                // test ya habrá cerrado el pool con `pool.close().await` y esto
                // es casi inmediato. En pánico puede no lograrlo: el driver de
                // la conexión vive en el runtime (current_thread) del test, que
                // está bloqueado haciendo el unwinding en ESTE hilo, así que el
                // cierre no progresa y expira. El fichero puede quedar agarrado
                // hasta que muere el proceso — y entonces lo barre el barrido
                // por-PID de la siguiente ejecución.
                let cierre = std::thread::spawn(move || {
                    if let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                        .enable_all()
                        .build()
                    {
                        rt.block_on(async {
                            let _ = tokio::time::timeout(
                                std::time::Duration::from_secs(2),
                                pool.close(),
                            )
                            .await;
                        });
                    }
                });
                let _ = cierre.join();
            }
        }
        for ruta in &self.rutas {
            // Mejor esfuerzo: la limpieza nunca debe enmascarar el fallo real.
            let _ = std::fs::remove_file(ruta);
        }
    }
}

/// Guardián simple de rutas temporales (directorios), usado para el volcado de
/// migraciones. En el Drop borra sus rutas — también durante el unwinding.
struct GuardiaTemp {
    rutas: Vec<std::path::PathBuf>,
}

impl Drop for GuardiaTemp {
    fn drop(&mut self) {
        for ruta in &self.rutas {
            let _ = std::fs::remove_dir_all(ruta);
        }
    }
}

/// Extrae el PID final de un nombre tipo `futsal_mig_test_tablas_35100.db`
/// (los nombres del arnés llevan `_{nombre}_{pid}` antes de la extensión).
fn pid_del_nombre(nombre: &str) -> Option<u32> {
    let base = nombre.trim_end_matches(".db").trim_end_matches(".db-wal").trim_end_matches(".db-shm");
    let ultimo = base.rsplit('_').next()?;
    ultimo.parse::<u32>().ok()
}

/// Barrido de restos de ejecuciones ANTERIORES: los de otros PID se borran
/// siempre (su proceso ya murió y soltó los handles — cubre el pánico en
/// Windows, donde el .db puede quedar bloqueado hasta que muere el proceso);
/// los del PID actual solo si llevan más de una hora (por si este binario
/// corre en paralelo con nextest y comparte PID).
fn barrer_restos_de_ejecuciones_anteriores() {
    let pid_actual = std::process::id();
    let Ok(entradas) = std::fs::read_dir(std::env::temp_dir()) else {
        return;
    };
    for entrada in entradas.flatten() {
        let nombre = entrada.file_name().to_string_lossy().to_string();
        if !nombre.starts_with("futsal_mig_") {
            continue;
        }
        let mismo_pid = pid_del_nombre(&nombre) == Some(pid_actual);
        let antiguo = entrada
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|m| m.elapsed().ok())
            .is_some_and(|e| e.as_secs() > 3600);
        if mismo_pid && !antiguo {
            continue;
        }
        let es_dir = entrada.metadata().map(|m| m.is_dir()).unwrap_or(false);
        let _ = if es_dir {
            std::fs::remove_dir_all(entrada.path())
        } else {
            std::fs::remove_file(entrada.path())
        };
    }
}

/// Vuelca la lista de migraciones de producción a un directorio temporal con el
/// formato de ficheros de sqlx ({version}_{descripción}.sql) y devuelve el migrator.
/// Así el test usa el runner real de sqlx mientras mantiene `migraciones()` (lib.rs)
/// como única fuente de verdad. El directorio se limpia al volver (o en pánico).
async fn migrator_desde_produccion(nombre: &str) -> Migrator {
    barrer_restos_de_ejecuciones_anteriores();
    let dir = std::env::temp_dir().join(format!(
        "futsal_mig_src_{}_{}",
        nombre,
        std::process::id()
    ));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("crear directorio temporal de migraciones");
    let guardia_dir = GuardiaTemp {
        rutas: vec![dir.clone()],
    };
    for m in migraciones() {
        let ruta = dir.join(format!("{}_{}.sql", m.version, m.description));
        std::fs::write(&ruta, m.sql)
            .expect("escribir migración temporal");
    }
    let migrator = Migrator::new(dir.clone())
        .await
        .expect("migraciones válidas para sqlx");
    drop(guardia_dir); // el migrator ya cargó el volcado: limpiar ya
    migrator
}

/// Aplica las migraciones de producción a una BD nueva en un fichero temporal.
/// Cada test usa su propio fichero para no interferir en paralelo. Devuelve
/// `(pool, guardia)`: los locales se sueltan en orden inverso de declaración,
/// así la guardia corre ANTES que el handle del pool del test — cierra el pool
/// compartido de forma síncrona y borra .db/-wal/-shm tanto en éxito como
/// durante el unwinding de un pánico. (En el camino feliz el test ya habrá
/// hecho `pool.close().await` y el cierre de la guardia es inmediato.)
async fn bd_virgen_con_migraciones(nombre: &str) -> (sqlx::SqlitePool, GuardiaPool) {
    let migrator = migrator_desde_produccion(nombre).await;
    let ruta = std::env::temp_dir().join(format!(
        "futsal_mig_test_{}_{}.db",
        nombre,
        std::process::id()
    ));
    let _ = std::fs::remove_file(&ruta); // limpiar restos de ejecuciones previas
    let opciones = SqliteConnectOptions::from_str(&format!("sqlite://{}", ruta.display()))
        .expect("URL de sqlite válida")
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal);

    let pool = SqlitePoolOptions::new()
        .connect_with(opciones)
        .await
        .expect("conexión a la BD virgen");
    migrator
        .run(&mut pool.acquire().await.expect("conexión libre"))
        .await
        .expect("todas las migraciones deben aplicarse limpias a una BD nueva");
    let guardia = GuardiaPool::para_bd(pool.clone(), &ruta);
    (pool, guardia)
}

/// Extrae el nombre de tabla de una sentencia CREATE TABLE / ALTER TABLE,
/// tolerando IF NOT EXISTS y comillas.
fn nombre_tabla(resto: &str) -> Option<String> {
    let resto = resto.trim_start_matches("IF NOT EXISTS").trim_start();
    let nombre: String = resto
        .chars()
        .take_while(|c| c.is_alphanumeric() || *c == '_' || *c == '"')
        .collect();
    let nombre = nombre.replace('"', "");
    if nombre.is_empty() {
        None
    } else {
        Some(nombre)
    }
}

/// El esquema completo tras migrar debe contener todas las tablas del dominio.
#[tokio::test]
async fn las_migraciones_crear_todas_las_tablas_del_dominio() {
    let (pool, _guardia) = bd_virgen_con_migraciones("tablas").await;

    let tablas: Vec<(String,)> =
        sqlx::query_as("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
            .fetch_all(&pool)
            .await
            .expect("lectura de sqlite_master");

    let nombres: Vec<&str> = tablas.iter().map(|(n,)| n.as_str()).collect();
    for esperada in [
        "Confederacion",
        "Pais",
        "Estadio",
        "Equipo",
        "Persona",
        "Afiliacion",
        "Temporada",
        "Competicion",
        "Edicion",
        "Fase",
        "Partido",
        "Alineacion",
        "Evento",
        "EstadisticaPartidoEquipo",
        "EstadisticaPartidoJugador",
        "Formacion",
        "Alerta",
        "Log",
        "Designacion",
        "Inscripcion",
        "Plantilla",
        "Preferencia",
    ] {
        assert!(
            nombres.contains(&esperada),
            "falta la tabla '{esperada}' tras aplicar las migraciones. Tablas: {nombres:?}"
        );
    }

    pool.close().await;
}

/// Smoke test funcional: inserta una cadena completa de datos de un partido
/// (país → equipo → persona → competición → edición → partido → alineación con
/// posicion_inicial de la migración 12) respetando todas las NOT NULL. Si una
/// migración introdujera una columna obligatoria sin DEFAULT, este test lo
/// destaparía igual que producción.
#[tokio::test]
async fn el_esquema_migrado_acepta_un_partido_completo() {
    let (pool, _guardia) = bd_virgen_con_migraciones("flujo").await;

    // RETURNING id en vez de last_insert_rowid(): el pool puede alternar conexiones,
    // y last_insert_rowid() es por-conexión.
    let (pais_id,): (i64,) = sqlx::query_as(
        "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('España', 'ES', 'ESP') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insertar país");

    let (equipo_id,): (i64,) = sqlx::query_as(
        "INSERT INTO Equipo (nombre, abreviatura, pais_id, categoria) VALUES ('Test FS', 'TFS', ?1, 'Club') RETURNING id",
    )
    .bind(pais_id)
    .fetch_one(&pool)
    .await
    .expect("insertar equipo");

    let (persona_id,): (i64,) = sqlx::query_as(
        "INSERT INTO Persona (nombre, apellidos, nombre_deportivo, roles) VALUES ('Ana', 'García', 'Ana', 'jugador') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insertar persona");

    let (competicion_id,): (i64,) = sqlx::query_as(
        "INSERT INTO Competicion (nombre, tipo) VALUES ('Liga Test', 'Liga') RETURNING id",
    )
    .fetch_one(&pool)
    .await
    .expect("insertar competición");

    let (temporada_id,): (i64,) =
        sqlx::query_as("INSERT INTO Temporada (nombre) VALUES ('2025-2026') RETURNING id")
            .fetch_one(&pool)
            .await
            .expect("insertar temporada");

    let (edicion_id,): (i64,) = sqlx::query_as(
        "INSERT INTO Edicion (competicion_id, temporada_id) VALUES (?1, ?2) RETURNING id",
    )
    .bind(competicion_id)
    .bind(temporada_id)
    .fetch_one(&pool)
    .await
    .expect("insertar edición");

    let (partido_id,): (i64,) = sqlx::query_as(
        "INSERT INTO Partido (edicion_id, local_id, visitante_id, estado) VALUES (?1, ?2, ?3, 'jugado') RETURNING id",
    )
    .bind(edicion_id)
    .bind(equipo_id)
    .bind(equipo_id)
    .fetch_one(&pool)
    .await
    .expect("insertar partido");

    sqlx::query(
        "INSERT INTO Alineacion (partido_id, equipo_id, persona_id, titular, es_capitan, posicion, posicion_inicial, fuente_posicion_inicial) \
         VALUES (?1, ?2, ?3, 1, 0, 'Ala', 'Pívot', 'manual')",
    )
    .bind(partido_id)
    .bind(equipo_id)
    .bind(persona_id)
    .execute(&pool)
    .await
    .expect("insertar alineación");

    let (guardada,): (String,) = sqlx::query_as(
        "SELECT posicion_inicial FROM Alineacion WHERE fuente_posicion_inicial = 'manual'",
    )
    .fetch_one(&pool)
    .await
    .expect("leer alineación");
    assert_eq!(guardada, "Pívot", "la posición inicial real debe persistir");

    pool.close().await;
}

/// Red de seguridad contra la clase de error concreta que tuvo la migración 11:
/// un ALTER TABLE sobre una tabla que no existe en el esquema (fue 'Participante').
/// Simula el esquema acumulado migración a migración y comprueba que toda tabla
/// alterada existe en el momento de alterarse.
#[tokio::test]
async fn ninguna_migracion_altera_tablas_que_no_existen() {
    let listado = migraciones();
    assert!(listado.len() >= 12, "deben existir al menos 12 migraciones");

    let mut existentes: std::collections::HashSet<String> = std::collections::HashSet::new();

    for m in &listado {
        for linea in m.sql.lines() {
            let l = linea.trim();
            if let Some(resto) = l
                .strip_prefix("CREATE TABLE ")
                .or_else(|| l.strip_prefix("create table "))
            {
                if let Some(t) = nombre_tabla(resto) {
                    existentes.insert(t);
                }
            } else if let Some(resto) = l
                .strip_prefix("ALTER TABLE ")
                .or_else(|| l.strip_prefix("alter table "))
            {
                if let Some(t) = nombre_tabla(resto) {
                    assert!(
                        existentes.contains(&t),
                        "la migración {} ({}) altera la tabla '{t}', que no existe en el esquema acumulado. \
                         Tablas conocidas hasta ahora: {:?}",
                        m.version,
                        m.description,
                        existentes
                    );
                }
            }
        }
    }
}

/// Cada migración debe llevar versión única y consecutiva desde 1, sin huecos
/// (un hueco haría que el plugin no aplicara las siguientes).
#[tokio::test]
async fn las_versiones_de_migracion_son_consecutivas_desde_uno() {
    let mut listado = migraciones();
    listado.sort_by_key(|m| m.version);
    for (esperado, m) in listado.iter().enumerate() {
        assert_eq!(
            m.version,
            (esperado + 1) as i64,
            "las versiones deben ser 1,2,3... sin huecos ni duplicados"
        );
    }
}

/// La migración 13 normaliza los formatos legacy de Persona.roles (arrays JSON
/// y variantes de caso) al texto plano canónico Jugador/Entrenador/Arbitro.
/// Ejecuta su SQL exacto sobre una BD ya migrada, pre-poblada con todos los
/// formatos vistos en producción, y comprueba que solo quedan canónicos.
#[tokio::test]
async fn la_migracion_normaliza_los_roles_legacy_de_persona() {
    let (pool, _guardia) = bd_virgen_con_migraciones("roles").await;

    // Formatos exactos encontrados en producción antes de la 13.
    for rol in [
        r#"["Jugador"]"#,
        r#"["Arbitro"]"#,
        r#"["Entrenador"]"#,
        r#"["Jugador","Entrenador"]"#,
        "jugador",
        "entrenador",
        "arbitro",
        " Jugador ",
        "Árbitro",
    ] {
        sqlx::query(
            "INSERT INTO Persona (nombre, apellidos, nombre_deportivo, roles) VALUES ('X', 'Y', 'X', ?1)",
        )
        .bind(rol)
        .execute(&pool)
        .await
        .expect("insertar persona con rol legacy");
    }
    // La columna es NOT NULL: todas las filas traen algún rol.

    // Re-ejecuta el SQL EXACTO de la migración 13 (es idempotente).
    let sql_m13 = migraciones()
        .into_iter()
        .find(|m| m.version == 13)
        .expect("existe la migración 13")
        .sql
        .to_string();
    sqlx::raw_sql(&sql_m13)
        .execute(&pool)
        .await
        .expect("re-ejecutar la migración 13");

    let roles: Vec<(Option<String>, i64)> =
        sqlx::query_as("SELECT roles, COUNT(*) FROM Persona GROUP BY roles ORDER BY roles")
            .fetch_all(&pool)
            .await
            .expect("leer roles normalizados");

    // SQLite ordena A < E < J. Total 9 filas insertadas, 9 normalizadas.
    let esperados: Vec<(Option<String>, i64)> = vec![
        (Some("Arbitro".into()), 3),    // ["Arbitro"], arbitro, Árbitro
        (Some("Entrenador".into()), 3), // ["Entrenador"], entrenador, ["Jugador","Entrenador"]
        (Some("Jugador".into()), 3),    // ["Jugador"], jugador, " Jugador "
    ];
    assert_eq!(roles, esperados, "solo deben quedar roles canónicos (y NULL)");

    pool.close().await;
}
