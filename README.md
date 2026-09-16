# Futsal Stats

[![CI](https://github.com/fpons73/futsal-stats/actions/workflows/ci.yml/badge.svg)](https://github.com/fpons73/futsal-stats/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tauri](https://img.shields.io/badge/Tauri-2-24C8D8?logo=tauri&logoColor=white)](https://v2.tauri.app/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

**Global Futsal Stats** — aplicación de escritorio (Windows) para gestionar y analizar
estadísticas de fútbol sala: competiciones, ediciones, equipos, jugadores, entrenadores,
árbitros, partidos con acta completa y rankings.

## Características

- **Gestión del dominio completo**: confederaciones, países, competiciones, temporadas,
  ediciones, fases, pabellones, equipos, plantillas, jugadores, entrenadores y árbitros.
- **Acta de partido interactiva**: alineaciones con posición inicial real (distinta de la
  natural del jugador), capitanía, eventos editables con *undo*, estadísticas por equipo
  y por jugador, tandas de penaltis y valoraciones.
- **Pizarra táctica**: alineaciones sobre el campo con posiciones reales de inicio,
  resumen de nacionalidades y edades del quinteto.
- **Acta en PDF** lista para presentación oficial: contexto (competición, temporada,
  jornada), banderas, firmas de árbitro/delegado/anotador y bloque de resumen.
- **Borrador del acta** con autoguardado en `localStorage`, recuperación tras cierre
  accidental, aviso de cambios sin guardar y atajo `Ctrl+S`.
- **Importación masiva de CSV** (equipos, jugadores, entrenadores y competiciones) con
  idempotencia, alias de países PT→ES y manejo honesto de datos incompletos.
- **Filtros de calidad de datos**: detección y reparación manual de registros "sin
  nacionalidad" y de equipos "Desconocidos" desde las propias listas.
- **UX consistente**: tema claro/oscuro persistido, toasts en lugar de `alert()`,
  diálogos modales con foco atrapado y confirmaciones temáticas.

## Stack

| Capa | Tecnología |
|---|---|
| Shell de escritorio | [Tauri 2](https://v2.tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript 5.8 + Vite |
| Estilos | Tailwind CSS 3 |
| Base de datos | SQLite vía `tauri-plugin-sql` (sqlx) |
| PDF | jsPDF + jspdf-autotable |
| Tests | Vitest + Testing Library · tests de integración en Rust |
| CI | GitHub Actions (`tsc`, `vitest`, migraciones y tests Rust) |

## Requisitos previos

- **Node.js 22+** y npm
- **Rust stable** ([rustup](https://rustup.rs/))
- **Windows**: WebView2 Runtime (incluido en Windows 10/11 modernos). Para el binario
  de pruebas con runtime mock ve `src-tauri/src/lib.rs` (notas del módulo de tests).

## Puesta en marcha

```bash
# 1. Instalar dependencias del frontend
npm install

# 2. Arrancar la app en modo desarrollo (compila el Rust y abre la ventana)
npm run tauri dev

# 3. Compilar el instalador/bundle de producción
npm run tauri build
```

El servidor de desarrollo de Vite sirve el frontend en `http://localhost:1430`
(configurado como `devUrl` de Tauri; el puerto 1420 queda libre para otras apps).

## Scripts npm

| Comando | Descripción |
|---|---|
| `npm run dev` | Solo el frontend con Vite (sin shell Tauri) |
| `npm run tauri dev` | App completa en modo desarrollo |
| `npm run build` | Comprobación de tipos (`tsc`) + build de producción del frontend |
| `npm test` | Suite de tests del frontend (Vitest, modo *run*) |
| `npm run test:watch` | Vitest en modo vigilancia |
| `npm run tauri build` | Bundle instalable de producción |

## Estructura del proyecto

```
src/
  pages/        # Una página por entidad (Dashboard, Partidos, Equipos, Jugadores…)
  components/   # Componentes compartidos (Modal, Toast, UndoToast, pizarra, PDF…)
  utils/        # Lógica: importadorMasivo.ts, csvExporters, calculadoraLiga, pdf…
  hooks/        # useFormGuard, useDialogFocus y otros hooks reutilizables
  context/      # Contextos de React (tema, toasts…)
  services/     # Acceso a base de datos
src-tauri/
  src/lib.rs    # Comandos Tauri, migraciones y política de scope del fs
  migrations/   # Migraciones SQL versionadas (1-13)
  tests/        # Tests de integración de migraciones + fixtures
scripts/        # Utilidades E2E (CDP) para verificar importaciones y rendimiento
```

## Base de datos

- **Motor**: SQLite embebido vía `tauri-plugin-sql`. La BD vive en el perfil de usuario:
  `%APPDATA%\com.fpons.futsal-stats\globalfutsal.db` (WAL).
- **Esquema versionado**: las migraciones SQL están en `src-tauri/migrations/` y se
  aplican al arrancar la app (`migraciones()` en `lib.rs` es la fuente de verdad).
  La migración 13, por ejemplo, normaliza los roles legacy de `Persona`
  (`["Jugador"]`, minúsculas) al formato canónico plano `Jugador`/`Entrenador`/`Arbitro`.
- **Tests de integración**: `src-tauri/tests/migraciones.rs` aplica todas las migraciones
  a una BD virgen con el runner real de sqlx y comprueba que el esquema resultante es
  completo y utilizable — para que una migración rota reviente en CI, no en producción.

```bash
cd src-tauri
cargo test --test migraciones   # migraciones 1-13 sobre BD virgen
cargo test --lib                # tests unitarios de la lib (scope fs, validaciones)
```

## Importación de datos CSV

La página **Importar** carga ficheros CSV (separador `;`, tolera BOM) con los datos de
la enciclopedia de futsal. Cada importador es **idempotente**: reimportar el mismo
fichero no crea duplicados.

| Importador | CSV esperado (separador `;`) | Notas |
|---|---|---|
| Equipos | `nombre;nombre_completo;pais;ciudad;fundacion;titulos;…` | País resuelto contra `Pais` sin acentos |
| Jugadores | `nombre;posicion;dorsal;pais;fecha_nacimiento;equipo_actual;…` | Idempotente por nombre deportivo + fecha de nacimiento |
| Entrenadores | `nombre;pais;fecha_nacimiento;equipo_actual;titulos;…` | Enriquece la ficha con club actual y títulos (`meta`) |
| Competiciones | `nombre;pais;tipo;url;…` | Deriva tipo (Liga/Copa/Torneo) y ámbito (Clubes/Selecciones) |

Detalles importantes:

- **Países en portugués**: el matching normaliza acentos y aplica un diccionario de
  alias PT→ES (`Espanha`→España, `Itália`→Italia, `Quenia`→Kenia, `Bissau`→Guinea
  Bissau, `RD Congo`→R.D. Congo…). Los países que no casan quedan a `NULL` y se listan
  en el toast — nunca un fallback silencioso.
- **Sin nacionalidad**: los registros importados sin país quedan con nacionalidad NULL
  y son localizables desde los badges y filtros "sin nacionalidad" de las páginas
  Jugadores y Entrenadores para repararlos a mano.
- **Carpeta de datos configurable**: en **Configuración** se puede fijar la carpeta
  raíz de datos (por defecto, la del proyecto). La app amplía el *scope* de lectura del
  plugin `fs` solo hasta esa carpeta, y los importadores aceptan también una ruta
  predefinida opcional para las pruebas E2E automatizadas.

## Tests y CI

```bash
npm test                        # 231 tests de frontend (Vitest)
cd src-tauri && cargo test      # migraciones + tests de la lib
```

GitHub Actions (`.github/workflows/ci.yml`) ejecuta en cada push a `main`:

- **Frontend**: `tsc --noEmit` + Vitest.
- **Rust**: migraciones sobre BD virgen + tests unitarios de la lib.

## Licencia

[MIT](./LICENSE)
