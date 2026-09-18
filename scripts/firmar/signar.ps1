# Comando de firma usado por el bundler de Tauri (bundle.windows.signCommand).
# El CLI sustituye %1 por la ruta del artefacto a firmar (ejecutable de la app,
# desinstalador, instalador NSIS) y ejecuta este comando por cada uno.
#
# NO-OP SEGURO: sin CERTUM_KEY_ID en el entorno (p. ej. build local sin
# secrets, o CI sin el certificado aún contratado) no hace nada y termina 0 —
# la configuración de firma puede vivir de forma permanente sin romper nada.
#
# Requiere la tarjeta cloud de Certum (SimplySign) YA CONECTADA en la máquina:
# en CI lo hace el paso previo del workflow de release con
# scripts/firmar/conectar-simplysign.ps1; el certificado debe estar en
# Cert:\CurrentUser\My con thumbprint $env:CERTUM_KEY_ID y clave privada
# operativa (la firma usa el CSP/KSP de la tarjeta virtual).
#
# Variables:
#   CERTUM_KEY_ID   (opcional; sin él = no-op) Thumbprint SHA1 del certificado.
#   CERTUM_TSA_URL  (opcional) Autoridad de sello de tiempo; por defecto la de
#                   Certum (http://time.certum.pl).
$ErrorActionPreference = "Stop"

$Fichero = $args[0]
# Tolerancia a ambas semánticas del placeholder: si el CLI dejara "%1" literal
# y añadiera la ruta real como argumento siguiente, usamos esa.
if ($Fichero -eq "%1" -and $args.Count -gt 1) { $Fichero = $args[1] }
if (-not $Fichero -or -not (Test-Path $Fichero)) {
    throw "signar.ps1: ruta del artefacto no recibida o inexistente ('$Fichero')."
}

$KeyId = $env:CERTUM_KEY_ID
if (-not $KeyId) {
    Write-Host "signar.ps1: CERTUM_KEY_ID no definido — se omite la firma de $Fichero (binario sin firmar)."
    exit 0
}
$TsaUrl = if ($env:CERTUM_TSA_URL) { $env:CERTUM_TSA_URL } else { "http://time.certum.pl" }

# signtool del Windows SDK instalado en el runner (windows-latest lo trae).
$Signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
    Sort-Object FullName -Descending | Select-Object -First 1
if (-not $Signtool) { throw "signtool.exe no encontrado en Windows Kits." }

# /fd sha256: digest de firma. /tr + /td sha256: sello de tiempo RFC 3161
# (imprescindible: la firma debe seguir siendo válida cuando el certificado
# expire). /sha1 <thumbprint>: certificado del almacén de usuario (tarjeta cloud).
& $Signtool.FullName sign /fd sha256 /tr $TsaUrl /td sha256 /sha1 $KeyId /v $Fichero
if ($LASTEXITCODE -ne 0) { throw "signtool fallo con codigo $LASTEXITCODE sobre $Fichero" }
Write-Host "Firmado OK: $Fichero"
