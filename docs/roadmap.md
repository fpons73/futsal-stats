# Roadmap post-1.0

Plan de evolución a partir de la `v1.0.0` publicada. Dos vías paralelas:
**distribución profesional** (que la app llegue bien a gente que no es el
autor) y **funcionalidad** (que la app haga más cosas para quien ya la
tiene). Cada bloque tiene criterio de salida medible, como en el hito 1.0.

Estado actual de partida: `v1.0.0` estable publicada (instalador NSIS,
10,4 MB), 344 tests, CI + release workflow en verde, sin firma de código
(SmartScreen avisa), actualización por descarga manual desde Releases,
tarea 0.2 (validación en máquina limpia) pendiente de ejecutar en el
Sandbox con el material ya preparado en `sandbox-prueba/`.

---

## Vía A — Distribución profesional

### A0 · Cerrar la validación 0.2 — ✅ HECHA (18/09/2026)

El instalador publicado de `v1.0.0` se validó con arnés automático en el
equipo real: Windows Sandbox resultó inviable como máquina limpia (su
contenedor no permite instalar WebView2 — exit 2 del NSIS, `0x80050002`
del standalone de Microsoft). Instalación exit 0, arranque con ventana,
desinstalación conservando BD y backups byte a byte. Detalle en el hito
1.0 (fila 0.2) y en el registro de `prueba-maquina-limpia.md`.
**Hito 1.0 al 100 %.** Pendiente opcional: repetir el checklist íntegro
en VM/PC ajeno antes de difusión masiva (natural hacerlo junto a A1,
cuando el binario ya vaya firmado).

### A1 · Firma de código — 🟡 INTEGRACIÓN HECHA, certificado pendiente (18/09/2026)

La mecánica completa está integrada y es segura por diseño: `release.yml`
conecta la tarjeta cloud de Certum (SimplySign) **solo si existen los
secrets** (`CERTUM_OTP_URI`, `CERTUM_USERNAME`, `CERTUM_KEY_ID`) y firma cada
artefacto vía `bundle.windows.signCommand` → `scripts/firmar/signar.ps1`
(signtool sha256 + sello de tiempo RFC 3161 de Certum). Sin secrets, la
release se genera sin firmar exactamente como hasta ahora. Proceso de
contratación y custodia de secrets documentado en `CONTRIBUTING.md`.

**Pendiente (decisión de compra, no de código)**: contratar el certificado
Certum OSS (~25-70 €/año), dar de alta los tres secrets y lanzar una release
de prueba (dispatch manual) verificando la firma con `signtool verify /pa`.
Nota 2024: EV ya no acelera la reputación de SmartScreen — Certum OSS es la
elección salvo que surja distribución corporativa.

### A2 · Auto-actualizador (`tauri-plugin-updater`)

Hoy el usuario no tiene forma de saber que hay versión nueva. El plugin
oficial de Tauri da aviso + actualización con un clic.

| Tarea | Notas |
|---|---|
| Endpoint de últimas versiones | Un JSON estático en el repo (`latest.json`, vía GitHub Pages o raw) con versión, URL de descarga y nota de release. Sin backend. |
| Firmar los artefactos de actualización | El updater exige firmas (`minisign`): `tauri signer generate` → clave privada en secret del repo, pública en el JSON. **Depende de A1** (misma disciplina de firma; los artefactos ya se generan en CI). |
| UI de actualización | Aviso no bloqueante en la sidebar (badge "v1.1 disponible") + diálogo de instalación con reinicio de la app. |
| Frecuencia de comprobación | Al arrancar y cada 24 h (configurable en Configuración, con botón "Buscar actualizaciones"). |

**Criterio de salida**: usuario con la 1.0.0 recibe el aviso de la
siguiente release y se actualiza sin volver a GitHub.

**Riesgos**: la clave de firma del updater es el secreto más crítico del
proyecto (fuga = actualizaciones suplantables); documentar su custodia.

---

## Vía B — Funcionalidad

Prioridad dada por el uso real que ya se le da a la app (datos masivos
importados de la Enciclopedia + gestión diaria de partidos).

### B1 · Estadísticas acumuladas y clasificaciones (el salto natural)

La BD ya tiene 17.979 equipos, 70.296 personas y miles de partidos: la
app es una enciclopedia consultable pero aún no explota los datos.

| Tarea | Detalle |
|---|---|
| Clasificación de liga automática | `calculadoraLiga.ts` ya existe: exponerla como página de Clasificación por grupo/temporada con partidos jugados, victorias, diferencia de goles (futsal: goles a favor/en contra). |
| Ficha de equipo enriquecida | Historial de temporadas, plantilla por temporada, resultados, racha. |
| Ficha de jugador enriquecida | Trayectoria completa, minutos/goles por temporada, comparativa. |
| Rankings avanzados | `Rankings.tsx` existe: goleadores, asistentes, fairness, por competición y temporada. |

**Criterio de salida**: desde un equipo, ver su clasificación y sus
jugadores sin escribir SQL a mano; rankings de la temporada en un clic.

### B2 · Vivir el partido (pizarra → seguimiento en vivo)

La pizarra táctica ya funciona; convertirla en herramienta de banquillo.

| Tarea | Detalle |
|---|---|
| Cronómetro de partido | Tiempo juego/reloj real, periodos de 20 min, registro de minuto de cada evento ya asociado. |
| Estadísticas en vivo por jugador | +1/-1, tiros, faltas acumuladas (6 faltas = doble penalti), tarjetas — botones grandes tocables. |
| Sustituciones con arrastre | Arrastrar chapa al banquillo y del banquillo a la pista con minuto. |
| Export del partido | Resumen del partido (evento → minuto → jugador) en PDF junto al acta. |

**Criterio de salida**: dirigir un partido real entero desde la tableta
sin papel: alineación inicial, eventos con minuto, acta final.

### B3 · Datos: completar el círculo de importación/exportación

| Tarea | Detalle |
|---|---|
| Exportación completa | CSV/JSON de cualquier tabla (equipos, jugadores, actas) — `csvExporters.ts` ya cubre varios casos. |
| Plantillas de importación | Descargar CSV de ejemplo con el formato exacto esperado (menos errores de columnas como el de los países en portugués). |
| Validador de CSV previo | Importar en modo "simulación": informe de errores sin escribir nada (el informe exportable ya existe, hacerlo pre-flight). |
| Carga por URL | Importar un CSV publicado en la web del club (con confirmación, dado el fs:scope). |

**Criterio de salida**: un club puede meter sus datos propios y sacar
reportes sin tocar la Enciclopedia.

### B4 · Calidad de vida (barato y muy visible)

| Tarea | Detalle |
|---|---|
| Atajos globales | Navegación con teclado (g p → Partidos, etc.), ayuda con `?`. |
| Modo compacto/denso | Tablas con más filas visibles (para 20k jugadores la densidad importa). |
| Columnas configurables | Mostrar/ocultar/reordenar columnas en las tablas grandes, persistido en Preferencias. |
| Búsqueda global | Ctrl+K que busque a la vez en equipos, jugadores, entrenadores, partidos. |

---

## Orden recomendado

```
A0 (esta semana, casi hecho) ──► A1 firma ──► A2 updater     [distribución]
        │
        └────────► B4 QoL ──► B1 estadísticas ──► B2 en vivo ──► B3 datos
                                                             [funcionalidad]
```

- **A0** cierra el hito 1.0 (obligatorio antes de difundir).
- **A1+A2** son el paquete "ya puedo pasársela a la gente": sin aviso de
  SmartScreen y con actualizaciones automáticas. ~2-3 semanas con la
  espera del certificado incluida.
- **B4** se puede intercalar en cualquier hueco (tareas pequeñas).
- **B1** es el mayor salto de valor con los datos ya importados.
- **B2** convierte la app en herramienta de banquillo para los partidos.
- **B3** redondea el ciclo de datos (menos urgente: la importación ya
  funciona bien tras las correcciones de países).

## Post-1.1 (apuntes sueltos, sin compromiso)

- Multi-idioma (i18n): hoy todo en español; los CSV vienen en PT — el
  catálogo de países ya es bilingüe de facto.
- Backup en la nube (OneDrive/Google Drive vía carpeta sincronizada
  documentada, o export programado).
- Versión portable (zip sin instalador) para entornos sin permisos.
- Publicar en winget / Microsoft Store (la Store exige firma EV).
- Telemetría de errores opt-in (hoy: registro local + export manual).
