# Conecta la tarjeta cloud de Certum (SimplySign) en un runner de CI para
# poder firmar con signtool (A1 del roadmap).
#
# Mecanismo (verificado contra la guía de automation de SimplySign y la action
# dismine/windows-app-signing-setup-action, que documentan el mismo flujo):
#   1. Instala SimplySign Desktop (MSI silencioso) si no está.
#   2. Genera el TOTP desde el URI otpauth:// del QR de alta (secreto CERTUM_OTP_URI).
#   3. Arranca SimplySign Desktop e inyecta usuario+TOTP por SendKeys (la app no
#      tiene CLI headless; la ventana debe existir).
#   4. Espera a que el certificado aparezca en Cert:\CurrentUser\My con el
#      thumbprint CERTUM_KEY_ID: a partir de ahí signtool firma con normalidad.
#
# Variables de entorno requeridas:
#   CERTUM_OTP_URI   URI otpauth:// completo del QR de SimplySign (SECRETO:
#                    es el segundo factor de la tarjeta cloud).
#   CERTUM_USERNAME  Usuario (email) de la cuenta SimplySign.
#   CERTUM_KEY_ID    Thumbprint SHA1 del certificado de firma de código.
# Opcionales:
#   CERTUM_SIMPLYSIGN_URL  URL del MSI (default: versión fijada y verificada).
#
# Uso local (sin certificado solo sirve para validar sintaxis/flujo):
#   pwsh -File scripts/firmar/conectar-simplysign.ps1
$ErrorActionPreference = "Stop"

$OtpUri = $env:CERTUM_OTP_URI
$Usuario = $env:CERTUM_USERNAME
$KeyId = $env:CERTUM_KEY_ID
$MsiUrl = if ($env:CERTUM_SIMPLYSIGN_URL) { $env:CERTUM_SIMPLYSIGN_URL } else {
    "https://files.certum.eu/software/SimplySignDesktop/Windows/9.4.3.90/SimplySignDesktop-9.4.3.90-64-bit-en.msi"
}
if (-not $OtpUri -or -not $Usuario -or -not $KeyId) {
    throw "Faltan CERTUM_OTP_URI / CERTUM_USERNAME / CERTUM_KEY_ID (secrets del repo)."
}

# --- 1. SimplySign Desktop: instalar si falta ---
$DirInstalacion = "$env:ProgramFiles\Certum\SimplySign Desktop"
$Exe = Get-ChildItem "$DirInstalacion\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $Exe) {
    Write-Host "Descargando SimplySign Desktop..."
    $Msi = Join-Path $env:TEMP "SimplySignDesktop.msi"
    Invoke-WebRequest -Uri $MsiUrl -OutFile $Msi -UseBasicParsing -TimeoutSec 300
    Write-Host "Instalando (msiexec silencioso)..."
    $p = Start-Process msiexec.exe -ArgumentList "/i", "`"$Msi`"", "/quiet", "/norestart" -PassThru -Wait
    if ($p.ExitCode -ne 0) { throw "msiexec salio con codigo $($p.ExitCode)" }
    Start-Sleep -Seconds 3
    $Exe = Get-ChildItem "$DirInstalacion\*.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $Exe) { throw "SimplySign Desktop no quedo instalado en $DirInstalacion" }
}
Write-Host "SimplySign Desktop: $($Exe.FullName)"

# --- 2. TOTP desde el URI otpauth:// (HMAC-SHA1, Base32, RFC 6238) ---
$uri = [Uri]$OtpUri
try { $q = [System.Web.HttpUtility]::ParseQueryString($uri.Query) } catch {
    $q = @{}
    foreach ($part in $uri.Query.TrimStart('?') -split '&') {
        $kv = $part -split '=', 2
        if ($kv.Count -eq 2) { $q[$kv[0]] = [Uri]::UnescapeDataString($kv[1]) }
    }
}
$Secreto = $q['secret']
$Digitos = if ($q['digits']) { [int]$q['digits'] } else { 6 }
$Periodo = if ($q['period']) { [int]$q['period'] } else { 30 }
if (-not $Secreto) { throw "El URI otpauth:// no contiene 'secret'." }

Add-Type -Language CSharp @"
using System;
using System.Security.Cryptography;
public static class Totp
{
    private const string B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    private static byte[] Base32Decode(string s)
    {
        s = s.TrimEnd('=').ToUpperInvariant();
        int n = s.Length * 5 / 8;
        byte[] bytes = new byte[n];
        int buffer = 0, bits = 0, idx = 0;
        foreach (char c in s)
        {
            int v = B32.IndexOf(c);
            if (v < 0) throw new ArgumentException("Base32 invalido: " + c);
            buffer = (buffer << 5) | v; bits += 5;
            if (bits >= 8) bytes[idx++] = (byte)(buffer >> (bits -= 8));
        }
        return bytes;
    }
    public static string Ahora(string secreto, int digitos, int periodo)
    {
        byte[] clave = Base32Decode(secreto);
        long contador = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / periodo;
        byte[] cnt = BitConverter.GetBytes(contador);
        if (BitConverter.IsLittleEndian) Array.Reverse(cnt);
        byte[] hash = new HMACSHA1(clave).ComputeHash(cnt);
        int offset = hash[hash.Length - 1] & 0x0F;
        int binario =
            ((hash[offset] & 0x7F) << 24) | ((hash[offset + 1] & 0xFF) << 16) |
            ((hash[offset + 2] & 0xFF) << 8) | (hash[offset + 3] & 0xFF);
        return (binario % (int)Math.Pow(10, digitos)).ToString(new string('0', digitos));
    }
}
"@
$Totp = [Totp]::Ahora($Secreto, $Digitos, $Periodo)
Write-Host "TOTP generado (no se imprime por seguridad)."

# --- 3. Autenticacion: arrancar la app e inyectar usuario + TOTP ---
$Proc = Start-Process -FilePath $Exe.FullName -PassThru
Start-Sleep -Seconds 6
$wshell = New-Object -ComObject WScript.Shell
$Foco = $wshell.AppActivate($Proc.Id)
for ($i = 0; -not $Foco -and $i -lt 10; $i++) {
    Start-Sleep -Milliseconds 500
    $Foco = $wshell.AppActivate($Proc.Id) -or $wshell.AppActivate('SimplySign Desktop')
}
if (-not $Foco) { throw "No se pudo poner SimplySign Desktop en primer plano." }
Start-Sleep -Milliseconds 400
$wshell.SendKeys("$Usuario{ENTER}")
Start-Sleep -Milliseconds 800
$wshell.SendKeys("$Totp{ENTER}")
Write-Host "Credenciales enviadas; esperando montaje de la tarjeta cloud..."

# --- 4. Verificar que el certificado esta disponible para signtool ---
$Conectado = $false
for ($i = 0; -not $Conectado -and $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $Cert = Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
        Where-Object { $_.Thumbprint -eq $KeyId } | Select-Object -First 1
    if ($Cert) { $Conectado = $true }
}
if (-not $Conectado) {
    Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue |
        Select-Object Subject, Thumbprint, NotAfter | Format-Table | Out-Host
    throw "El certificado $KeyId no aparecio en Cert:\CurrentUser\My tras 60 s."
}
Write-Host "OK: tarjeta cloud montada. Certificado disponible:"
Write-Host "  Subject: $($Cert.Subject)"
Write-Host "  Vence:   $($Cert.NotAfter)"
