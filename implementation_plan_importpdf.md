# Plan de Implementación: Importación de Calendario de Competición en PDF

Este plan describe el diseño y desarrollo de una nueva funcionalidad en la pantalla de **Partidos** para importar un calendario completo de competición a partir de un archivo PDF (como `calendario_primera_division_futbol_sala_2025-2026.pdf`). 

El sistema extraerá automáticamente las jornadas, las fechas y los enfrentamientos, y permitirá al usuario realizar un mapeo inteligente (fuzzy matching) entre los nombres de los equipos detectados en el PDF y los equipos reales en la base de datos `globalfutsal.db`, creando automáticamente las fases ("Primera Vuelta", "Segunda Vuelta") y los partidos necesarios en estado "programado".

---

## User Review Required

> [!IMPORTANT]
> **Mapeo Inteligente y Creación de Equipos Nuevos**
> Para garantizar una importación fluida, el sistema mostrará un paso de confirmación ("Paso 2") en el que se listarán todos los equipos detectados en el PDF y su correspondencia sugerida en la base de datos (mediante algoritmos de Levenshtein y normalización).
> - Si un equipo no existe o tiene un nombre muy diferente, el usuario podrá vincularlo manualmente a un equipo de la base de datos mediante un menú desplegable.
> - O bien, podrá seleccionar la opción **"+ Crear Nuevo Equipo [Nombre]"** para que el sistema lo registre de forma automática en la base de datos (con país predeterminado España y categoría Senior) e inscriba tanto a los equipos nuevos como existentes en la edición activa.

> [!TIP]
> **Fases Automáticas (Primera y Segunda Vuelta)**
> El sistema detectará las secciones "Primera Vuelta" y "Segunda Vuelta" del PDF para vincular cada partido a su correspondiente fase (creándolas en la tabla `Fase` si no existen). La jornada (p. ej. "1", "2") se almacenará en la columna `jornada` de la tabla `Partido`.

---

## Proposed Changes

### 📁 Archivos de Librería (Offline)

#### [NEW] [pdf.min.js](file:///c:/Proyectos/futsal-stats/public/js/pdf.min.js) y [pdf.worker.min.js](file:///c:/Proyectos/futsal-stats/public/js/pdf.worker.min.js)
* **Estado:** Ya descargados en la carpeta `public/js/` para garantizar funcionamiento 100% local, rápido y sin dependencias externas complejas de Vite/Rust.

---

### 📊 Componente de Frontend: Gestión de Partidos

#### [MODIFY] [Partidos.tsx](file:///c:/Proyectos/futsal-stats/src/pages/Partidos.tsx)
* **Objetivo:** Integrar el botón "Importar Calendario PDF", agregar el modal paso a paso con la lógica de parseo con PDF.js offline, el mapeo visual de equipos y la inserción transaccional en SQLite.
* **Detalles de la Implementación:**
  1. **UI en la Cabecera:**
     - Añadir un botón premium "Importar Calendario" al lado del botón "Programar" con el icono `Calendar` y un diseño moderno (glassmorphism con borde brillante).
     - Añadir un input oculto de tipo file para seleccionar el PDF de calendario.
  2. **Modal del Importador de Calendario (`isCalendarModalOpen`):**
     - **Paso 1: Selección y Extracción.**
       - Diseñar una zona de arrastrar y soltar (drop-zone) o botón de exploración muy vistoso.
       - Extraer texto de forma asíncrona cargando `/js/pdf.min.js` y configurando el worker en `/js/pdf.worker.min.js`.
     - **Paso 2: Mapeo de Equipos.**
       - Mostrar una tabla premium con:
         - Columna Izquierda: Nombre del equipo encontrado en el PDF (p. ej. `CA Osasuna Magna`).
         - Columna Derecha: Dropdown de selección con los equipos de la base de datos, pre-seleccionando de forma difusa (fuzzy logic) la mejor coincidencia.
         - Opción adicional en el dropdown: `+ Crear Nuevo Equipo (Nombre en PDF)`.
     - **Paso 3: Confirmación e Importación.**
       - Botón "Confirmar e Importar [X] Partidos".
       - Barra de progreso interactiva o animación de carga mientras se ejecuta el proceso en la base de datos.
  3. **Lógica de Parseo de Texto:**
     - Identificar el inicio de fases ("Primera Vuelta" -> `Fase` "Primera Vuelta", "Segunda Vuelta" -> `Fase` "Segunda Vuelta").
     - Detectar líneas de Jornada: `/Jornada\s+(\d+)\s*\(([^)]+)\)/i` para extraer el número de jornada y la fecha (en formato `DD-MM-YYYY`).
     - Detectar líneas de partidos separadas por `-` (p. ej., `Local - Visitante`).
  4. **Lógica de Guardado en Base de Datos:**
     - **Equipos Nuevos:** Insertar los equipos marcados como nuevos en la tabla `Equipo` (abreviatura automática de 3 letras, país de la base de datos o España, categoría "Senior").
     - **Inscripciones:** Verificar e inscribir a todos los equipos involucrados en la `Edición` activa (`Inscripcion` table) si no lo están.
     - **Fases:** Buscar o insertar las fases "Primera Vuelta" (orden 1) y "Segunda Vuelta" (orden 2) para la edición activa.
     - **Partidos:** Para cada enfrentamiento:
       - Convertir la fecha `DD-MM-YYYY` a `YYYY-MM-DD 20:00`.
       - Verificar si ya existe un partido entre ambos equipos en esta edición.
       - Si existe y está en estado `programado`, actualizar su fecha, hora, `fase_id` y `jornada`. Si no está en estado `programado` (p. ej., finalizado), conservarlo intacto.
       - Si no existe, insertar un nuevo `Partido` con estado `'programado'`, marcadores a 0 y `fase_id` correspondiente.
  5. **Feedback Final:** Mostrar un resumen premium de los partidos creados y actualizados con éxito.

---

## Verification Plan

### Automated & Manual Tests
1. **Ejecutar el servidor local:** Correr la aplicación Tauri usando `npm run tauri dev`.
2. **Probar el importador con el calendario PDF:**
   - Seleccionar la edición activa (p. ej. "Primera División (2025-2026)").
   - Hacer clic en "Importar Calendario".
   - Subir el archivo `calendario_primera_division_futbol_sala_2025-2026.pdf`.
   - Verificar que el Paso 2 carga correctamente la lista de 16 equipos detectados y sugiere las coincidencias difusas adecuadamente.
   - Probar a cambiar un mapeo o seleccionar `+ Crear Nuevo Equipo` para comprobar la flexibilidad.
   - Confirmar la importación.
3. **Verificar los datos creados:**
   - Comprobar que en la lista de partidos aparecen los partidos de la Jornada 1 con fecha `2025-09-06` a las `20:00` en estado "PROGRAMADO".
   - Filtrar por la Fase "Primera Vuelta" o "Segunda Vuelta" y verificar que las jornadas 1-15 y 16-30 cargan perfectamente.
   - Verificar en la base de datos que no se han generado duplicados y que los equipos nuevos están debidamente inscritos en la edición.
