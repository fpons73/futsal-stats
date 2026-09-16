# Scripts E2E y de verificación

Utilidades para verificar **en la app real** (WebView2 de Windows, con la BD real de
`%APPDATA%\com.fpons.futsal-stats\globalfutsal.db`) lo que los tests unitarios no cubren:
diálogos nativos, puente Tauri, alcance `fs`, rendimiento con 70k registros y capturas.

Nada aquí se ejecuta en CI: son herramientas de desarrollo manual.

## Arrancar la app con depuración (requisito)

Todos los scripts se conectan por **Chrome DevTools Protocol (CDP)** al WebView2 de la
app, así que hay que lanzarla exponiendo el puerto de depuración:

```powershell
# PowerShell
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9333"
npm run tauri dev
```

```bash
# Git Bash
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9333" npm run tauri dev
```

- El frontend se sirve en `http://localhost:1430` (los scripts filtran el target por esa URL).
- El endpoint CDP queda en `http://127.0.0.1:9333`.
- **Patrón de conexión**: la *primera* conexión CDP tras arrancar la app es la fiable;
  conexiones nuevas cuando la sesión lleva rato abierta tienden a colgarse. Por eso
  todos los scripts trabajan en **una sola sesión** (navegación, clics y sondas dentro
  de la misma conexión) y se recomienda relanzar la app antes de cada verificación.

## Infraestructura

| Script | Qué hace |
|---|---|
| `cdp-eval.mjs` | Driver CDP compartido (`conectar`/`evaluar`/`cerrar`). También usable en CLI: `node scripts/cdp-eval.mjs "<expresión JS>"`. Timeout de 30 s por eval. |
| `recuperar-app.mjs` | Si la app quedó atascada en la splash: recarga completa, comprueba el puente Tauri (`__TAURI_INTERNALS__`) y diagnostica el `#root`. |
| `diag-ui.mjs` | Radiografía de la página viva: enlaces, botones y estado del router en una sola sesión CDP. |

## Importación E2E

Dos formas de probar los importadores, en orden de fidelidad:

1. **Botón real + diálogo nativo real** (UI Automation rellena el diálogo como un
   usuario): `importar-equipos-e2e.mjs`, `importar-jugadores-e2e.mjs`.
2. **Importadores reales dentro de la app con ruta predefinida** (los importadores
   aceptan `rutaPredefinida`; sin diálogo): `importar-lote-directo.mjs`,
   `importar-competiciones-directo.mjs`, `probar-idempotencia.mjs`.

| Script | Qué hace |
|---|---|
| `importar-equipos-e2e.mjs` | E2E completo de equipos: navega a `#/importar`, lanza UIA en background, pulsa el botón real y espera el toast. |
| `importar-jugadores-e2e.mjs` | Igual para el CSV de jugadores (botón real + diálogo UIA). |
| `importar-equipos-ui.mjs` | Variante que parchea `plugin:dialog\|open` y pulsa el botón en **una sola eval atómica** (un reload de HMR entre evals borraba el parche y abría el diálogo nativo real). |
| `importar-lote-directo.mjs` | Importa varios CSV en una sesión (importadores reales con ruta fija), sondeando el progreso. Útil para los CSV grandes de jugadores. |
| `importar-competiciones-directo.mjs` | Importador de competiciones con ruta predefinida, misma mecánica in-app. |
| `probar-idempotencia.mjs` | Reimporta un CSV ya cargado y verifica el resultado esperado: `0 importados, todo omitido, 0 errores`. |
| `verificar-importacion-e2e.mjs` | Flujo E2E con verificación del puente Tauri y del alcance `fs` (comprueba que `C:\Windows\win.ini` queda **denegado**). Marca las filas de prueba con el prefijo `ZZTEST_E2E_*`. |

### Apoyo UIA para el diálogo nativo

| Script | Qué hace |
|---|---|
| `abrir-dialogo-uia.ps1` | PowerShell + UI Automation: localiza el diálogo *Abrir* (`#32770`) por `EnumWindows`, escribe la ruta (`ValuePattern`) y acepta. Uso: `powershell -File scripts/abrir-dialogo-uia.ps1 -Ruta "C:\...\fichero.csv" [-Segundos 30]`. |
| `diag-dialogo-uia.mjs` | Diagnóstico del diálogo: una captura, lista completa de HWND y lectura del toast, sin spawns repetidos que le roben el foco. |
| `diag-importacion-jugadores.mjs` | Variante diagnóstica de la importación de jugadores: UIA espera 120 s, sondeos impresos al momento y salida del UIA a fichero. |

> **Aviso conocido**: el diálogo nativo automatizado tiene una carrera contra la
> inicialización de Tauri (el `SetValue` puede salir cancelado con `0x800704C7`).
> Si falla dos veces, usa la vía 2 (ruta predefinida), que ejercita el mismo código
> de importación y la misma BD.

## Verificaciones de páginas

Comprobaciones visuales/funcionales contra la BD real. Salida `PASS/FAIL` por paso.

| Script | Qué verifica |
|---|---|
| `verificar-rendimiento-jugadores.mjs` | Rendimiento de Jugadores con ~70k filas: carga inicial, búsqueda con debounce (200 ms), búsqueda vacía y paginación. |
| `verificar-jugadores-p2.mjs` | Complemento: estado vacío, restauración y cambio de página (detectado por contenido del `tbody`, no por textos ambiguos). |
| `verificar-filtro-sin-nacionalidad.mjs` | Paquete "sin nacionalidad" de Jugadores: badge con total, opción del select, aviso al activar y filas marcadas. |
| `verificar-entrenadores.mjs` | Entrenadores: paginación, badge "sin nacionalidad", búsqueda y cambio de página. |
| `verificar-ficha-entrenador.mjs` | Trayectoria de la ficha: entrenador con `equipo_actual`+títulos (de `Persona.meta`) y placeholder honesto para quien no tiene datos. |
| `capturas-readme.mjs` | Genera las capturas del README (`docs/screenshots/`): Dashboard, Partidos y Pizarra del partido con más alineaciones. |

## Configuración y alcance fs

| Script | Qué hace |
|---|---|
| `configurar-carpeta-e2e.mjs` | Configura `Preferencia.carpeta_datos` en la app viva y comprueba el alcance: el CSV de la carpeta pasa a ser legible y `C:\Windows\win.ini` sigue denegado. Uso: `node scripts/configurar-carpeta-e2e.mjs [carpeta]`. |
| `verificar-arranque-carpeta.mjs` | Arranque en frío: el alcance debe aplicarse solo desde la preferencia persistida, sin configurar nada en la sesión. |

## Mantenimiento de datos (one-off)

| Fichero | Qué es |
|---|---|
| `reparar_paises_equipos.py` | Reparación histórica del `pais_id` de equipos importados con nombres de país en portugués (mapa PT→ES, backup previo, transacción). Se conserva como referencia del procedimiento. |
| `snapshot_paises_antes_reparacion.json` | Snapshot de datos anterior a esa reparación (artefacto, no script). |

## Convenciones

- Los importadores son **idempotentes**: reejecutar cualquier script de importación
  no duplica filas (verifícalo con `probar-idempotencia.mjs`).
- Los scripts no tocan la BD directamente: todo pasa por los importadores/commands
  reales de la app, igual que un usuario.
- Las verificaciones de página asumen la BD con datos cargados de `Futsal_Data/`.
