import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core"; // <--- CLAVE
import { Plus, Layers, Trash2, Edit, Save, Trophy } from "lucide-react";
import Modal from "../components/Modal";
// Ya no usamos ImagenLocal

interface EdicionDisplay {
    id: number;
    competicion_nombre: string;
    competicion_logo: string | null;
    temporada_nombre: string;
    puntos_victoria: number;
    puntos_empate: number;
    puntos_derrota: number;
    competicion_id: number;
    temporada_id: number;
}

interface SelectorData {
    id: number;
    nombre: string;
}

export default function Ediciones() {
    const [ediciones, setEdiciones] = useState<EdicionDisplay[]>([]);
    const [competiciones, setCompeticiones] = useState<SelectorData[]>([]);
    const [temporadas, setTemporadas] = useState<SelectorData[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [selCompeticion, setSelCompeticion] = useState("");
    const [selTemporada, setSelTemporada] = useState("");
    const [ptsVictoria, setPtsVictoria] = useState(3);
    const [ptsEmpate, setPtsEmpate] = useState(1);
    const [ptsDerrota, setPtsDerrota] = useState(0);

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const query = `
        SELECT e.id, c.nombre as competicion_nombre, c.logo_path as competicion_logo, t.nombre as temporada_nombre,
          e.puntos_victoria, e.puntos_empate, e.puntos_derrota, e.competicion_id, e.temporada_id
        FROM Edicion e
        JOIN Competicion c ON e.competicion_id = c.id
        JOIN Temporada t ON e.temporada_id = t.id
        ORDER BY t.fecha_inicio DESC, c.nombre ASC
      `;
            const resEdiciones = await db.select<EdicionDisplay[]>(query);
            setEdiciones(resEdiciones);

            const resComp = await db.select<SelectorData[]>("SELECT id, nombre FROM Competicion ORDER BY nombre ASC");
            setCompeticiones(resComp);

            const resTemp = await db.select<SelectorData[]>("SELECT id, nombre FROM Temporada ORDER BY fecha_inicio DESC");
            setTemporadas(resTemp);
        } catch (error) { console.error(error); }
    }

    function abrirCrear() {
        setEditingId(null);
        setSelCompeticion(""); setSelTemporada(""); setPtsVictoria(3); setPtsEmpate(1); setPtsDerrota(0);
        setIsModalOpen(true);
    }

    function abrirEditar(e: EdicionDisplay) {
        setEditingId(e.id);
        setSelCompeticion(e.competicion_id.toString());
        setSelTemporada(e.temporada_id.toString());
        setPtsVictoria(e.puntos_victoria); setPtsEmpate(e.puntos_empate); setPtsDerrota(e.puntos_derrota);
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!selCompeticion || !selTemporada) {
            alert("Selecciona Competición y Temporada");
            return;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            if (editingId) {
                await db.execute(
                    `UPDATE Edicion SET competicion_id=$1, temporada_id=$2, puntos_victoria=$3, puntos_empate=$4, puntos_derrota=$5 WHERE id=$6`,
                    [selCompeticion, selTemporada, ptsVictoria, ptsEmpate, ptsDerrota, editingId]
                );
            } else {
                const existe = await db.select<any[]>("SELECT id FROM Edicion WHERE competicion_id = $1 AND temporada_id = $2", [selCompeticion, selTemporada]);
                if (existe.length > 0) { alert("¡Esta edición ya existe!"); return; }
                await db.execute(
                    `INSERT INTO Edicion (competicion_id, temporada_id, puntos_victoria, puntos_empate, puntos_derrota) VALUES ($1, $2, $3, $4, $5)`,
                    [selCompeticion, selTemporada, ptsVictoria, ptsEmpate, ptsDerrota]
                );
            }
            setIsModalOpen(false);
            cargarDatos();
        } catch (error) { console.error(error); }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar esta edición?", { title: "Eliminar", kind: "warning", okLabel: "Sí", cancelLabel: "Cancelar" });
        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Edicion WHERE id = $1", [id]);
            cargarDatos();
        }
    }

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3"><Layers className="text-orange" /> Ediciones</h1>
                    <p className="text-silver-dim mt-1">Vincula competiciones con temporadas.</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-lg font-semibold shadow-md flex items-center gap-2 hover:scale-105 transition-transform">
                    <Plus size={20} /> <span>Nueva Edición</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ediciones.map((ed) => (
                    <div key={ed.id} className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-all flex items-center justify-between group">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center p-1 overflow-hidden shrink-0">
                                {/* AQUI ESTÁ EL CAMBIO A convertFileSrc */}
                                {ed.competicion_logo ? (
                                    <img src={convertFileSrc(ed.competicion_logo)} alt={ed.competicion_nombre} className="w-full h-full object-contain" />
                                ) : (
                                    <Trophy className="text-gray-300" />
                                )}
                            </div>
                            <div>
                                <h3 className="font-bold text-navy text-lg">{ed.competicion_nombre}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="bg-purple/10 text-purple text-xs font-bold px-2 py-0.5 rounded uppercase">{ed.temporada_nombre}</span>
                                    <span className="text-[10px] text-gray-400 border px-1.5 rounded" title="Sistema de Puntuación (V/E/D)">Pts: {ed.puntos_victoria}/{ed.puntos_empate}/{ed.puntos_derrota}</span>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => abrirEditar(ed)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"><Edit size={18} /></button>
                            <button onClick={() => borrar(ed.id)} className="p-2 text-red hover:bg-red-50 rounded-lg"><Trash2 size={18} /></button>
                        </div>
                    </div>
                ))}
                {ediciones.length === 0 && <div className="col-span-full p-10 text-center text-gray-400 border-2 border-dashed rounded-xl">No hay ediciones creadas.</div>}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Edición" : "Nueva Edición"}>
                <div className="space-y-5">
                    <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">Competición</label>
                            <select value={selCompeticion} onChange={e => setSelCompeticion(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange outline-none">
                                <option value="">-- Seleccionar --</option>
                                {competiciones.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">Temporada</label>
                            <select value={selTemporada} onChange={e => setSelTemporada(e.target.value)} className="w-full p-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-orange outline-none">
                                <option value="">-- Seleccionar --</option>
                                {temporadas.map(t => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                            </select>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2"><Save size={12} /> Sistema de Puntuación</h4>
                        <div className="grid grid-cols-3 gap-3">
                            <div><label className="block text-xs font-semibold text-navy mb-1">Victoria</label><input type="number" value={ptsVictoria} onChange={e => setPtsVictoria(parseInt(e.target.value))} className="w-full p-2 border rounded text-center font-bold text-green-600" /></div>
                            <div><label className="block text-xs font-semibold text-navy mb-1">Empate</label><input type="number" value={ptsEmpate} onChange={e => setPtsEmpate(parseInt(e.target.value))} className="w-full p-2 border rounded text-center font-bold text-blue-600" /></div>
                            <div><label className="block text-xs font-semibold text-navy mb-1">Derrota</label><input type="number" value={ptsDerrota} onChange={e => setPtsDerrota(parseInt(e.target.value))} className="w-full p-2 border rounded text-center font-bold text-red-600" /></div>
                        </div>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                        <button onClick={guardar} className="bg-navy text-white px-6 py-2 rounded font-medium shadow-md">{editingId ? "Guardar Cambios" : "Crear Edición"}</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}