# Cierre de la 1.0.0 — de la rc al tag final

Runbook de la fase de cierre del hito 1.0. Estado de partida: la
**v1.0.0-rc.1** está etiquetada y su workflow de release generó el instalador
NSIS en CI. Queda: validar en VM → versionar a `1.0.0` → regenerar notas →
tag final → publicar.

---

## Paso 1 — Validación en máquina limpia (tarea 0.2)

El binario a probar es **el de CI, no uno local**. Ya descargado con hash
precalculado y **verificado tras la publicación** (descarga anónima del
asset → mismo hash):

```
Fichero : Global.Futsal.Stats_1.0.0-rc.1_x64-setup.exe  (10,9 MB)
SHA-256 : ba8df7fcaa53e571777abd99251dd533aa10dfb027220c92cf89f2a00f807a4a
Publicada: https://github.com/fpons73/futsal-stats/releases/tag/v1.0.0-rc.1
          (prerelease; URL directa de descarga verificada sin autenticar)
```

> El hash se puede recalcular en cualquier momento:
> `gh release download v1.0.0-rc.1 --repo fpons73/futsal-stats --dir .rc-artifacts --pattern "*.exe"`
> y `certutil -hashfile <exe> SHA256` (la carpeta `.rc-artifacts/` está en
> `.gitignore`; no versionar binarios).

Ejecutar el checklist completo de
[`docs/prueba-maquina-limpia.md`](./prueba-maquina-limpia.md) en la VM:

1. Snapshot de la VM → instalar el exe → verificar SHA-256 en la VM.
2. Fases A-E: instalación con SmartScreen, onboarding, datos, acta con
   persistencia y PDF, recuperación y desinstalación.
3. Rellenar la tabla de registro de la guía con fecha, VM, hash y resultado.

**Criterio de paso**: todas las fases ✅. Si algo falla → corregir, subir a
`rc.2` (ver paso 6) y repetir desde el snapshot. **No se etiqueta 1.0.0 sin
esta validación.**

## Paso 2 — Cierre documental del hito

- [ ] `docs/milestone-1.0.md`: marcar **0.1** y **0.2** como HECHO (fecha +
  resultado), moviendo 0.1 al estado ✅ igual que el resto de tareas.
- [ ] Verificar que las tasks restantes del hito están todas ✅ (1.x, 2.x,
  3.x ya lo están).
- [ ] README: sin referencias a "rc" pendientes; sección de instalación
  apuntando a los Releases publicados.

## Paso 3 — Bump de versión a 1.0.0

Actualizar **las tres versiones + lock** (mismo procedimiento que la rc):

| Fichero | Valor nuevo |
|---|---|
| `src-tauri/tauri.conf.json` → `version` | `1.0.0` |
| `src-tauri/Cargo.toml` → `[package] version` | `1.0.0` |
| `src-tauri/Cargo.lock` (entrada `futsal-stats`) | `1.0.0` |
| `package.json` → `version` | `1.0.0` |

Verificación: `cd src-tauri && cargo verify-project` y `npx tsc --noEmit`.

> **Automatización (pasos 3 y 4)**: `python scripts/cerrar_v1.py` hace el
> bump cuádruple y regenera el CHANGELOG — e incluye la **guardia del paso 1**:
> se niega a versionar si no existe la evidencia de la validación
> (`sandbox-prueba/evidencias/resultado-fase-a.json`) o si algún check falló.

## Paso 4 — Regenerar las notas de la 1.0.0

En `CHANGELOG.md`:

1. **Renombrar** la cabecera `## [1.0.0-rc.1] — 2026-09-17` a
   `## [1.0.0] — <fecha del tag final>` y sustituir el párrafo introductorio
   por uno sin la condición de rc (ya no hay pendientes).
2. **Añadir encima** una entrada `## [1.0.0-rc.1] — 2026-09-17` breve:
   *"Candidata a release: contenido idéntico a la 1.0.0; instalador validado
   en máquina limpia (ver docs/prueba-maquina-limpia.md)."* — el historial
   queda honesto: la rc existió, y qué cambió entre rc y final (solo la
   validación y la fecha).
3. En el cuerpo del release, `tauri-action` reutiliza el texto del workflow;
   editar notas finas directamente en el borrador antes de publicar.

## Paso 5 — Tag final y publicación

```bash
git commit -am "chore: release v1.0.0"          # bumps + CHANGELOG + docs
git tag -a v1.0.0 -m "Global Futsal Stats 1.0.0"
git push origin main v1.0.0
```

El workflow de release generará el **borrador** "Global Futsal Stats v1.0.0"
con su instalador. Revisar y **publicar** desde
<https://github.com/fpons73/futsal-stats/releases>. Tras publicar:

- [ ] Comprobar la descarga del exe desde otra máquina/red.
- [ ] Anunciar donde corresponda; el README ya enlaza a Releases.

## Paso 6 — Si hay que sacar una rc.2 (contingencia)

Fallo de la validación → fix en `main` → bump a `1.0.0-rc.2` (los cuatro
ficheros del paso 3) → commit + tag `v1.0.0-rc.2` → push → repetir el
checklist completo en la VM con el binario nuevo (recalcular SHA-256). El
workflow marca las `-rc*` como **prerelease** automáticamente.

## Post-1.0 (fuera del hito, ya anotado)

- Firma de código (SmartScreen desaparece; ~100-300 USD/año).
- `tauri-plugin-updater` si la descarga manual se queda corta.
- Cambiar el identifier `com.fpons.futsal-stats` **solo antes** de crecer más
  allá del círculo actual (es la identidad de actualizaciones).
