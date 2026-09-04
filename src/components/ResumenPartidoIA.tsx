import { useState } from "react";
import { Sparkles, Copy, Check, RefreshCw } from "lucide-react";
import { geminiService } from "../services/geminiService";

interface Props {
  localNombre: string;
  visitanteNombre: string;
  golesLocal: number;
  golesVisitante: number;
  statsLocal: any;
  statsVisitante: any;
}

export function ResumenPartidoIA({ localNombre, visitanteNombre, golesLocal, golesVisitante, statsLocal, statsVisitante }: Props) {
  const [resumen, setResumen] = useState<string>("");
  const [cargando, setCargando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const generarResumen = async () => {
    setCargando(true);
    setResumen("");
    try {
      await geminiService.generateMatchSummary(
        localNombre, visitanteNombre, golesLocal, golesVisitante, statsLocal, statsVisitante,
        (chunk: string) => setResumen(chunk)
      );
    } catch (error) {
      setResumen("Hubo un error al generar el resumen. Verifica la configuracion de la API de Gemini.");
    } finally {
      setCargando(false);
    }
  };

  const copiar = () => {
    navigator.clipboard.writeText(resumen);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-purple-200 dark:border-purple-900 p-4 shadow-sm transition-colors">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-black uppercase text-purple-600 dark:text-purple-400 flex items-center gap-2 tracking-widest">
          <Sparkles size={16} /> Cronica IA (Gemini)
        </h3>
        <button
          onClick={generarResumen}
          disabled={cargando}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-all"
        >
          {cargando ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {cargando ? "Generando..." : "Generar Resumen"}
        </button>
      </div>

      {resumen && (
        <div className="relative">
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{resumen}</p>
          <button
            onClick={copiar}
            className="absolute top-0 right-0 p-1.5 text-gray-400 hover:text-purple-600 transition-colors"
            title="Copiar"
          >
            {copiado ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
          </button>
        </div>
      )}
    </div>
  );
}
