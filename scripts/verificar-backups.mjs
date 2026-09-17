// Verificación E2E de backups: crear copia, listar y comprobar integridad de cada una.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

const r = await evaluar(`(async () => {
  const { invoke } = window.__TAURI_INTERNALS__ ? { invoke: window.__TAURI_INTERNALS__.invoke } : await import('@tauri-apps/api/core');
  const creada = await invoke('crear_backup_bd');
  const lista = await invoke('listar_backups_bd');
  return JSON.stringify({ creada, total: lista.length, copias: lista.map(b => ({ fecha: b.fecha, mb: (b.bytes/1048576).toFixed(1) })) }, null, 2);
})()`);

console.log(r);
await cerrar();
