import { getPreferencia, setPreferencia } from "../db";

export const DEFAULT_GEMINI_MODEL = "gemini-2.0-flash";
export const GEMINI_API_KEY_STORAGE = "gemini_api_key";
export const GEMINI_MODEL_STORAGE = "gemini_model_name";

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
    const model = await getPreferencia(GEMINI_MODEL_STORAGE, localStorage.getItem(GEMINI_MODEL_STORAGE) || DEFAULT_GEMINI_MODEL);
    cachedApiKey = apiKey;
    cachedModel = model;
    return { apiKey, model };
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
    return (typeof window !== "undefined" ? localStorage.getItem(GEMINI_MODEL_STORAGE) : "") || DEFAULT_GEMINI_MODEL;
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
