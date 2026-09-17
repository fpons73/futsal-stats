import { getPreferencia, setPreferencia } from "../db";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";
export const GEMINI_API_KEY_STORAGE = "gemini_api_key";
export const GEMINI_MODEL_STORAGE = "gemini_model_name";

/** Modelos operativos que ofrece el selector (estables en la API pública). */
export const MODELOS_GEMINI_DISPONIBLES = [
    { id: "gemini-3.6-flash", etiqueta: "Gemini 3.6 Flash (recomendado)" },
    { id: "gemini-3.7-flash", etiqueta: "Gemini 3.7 Flash" },
    { id: "gemini-3.8-flash", etiqueta: "Gemini 3.8 Flash" },
    { id: "gemini-2.5-flash", etiqueta: "Gemini 2.5 Flash" },
    { id: "gemini-2.5-flash-lite", etiqueta: "Gemini 2.5 Flash-Lite" },
] as const;

/** Modelos retirados por Google (apagados): si la preferencia guardada apunta
 *  a uno de ellos, se repara automáticamente al default. 2.0 fue cerrado y
 *  con él la app dejaba de generar crónicas sin que el usuario supiera por qué. */
const MODELOS_RETIRADOS = new Set([
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash-exp",
    "gemini-1.5-flash",
    "gemini-1.5-flash-8b",
    "gemini-1.5-pro",
]);

/** Normaliza un modelo guardado: retirado → default. Devuelve también si
 *  cambió, para que el llamador persista la reparación. */
export function normalizarModelo(modelo: string | null | undefined): { modelo: string; reparado: boolean } {
    const limpio = (modelo ?? "").trim();
    if (!limpio) return { modelo: DEFAULT_GEMINI_MODEL, reparado: true };
    if (MODELOS_RETIRADOS.has(limpio)) return { modelo: DEFAULT_GEMINI_MODEL, reparado: true };
    return { modelo: limpio, reparado: false };
}

let cachedApiKey: string | null = null;
let cachedModel: string | null = null;

if (typeof window !== "undefined") {
  getPreferencia(GEMINI_API_KEY_STORAGE).then(key => {
    if (key) cachedApiKey = key;
  });
  getPreferencia(GEMINI_MODEL_STORAGE, DEFAULT_GEMINI_MODEL).then(m => {
    if (m) cachedModel = m;
  });
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const geminiService = {
  async loadPreferences(): Promise<{ apiKey: string; model: string }> {
    const apiKey = await getPreferencia(GEMINI_API_KEY_STORAGE, localStorage.getItem(GEMINI_API_KEY_STORAGE) || (import.meta as any).env?.VITE_GEMINI_API_KEY || "");
    let { modelo, reparado } = normalizarModelo(
      await getPreferencia(GEMINI_MODEL_STORAGE, localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_GEMINI_MODEL),
    );
    if (reparado) {
      // Persistir la reparación: si no, el valor apagado volvería a cargarse
      // en el próximo arranque y el fallo sería intermitente.
      await setPreferencia(GEMINI_MODEL_STORAGE, modelo);
    }
    cachedApiKey = apiKey;
    cachedModel = modelo;
    return { apiKey, model: modelo };
  },

  getApiKey(): string {
    if (cachedApiKey !== null) return cachedApiKey;
    return (typeof window !== "undefined" ? localStorage.getItem(GEMINI_API_KEY_STORAGE) : "") || (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  },

  setApiKey(key: string): void {
    const val = key.trim();
    cachedApiKey = val;
    setPreferencia(GEMINI_API_KEY_STORAGE, val);
  },

  getModel(): string {
    if (cachedModel !== null) return cachedModel;
    const { modelo } = normalizarModelo(
      (typeof window !== "undefined" ? localStorage.getItem(GEMINI_MODEL_STORAGE) : "") || DEFAULT_GEMINI_MODEL,
    );
    return modelo;
  },

  setModel(model: string): void {
    const val = model.trim();
    cachedModel = val;
    setPreferencia(GEMINI_MODEL_STORAGE, val);
  },

  hasApiKey(): boolean {
    return !!this.getApiKey().trim();
  },

  async generateMatchSummary(
    localNombre: string,
    visitanteNombre: string,
    golesLocal: number,
    golesVisitante: number,
    statsLocal: any,
    statsVisitante: any,
    onChunk: (chunk: string) => void
  ): Promise<string> {
    const apiKey = this.getApiKey();
    if (!apiKey) throw new Error("No hay API key de Gemini configurada");
    const model = this.getModel();

    const prompt = `Eres un cronista deportivo experto en fútbol sala. Genera una crónica del partido en formato resumen (máximo 200 palabras).

${localNombre} ${golesLocal} - ${golesVisitante} ${visitanteNombre}

Estadísticas de ${localNombre}: ${JSON.stringify(statsLocal)}
Estadísticas de ${visitanteNombre}: ${JSON.stringify(statsVisitante)}

Escribe la crónica en español, destacando los aspectos clave del juego, el rendimiento de los equipos y los momentos decisivos. Usa terminología específica de fútbol sala (faltas acumulativas, doble penalti, tiempos muertos, etc.).`;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.7, maxOutputTokens: 500 },
      }),
    });

    if (!response.ok) throw new Error(`Gemini API error: ${response.status}`);

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "No se pudo generar el resumen.";

    // Simular streaming para mejor UX
    const words = text.split(" ");
    let accumulated = "";
    for (const word of words) {
      accumulated += (accumulated ? " " : "") + word;
      onChunk(accumulated);
      await new Promise(r => setTimeout(r, 20));
    }

    return text;
  },
};
