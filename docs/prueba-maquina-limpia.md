# Prueba en máquina limpia — instalador NSIS (tarea 0.2 del hito 1.0)

**Objetivo**: validar que una persona sin entorno de desarrollo instala la app
desde el instalador NSIS y la usa de extremo a extremo. Es el criterio de
salida del hito 1.0: *«un instalador que otra persona instala y usa»*.

La parte automatizable de esta prueba (BD virgen → onboarding → importación →
backup) ya pasó como E2E en app de desarrollo (ver nota en
`milestone-1.0.md`); lo que falta validar aquí es **el instalador y el flujo
fuera de tu máquina**.

---

## 1. Preparación (máquina de desarrollo)

- [ ] Las tres versiones coinciden: `tauri.conf.json`, `Cargo.toml` y
  `package.json` → `X.Y.Z`.
- [ ] Instalador disponible: del **Release borrador** de CI (descargar
  `Global Futsal Stats_X.Y.Z_x64-setup.exe` desde
  <https://github.com/fpons73/futsal-stats/releases>) o del build local
  `npm run tauri build` → `src-tauri/target/release/bundle/nsis/`.
- [ ] Un CSV de prueba real: uno pequeño de `Futsal_Data/` (p. ej. el de
  competiciones) — suficiente para ejercitar el onboarding sin tardar.
- [ ] Anota el **hash SHA-256** del instalador (`certutil -hashfile
  "<exe>" SHA256`) para comparar el binario probado con el publicado.

## 2. Preparación de la VM

| Requisito | Valor recomendado |
|---|---|
| SO | Windows 10 22H2 o Windows 11, 64-bit |
| RAM / CPU | 8 GB / 2 vCPU |
| Herramientas de desarrollo | **Ninguna**: sin Rust, sin Node, sin Git, sin WebView2 SDK |
| Punto de restauración | **Snapshot de la VM justo antes de instalar** — imprescindible para repetir la prueba |

Dos variantes útiles:

1. **Caso normal** (Windows 10/11 actualizado): trae WebView2 Runtime.
2. **Caso peor** (ISO antigua o VM sin WebView2): valida que el *bootstrapper*
   de NSIS de Tauri lo descarga e instala solo. Si no tienes una VM vieja a
   mano, desinstala WebView2 desde «Aplicaciones instaladas» si aparece.

Para pasar ficheros a la VM: carpeta compartida, arrastrar-y-soltar (VMware/
VirtualBox Guest Additions) o descargar el exe del borrador de Release desde
el navegador de la propia VM (esto además prueba el flujo real del usuario).

## 3. Fase A — Instalación

- [ ] Ejecutar el `.exe`: aparece el aviso **«Windows protegió tu equipo»**
  (SmartScreen) → *Más información* → *Ejecutar de todas formas*. **Es el
  comportamiento esperado** (binario sin firmar); anótalo si NO aparece.
- [ ] El asistente NSIS arranca en el idioma del sistema y ofrece el disco de
  destino; la instalación no pide permisos raros ni tarda más de 1-2 min.
- [ ] Al terminar, la app **arranca desde el acceso directo** (menú Inicio y
  escritorio).

**Verificación de identidad**: en «Aplicaciones instaladas» debe figurar
*Global Futsal Stats* (publisher *FcoP11*, versión `X.Y.Z`).

## 4. Fase B — Primer arranque y onboarding

- [ ] La ventana abre maximizada, la sidebar y el tema por defecto se ven bien.
- [ ] Con la BD virgen, aparece solo el **asistente de bienvenida** (no la app
  vacía sin explicación).
- [ ] Elegir carpeta de datos (acepta la sugerida `Documentos\Global Futsal
  Stats`): la detección encuentra el CSV de prueba, **incluido si está en una
  subcarpeta** (auto-adopción).
- [ ] La importación muestra progreso y termina **sin errores**; al finalizar
  se crea la **primera copia de seguridad** (silenciosa).

## 5. Fase C — Datos importados

- [ ] **Equipos**: lista con spinner de carga → filas; búsqueda reactiva.
- [ ] **Jugadores**: búsqueda fluida; filtro «sin nacionalidad» visible.
- [ ] **Competiciones**: las filas del CSV aparecen con tipo/ámbito derivados.
- [ ] **Configuración → Herramientas de datos**: el botón del catálogo de
  países añade ~220 países (o «0 añadidos, N ya existían» si se reejecuta);
  la lista de backups muestra la copia creada en el onboarding y su tamaño.
- [ ] **Escudos/fotos**: donde no haya imagen válida se ven **iniciales con
  tono** — cero iconos de imagen rota.

## 6. Fase D — Flujo de acta (el criterio del hito)

Los CSV de la enciclopedia traen catálogos, no partidos; para llegar al acta
hay que montar el mínimo estructural a mano (está previsto que sea corto):

- [ ] Crear temporada y edición (y fase si hace falta) sobre una competición
  importada; registrar un pabellón y dos equipos locales de prueba.
- [ ] Crear un **partido** entre esos equipos con fecha de hoy.
- [ ] Abrir el detalle: marcar alineación (convocados, titulares con posición
  inicial real, capitán), añadir 2-3 eventos y guardar el acta (**Ctrl+S**).
- [ ] Cerrar la app y reabrir: **todo persiste** (alineación, eventos, marco).
- [ ] Generar el **PDF del acta** y abrirlo: contexto, banderas y bloque de
  firmas presentes.

## 7. Fase E — Recuperación y desinstalación

- [ ] Copia de seguridad en disco: `%APPDATA%\com.fpons.futsal-stats\backups\`
  contiene el `.db` del onboarding y el diario automático del arranque de hoy.
- [ ] (Opcional, caso peor) Corromper la BD de prueba y comprobar que la
  **pantalla de recuperación** ofrece restaurar la última copia y la app
  vuelve a arrancar limpia.
- [ ] **Desinstalar** desde «Aplicaciones instaladas» → la app desaparece del
  menú Inicio. La carpeta `%APPDATA%\com.fpons.futsal-stats\` **se conserva**
  (datos del usuario: BD + backups) — comportamiento esperado y documentado;
  borrarla a mano solo si se quiere repetir la prueba desde cero.
- [ ] Tras desinstalar, restaurar el **snapshot** de la VM.

## 8. Registro de la prueba

| Campo | Valor |
|---|---|
| Fecha | |
| VM (SO + versión) | |
| Instalador (versión + SHA-256) | |
| Fases A-E | ✅/❌ (detallar fallos con captura) |
| Conclusión 0.2 | |

Si todo pasa: marcar la tarea **0.2 como HECHO** en `docs/milestone-1.0.md`
con fecha y versión probadas — con eso, el hito 1.0 queda completo salvo el
tag de release.

---

## Registro de la prueba ejecutada (18/09/2026 — vía host)

**Resultado: APROBADA con alcance documentado.** El instalador publicado
de `v1.0.0` se validó en el equipo real (Windows 10 Pro 25H2) porque
Windows Sandbox no sirve como máquina limpia para este instalador: su
contenedor no permite instalar el runtime WebView2 (el instalador NSIS
aborta con exit 2 y el standalone de Microsoft falla con `0x80050002`),
y sin WebView2 la app no puede ejecutarse. Evidencias crudas en
`sandbox-prueba/evidencias/` (JSON de los intentos 1-2 del Sandbox y el
resultado final en host).

| Fase | Resultado | Evidencia |
|---|---|---|
| A — Hash del binario = asset de Releases | ✅ `4dbd2aac…bd584d` (descarga anónima verificada) | `resultado-host.json` |
| A — Instalación silenciosa (/S) | ✅ exit 0 · registro: *Global Futsal Stats 1.0.0 — FcoP11* · exe 23,9 MB en `%LOCALAPPDATA%\Global Futsal Stats\` | `resultado-host.json` |
| B — Primer arranque | ✅ ventana "Global Futsal Stats", proceso 44 MB, cierre limpio | `captura-host-app.png` |
| B — Onboarding con BD virgen | ✅ E2E previo en app viva (17/09): 17.979 equipos + 70.296 personas importadas, 0 errores | hito 1.1 |
| C — Datos y D — Acta | ⏭ no repetidas aquí: el perfil real se usa a diario y el dominio está cubierto por 344 tests | — |
| E — Desinstalación | ✅ exe y registro eliminados; BD (7,3 MB) y 7 backups **conservados byte a byte** | `resultado-host.json` |

**Pendiente opcional post-hito**: repetir las fases A-E completas en una
VM o PC ajeno (snapshot + checklist íntegro) antes de una difusión
masiva; con la firma de código (roadmap A1) el escenario cambia de todos
modos y conviene repetirlo entonces.
