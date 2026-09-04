# Plan de Implementación: Transformación Visual Premium de Global Futsal Stats

Este plan detalla los cambios propuestos para actualizar la interfaz visual de la aplicación a un diseño premium y de última generación. Aplicaremos principios de diseño modernos como **glassmorphism (efectos de cristal templado)**, **gradientes de acento brillantes**, **sombras suaves de alta definición**, **micro-animaciones interactivas** y una **paleta de colores oscura y lujosa (Dark-Mode First)** que realce el carácter analítico y deportivo del sistema.

---

## 1. Cambios Propuestos

### 🎨 Componente: Sistema de Diseño y Estilos Globales

#### [MODIFY] [tailwind.config.js](file:///c:/Proyectos/futsal-stats/tailwind.config.js)
* **Objetivo:** Ampliar la paleta oficial e integrar utilidades premium.
* **Detalles:**
  * Configurar soporte nativo de modo oscuro (`darkMode: 'class'`).
  * Agregar sombras de alta definición (`boxShadow` extendido como `glass`, `glass-hover` y `neon`).
  * Configurar una tipografía moderna de alto impacto: **Outfit** para encabezados/números deportivos e **Inter** para textos legibles de datos.
  * Añadir colores de acento vibrantes (naranja energético con brillo, azul neon, violeta digital).

#### [MODIFY] [index.css](file:///c:/Proyectos/futsal-stats/src/index.css)
* **Objetivo:** Configurar las fuentes y las clases globales de cristal/glassmorphism.
* **Detalles:**
  * Importar las fuentes de Google Fonts (**Outfit** e **Inter**).
  * Crear clases de utilidad reutilizables de CSS para efectos de cristal (`.glass-panel`, `.glass-panel-hover`, `.neon-glow`).
  * Reemplazar el fondo plano del cuerpo por un gradiente de alta calidad deportivo y moderno.

---

### 🧱 Componente: Estructura y Navegación (Sidebar)

#### [MODIFY] [Sidebar.tsx](file:///c:/Proyectos/futsal-stats/src/components/Sidebar.tsx)
* **Objetivo:** Lograr una barra lateral que se vea sumamente futurista y premium.
* **Detalles:**
  * Fondo de cristal templado semi-transparente oscuro con bordes brillantes (`backdrop-blur-xl bg-navy-dark/90 border-r border-white/5`).
  * El logo tendrá un anillo brillante de color naranja/oro.
  * Los elementos activos del menú contarán con un degradado de púrpura a naranja brillante con sombra de brillo neón sutil, eliminando bordes planos.
  * Transiciones de hover dinámicas más elegantes (`duration-300 scale-[1.02]`).

---

### 📊 Componente: Panel de Control (Dashboard)

#### [MODIFY] [Dashboard.tsx](file:///c:/Proyectos/futsal-stats/src/pages/Dashboard.tsx)
* **Objetivo:** Convertir el Dashboard de una interfaz simple a una suite de análisis deportivo de nivel profesional.
* **Detalles:**
  * **Fondo del Dashboard:** Adaptado para integrarse perfectamente al gradiente de la aplicación.
  * **KPICards Renovadas:** Diseño de cristal redondeado de alta definición, efectos de brillo al pasar el cursor (hover), contenedores de iconos con degradados brillantes y tipografías en Outfit extra-bold de gran tamaño.
  * **Distribución de Posiciones (Gráfico de Barras):** Reemplazar la barra plana azul por un gráfico con gradiente brillante y esquinas redondeadas suavizadas.
  * **Goles Local vs Visitante (Gráfica Circular):** Optimizar los colores a verde esmeralda futsal brillante y azul profundo metálico con un anillo más fino y elegante.
  * **Top de Países:** Tablas con filas redondeadas tipo cristal, efectos hover suaves y números de ranking destacados en gradiente naranja.

---

### ⚙️ Componente: Ajustes de Layout Principal

#### [MODIFY] [App.tsx](file:///c:/Proyectos/futsal-stats/src/App.tsx)
* **Objetivo:** Sincronizar el layout para usar el nuevo fondo de gradiente global.
* **Detalles:**
  * Modificar el fondo principal del contenedor y el elemento `main` para que sea transparente y deje lucir el degradado global en lugar del gris plano.

---

## 2. Plan de Verificación

### Pruebas Visuales Manuales
* **Dashboard y Navegación:** Comprobar la visualización correcta de los gráficos con el nuevo diseño, la legibilidad de las tipografías "Outfit" e "Inter", los efectos hover de las tarjetas KPI y el menú lateral.
* **Responsividad:** Asegurar que el efecto de desenfoque de fondo (backdrop-filter) funcione de forma fluida y sin caídas de frames en el renderizado local de Tauri.
