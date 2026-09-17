import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path"; // Para unir rutas de carpetas
import Papa from "papaparse"; // El lector de CSV
import { Search, Upload, Plus, Trash2, Edit, Flag, FileSpreadsheet } from "lucide-react";
import { toast } from "../components/Toast";
import { EstadoVacio } from "../components/EstadoVacio";
import Modal from "../components/Modal";
import { useConfirm } from "../components/ConfirmDialog";
import { useFormGuard } from "../hooks/useFormGuard";

interface Pais {
    id: number;
    nombre: string;
    codigo_iso2: string;
    codigo_iso3: string;
    bandera_path: string | null;
    confederacion_id: number | null;
}

interface Confederacion {
    id: number;
    codigo: string;
}

export default function Paises() {
    const { confirmar, dialogo: dialogoConfirmar } = useConfirm();
    // --- CAMBIOS SIN GUARDAR EN EL FORMULARIO (useFormGuard) ---
    const { iniciar, cerrarSeguro, dialogo: dialogoFormulario } = useFormGuard();
    const [paises, setPaises] = useState<Pais[]>([]);
    const [confederaciones, setConfederaciones] = useState<Confederacion[]>([]);
    const [busqueda, setBusqueda] = useState("");
    const [loading, setLoading] = useState(false);

    // Modal Edición
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);
    const [form, setForm] = useState({ nombre: "", iso2: "", iso3: "", conf_id: "", bandera: "" });

    useEffect(() => {
        cargarDatos();
    }, []);

    async function cargarDatos() {
        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const resP = await db.select<Pais[]>("SELECT * FROM Pais ORDER BY nombre ASC");
            const resC = await db.select<Confederacion[]>("SELECT id, codigo FROM Confederacion");
            setPaises(resP);
            setConfederaciones(resC);
        } catch (err) {
            console.error(err);
            toast.error("Error al cargar los países");
        }
    }

    // --- LÓGICA DE IMPORTACIÓN MASIVA (LA MAGIA) ---
    async function importarCSV() {
        try {
            // 1. Pedir el archivo CSV
            const csvPath = await open({
                title: "Selecciona el archivo CSV de Países",
                filters: [{ name: 'CSV', extensions: ['csv'] }]
            });
            if (!csvPath) return;

            // 2. Pedir la carpeta de Banderas
            const carpetaBanderas = await open({
                title: "Selecciona la CARPETA donde están las imágenes de las banderas (png)",
                directory: true, // Importante: Selecciona carpeta, no archivo
                multiple: false
            });
            if (!carpetaBanderas) return;

            setLoading(true);

            // 3. Leer el CSV
            const csvContent = await readTextFile(csvPath as string);

            Papa.parse(csvContent, {
                header: true,
                delimiter: ";", // Tu CSV usa punto y coma
                skipEmptyLines: true,
                complete: async (results: any) => {
                    const db = await Database.load("sqlite:globalfutsal.db");
                    let cont = 0;

                    // 4. Recorrer cada fila del CSV
                    for (const row of results.data) {
                        // Aseguramos que existan los campos (según tu CSV: nombre;ISO2;ISO3)
                        if (!row.nombre || !row.ISO2 || !row.ISO3) continue;

                        const iso2 = row.ISO2.toLowerCase().trim();
                        const iso3 = row.ISO3.toUpperCase().trim();
                        const nombre = row.nombre.trim();

                        // 5. BUSCAR BANDERA AUTOMÁTICA
                        // Construimos la ruta: Carpeta + \ + iso2 + .png (ej: C:\Banderas\es.png)
                        // Nota: En Windows la barra es \, pero join lo maneja
                        const rutaBandera = await join(carpetaBanderas as string, `${iso2}.png`);

                        // 6. Insertar en BD
                        // Usamos INSERT OR IGNORE para no duplicar si ya existe el ISO
                        await db.execute(
                            `INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3, bandera_path) 
               VALUES ($1, $2, $3, $4)`,
                            [nombre, iso2.toUpperCase(), iso3, rutaBandera]
                        );
                        cont++;
                    }

                    setLoading(false);
                    toast.success(`Importación completada: ${cont} países procesados.`);
                    cargarDatos();
                }
            });

        } catch (error) {
            console.error(error);
            setLoading(false);
            toast.error("Error en la importación. Revisa la consola.");
        }
    }

    // --- LÓGICA CRUD MANUAL ---
    async function seleccionarBanderaManual() {
        try {
            const file = await open({
                multiple: false,
                filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]
            });
            if (file) setForm({ ...form, bandera: file as string });
        } catch (err) {
            console.error(err);
            toast.error("No se pudo abrir el selector de archivos");
        }
    }

    async function guardarManual(): Promise<boolean> {
        if (!form.nombre || !form.iso2 || !form.iso3) {
            toast.warning("Nombre e ISOs son obligatorios");
            return false;
        }

        try {
            const db = await Database.load("sqlite:globalfutsal.db");
            const iso2 = form.iso2.toUpperCase();
            const iso3 = form.iso3.toUpperCase();

            if (editId) {
                await db.execute(
                    "UPDATE Pais SET nombre=$1, codigo_iso2=$2, codigo_iso3=$3, confederacion_id=$4, bandera_path=$5 WHERE id=$6",
                    [form.nombre, iso2, iso3, form.conf_id || null, form.bandera || null, editId]
                );
            } else {
                await db.execute(
                    "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3, confederacion_id, bandera_path) VALUES ($1, $2, $3, $4, $5)",
                    [form.nombre, iso2, iso3, form.conf_id || null, form.bandera || null]
                );
            }
            cerrarModal();
            cargarDatos();
            return true;
        } catch (error) {
            console.error(error);
            toast.error("Error al guardar el país");
            return false;
        }
    }

    async function borrar(id: number) {
        const ok = await confirmar({
            titulo: "Eliminar país",
            mensaje: "¿Eliminar este país? Los equipos, competiciones y personas que lo usen quedarán sin país asignado.",
            textoConfirmar: "Sí, eliminar",
        });
        if (!ok) return;
        const db = await Database.load("sqlite:globalfutsal.db");
        await db.execute("DELETE FROM Pais WHERE id=$1", [id]);
        toast.success("País eliminado");
        cargarDatos();
    }

    function abrirCrear() {
        setEditId(null);
        const inicial = { nombre: "", iso2: "", iso3: "", conf_id: "", bandera: "" };
        setForm(inicial);
        iniciar(inicial);
        setIsModalOpen(true);
    }

    function abrirEditar(p: Pais) {
        setEditId(p.id);
        const inicial = {
            nombre: p.nombre,
            iso2: p.codigo_iso2,
            iso3: p.codigo_iso3,
            conf_id: p.confederacion_id?.toString() || "",
            bandera: p.bandera_path || ""
        };
        setForm(inicial);
        iniciar(inicial);
        setIsModalOpen(true);
    }

    function cerrarModal() { setIsModalOpen(false); setEditId(null); setForm({ nombre: "", iso2: "", iso3: "", conf_id: "", bandera: "" }); }

    /** Cierre seguro: si el formulario difiere de su estado inicial, pregunta antes de perder los cambios. */
    const cerrarModalSeguro = async () => {
        if (await cerrarSeguro(form, guardarManual)) cerrarModal();
    };

    // Filtrado de búsqueda
    const paisesFiltrados = paises.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo_iso3.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="p-8 min-h-screen bg-transparent text-white ml-0 flex flex-col">

            {/* CABECERA */}
            <div className="flex justify-between items-center mb-8 glass-panel p-5 rounded-2xl border border-white/5 shadow-2xl">
                <div>
                    <h1 className="text-2xl font-display font-black text-white flex items-center gap-3">
                        <Flag className="text-orange text-glow-orange animate-pulse" /> Países
                    </h1>
                    <p className="text-silver/50 text-sm mt-1">Base de datos de naciones y banderas en el sistema</p>
                </div>
                <div className="flex gap-3">
                    {/* BOTÓN DE IMPORTAR CSV */}
                    <button
                        onClick={importarCSV}
                        disabled={loading}
                        className="bg-navy-light hover:bg-navy-light/80 text-white px-4 py-2.5 rounded-xl font-bold shadow-md border border-white/5 flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <FileSpreadsheet size={20} className="text-orange" />
                        <span>{loading ? "Importando..." : "Importar CSV"}</span>
                    </button>

                    <button onClick={abrirCrear} className="bg-orange hover:bg-orange-hover text-white px-6 py-2.5 rounded-xl font-bold shadow-neon-orange flex items-center gap-2 transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">
                        <Plus size={20} /> <span>Nuevo</span>
                    </button>
                </div>
            </div>

            {/* BARRA DE BÚSQUEDA */}
            <div className="glass-panel p-4 rounded-xl border border-white/5 mb-6 flex items-center gap-3">
                <Search className="text-silver/40" size={18} />
                <input
                    type="text"
                    placeholder="Buscar país por nombre o código ISO..."
                    className="bg-transparent outline-none w-full text-white placeholder-silver/40 text-sm"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
                <div className="text-xs text-silver/40 font-bold uppercase tracking-wider">
                    {paisesFiltrados.length} registros
                </div>
            </div>

            {/* TABLA DE PAÍSES */}
            <div className="glass-panel rounded-2xl border border-white/5 overflow-hidden shadow-2xl">
                <table className="w-full text-left">
                    <thead className="bg-navy-dark/85 border-b border-white/5 text-[10px] text-silver/40 uppercase tracking-widest font-black font-display">
                        <tr>
                            <th className="p-4 w-16">Bandera</th>
                            <th className="p-4">Nombre</th>
                            <th className="p-4 w-24">ISO 3</th>
                            <th className="p-4 w-32">Confed.</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-silver/80">
                        {paisesFiltrados.map(pais => (
                            <tr key={pais.id} className="hover:bg-white/5 transition-colors group duration-200">
                                <td className="p-4">
                                    <div className="w-10 h-7 rounded border border-white/10 overflow-hidden bg-navy flex items-center justify-center shadow-inner">
                                        {pais.bandera_path ? (
                                            <img src={convertFileSrc(pais.bandera_path)} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[10px] text-silver/40 font-bold">N/A</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 font-bold text-white group-hover:text-orange transition-colors">{pais.nombre}</td>
                                <td className="p-4">
                                    <span className="bg-orange/10 text-orange border border-orange/20 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider">{pais.codigo_iso3}</span>
                                </td>
                                <td className="p-4 text-sm font-bold text-white/70">
                                    {confederaciones.find(c => c.id === pais.confederacion_id)?.codigo || "-"}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2 transition-opacity duration-300">
                                    <button onClick={() => abrirEditar(pais)} className="p-1.5 text-accent-blue hover:bg-white/5 rounded-lg bg-navy border border-white/5 transition-colors"><Edit size={16} /></button>
                                    <button onClick={() => borrar(pais.id)} className="p-1.5 text-red hover:bg-red/10 rounded-lg bg-navy border border-white/5 transition-colors"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {paisesFiltrados.length === 0 && (paises.length === 0 ? (
                    <EstadoVacio
                        icono={Flag}
                        titulo="Aún no hay países"
                        descripcion="Los países nacionalizan equipos, jugadores y entrenadores. Cárgalos con los seeds o crea el primero."
                        acciones={[
                            { texto: "Crear país", onClick: abrirCrear, primario: true },
                            { texto: "Cargar seeds", a: "/configuracion" },
                        ]}
                    />
                ) : (
                    <EstadoVacio
                        icono={Search}
                        titulo="Ningún país coincide"
                        descripcion="Prueba con otro nombre."
                        porFiltros
                        acciones={[{ texto: "Limpiar búsqueda", onClick: () => setBusqueda("") }]}
                    />
                ))}
            </div>

            {/* MODAL EDICIÓN MANUAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModalSeguro} title={editId ? "Editar País" : "Nuevo País"}>
                <div className="space-y-4">
                    <div className="flex flex-col items-center mb-2">
                        <label className="text-xs font-bold text-silver/50 mb-2 uppercase tracking-wider">Bandera</label>
                        <div
                            onClick={seleccionarBanderaManual}
                            className="w-24 h-16 rounded-xl border border-white/10 hover:border-orange cursor-pointer flex items-center justify-center bg-navy-dark overflow-hidden relative group shadow-inner"
                        >
                            {form.bandera ? (
                                <img src={convertFileSrc(form.bandera)} className="w-full h-full object-cover" />
                            ) : (
                                <div className="text-center text-silver/40">
                                    <Flag size={24} className="mx-auto mb-1 text-silver/30" />
                                    <span className="text-[10px] uppercase font-bold tracking-wider">Cargar PNG</span>
                                </div>
                            )}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Upload size={20} className="text-white" />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Nombre</label>
                        <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">ISO 2 (ej: ES)</label>
                            <input value={form.iso2} onChange={e => setForm({ ...form, iso2: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors uppercase font-bold text-center" maxLength={2} />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">ISO 3 (ej: ESP)</label>
                            <input value={form.iso3} onChange={e => setForm({ ...form, iso3: e.target.value })} className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors uppercase font-bold text-center" maxLength={3} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-silver/50 mb-1 uppercase tracking-wider">Confederación</label>
                        <select
                            value={form.conf_id}
                            onChange={e => setForm({ ...form, conf_id: e.target.value })}
                            className="w-full p-2.5 bg-navy border border-white/10 rounded-xl text-white outline-none focus:border-orange transition-colors font-bold cursor-pointer"
                        >
                            <option value="">-- Sin asignar --</option>
                            {confederaciones.map(c => (
                                <option key={c.id} value={c.id}>{c.codigo}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-white/5">
                        <button onClick={cerrarModalSeguro} className="px-5 py-2 text-silver/50 hover:text-white font-bold transition-colors">Cancelar</button>
                        <button onClick={guardarManual} className="bg-orange hover:bg-orange-hover text-white px-6 py-2 rounded-xl font-bold shadow-neon-orange transition-all duration-300 hover:scale-[1.02] active:scale-[0.98]">Guardar</button>
                    </div>
                </div>
            </Modal>

            {dialogoConfirmar}
            {dialogoFormulario}
        </div>
    );
}