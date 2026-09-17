import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core"; // <--- USAMOS ESTO QUE ES LO QUE FUNCIONA
import { Plus, Trophy, Trash2, Edit, Upload, X } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
import Modal from "../components/Modal";
import { UndoToast } from "../components/UndoToast";
import { useBorradorConDeshacer } from "../hooks/useBorradorConDeshacer";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";
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

    // --- CAMBIOS SIN GUARDAR (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo } = useFormGuard();
    // Confirmación temática para acciones destructivas (sustituye a ask() nativo).
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // Borrado con deshacer: instantánea antes del DELETE, re-INSERT al deshacer.
    const { pendiente: filaBorrada, borrar: borrarFila, deshacer, clear: limpiarBorrado } = useBorradorConDeshacer("Competicion", cargarDatos);

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
        } catch (error) {
            console.error(error);
            toast.error("Error al cargar las competiciones");
        }
    }

    async function seleccionarLogo() {
        try {
            const file = await open({
                multiple: false,
                directory: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'svg', 'webp', 'gif'] }]
            });
            if (file) setLogoPath(file as string);
        } catch (err) {
            console.error(err);
            toast.error("No se pudo abrir el selector de archivos");
        }
    }

    function abrirCrear() {
        setEditingId(null);
        setNombre(""); setTipo("Liga"); setAmbito("nacional"); setSeleccionId(""); setLogoPath(null);
        iniciar({ nombre: "", tipo: "Liga", ambito: "nacional", seleccionId: "", logoPath: null });
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
        iniciar({ nombre: c.nombre, tipo: c.tipo, ambito: c.pais_id ? "nacional" : (c.confederacion_id ? "internacional" : "nacional"), seleccionId: c.pais_id ? c.pais_id.toString() : (c.confederacion_id ? c.confederacion_id.toString() : ""), logoPath: c.logo_path });
        setIsModalOpen(true);
    }

    async function guardar(): Promise<boolean> {
        if (!nombre || !seleccionId) {
            toast.warning("Faltan datos obligatorios");
            return false;
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
            return true;
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar la competición");
            return false;
        }
    }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro({ nombre, tipo, ambito, seleccionId, logoPath }, guardar)) setIsModalOpen(false);
    }

    async function borrar(id: number) {
        const confirm = await confirmar({ mensaje: "¿Eliminar competición?", titulo: "Confirmar", textoConfirmar: "Sí", textoCancelar: "No", peligroso: true });
        if (confirm) await borrarFila(id);
    }

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-8 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3"><Trophy className="text-orange text-glow-orange animate-pulse" /> Competiciones</h1>
                    <p className="text-silver/50 text-sm mt-1">Ligas, Copas y Torneos registrados en el sistema</p>
                </div>
                <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                    <Plus size={20} /> <span>Nueva</span>
                </button>
            </div>

            {/* REJILLA DE TARJETAS */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {competiciones.length === 0 && (
                    <EstadoVacio
                        icono={Trophy}
                        titulo="Aún no hay competiciones"
                        descripcion="Importa la enciclopedia de competiciones desde CSV, carga los seeds de futsal o crea la primera a mano."
                        acciones={[
                            { texto: "Importar CSV", a: "/importar", primario: true },
                            { texto: "Crear competición", onClick: abrirCrear },
                        ]}
                    />
                )}
                {competiciones.map((comp) => {
                    const pais = paises.find(p => p.id === comp.pais_id);
                    const conf = confederaciones.find(c => c.id === comp.confederacion_id);

                    return (
                        <div key={comp.id} className="glass-panel p-6 rounded-2xl border border-white/5 hover:border-white/10 hover:shadow-2xl transition-all duration-300 relative group flex flex-col justify-between">
                            <div>
                                <div className="flex items-start gap-4">
                                    <div className="w-16 h-16 rounded-xl bg-white border border-white/10 flex items-center justify-center p-1.5 overflow-hidden shrink-0 shadow-md">
                                        {comp.logo_path ? (
                                            <img src={convertFileSrc(comp.logo_path)} className="w-full h-full object-contain filter drop-shadow-md" alt={comp.nombre} />
                                        ) : (
                                            <Trophy className="text-silver/30 animate-pulse" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-bold text-white text-lg leading-tight line-clamp-2 group-hover:text-orange transition-colors" title={comp.nombre}>{comp.nombre}</h3>
                                        <span className="inline-block bg-orange/10 text-orange border border-orange/20 text-[10px] font-black px-2 py-0.5 rounded uppercase mt-2 tracking-wider">{comp.tipo}</span>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-2 text-sm text-silver/60">
                                {pais ? (
                                    <>
                                        <div className="w-6 h-4 border border-white/10 shadow-sm flex items-center justify-center bg-navy rounded-sm">
                                            {pais.bandera_path && <img src={convertFileSrc(pais.bandera_path)} className="w-full h-full object-cover" />}
                                        </div>
                                        <span className="truncate font-bold text-xs">{pais.nombre}</span>
                                    </>
                                ) : conf ? (
                                    <>
                                        <div className="w-6 h-6 rounded-full border border-white/10 shadow-sm p-0.5 bg-navy flex items-center justify-center">
                                            {conf.logo_path && <img src={convertFileSrc(conf.logo_path)} className="w-full h-full object-contain" />}
                                        </div>
                                        <span className="truncate font-bold text-xs">{conf.codigo}</span>
                                    </>
                                ) : <span className="text-xs italic text-silver/30 font-medium">Sin asignar</span>}
                            </div>

                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-navy-dark/95 p-1 rounded-xl border border-white/5 shadow-2xl backdrop-blur-sm">
                                <button onClick={() => abrirEditar(comp)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg transition-colors"><Edit size={16} /></button>
                                <button onClick={() => borrar(comp.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg transition-colors"><Trash2 size={16} /></button>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* MODAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editingId ? "Editar Competición" : "Nueva Competición"}>
                <div className="space-y-4">
                    <div className="flex justify-center">
                        <div
                            onClick={seleccionarLogo}
                            className="w-32 h-32 rounded-xl border border-white/10 hover:border-orange cursor-pointer flex items-center justify-center bg-white overflow-hidden relative group transition-colors shadow-inner"
                        >
                            {logoPath ? (
                                <img src={convertFileSrc(logoPath)} className="w-full h-full object-contain p-2 filter drop-shadow-sm" />
                            ) : (
                                <div className="text-center text-silver/40 group-hover:text-orange transition-colors">
                                    <Upload size={24} className="mx-auto mb-1 text-silver/30" />
                                    <span className="text-[10px] font-bold uppercase tracking-wider">Subir Logo</span>
                                </div>
                            )}
                        </div>
                        {logoPath && (
                            <button onClick={(e) => { e.stopPropagation(); setLogoPath(null); }} className="absolute ml-28 mt-[-10px] text-red bg-navy border border-white/10 rounded-full p-1 shadow-2xl hover:bg-white/5 transition-colors"><X size={14} /></button>
                        )}
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                        <input value={nombre} onChange={e => setNombre(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Tipo</label>
                            <select value={tipo} onChange={e => setTipo(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="Liga">Liga</option>
                                <option value="Copa">Copa</option>
                                <option value="Playoff">Playoff</option>
                                <option value="Amistoso">Amistoso</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-navy-dark/40 p-4 rounded-xl border border-white/5">
                        <label className="block text-xs font-bold text-silver/50 mb-2 uppercase tracking-wider">Ámbito</label>
                        <div className="flex gap-4 mb-3">
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-sm"><input type="radio" checked={ambito === "nacional"} onChange={() => setAmbito("nacional")} className="text-orange focus:ring-orange cursor-pointer" /><span className="text-sm">Nacional</span></label>
                            <label className="flex items-center gap-2 cursor-pointer font-bold text-sm"><input type="radio" checked={ambito === "internacional"} onChange={() => setAmbito("internacional")} className="text-orange focus:ring-orange cursor-pointer" /><span className="text-sm">Internacional</span></label>
                        </div>
                        {ambito === "nacional" ? (
                            <select value={seleccionId} onChange={e => setSeleccionId(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Selecciona País --</option>
                                {paises.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                        ) : (
                            <select value={seleccionId} onChange={e => setSeleccionId(e.target.value)} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer">
                                <option value="">-- Selecciona Confederación --</option>
                                {confederaciones.map(c => <option key={c.id} value={c.id}>{c.codigo}</option>)}
                            </select>
                        )}
                    </div>

                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardar} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

            {/* Diálogo de cambios sin guardar del formulario */}
            {dialogo}
            {/* Diálogo de confirmación destructiva */}
            {dialogoConfirmar}
            <UndoToast
                pendiente={filaBorrada}
                onUndo={deshacer}
                onDescartar={limpiarBorrado}
                mensaje={(f) => `Competición ${f.nombre} eliminada`}
            />
        </div>
    );
}