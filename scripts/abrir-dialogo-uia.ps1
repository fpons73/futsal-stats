# Rellena el diálogo nativo "Abrir" (clase #32770) de futsal-stats y acepta.
# Estrategia: localizar el diálogo por EnumWindows (Win32, fiable) y operarlo
# vía UIA FromHandle (ValuePattern en el campo + Invoke en el botón Abrir).
# Uso: powershell -File abrir-dialogo-uia.ps1 -Ruta "C:\ruta\fichero.csv" [-Segundos 30]
param(
    [Parameter(Mandatory = $true)][string]$Ruta,
    [int]$Segundos = 30
)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public class WFind {
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  public delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
  public static IntPtr Find(string clase, string titulo, uint[] pids) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, lp) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) >= 0 && IsWindowVisible(h)) {
        var t = new StringBuilder(256); GetWindowText(h, t, 256);
        var c = new StringBuilder(256); GetClassName(h, c, 256);
        if (c.ToString() == clase && t.ToString() == titulo) { found = h; return false; }
      }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$procs = Get-Process futsal-stats -ErrorAction SilentlyContinue
if (-not $procs) { Write-Output "SIN_PROCESO"; exit 1 }
$pids = [uint32[]]($procs | ForEach-Object { [uint32]$_.Id })

$dialogo = [IntPtr]::Zero
for ($i = 0; $i -lt $Segundos; $i++) {
    $dialogo = [WFind]::Find("#32770", "Abrir", $pids)
    if ($dialogo -ne [IntPtr]::Zero) { break }
    Start-Sleep -Milliseconds 1000
}
if ($dialogo -eq [IntPtr]::Zero) { Write-Output "DIALOGO_NO_ENCONTRADO"; exit 1 }
Write-Output ("DIALOGO_OK hwnd=" + $dialogo)

$el = [System.Windows.Automation.AutomationElement]::FromHandle($dialogo)

# Campo de nombre de fichero: primer Edit descendiente del diálogo.
# El árbol UIA puede tardar en poblarse tras abrir el diálogo: reintento 10s.
$condEdit = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)
$campo = $null
for ($i = 0; $i -lt 20; $i++) {
    $campo = $el.FindFirst([System.Windows.Automation.TreeScope]::Descendants, $condEdit)
    if ($campo) { break }
    Start-Sleep -Milliseconds 500
    $el = [System.Windows.Automation.AutomationElement]::FromHandle($dialogo)
}
if (-not $campo) { Write-Output "CAMPO_NO_ENCONTRADO"; exit 1 }
($campo.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)).SetValue($Ruta)
Write-Output "RUTA_ESCRITA"

# Botón Abrir
$condBtn = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Button)
$botones = $el.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condBtn)
foreach ($b in $botones) {
    if ($b.Current.Name -match "^(Abrir|Open)$") {
        ($b.GetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern)).Invoke()
        Write-Output "ABRIR_PULSADO"
        exit 0
    }
}
Write-Output "BOTON_NO_ENCONTRADO"
exit 1
