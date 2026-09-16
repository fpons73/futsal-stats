// Diagnóstico 4: tras el clic, UNA foto (t=2s), UNA lista completa de HWNDs
// (t=4s) y la lectura del toast al resolverse. Sin spawns repetidos que roben
// el foco y cierren el diálogo.
import { spawn } from "node:child_process";
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

const PS_ENUM = `
Add-Type @"
using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public class WinEnum {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindowsProc cb, IntPtr lp);
  [DllImport("user32.dll")] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  delegate bool EnumWindowsProc(IntPtr h, IntPtr lp);
  public static List<string> Dump(uint[] pids) {
    var res = new List<string>();
    EnumWindows((h, lp) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (Array.IndexOf(pids, pid) >= 0) {
        var t = new StringBuilder(256); GetWindowText(h, t, 256);
        var c = new StringBuilder(256); GetClassName(h, c, 256);
        RECT r; GetWindowRect(h, out r);
        bool vis = IsWindowVisible(h);
        res.Add("HWND | pid=" + pid + " | vis=" + vis + " | clase=" + c + " | titulo=[" + t + "] | rect=" + r.L + "," + r.T + "," + (r.R - r.L) + "x" + (r.B - r.T));
      }
      return true;
    }, IntPtr.Zero);
    return res;
  }
}
"@
$procs = Get-Process futsal-stats -ErrorAction SilentlyContinue
if (-not $procs) { Write-Output "SIN_PROCESO"; exit }
$pids = [uint32[]]($procs | ForEach-Object { [uint32]$_.Id })
[WinEnum]::Dump($pids) | ForEach-Object { Write-Output $_ }
`;

const PS_FOTO = `
Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing
$b = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)
$g = [System.Drawing.Graphics]::FromImage($b)
$g.CopyFromScreen(0, 0, 0, 0, $b.Size)
$b.Save("C:\\Proyectos\\futsal-stats\\pantalla_diag.png", [System.Drawing.Imaging.ImageFormat]::Png)
Write-Output "FOTO_OK"
`;

const correr = (ps) => new Promise(res => {
  const p = spawn("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { cwd: "C:\\Proyectos\\futsal-stats" });
  let out = "";
  p.stdout.on("data", d => { out += d.toString(); });
  p.on("close", () => res(out));
});

await conectar();
await evaluar(`(function(){ const a = document.querySelector('a[href=\"#/importar\"]'); if (a) a.click(); else location.hash = \"#/importar\"; return 1; })()`);
await new Promise(r => setTimeout(r, 1200));
const clic = JSON.parse(await evaluar(`(function(){
  const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar equipos'));
  if (!b) return JSON.stringify({ok:false});
  b.click(); return JSON.stringify({ok:true});
})()`));
console.log("INFO | clic |", JSON.stringify(clic));

await new Promise(r => setTimeout(r, 2000));
console.log("INFO | foto_2s |", (await correr(PS_FOTO)).trim());

await new Promise(r => setTimeout(r, 2000));
const dump = await correr(PS_ENUM);
console.log("INFO | hwnds_completos_4s |");
console.log(dump.trim());

// Esperar resolución y leer el toast
let resuelto = false;
for (let s = 0; s < 35; s++) {
  await new Promise(r => setTimeout(r, 1000));
  try {
    const st = JSON.parse(await evaluar(`JSON.stringify({
      d: [...document.querySelectorAll('button')].find(x => x.textContent.includes('Importar equipos'))?.disabled ?? null,
      toasts: [...document.querySelectorAll('div')].filter(e => String(e.className).includes('border-l-')).map(e => e.textContent.trim().slice(0, 120))
    })`));
    if (st.d === false) { console.log("INFO | resuelto |", JSON.stringify(st.toasts)); resuelto = true; break; }
  } catch { /* sigue */ }
}
if (!resuelto) console.log("INFO | resuelto | timeout");
cerrar();
process.exit(0);
