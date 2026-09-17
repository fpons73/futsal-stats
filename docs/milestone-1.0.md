# Milestone 1.0 — Futsal Stats "production-ready"

**Objetivo**: que otra persona pueda descargar el instalador, instalarlo, importar sus CSV y usar la app sin ti al lado. Todo lo demás (features nuevas) espera a esto.

**Principio rector**: cada bloque termina con "cómo se verifica". Un hito sin verificación es una intención, no un hito.

---

## Bloque 0 — Validar el camino de distribución (2-3 días, primero esto)

> Nada de lo demás importa si el instalador no funciona en una máquina limpia.

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 0.1 | **Bundle de producción en verde** | `npm run tauri build` → NSIS + MSI. Resolver lo que surja (iconos del bundle ya existen; `targets: all` puede fallar en firmas) | Instalador generado sin warnings bloqueantes; app arranca desde el .exe instalado |
| 0.2 | **Prueba en máquina limpia** | VM o PC sin Rust/Node: instalar NSIS, importar un CSV, guardar un acta. **Guía con checklist ejecutable**: [`docs/prueba-maquina-limpia.md`](./prueba-maquina-limpia.md) | El flujo completo funciona sin entorno de desarrollo |

> **Nota 0.2**: la parte automatizable de la prueba en máquina limpia ya está hecha — el E2E de primera instalación (BD virgen → onboarding → importación completa → backup) pasó de extremo a extremo en app viva (17/09/2026). Queda la instalación del NSIS en VM sin Rust/Node siguiendo [`docs/prueba-maquina-limpia.md`](./prueba-maquina-limpia.md).
| 0.3 | ✅ **Primera ejecución sin carpeta dev** — HECHO: `carpetaSugerida()` resuelve en build la raíz real del proyecto (dev, válida en cualquier máquina vía `__RAIZ_PROYECTO__`) o `Documentos\Global Futsal Stats` en producción | App nueva sin BD previa: onboarding de carpeta de datos OK |
| 0.4 | ✅ **Versión y nombre coherentes** — HECHO: `productName: "Global Futsal Stats"`, publisher/copyright en tauri.conf.json, description real en Cargo.toml y package.json (ya no "A Tauri App"). Instaladores renombrados en consecuencia | Metadatos del instalador correctos en Agregar/Quitar programas |
| 0.5 | ✅ **CSP definida** (seguridad) — HECHO: `csp` estricta en producción (allowlist: Gemini en connect-src, Google Fonts en style/font-src, asset:/https: en img-src; Tauri añade hash del script de init) + `devCsp` para el HMR de Vite. Verificada en el binario release vía CDP: cabecera presente, host prohibido bloqueado con violación registrada, fuentes y app OK (`scripts/diag-csp-funcional.mjs`) | App funcional con CSP activa (pizarra, escudos, fetch) |

**Criterio de salida**: un instalador que otra persona instala y usa.

**Cierre**: la rc `v1.0.0-rc.1` está etiquetada con instalador generado en CI;
el paso a `1.0.0` final está documentado paso a paso en
[`docs/cierre-v1-0-0.md`](./cierre-v1-0-0.md) (validación en VM → bump →
notas → tag → publicación, con contingencia `rc.2`).

## Bloque 1 — Primera experiencia y datos (3-4 días)

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 1.1 | ✅ **Onboarding de importación** — HECHO: `src/components/Onboarding.tsx` se muestra en App.tsx cuando `esBaseVacia()` (Persona y Equipo a cero) y no hay `onboarding_completado` en Preferencia. Elige carpeta (sugerida por contexto), detecta los CSV de la Enciclopedia y importa en orden de dependencias con progreso y detalle; saltar no importa nada; los importadores reciben rutas de fichero localizadas por patrón (idempotente). **Auto-adopción de subcarpeta**: si la carpeta elegida no tiene CSV pero una subcarpeta inmediata sí (p. ej. `Futsal_Data`), la adopta sola. **Copia de seguridad post-importación**: al terminar crea la primera copia real (la automática del arranque guardó la BD vacía). 4 tests. **E2E verificado en app viva sobre BD virgen**: 17.979 equipos, 70.296 personas y 1.501 competiciones importados con 0 errores; reimportación idempotente; backup final de 7 MB con todos los datos | BD virgen → datos cargados sin tocar la página Importar a mano |
| 1.2 | ✅ **Errores de importación accionables** — HECHO: `src/utils/informeImportacion.ts` (modelo `InformeImportacion` con filas con error numeradas y países sin coincidencia, serialización CSV de dos secciones + JSON redondo, exportación con diálogo nativo). Los 4 importadores masivos registran `ULTIMOS_INFORMES`; la página Importar muestra panel ámbar con resumen y botones CSV/JSON cuando hay avisos, y el onboarding ofrece exportar por tipo afectado. 5 tests | Importar un CSV con países basura → detalle exportable |
| 1.3 | ✅ **Backups automáticos de la BD** — HECHO: módulo `src-tauri/src/backups.rs` (VACUUM INTO, rotación por nombre con fecha, verificación integrity_check + esquema antes de restaurar), backup diario al arrancar (una vez al día, silencioso), comandos `crear_backup_bd`/`listar_backups_bd`/`restaurar_backup_bd`/`guardar_retencion_backups` y tarjeta en Configuración (crear ahora, lista con fecha/tamaño, restaurar con confirmación temática + reinicio, retención 1-365 aplicada al momento). 3 tests de integración Rust sobre BD migrada real | Borrar un dato, restaurar backup, dato de vuelta |
| 1.4 | ✅ **Manejo de BD corrupta** — HECHO: comando `diagnosticar_bd` (integrity_check + esquema + última copia) y comprobación PROACTIVA en cada arranque (SQLite arranca "bien" con páginas dañadas: esperar al fallo es tarde). Pantalla `PantallaRecuperacion` con diagnóstico, oferta de restaurar la última copia verificada y reinicio. Probado de verdad: BD dañada a mano → pantalla → restaurar desde la UI → integrity ok con los 70.480 datos | Corromper una BD de prueba → app se recupera |

## Bloque 2 — Estabilidad y percepción de calidad (2-3 días, paralelizable)

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 2.1 | ✅ **Sweep de `console.error` silenciosos** — HECHO: auditoría con `scripts/inventario-console.mjs` (77 en pages; 73 ya con doble reporte console+toast, 3 casos reales corregidos: Importar round-robin muestra el primer error real en el toast, Configuración lista backups con toast suave, snapshot del undo con silencio JUSTIFICADO documentado). Política permanente en `consolePolitica.test.ts`: todo catch silencioso sin toast, acumulador de informe o comentario justificado rompe el build | Grep limpio: 0 `console.error` sin decisión documentada |
| 2.2 | ✅ **Estados vacíos con CTA** — HECHO: componente `EstadoVacio` (icono, título, descripción, acciones con Link/onClick, modo `porFiltros` para búsqueda sin resultados) aplicado a 13 páginas de listado con CTA contextual real (Importar CSV, Crear X, Limpiar búsqueda, seeds). Cobertura permanente en `estadoVacioCobertura.test.ts`. **Catálogo de países** (bonus post-E2E): `seedPaises.ts` con ~220 países ISO2/ISO3 + confederación FIFA y `Desconocido`, siembra idempotente desde Configuración que nunca sobreescribe países existentes (dedupe robusto sin acentos/signos) y **enriquece** los existentes sin confederación (215 vinculados en BD real). 7 tests. **Spinners de primera carga** (hueco menor cerrado): `SpinnerCarga` accesible (role=status) aplicado a las 12 páginas de listado con carga al montar o al cambiar de edición — el EstadoVacio ya no destella durante la carga; cobertura estática permanente en `spinnerCargaCobertura.test.ts` (14 tests) | Recorrer las 20 páginas con BD virgen |
| 2.3 | ✅ **Ventana de error global** — HECHO: `src/utils/registroErrores.ts` (store singleton) + `PanelErrores.tsx` (panel deslizante desde la sidebar con badge de no vistos). Captura triple: `console.error` (puentea la política 2.1), `window.onerror` y `unhandledrejection`, con deduplicación en ráfaga (2 s), límite de 500 entradas, filtrado por nivel/texto, detalle expandible con stack, exportar CSV y limpiar con confirmación. **Desviación justificada**: persistencia en localStorage en vez de la tabla `Log` de SQLite — el caso de uso principal es diagnosticar cuando la BD es la rota. 18 tests. **Primer bug real cazado en su primera sesión**: checksum de la migración 13 desalineado en la BD dev (fichero editado tras aplicarse); reparado y arranque verificado limpio | Provocar error JS → aparece en el panel y con badge en la sidebar |
| 2.4 | ✅ **Escudos/fotos rotos** — HECHO: `ImagenSegura.tsx` (`Escudo`, `Bandera`, `AvatarPersona`) + `ImagenLocal` modernizado (API intacta, sus 35 usos heredan el fallback). La BD no tenía URLs remotas sino **rutas locales muertas** (`Desktop\BD Futbol Sala\...`): cualquier ruta ausente/muerta muestra ahora iniciales del nombre con tono determinista (mismo nombre → mismo color), nunca una imagen rota; banderas pequeñas usan un chip con title. 15 tests. Verificado en vivo: Equipos/Partidos/Dashboard con 0 `<img>` rotas e iniciales donde antes había escudos podridos | Lista de Equipos sin red o con URLs podridas |

## Bloque 3 — Distribución continua (1-2 días)

| # | Tarea | Detalle | Verificación |
|---|---|---|---|
| 3.1 | ✅ **Job de release en CI** — HECHO: `.github/workflows/release.yml` dispara en tag `v*` (y `workflow_dispatch` para regenerar sin tocar tags): `npm ci` + `tauri-action` en `windows-latest` → NSIS + MSI adjuntos a un **Release borrador** con cuerpo predefinido (instrucciones + aviso SmartScreen). Test estático permanente (`releaseWorkflow.test.ts`) blinda disparadores, runner y draft | Tag de prueba → instalador adjunto al release |
| 3.2 | ✅ **Canal de actualizaciones** — HECHO: (a) descarga manual desde Releases (decisión documentada; sin `tauri-plugin-updater` en la 1.0). Proceso completo de release (versionado triple conf/Cargo/package, tag, draft, publicación, firma post-1.0) en `CONTRIBUTING.md` | Documentar el proceso de release en CONTRIBUTING |
| 3.3 | ✅ **README para usuarios (no para ti)** — HECHO: sección «Instalación (usuarios)» con descarga desde Releases, requisitos (Windows 10+, WebView2 con descarga automática si falta), aviso SmartScreen paso a paso, «Primer uso» (asistente de bienvenida, catálogo de países, backups) y «Solución de problemas» (panel de errores, imágenes con iniciales, informes de importación, recuperación de BD) | Una persona ajena instala y carga datos siguiendo solo el README |

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
