// Driver CDP para evaluar expresiones dentro del webview real de futsal-stats.
// Uso: node scripts/cdp-eval.mjs "<expresión JS>"
const port = process.env.CDP_PORT || "9333";

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === "page" && t.url.includes("localhost:1430"));
if (!page) {
  console.error("No app page target found. Targets:", targets.map((t) => `${t.type} ${t.url}`));
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
let idSeq = 0;
const pending = new Map();

export function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++idSeq;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
  }
};

export async function evaluar(expression) {
  const r = await Promise.race([
    send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }),
    new Promise((_, rej) =>
      setTimeout(() => rej(new Error("EVAL_TIMEOUT (30s)")), 30000),
    ),
  ]);
  if (r.exceptionDetails) {
    throw new Error("EXCEPTION: " + JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
}

export async function conectar() {
  if (ws.readyState === WebSocket.OPEN) return;
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = (e) => reject(new Error("WS_ERROR " + (e.message || e)));
  });
}

export function cerrar() {
  ws.close();
}

// Modo CLI: node scripts/cdp-eval.mjs "<expresión>"
// (el fail-safe de 60s solo aplica al modo CLI: en sesiones importadas de larga
// duración mataría el proceso a mitad de flujo)
const invocadoDirectamente = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("cdp-eval.mjs");
if (invocadoDirectamente) {
  setTimeout(() => {
    console.error("TIMEOUT waiting for CDP");
    process.exit(1);
  }, 60000);
  conectar()
    .then(() => evaluar(process.argv[2]))
    .then((v) => console.log(JSON.stringify(v, null, 2)))
    .catch((e) => {
      console.error("ERROR:", e.message);
      process.exitCode = 1;
    })
    .finally(cerrar);
}
