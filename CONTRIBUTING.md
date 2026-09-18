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

### Firma de código (Certum OSS — roadmap A1)

**Estado**: integración preparada; falta contratar el certificado. Sin los
secrets configurados, la release se genera **sin firmar** (comportamiento de
la 1.0.0) y nada falla: el paso de conexión se omite y `signar.ps1` es no-op.

**Por qué Certum OSS**: la opción más económica para un proyecto open source
(~25-70 €/año frente a 100-500 € de un OV/EV estándar) y con tarjeta cloud
(SimplySign) en lugar de token USB. Desde 2024 los certificados EV tampoco
eliminan el aviso de SmartScreen de inmediato: la reputación se acumula
firmando cada release con el mismo certificado, así que el ahorro no cuesta
nada a efectos prácticos.

**Contratación** (una sola vez):
1. Certum → *Code Signing in the Cloud* (variante Open Source): validación
   de identidad según su proceso (documento + verificación).
2. Al activar la tarjeta cloud, SimplySign Desktop muestra un **QR de alta**:
   guarda su URI `otpauth://` (es el secreto TOTP de la tarjeta — no subirlo
   a ningún repo ni compartirlo).
3. Anota el **thumbprint SHA1** del certificado de firma de código.

**Secrets del repo** (Settings → Secrets and variables → Actions):

| Secret | Valor |
|---|---|
| `CERTUM_OTP_URI` | URI `otpauth://` completo del QR de alta |
| `CERTUM_USERNAME` | Usuario (email) de la cuenta SimplySign |
| `CERTUM_KEY_ID` | Thumbprint SHA1 del certificado |

**Custodia**: `CERTUM_OTP_URI` es el segundo factor de la tarjeta cloud — si
se filtrara, cualquiera podría firmar binarios como tú. Guárdalo también en
tu gestor de contraseñas y rótalo desde el panel de Certum si hay sospecha.
Los secrets no se imprimen en los logs (GitHub los ofusca).

**Cómo funciona en CI** (automático en el próximo tag una vez dados de alta
los secrets):
- `release.yml` conecta SimplySign Desktop en el runner y monta la tarjeta:
  `scripts/firmar/conectar-simplysign.ps1` instala el MSI en silencio,
  genera el TOTP desde el `otpauth://` (HMAC-SHA1/RFC 6238), lo inyecta por
  SendKeys y verifica que el certificado aparece en `Cert:\CurrentUser\My`.
- El bundler de Tauri firma cada artefacto (ejecutable, desinstalador,
  instalador NSIS) vía `bundle.windows.signCommand` →
  `scripts/firmar/signar.ps1`, que llama a `signtool sign /fd sha256
  /tr http://time.certum.pl /td sha256 /sha1 <thumbprint>`.
- El sello de tiempo RFC 3161 mantiene las firmas válidas después de que el
  certificado expire.

**Prueba local**: con la tarjeta conectada en tu PC, `pwsh -File
scripts/firmar/signar.ps1 <exe>` firma ese binario; sin `CERTUM_KEY_ID` en el
entorno es un no-op (útil para verificar la integración sin certificado).
