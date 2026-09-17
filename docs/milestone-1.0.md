# Milestone 1.0 — Futsal Stats "production-ready"

**Objetivo**: que otra persona pueda descargar el instalador, instalarlo, importar sus CSV y usar la app sin ti al lado. Todo lo demás (features nuevas) espera a esto.

**Principio rector**: cada bloque termina con "cómo se verifica". Un hito sin verificación es una intención, no un hito.

---

## Bloque 0 — Validar el camino de distribución (2-3 días, primero esto)

> Nada de lo demás importa si el instalador no funciona en una máquina limpia.

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 0.1 | **Bundle de producción en verde** | `npm run tauri build` → NSIS + MSI. Resolver lo que surja (iconos del bundle ya existen; `targets: all` puede fallar en firmas) | Instalador generado sin warnings bloqueantes; app arranca desde el .exe instalado |
| 0.2 | **Prueba en máquina limpia** | VM o PC sin Rust/Node: instalar NSIS, importar un CSV, guardar un acta | El flujo completo funciona sin entorno de desarrollo |
| 0.3 | ✅ **Primera ejecución sin carpeta dev** — HECHO: `carpetaSugerida()` resuelve en build la raíz real del proyecto (dev, válida en cualquier máquina vía `__RAIZ_PROYECTO__`) o `Documentos\Global Futsal Stats` en producción | App nueva sin BD previa: onboarding de carpeta de datos OK |
| 0.4 | ✅ **Versión y nombre coherentes** — HECHO: `productName: "Global Futsal Stats"`, publisher/copyright en tauri.conf.json, description real en Cargo.toml y package.json (ya no "A Tauri App"). Instaladores renombrados en consecuencia | Metadatos del instalador correctos en Agregar/Quitar programas |
| 0.5 | ✅ **CSP definida** (seguridad) — HECHO: `csp` estricta en producción (allowlist: Gemini en connect-src, Google Fonts en style/font-src, asset:/https: en img-src; Tauri añade hash del script de init) + `devCsp` para el HMR de Vite. Verificada en el binario release vía CDP: cabecera presente, host prohibido bloqueado con violación registrada, fuentes y app OK (`scripts/diag-csp-funcional.mjs`) | App funcional con CSP activa (pizarra, escudos, fetch) |

**Criterio de salida**: un instalador que otra persona instala y usa.

## Bloque 1 — Primera experiencia y datos (3-4 días)

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 1.1 | **Onboarding de importación** | Si `Persona` está vacía → pantalla de bienvenida que ofrece: elegir carpeta de datos → importar los 4 tipos de CSV en orden sugerido (equipos → competiciones → jugadores → entrenadores) con progreso | BD virgen → datos cargados sin tocar la página Importar a mano |
| 1.2 | **Errores de importación accionables** | Los toasts ya listan países no encontrados; añadir export del detalle (CSV/JSON) y enlace a la fila problemática cuando sea posible | Importar un CSV con países basura → detalle exportable |
| 1.3 | **Backups automáticos de la BD** | Copia diaria rotativa (últimos N) de `globalfutsal.db` al arrancar + botón "Crear copia / Restaurar" en Configuración | Borrar un dato, restaurar backup, dato de vuelta |
| 1.4 | **Manejo de BD corrupta** | Si el arranque falla por BD corrupta: mensaje claro + opción de restaurar el último backup (1.3) | Corromper una BD de prueba → app se recupera |

## Bloque 2 — Estabilidad y percepción de calidad (2-3 días, paralelizable)

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 2.1 | **Sweep de `console.error` silenciosos** (~40 en rutas de usuario) | Clasificar: (a) fallo visible por el usuario → toast con detalle, (b) ruido interno → silencio. Empezar por DetallePartido (11) | Grep limpio: 0 `console.error` sin decisión documentada |
| 2.2 | **Estados de carga y vacíos** | Cada página: spinner/estado vacío con CTA ("Importa datos", "Crea un equipo") | Recorrer las 20 páginas con BD virgen |
| 2.3 | **Ventana de error global** | Handler `onunhandledrejection`/`onerror` → toast + log a `Log` (la tabla ya existe) | Provocar error JS → aparece en Log y como toast |
| 2.4 | **Escudos/fotos rotos** | URLs remotas muertas → placeholder (iniciales) en vez de imagen rota | Lista de Equipos sin red o con URLs podridas |

## Bloque 3 — Distribución continua (1-2 días)

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 3.1 | **Job de release en CI** | Workflow que en tag `v*`: build NSIS + adjuntar a GitHub Release (draft). Sin firma de código por ahora (aviso de SmartScreen documentado en el README) | Tag de prueba → instalador adjunto al release |
| 3.2 | **Canal de actualizaciones** | Decidir: (a) descarga manual desde Releases (suficiente para empezar) o (b) `tauri-plugin-updater`. Empezar por (a) | Documentar el proceso de release en CONTRIBUTING |
| 3.3 | **README para usuarios (no para ti)** | Requisitos (Windows 10+, WebView2), qué hace la app, capturas, cómo importar datos, solución de problemas | Una persona ajena instala y carga datos siguiendo solo el README |

## Fuera de alcance del 1.0 (post-1.0)

- **Firma de código** (certificado ~$100-300/año; sin ella, SmartScreen avisa).
- **Multiplataforma** (macOS/Linux): el scope fs y las rutas son Windows-céntricos.
- **Multiusuario / nube**: la app es local-first; mantenerlo así.
- **Modo oscuro por sistema**, edición masiva de actas, estadísticas avanzadas.

## Riesgos y decisiones abiertas

1. **¿NSIS o MSI?** — NSIS para usuarios finales (mejor UX de instalación); MSI solo si hay deploy corporativo.
2. **WebView2 no presente en el equipo** — el bootstrapper de NSIS de Tauri lo descarga; verificar en la VM limpia (0.2).
3. **Tamaño de la BD con 70k personas** — ya medido: fluido con paginación; vigilar tras añadir índices nuevos.
4. **El identifier `com.fpons.futsal-stats`** — si algún día se publica con otro nombre, cambiarlo ANTES del primer release público (es la identidad de actualizaciones).

## Orden sugerido de ejecución

```
Semana 1: Bloque 0 completo (instalador + máquina limpia)
Semana 2: Bloque 1 (onboarding + backups)  |  Bloque 2 en paralelo si hay tiempo
Semana 3: Bloque 3 (release CI + README usuario) → TAG v1.0.0
```
