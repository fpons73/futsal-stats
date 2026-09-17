# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y [Versionado Semántico](https://semver.org/lang/es/). Los detalles de cada
tarea están en [`docs/milestone-1.0.md`](./docs/milestone-1.0.md).

## [Sin publicar]

### Preparación del cierre 1.0.0

- Runbook de cierre de la 1.0.0 (`docs/cierre-v1-0-0.md`): validación en VM
  del instalador de la rc (hash precalculado), bump de versión, regeneración
  de notas y tag final con contingencia `rc.2`.
- Workflow de release: los tags con sufijo (`-rc*`, `-beta*`) se publican
  como **prerelease** automáticamente; las versiones estables no.
- Instalador de la rc descargable desde el borrador de la release en CI.

## [1.0.0-rc.1] — 2026-09-17

## [1.0.0-rc.1] — 2026-09-17

Primera candidata a release: aplicación completa, instalable y con red de
seguridad de datos. Pendiente para 1.0.0 final: prueba del instalador en
máquina limpia ([guía](./docs/prueba-maquina-limpia.md)) y firma de código
(post-1.0).

### Añadido

**Gestión de futsal**
- Dominio completo: confederaciones, países, competiciones, temporadas,
  ediciones, fases, pabellones, equipos, plantillas, jugadores, entrenadores
  y árbitros.
- Acta de partido interactiva: alineaciones con posición inicial real,
  capitanía, eventos editables con *undo*, estadísticas por equipo y jugador,
  penaltis y valoraciones; borrador autoguardado con recuperación y Ctrl+S.
- Pizarra táctica con alineaciones sobre el campo, resumen de nacionalidades
  y edades del quinteto.
- Acta en PDF lista para presentación oficial: contexto de competición,
  banderas, resumen y bloque de firmas.

**Primera experiencia y datos**
- Asistente de bienvenida en instalaciones nuevas: elige carpeta de datos,
  detecta los CSV (incluso en subcarpetas) e importa en orden de dependencias
  con progreso; crea la primera copia de seguridad al terminar.
- Importación masiva idempotente de CSV (equipos, jugadores, entrenadores,
  competiciones) con matching de países PT→ES y auto-seed de "Desconocido"
  para que una BD virgen importe sin morir.
- Informes de error de importación exportables en CSV/JSON desde la página
  Importar.
- Copias de seguridad automáticas diarias con rotación, restauración
  verificada desde Configuración y detección de BD corrupta al arrancar con
  pantalla de recuperación.
- Catálogo mundial de países (~220, ISO2/ISO3 + confederación FIFA) cargable
  desde Configuración, idempotente y enriquecedor de países existentes.

**Calidad y robustez**
- Política de errores sin fallos silenciosos: toasts, informes o justificación
  documentada (blindado por tests).
- Estados vacíos con llamadas a la acción en todas las listas y spinners de
  primera carga.
- Registro global de errores con panel lateral, badge de no vistos, filtros,
  exportación y captura de errores globales y de consola.
- Fallback de iniciales con tono determinista para escudos, banderas y fotos
  ausentes o con rutas muertas — ninguna imagen rota.
- Diálogos temáticos con foco atrapado, guardas de cambios sin guardar,
  atajos de teclado y toasts en todo el flujo.

**Distribución**
- Workflow de release en CI: cada tag `v*` compila el instalador Windows
  (NSIS + MSI) y lo adjunta a un borrador de GitHub Release.
- Documentación de usuario (instalación, primer uso, solución de problemas) y
  de contribución (proceso de release).

### Técnico

- Tauri 2 + React 19 + TypeScript 5.8 + Vite; SQLite (sqlx) con 13
  migraciones versionadas y tests de integración de migraciones en CI.
- 340+ tests de frontend (Vitest/RTL) y tests Rust (migraciones + lib) en
  GitHub Actions.
- CSP estricta en producción, scope de `fs` minimizado a la carpeta de datos
  configurable y versionado coherente de metadatos del bundle.
