# Plan de Importación: app-estadisticas-futbol → futsal-stats

## Resumen Ejecutivo

El proyecto `futsal-stats` ya tiene una base funcional (páginas, DB con migraciones, routing, sidebar, componente Modal). El objetivo es **fusionar incrementalmente** las funcionalidades del proyecto de fútbol (`app-estadisticas-futbol`), adaptando todo al futsal: 5 titulares en lugar de 11, posiciones distintas (Portero, Cierre, Ala, Pívot, Universal), formaciones tácticas propias, eventos específicos (dobles penaltis, tiempos muertos, faltas acumulativas), y estadísticas de nivel medio (~25 métricas en lugar de 80+).

---

## Diferencias Clave Fútbol → Futsal

| Aspecto | Fútbol | Futsal |
|---------|--------|--------|
| **Titulares** | 11 | 5 (incluyendo portero) |
| **Posiciones** | Portero, Defensa, Lateral, Mediocentro, Extremo, Delantero... | Portero, Cierre, Ala, Pívot, Universal |
| **Formaciones** | 1-4-4-2, 1-4-3-3, etc. (4 líneas) | 1-3-1, 1-2-1-1, 1-1-2-1, 1-3-1-0, 1-2-2, 1-1-3, 1-4-0, 1-0-4 |
| **Duración** | 2 tiempos de 45 min | 2 tiempos de 20 min (tiempo efectivo) |
| **Cambios** | Limitados (3-5) | Ilimitados (roll), con ventana de cambios |
| **Tiempos muertos** | No existen | 1 por equipo por tiempo (2 total) |
| **Faltas acumulativas** | No | Sí: a partir de la 6ª falta, tiro doble penalti |
| **Doble penalti** | No existe | Sí (segunda marca de penalti desde 10m) |
| **Tanda de penaltis** | 5 lanzadores | 3 lanzadores |
| **Campo** | Césped grande (100x68m) | Parquet/PVC pequeño (40x20m) |
| **Estadio** | Estadio | Pabellón/Pista |
| **Árbitros** | 1 principal (+ asistentes) | 2 principales (+ 3er árbitro + cronometrador) |
| **VAR** | Sí | No (no existe en futsal) |
| **Estadísticas jugador** | 80+ métricas (xG, xA, etc.) | ~25 métricas esenciales |

---

## FASE 1: Infraestructura y Base de Datos

### 1.1 — Sistema de Preferencias y db.ts
- [ ] Crear `src/db.ts` en futsal (basado en el de fútbol) que:
  - Cargue el schema desde migrations existentes
  - Implemente `iniciarBaseDeDatos()` con migraciones ALTER TABLE en cascada
  - Implemente `getPreferencia()` / `setPreferencia()` para persistencia
  - Use `sqlite:globalfutsal.db` (nombre ya existente en futsal)

### 1.2 — Migraciones de Base de Datos (nuevas columnas y tablas)
- [ ] Crear migración 7: `7_estadisticas_partido.sql`
  - Añadir columnas a `EstadisticaPartidoEquipo`: pases_totales, pases_precisos, centros_totales, centros_buenos, entradas_totales, entradas_ganadas, despejes, intercepciones, recuperaciones, duelos_ganados, duelos_perdidos, paradas, saques_banda, faltas_recibidas, balones_perdidos, saques_puerta, punos, formacion_local, formacion_visitante, metadata
  - Añadir a `Partido`: descuento_1, descuento_2, goles_1_prorroga_local, goles_1_prorroga_visitante, goles_2_prorroga_local, goles_2_prorroga_visitante, formacion_local, formacion_visitante, metadata
  - Añadir `rating REAL` a `Alineacion`

- [ ] Crear migración 8: `8_formaciones_futsal.sql`
  - Crear tabla `Formacion` con formaciones de futsal: 1-3-1, 1-2-1-1, 1-1-2-1, 1-3-1-0, 1-2-2, 1-1-3, 1-4-0, 1-0-4

- [ ] Crear migración 9: `9_estadistica_jugador.sql`
  - Crear tabla `EstadisticaPartidoJugador` con ~25 métricas clave:
    - minutos_jugados, goles, asistencias, tiros, tiros_puerta, pases_totales, pases_precisos, pases_clave, centros_totales, centros_buenos, entradas, intercepciones, recuperaciones, despejes, duelos_ganados, duelos_perdidos, faltas_cometidas, faltas_recibidas, tarjetas_amarillas, tarjetas_rojas, penaltis_marcados, penaltis_fallados, dobles_penaltis_marcados, dobles_penaltis_fallados, paradas, saques_banda, rating

- [ ] Crear migración 10: `10_preferencias.sql`
  - Crear tabla `Preferencia (clave TEXT PRIMARY KEY, valor TEXT)`

- [ ] Crear migración 11: `11_mejoras_adicionales.sql`
  - Añadir a `Equipo`: equipo_principal_id (filiales)
  - Añadir a `Competicion`: color1, color2, ambito
  - Añadir a `Participante`: grupo
  - Añadir a `Estadio`: anio_construccion, dimensiones

### 1.3 — Contextos React
- [ ] Crear `src/context/ThemeContext.tsx` (tema claro/oscuro persistente)
- [ ] Crear `src/context/EdicionContext.tsx` (edición activa seleccionable)
- [ ] Crear `src/context/ModoContext.tsx` (pantalla de selección de modo: Clubes/Selecciones)

### 1.4 — Actualizar lib.rs
- [ ] Añadir las nuevas migraciones al vector de migrations
- [ ] Mantener el comando `fetch_html` existente
- [ ] Añadir `tauri_plugin_shell` si hace falta

---

## FASE 2: Componentes Core del Partido

### 2.1 — CampoFutsal (equivalente a CampoFutbol)
- [ ] Crear `src/components/CampoFutsal.tsx`
  - Diseño de pista de futsal (parquet, líneas de área, marca de 10m, marca de 6m, círculo central)
  - Coordenadas para posiciones de futsal:
    - Portero: { x: 5, y: 50 }
    - Cierre: { x: 20, y: 50 }
    - Ala Izquierdo: { x: 35, y: 15 }
    - Ala Derecho: { x: 35, y: 85 }
    - Pívot: { x: 45, y: 50 }
    - Universal: { x: 30, y: 50 } (flexible)
  - Distribución inteligente de jugadores (resolución de colisiones)
  - Panel lateral con escudo, bandera, entrenador, formación táctica
  - Estadísticas: edad media, % extranjeros (titulares y convocatoria)
  - Selector de formación táctica desplegable
  - Token de jugador con foto, dorsal, bandera, tooltip hover
  - **5 titulares** en lugar de 11

### 2.2 — ModalEvento (gestión de eventos del partido)
- [ ] Crear `src/components/ModalEvento.tsx`
  - Tipos de evento adaptados a futsal:
    - **GOL**: subtipos = [Pie Derecho, Pie Izquierdo, Cabeza, Volea, Rebote, Doble Penalti, Falta Directa, Penalti, Propia Puerta, Olímpico, Chilena]
    - **ASISTENCIA**: subtipos = [Pase, Pase filtrado, Centro, Banda, Córner, Dejada, Rebote, Tiro parado, Tacón]
    - **TARJETA**: subtipos = [Amarilla, 2ª Amarilla, Roja, Azul (futsal específica)]
    - **FALTA_ACUMULATIVA** ⚡ NUEVO:跟踪 de faltas acumulativas por equipo (1-5 normales, 6+ = doble penalti)
    - **TIEMPO_MUERTO** ⚡ NUEVO: 1 por equipo por tiempo (max 2 total)
    - **CAMBIO**: ilimitados en futsal, con control de ventana (1ª parte, 2ª parte, prórroga)
    - **LESION**: [Leve, Grave, Conmoción]
    - **DOBLE_PENALTI** ⚡ NUEVO: evento específico de futsal (segunda marca)
    - **TANDA_PENALTI**: 3 lanzadores (en lugar de 5)
    - **GOL_ANULADO**: motivos = [Fuera de juego, Falta previa, Mano previa, etc.]
    - ❌ SIN VAR (no existe en futsal)
  - Selector de zona de gol (adaptado a pista de futsal)
  - Control de tiempos muertos consumidos
  - Control de faltas acumulativas (aviso visual al llegar a 5)

### 2.3 — EstadisticasPartido (estadísticas de equipo)
- [ ] Crear `src/components/EstadisticasPartido.tsx`
  - Vista visual con barras comparativas (local vs visitante)
  - Vista editor para introducir datos manualmente
  - Métricas de equipo (nivel medio, adaptadas a futsal):
    - Posesión, Tiros, Tiros a puerta, Esquinas/Córners, Faltas, Faltas acumulativas
    - Saques de banda, Saques de puerta, Tarjetas amarillas, Rojas
    - Pases totales, Pases precisos, Centros, Entradas, Intercepciones, Recuperaciones
    - Duelos ganados, Perdidos, Paradas (portero)
  - Integración con `ResumenPartidoIA` (Gemini)
  - Gráfico radar de rendimiento de equipo (`TeamPerformanceRadar`)

### 2.4 — EstadisticasJugadorPartido
- [ ] Crear `src/components/EstadisticasJugadorPartido.tsx`
  - Tabla editable con ~25 métricas por jugador
  - Carga/guardado en `EstadisticaPartidoJugador`
  - Columnas agrupadas: Ataque, Pases, Defensa, Portero, Disciplina

### 2.5 — ValoracionesPartido
- [ ] Crear `src/components/ValoracionesPartido.tsx`
  - Rating numérico por jugador (0-10)
  - Ordenado por posición (Portero → Cierre → Ala → Pívot → Universal)
  - Carga/guardado en `Alineacion.rating`
  - Estrellas visuales para MVP

### 2.6 — ResumenPartidoIA
- [ ] Crear `src/components/ResumenPartidoIA.tsx`
  - Integración con Gemini AI para generar crónica del partido
  - Streaming de respuesta en tiempo real
  - Botón copiar al portapapeles

### 2.7 — TandaPenaltisPartido
- [ ] Crear `src/components/TandaPenaltisPartido.tsx`
  - **3 lanzadores** por equipo (en lugar de 5)
  - Control de jugadores que acabaron el partido
  - Registro de: gol, parado, fuera, palo

### 2.8 — Componentes auxiliares
- [ ] Crear `src/components/BadgeFormacion.tsx` (badge visual de formación)
- [ ] Crear `src/components/IconoZonaGol.tsx` (SVG de mini-cancha para zona de gol)
- [ ] Crear `src/components/ModalGestionFormaciones.tsx` (CRUD de formaciones)
- [ ] Crear `src/components/ModalBuscarDuplicados.tsx` (buscar y fusionar duplicados)
- [ ] Crear `src/components/ModalComparador.tsx` (comparar jugadores/equipos)
- [ ] Crear `src/components/ModalConfigTabla.tsx` (configurar columnas y orden de clasificación)

### 2.9 — Charts
- [ ] Crear `src/components/charts/ComparisonMetricBar.tsx`
- [ ] Crear `src/components/charts/TeamPerformanceRadar.tsx`
- [ ] Crear `src/components/charts/PlayerMetricCard.tsx`
- [ ] Crear `src/components/charts/TacticalMetricIcon.tsx`

---

## FASE 3: Páginas Nuevas y Mejoradas

### 3.1 — DetallePartido (reescritura completa)
- [ ] Reescribir `src/pages/DetallePartido.tsx` con:
  - Tabs: Alineaciones | Eventos | Estadísticas | Valoraciones | Tanda Penaltis
  - Componente `CampoFutsal` en tab de alineaciones
  - Componente `ModalEvento` para gestionar eventos
  - Componente `EstadisticasPartido` en tab de stats
  - Componente `EstadisticasJugadorPartido` en tab de stats
  - Componente `ValoracionesPartido` en tab de valoraciones
  - Componente `TandaPenaltisPartido` (si hay penaltis)
  - Generación de acta PDF (`generarActaPartido`)
  - Grupos de posición de futsal:
    - Grupo 1: Portero
    - Grupo 2: Cierre
    - Grupo 3: Ala (Izquierdo, Derecho)
    - Grupo 4: Pívot
    - Grupo 5: Universal

### 3.2 — Configuracion (nueva página)
- [ ] Crear `src/pages/Configuracion.tsx`
  - Herramienta: sumar 1 año a fechas de nacimiento
  - Herramienta: reset de fábrica (borrar todos los datos)
  - Herramienta: buscar duplicados
  - Configuración de IA (Gemini API Key + modelo)
  - Exportación CSV de datos

### 3.3 — Rankings (nueva página)
- [ ] Crear `src/pages/Rankings.tsx`
  - Clasificación de la edición (tabla de liga)
  - Estadísticas de jugadores (top goleadores, asistentes, etc.)
  - Estadísticas de equipos (ataque, defensa, posesión)
  - Estadísticas de entrenadores
  - **Cinco Ideal** (equipo ideal de la jornada, en lugar de "Once Ideal")
  - Filtros por fase, jornada
  - Modal de configuración de tabla
  - Modal de detalle de equipo
  - Métricas de futsal (adaptadas, ~25 en lugar de 80+)

### 3.4 — Importar (nueva página)
- [ ] Crear `src/pages/Importar.tsx`
  - Importación de calendarios CSV (ya existe `calendario_primera_division_futbol_sala_2025-2026.pdf`)
  - Importación masiva de equipos/jugadores desde CSV
  - No StatsBomb (no existe para futsal)
  - Importación desde Excel/xlsx (hay archivos en Futsal_Data/)

### 3.5 — Mejoras a páginas existentes
- [ ] Mejorar `src/pages/Dashboard.tsx`: añadir KPIs más ricos, gráficos adicionales
- [ ] Mejorar `src/pages/CentroDatos.tsx`: añadir más métricas de futsal, filtros avanzados
- [ ] Mejorar `src/pages/Jugadores.tsx`: añadir exportación CSV, detalle enriquecido
- [ ] Mejorar todas las páginas con soporte de tema (claro/oscuro)

---

## FASE 4: Utilidades y Servicios

### 4.1 — Utilidades core
- [ ] Crear `src/utils/calculadoraLiga.ts`
  - `calcularClasificacion()` (con reglas de desempate configurables)
  - `obtenerEstadisticasJugadores()` (agregación de métricas por jugador)
  - `obtenerEstadisticasEquipos()` (agregación de métricas por equipo)
  - `obtenerEstadisticasEntrenadores()` (récord de entrenadores)
  - `obtenerReglasClasificacion()` (desempates: DG, goles a favor, enfrentamiento directo)
  - `obtenerCincoIdeal()` (mejores 5 jugadores de una jornada por posición)

- [ ] Crear `src/utils/pdfGenerator.ts`
  - `generarActaPartido()` con formato adaptado a futsal
  - Cabecera con escudos, árbitros (2 principales + 3er árbitro)
  - Alineaciones con formaciones de futsal
  - Eventos del partido
  - Estadísticas

- [ ] Crear `src/utils/csvExporters.ts`
  - `exportarPersonasCSV()` (jugadores, entrenadores, árbitros)
  - `exportarEquiposCSV()`
  - `exportarClasificacionCSV()`
  - `exportarEstadisticasJugadorCSV()`

- [ ] Crear `src/utils/generadorCalendario.ts`
  - Generación de calendario round-robin (ida y vuelta)
  - Soporte para grupos y fases
  - Distribución de pabellones

- [ ] Crear `src/utils/importadorCalendario.ts`
  - Parsear CSV de calendario de LNFS
  - Importar partidos desde el PDF extraído (`calendario_texto.txt`)

- [ ] Crear `src/utils/importadorMasivo.ts`
  - Importación masiva de equipos y jugadores desde CSV/Excel

- [ ] Crear `src/utils/imageHelpers.ts`
  - `getImgSrc()` helper para resolver rutas de imágenes
  - Integración con `convertFileSrc`

- [ ] Crear `src/utils/colorUtils.ts`
  - `getReadableTeamColor()` (generar color legible para textos)
  - `getLuminance()` (calcular luminosidad para contraste)
  - `resolveTeamMatchColors()` (resolver colores de equipación)

- [ ] Crear `src/utils/normalizar.ts`
  - Normalización de strings (búsqueda sin acentos)
  - Normalización de nombres de equipos

### 4.2 — Servicio Gemini AI
- [ ] Crear `src/services/geminiService.ts`
  - `loadPreferences()` / `setApiKey()` / `setModel()`
  - `generateMatchSummary()` con streaming
  - `hasApiKey()`
  - Prompt adaptado a futsal (terminología, posiciones, reglas)
  - Modelo por defecto: `gemini-2.0-flash` (actualizado)

---

## FASE 5: Seeds y Datos Iniciales

### 5.1 — Seeds de Confederaciones Futsal
- [ ] Crear `src/utils/seedConfederaciones.ts`
  - UEFA Futsal, CONMEBOL Futsal, AFC Futsal, CAF Futsal, CONCACAF Futsal, OFC Futsal
  - Mismas confederaciones pero con logos/colores de futsal

### 5.2 — Seeds de Competiciones de Futsal
- [ ] Crear seeds para:
  - **LNFS** (Liga Nacional de Fútbol Sala - Primera División)
  - **Copa de España de Futsal**
  - **UEFA Futsal Champions League**
  - **Copa del Rey de Futsal** (si aplica)
  - **Mundial de Futsal FIFA**
  - **Eurocopa de Futsal UEFA**
  - **Copa América de Futsal**
  - **Copa Libertadores de Futsal**
  - **AFC Futsal Asian Cup**
  - **Futsal Confederations Cup**

### 5.3 — Seed de Formaciones
- [ ] Insertar formaciones de futsal en la tabla `Formacion`:
  - 1-3-1 (más común)
  - 1-2-1-1 (con pívot adelantado)
  - 1-1-2-1 (con dos alas)
  - 1-3-1-0 (sin pívot, sistema defensivo)
  - 1-2-2 (cuatro jugadores libres)
  - 1-1-3 (ultra ofensivo)
  - 1-4-0 (caída total al pívot falso)
  - 1-0-4 (portero-línea, todos adelantados)

---

## FASE 6: Actualización de App.tsx y Routing

### 6.1 — App.tsx completo
- [ ] Reescribir `src/App.tsx` con:
  - `ThemeProvider` wrapper
  - `EdicionProvider` wrapper
  - `ModoProvider` wrapper con `PantallaModo`
  - Loading screen con spinner
  - Rutas nuevas:
    - `/configuracion` → Configuracion
    - `/rankings` → Rankings
    - `/importar` → Importar
  - Mantener todas las rutas existentes
  - Cambiar de `BrowserRouter` a `HashRouter` (mejor para Tauri)

### 6.2 — Sidebar actualizado
- [ ] Actualizar `src/components/Sidebar.tsx`:
  - Añadir entradas: Rankings, Importar, Configuracion
  - Integrar toggle de tema (claro/oscuro)
  - Selector de edición activa (como en fútbol)

### 6.3 — PantallaModo
- [ ] Crear `src/components/PantallaModo.tsx`
  - Selección inicial: Clubes | Selecciones | Ambos
  - Pantalla de bienvenida con logo y selección visual

---

## FASE 7: OnceIdeal → CincoIdeal

### 7.1 — CincoIdeal
- [ ] Crear `src/components/CincoIdeal.tsx` (equivalente a OnceIdeal)
  - **5 jugadores** en lugar de 11
  - Posiciones de futsal: 1 Portero + 1 Cierre + 2 Alas + 1 Pívot (o Universal)
  - Render en CampoFutsal con los mejores jugadores de la jornada
  - Rating medio mostrado
  - Escudo y bandera del jugador

---

## FASE 8: Integración y Testing

### 8.1 — Integración
- [ ] Conectar todas las páginas con los contextos
- [ ] Verificar que el flujo completo funciona:
  - Crear confederación → país → pabellón → equipo → jugadores → temporada → competición → edición → inscripción → plantillas → designaciones → partido → alineación → eventos → estadísticas → valoraciones → PDF → CSV → IA
- [ ] Verificar consistencia de nombres de DB (`globalfutsal.db` en todas partes)

### 8.2 — Testing
- [ ] Verificar que las migraciones no rompen la DB existente
- [ ] Verificar que los ALTER TABLE son idempotentes (try/catch)
- [ ] Probar importación de calendario CSV existente
- [ ] Probar generación de PDF
- [ ] Probar exportación CSV
- [ ] Probar resumen IA (si hay API key)

### 8.3 — Dependencias
- [ ] Verificar e instalar paquetes necesarios:
  - `jspdf` y `jspdf-autotable` (PDF)
  - `lucide-react` (iconos) — probablemente ya instalado
  - `react-icons` (iconos adicionales)
  - Verificar que `recharts` ya está instalado (gráficos)

---

## Orden de Ejecución Recomendado

1. **FASE 1** (DB + contextos) → sin esto no funciona nada
2. **FASE 4** (utils base) → funciones que usan todos los componentes
3. **FASE 2** (componentes core) → el corazón del partido
4. **FASE 3** (páginas) → que usan los componentes
5. **FASE 7** (CincoIdeal) → extensión de rankings
6. **FASE 5** (seeds) → datos de ejemplo
7. **FASE 6** (routing y sidebar) → conectar todo
8. **FASE 8** (testing) → verificar

---

## Archivos a Crear (resumen)

### Componentes (15)
- CampoFutsal.tsx
- ModalEvento.tsx
- EstadisticasPartido.tsx
- EstadisticasJugadorPartido.tsx
- ValoracionesPartido.tsx
- ResumenPartidoIA.tsx
- TandaPenaltisPartido.tsx
- BadgeFormacion.tsx
- IconoZonaGol.tsx
- ModalGestionFormaciones.tsx
- ModalBuscarDuplicados.tsx
- ModalComparador.tsx
- ModalConfigTabla.tsx
- PantallaModo.tsx
- CincoIdeal.tsx
- charts/ComparisonMetricBar.tsx
- charts/TeamPerformanceRadar.tsx
- charts/PlayerMetricCard.tsx
- charts/TacticalMetricIcon.tsx

### Páginas (3 nuevas + mejoras)
- Configuracion.tsx (nueva)
- Rankings.tsx (nueva)
- Importar.tsx (nueva)
- DetallePartido.tsx (reescritura completa)

### Utils (9)
- db.ts
- calculadoraLiga.ts
- pdfGenerator.ts
- csvExporters.ts
- generadorCalendario.ts
- importadorCalendario.ts
- importadorMasivo.ts
- imageHelpers.ts
- colorUtils.ts
- normalizar.ts

### Services (1)
- geminiService.ts

### Contexts (3)
- ThemeContext.tsx
- EdicionContext.tsx
- ModoContext.tsx

### Migrations (5)
- 7_estadisticas_partido.sql
- 8_formaciones_futsal.sql
- 9_estadistica_jugador.sql
- 10_preferencias.sql
- 11_mejoras_adicionales.sql

### Seeds (3+)
- seedConfederaciones.ts
- seedCompeticionesFutsal.ts
- seedFormaciones.ts

**Total: ~40 archivos nuevos/modificados**
