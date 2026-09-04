import { Trophy, Users, Shield } from "lucide-react";

interface Props {
  onSeleccionar: (modo: "Clubes" | "Selecciones" | "Ambos") => void;
}

export function PantallaModo({ onSeleccionar }: Props) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-amber-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-5xl font-black text-white tracking-wider mb-2">GLOBAL FUTSAL</h1>
        <p className="text-amber-400 text-sm tracking-widest uppercase font-bold">Stats System</p>
      </div>

      <h2 className="text-white text-xl font-bold mb-8">Selecciona el modo de trabajo</h2>

      <div className="flex gap-4 flex-wrap justify-center">
        <button
          onClick={() => onSeleccionar("Clubes")}
          className="flex flex-col items-center gap-3 p-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/50 rounded-2xl transition-all duration-300 hover:scale-105 group"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
            <Shield size={32} className="text-amber-400" />
          </div>
          <div className="text-center">
            <span className="text-white font-bold text-lg block">Clubes</span>
            <span className="text-gray-400 text-xs">Ligas y copas de clubes</span>
          </div>
        </button>

        <button
          onClick={() => onSeleccionar("Selecciones")}
          className="flex flex-col items-center gap-3 p-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/50 rounded-2xl transition-all duration-300 hover:scale-105 group"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
            <Trophy size={32} className="text-amber-400" />
          </div>
          <div className="text-center">
            <span className="text-white font-bold text-lg block">Selecciones</span>
            <span className="text-gray-400 text-xs">Mundiales, Eurocopas, etc.</span>
          </div>
        </button>

        <button
          onClick={() => onSeleccionar("Ambos")}
          className="flex flex-col items-center gap-3 p-8 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-amber-500/50 rounded-2xl transition-all duration-300 hover:scale-105 group"
        >
          <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center group-hover:bg-amber-500/30 transition-colors">
            <Users size={32} className="text-amber-400" />
          </div>
          <div className="text-center">
            <span className="text-white font-bold text-lg block">Ambos</span>
            <span className="text-gray-400 text-xs">Clubes y selecciones</span>
          </div>
        </button>
      </div>
    </div>
  );
}
