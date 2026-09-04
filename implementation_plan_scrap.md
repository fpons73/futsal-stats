# Plan de Implementación: Scraping de Partidos desde ceroacero.es

Este plan propone añadir la capacidad de automatizar la carga de actas oficiales (alineaciones y eventos) de un partido a partir de una URL de la web **ceroacero.es**.

---

## 🛡️ Backend: Bypass de CORS en Tauri

Para evitar las restricciones de CORS del navegador al realizar peticiones directas a `ceroacero.es` desde la interfaz React, utilizaremos el backend de Rust para descargar el contenido HTML.

### [MODIFY] [Cargo.toml](file:///c:/Proyectos/futsal-stats/src-tauri/Cargo.toml)
* **Objetivo:** Añadir `reqwest` como dependencia para realizar peticiones HTTP de forma nativa.
* **Detalle:**
  ```toml
  reqwest = { version = "0.12", features = ["blocking"] }
  ```

### [MODIFY] [lib.rs](file:///c:/Proyectos/futsal-stats/src-tauri/src/lib.rs)
* **Objetivo:** Implementar y registrar el comando Tauri `fetch_html`.
* **Detalle:**
  * Crear la función `fetch_html` que recibe una URL, realiza una petición GET simulando un navegador común (User-Agent) y devuelve el cuerpo HTML.
  * Registrar la función en el constructor del builder de Tauri.

---

## 🎨 Frontend: Interfaz de Scraping Premium

Añadiremos un botón y un modal interactivo en la vista de detalle del partido que permita ingresar la URL de ceroacero, muestre una previsualización de los datos parseados y permita mapear los jugadores detectados en la web con los de las plantillas actuales de la base de datos de manera visual e interactiva.

### [MODIFY] [DetallePartido.tsx](file:///c:/Proyectos/futsal-stats/src/pages/DetallePartido.tsx)
* **Objetivo:** Integrar el flujo de scraping completo.
* **Flujo de Trabajo:**
  1. **Botón de Acción:** Añadir el botón "Importar desde CeroaCero" en la pestaña de Alineaciones y Eventos.
  2. **Diálogo de Entrada:** Mostrar un modal para pegar la URL.
  3. **Descarga y Parseo (TypeScript / DOMParser):**
     * Descargar el HTML a través del comando `fetch_html`.
     * Utilizar `DOMParser` para extraer de forma robusta:
       * **Alineaciones:** Titulares, suplentes y entrenadores de ambos equipos (nombre, dorsal, capitanía).
       * **Goles:** Minuto, jugador, si es penalti (indicado por `(p)`) o en propia puerta (p.p.).
       * **Tarjetas:** Minuto, jugador y tipo (amarilla, roja, doble amarilla).
  4. **Pantalla de Mapeo Inteligente (Premium UI):**
     * Presentar una lista de comparación donde el usuario vea qué jugadores se encontraron en la web y cómo se asocian automáticamente (por nombre deportivo) con la plantilla actual del equipo en la base de datos.
     * Permitir al usuario seleccionar manualmente la equivalencia si el nombre no es idéntico.
  5. **Confirmación y Guardado:**
     * Al hacer clic en "Confirmar e Importar", se eliminarán las alineaciones/eventos previos del partido y se guardarán los nuevos mapeados directamente en `Alineacion` y `Evento`, actualizando también el marcador general del partido.

---

## 🧪 Plan de Verificación

1. **Prueba de Conexión:** Comprobar que el comando Rust descarga el HTML sin bloqueos ni errores de certificado TLS.
2. **Prueba de Parsing:** Validar con la URL real provista por el usuario (`https://www.ceroacero.es/partido/2025-09-05-o-parrulo-ferrol-nitida-alzira/11061953`) que se extraen correctamente:
   * 5 titulares y los suplentes de cada equipo.
   * Los entrenadores asignados.
   * Goles (y penaltis).
   * Tarjetas con sus respectivos minutos.
3. **Guardado en Base de Datos:** Comprobar en el Centro de Datos y en la interfaz que las estadísticas se calculan a la perfección a partir de la importación.
