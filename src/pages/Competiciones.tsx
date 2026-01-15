import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open, ask } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core"; // <--- USAMOS ESTO QUE ES LO QUE FUNCIONA
import { Plus, Trophy, Trash2, Edit, Upload, X } from "lucide-react";
import Modal from "../components/Modal";
// Ya no importamos ImagenLocal

interface Competicion {
    id: number;
    nombre: string;
    tipo: string;
    pais_id: number | null;
    confederacion_id: number | null;
    logo_path: string | null;
}

interface Pais {
    id: number;
    nombre: string;
    bandera_path: string | null;
}

interface Confederacion {
    id: number;
    codigo: string;
    logo_path: string | null;
}

export default function Competiciones() {
    const [competiciones, setCompeticiones] = useState<Competicion[]>([]);
    const [paises, setPaises] = useState<Pais[]>([]);
    const [confederaciones, setConfederaciones] = useState<Confederacion[]>([]);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [nombre, setNombre] = useState("");
    const [tipo, setTipo] = useState("Liga");
    const [ambito, setAmbito] = useState<"nacional" | "internacional">("nacional");
    const [seleccionId, setSeleccionId] = useState<string>("");
    const [logoPath, setLogoPath] = useState<string | null>(null);

    useEffect(() => { cargarDatos(); }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const resComp = await db.select<Competicion[]>("SELECT * FROM Competicion ORDER BY nombre ASC");
            setCompeticiones(resComp);
            const resPais = await db.select<Pais[]>("SELECT id, nombre, bandera_path FROM Pais ORDER BY nombre ASC");
            setPaises(resPais);
            const resConf = await db.select<Confederacion[]>("SELECT id, codigo, logo_path FROM Confederacion ORDER BY codigo ASC");
            setConfederaciones(resConf);
        } catch (error) { console.error(error); }
    }

    async function seleccionarLogo() {
        try {
            const file = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setLogoPath(file as string);
        } catch (err) { console.error(err); }
    }

    function abrirCrear() {
        setEditingId(null);
        setNombre(""); setTipo("Liga"); setAmbito("nacional"); setSeleccionId(""); setLogoPath(null);
        setIsModalOpen(true);
    }

    function abrirEditar(c: Competicion) {
        setEditingId(c.id);
        setNombre(c.nombre);
        setTipo(c.tipo);
        setLogoPath(c.logo_path);

        if (c.pais_id) {
            setAmbito("nacional");
            setSeleccionId(c.pais_id.toString());
        } else if (c.confederacion_id) {
            setAmbito("internacional");
            setSeleccionId(c.confederacion_id.toString());
        } else {
            setAmbito("nacional");
            setSeleccionId("");
        }
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!nombre || !seleccionId) {
            alert("Faltan datos obligatorios");
            return;
        }
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const paisId = ambito === "nacional" ? parseInt(seleccionId) : null;
            const confId = ambito === "internacional" ? parseInt(seleccionId) : null;

            if (editingId) {
                await db.execute(
                    `UPDATE Competicion SET nombre=$1, tipo=$2, pais_id=$3, confederacion_id=$4, logo_path=$5 WHERE id=$6`,
                    [nombre, tipo, paisId, confId, logoPath, editingId]
                );
            } else {
                await db.execute(
                    `INSERT INTO Competicion (nombre, tipo, pais_id, confederacion_id, logo_path) VALUES ($1, $2, $3, $4, $5)`,
                    [nombre, tipo, paisId, confId, logoPath]
                );
            }
            setIsModalOpen(false);
            cargarDatos();
        } catch (error) { console.error(error); }
    }

    async function borrar(id: number) {
        const confirm = await ask("¿Eliminar competición?", { title: "Confirmar", kind: "warning", okLabel: "Sí", cancelLabel: "No" });
        if (confirm) {
            const db = await Database.load("sqlite:globalfutsal.db");
            await db.execute("DELETE FROM Competicion WHERE id = $1", [id]);
            cargarDatos();
        }
    }

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3"><Trophy className="text-orange" /> Competiciones</h1>
                    <p className="text-silver-dim mt-1">Ligas, Copas y Torneos.</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-lg font-semibold shadow-md flex items-center gap-2 hover:scale-105 transition-transform">
                    <Plus size={20} /> <span>Nueva</span>
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {competiciones.map((comp) => {
                    const pais = paises.find(p => p.id === comp.pais_id);
                    const conf = confederaciones.find(c => c.id === comp.confederacion_id);

                    return (
                        <div key={comp.id} className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 hover:shadow-lg transition-all relative group">
                            <div className="flex items-start gap-4">
                                <div className="w-16 h-16 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center p-1 overflow-hidden shrink-0">
                                    {/* IMAGEN ESTÁNDAR */}
                                    {comp.logo_path ? (
                                        <img src={convertFileSrc(comp.logo_path)} className="w-full h-full object-contain" alt={comp.nombre} />
                                    ) : (
                                        <Trophy className="text-gray-300" />
                                    )}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="font-bold text-navy text-lg leading-tight line-clamp-2" title={comp.nombre}>{comp.nombre}</h3>
                                    <span className="inline-block bg-orange/10 text-orange text-[10px] font-bold px-2 py-0.5 rounded uppercase mt-2">{comp.tipo}</span>
                                </div>
                            </div>
                            <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
                                {pais ? (
                                    <>
                                        <div className="w-6 h-4 border border-gray-200 shadow-sm flex items-center justify-center bg-gray-100">
                                            {pais.bandera_path && <img src={convertFileSrc(pais.bandera_path)} className="w-full h-full object-cover" />}
                                        </div>
                                        <span className="truncate">{pais.nombre}</span>
                                    </>
                                ) : conf ? (
                                    <>
                                        <div className="w-6 h-6 rounded-full border border-gray-200 shadow-sm p-0.5 bg-white flex items-center justify-center">
                                            {conf.logo_path && <img src={convertFileSrc(conf.logo_path)} className="w-full h-full object-contain" />}
                                        </div>
                                        <span className="truncate">{conf.codigo}</span>
                                    </>
                                ) : <span className="text-xs italic text-gray-400">Sin asignar</span>}
                            </div>
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 p-1 rounded shadow-sm">
                                <button onClick={() => abrirEditar(comp)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                <button onClick={() => borrar(comp.id)} className="p-1.5 text-red hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    );
                })}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingId ? "Editar Competición" : "Nueva Competición"}>
                <div className="space-y-4">
                    <div className="flex justify-center">
                        <div
                            onClick={seleccionarLogo}
                            className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 hover:border-orange cursor-pointer flex items-center justify-center bg-gray-50 overflow-hidden relative group transition-colors"
                        >
                            {logoPath ? (
                                <img src={convertFileSrc(logoPath)} className="w-full h-full object-contain p-2" />
                            ) : (
                                <div className="text-center text-gray-400 group-hover:text-orange transition-colors">
                                    <Upload size={24} className="mx-auto mb-1" />
                                    <span className="text-[10px] font-bold uppercase">Subir Logo</span>
                                </div>
                            )}
                        </div>
                        {logoPath && (
                            <button onClick={(e) => { e.stopPropagation(); setLogoPath(null); }} className="absolute ml-28 mt-[-10px] text-red bg-white rounded-full p-1 shadow border hover:bg-red hover:text-white transition-colors"><X size={14} /></button>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">Nombre</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-orange outline-none text-navy" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">Tipo</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white text-navy">
                                <option value="Liga">Liga</option>
                                <option value="Copa">Copa</option>
                                <option value="Playoff">Playoff</option>
                                <option value="Amistoso">Amistoso</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                        <label className="block text-sm font-bold text-navy mb-2">Ámbito</label>
                        <div className="flex gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={ambito === "nacional"} onChange={() => setAmbito("nacional")} className="text-orange focus:ring-orange" /><span className="text-sm text-navy">Nacional</span></label>
                            <label className="flex items-center gap-2 cursor-pointer"><input type="radio" checked={ambito === "internacional"} onChange={() => setAmbito("internacional")} className="text-orange focus:ring-orange" /><span className="text-sm text-navy">Internacional</span></label>
                        </div>
                        {ambito === "nacional" ? (
                            <select value={seleccionId} onChange={e => setSeleccionId(e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white text-navy">
                                <option value="">-- Selecciona País --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        ) : (
                            <select value={seleccionId} onChange={e => setSeleccionId(e.target.value)} className="w-full p-2 border border-gray-300 rounded bg-white text-navy">
                                <option value="">-- Selecciona Confederación --</option>
                                {confederaciones.map(c => <option key={c.id} value={c.id}>{c.codigo}</option>)}
                            </select>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded">Cancelar</button>
                        <button onClick={guardar} className="bg-navy text-white px-6 py-2 rounded font-medium shadow-md">Guardar</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}