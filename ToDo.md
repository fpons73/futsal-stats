# ToDo — Importación Fútbol → Futsal

## FASE 1: Infraestructura y Base de Datos
- [x] 1.1 Crear `src/db.ts` (sistema de preferencias + iniciarBaseDeDatos)
- [x] 1.2 Migración 7: estadísticas de partido (columnas extendidas)
- [x] 1.3 Migración 8: formaciones de futsal
- [x] 1.4 Migración 9: EstadisticaPartidoJugador
- [x] 1.5 Migración 10: tabla Preferencia
- [x] 1.6 Migración 11: mejoras adicionales (filiales, colores, ámbito, grupo)
- [x] 1.7 Crear `src/context/ThemeContext.tsx`
- [x] 1.8 Crear `src/context/EdicionContext.tsx`
- [x] 1.9 Crear `src/context/ModoContext.tsx`
- [x] 1.10 Actualizar `src-tauri/src/lib.rs` con nuevas migraciones
- [x] 1.11 Instalar dependencias (react-icons, jspdf-autotable)

## FASE 2: Componentes Core del Partido
- [x] 2.1 Crear `src/components/CampoFutsal.tsx`
- [x] 2.2 Crear `src/components/ModalEvento.tsx`
- [x] 2.3 Crear `src/components/EstadisticasPartido.tsx`
- [x] 2.4 Crear `src/components/EstadisticasJugadorPartido.tsx`
- [x] 2.5 Crear `src/components/ValoracionesPartido.tsx`
- [x] 2.6 Crear `src/components/ResumenPartidoIA.tsx`
- [x] 2.7 Crear `src/components/TandaPenaltisPartido.tsx`
- [x] 2.8 Crear `src/components/BadgeFormacion.tsx`
- [x] 2.9 Crear `src/components/IconoZonaGol.tsx`
- [x] 2.10 Crear `src/components/ModalGestionFormaciones.tsx`
- [x] 2.11 Crear `src/components/ModalBuscarDuplicados.tsx`
- [x] 2.12 Crear `src/components/ModalConfigTabla.tsx`
- [x] 2.13 Crear `src/components/charts/ComparisonMetricBar.tsx`
- [x] 2.14 Crear `src/components/charts/TeamPerformanceRadar.tsx`
- [x] 2.15 Crear `src/components/PantallaModo.tsx`
- [x] 2.16 Crear `src/components/CincoIdeal.tsx`

## FASE 3: Páginas Nuevas y Mejoradas
- [x] 3.1 Reescribir `src/pages/DetallePartido.tsx`
- [x] 3.2 Crear `src/pages/Configuracion.tsx`
- [x] 3.3 Crear `src/pages/Rankings.tsx`
- [x] 3.4 Crear `src/pages/Importar.tsx`

## FASE 4: Utilidades y Servicios
- [x] 4.1 Crear `src/utils/calculadoraLiga.ts`
- [x] 4.2 Crear `src/utils/pdfGenerator.ts`
- [x] 4.3 Crear `src/utils/csvExporters.ts`
- [x] 4.4 Crear `src/utils/generadorCalendario.ts`
- [x] 4.5 Crear `src/utils/importadorCalendario.ts`
- [x] 4.6 Crear `src/utils/importadorMasivo.ts`
- [x] 4.7 Crear `src/utils/imageHelpers.ts`
- [x] 4.8 Crear `src/utils/colorUtils.ts`
- [x] 4.9 Crear `src/utils/normalizar.ts`
- [x] 4.10 Crear `src/services/geminiService.ts`

## FASE 5: Seeds y Datos Iniciales
- [x] 5.1 Crear `src/utils/seedConfederaciones.ts`
- [x] 5.2 Crear `src/utils/seedCompeticionesFutsal.ts`

## FASE 6: Routing y Sidebar
- [x] 6.1 Reescribir `src/App.tsx`
- [x] 6.2 Actualizar `src/components/Sidebar.tsx`

## FASE 7: Commit y Push a GitHub
- [x] 7.1 Commit inicial con todos los cambios
- [x] 7.2 Push a origin/main
