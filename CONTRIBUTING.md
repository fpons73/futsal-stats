# Contribuir a Global Futsal Stats

Gracias por tu interés. Esta guía cubre el flujo de trabajo diario y el
**proceso de release** (tarea 3.2 del hito 1.0: canal de actualizaciones por
descarga manual desde GitHub Releases).

## Desarrollo

```bash
npm install          # dependencias del frontend
npm run tauri dev    # app completa (compila el Rust y abre la ventana)
npm test             # 330+ tests de frontend (Vitest)
npm run build        # tsc + build de producción del frontend
cd src-tauri && cargo test   # migraciones sobre BD virgen + tests de la lib
```

Antes de abrir un PR o empujar a `main`, comprueba que `npx tsc --noEmit` y
`npm test` pasan — la CI (`.github/workflows/ci.yml`) ejecuta lo mismo en cada
push y fallará si no está limpio.

Convenciones del proyecto:

- Español para identificadores del dominio y comentarios; commits convencionales
  (`feat:`, `fix:`, `docs:`, `chore:`) en inglés.
- Todo feedback al usuario va por toasts o confirmaciones temáticas — ni
  `alert()` ni `confirm()` nativos (hay tests que lo blinda).
- Las páginas nuevas deben usar `EstadoVacio`, `SpinnerCarga` e `ImagenSegura`;
  los tests de cobertura estática romperán el build si se omiten.

## Proceso de release

El canal de distribución para la 1.0 es **descarga manual desde GitHub
Releases**: el instalador se compila en CI y se publica como borrador para
revisión. No hay auto-actualizador (`tauri-plugin-updater`) — es la decisión
documentada del hito; si algún día se añade, actualizar esta sección.

### Pasos

1. **Prepara la versión** en tres ficheros (deben coincidir):
   - `src-tauri/tauri.conf.json` → `version`
   - `src-tauri/Cargo.toml` → `[package] version`
   - `package.json` → `version`

2. **Commit y tag**:

   ```bash
   git commit -am "chore: bump version to X.Y.Z"
   git tag vX.Y.Z
   git push origin main vX.Y.Z
   ```

3. **CI compila el instalador**: el workflow `release.yml` (disparado por el tag
   `v*`) compila NSIS + MSI en `windows-latest` con `tauri-action` y crea un
   **Release borrador** con los artefactos adjuntos.

4. **Revisa y publica** desde <https://github.com/fpons73/futsal-stats/releases>:
   abre el borrador, edita las notas si hace falta y pulsa *Publish*. Los
   usuarios descargarán `Global Futsal Stats_X.Y.Z_x64-setup.exe`.

### Disparo manual

El workflow admite `workflow_dispatch` por si hay que regenerar un instalador
sin tocar tags: *Actions → Release → Run workflow*. Con la entrada `tag_name`
vacía usa la versión de `tauri.conf.json`.

### Firma de código (post-1.0)

Los binarios no están firmados: Windows mostrará el aviso de SmartScreen
(*Más información → Ejecutar de todas formas*). El README ya lo documenta para
usuarios finales. Firmar requiere un certificado de firma de código (~100-300
USD/año) y añadir los secretos al workflow — decisión explícitamente fuera del
alcance de la 1.0 (ver `docs/milestone-1.0.md`).
