import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { convertFileSrc } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path"; // Para unir rutas de carpetas
import Papa from "papaparse"; // El lector de CSV
import { Search, Upload, Plus, Trash2, Edit, Flag, FileSpreadsheet } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";

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
        } catch (err) { console.error(err); }
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
                    alert(`¡Importación completada! Se han procesado ${cont} países.`);
                    cargarDatos();
                }
            });

        } catch (error) {
            console.error(error);
            setLoading(false);
            alert("Error en la importación. Revisa la consola.");
        }
    }

    // --- LÓGICA CRUD MANUAL ---
    async function guardarManual() {
        const db = await Database.load("sqlite:globalfutsal.db");
        if (editId) {
            await db.execute(
                "UPDATE Pais SET nombre=$1, codigo_iso2=$2, codigo_iso3=$3, confederacion_id=$4 WHERE id=$5",
                [form.nombre, form.iso2, form.iso3, form.conf_id || null, editId]
            );
        } else {
            await db.execute(
                "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3, confederacion_id) VALUES ($1, $2, $3, $4)",
                [form.nombre, form.iso2, form.iso3, form.conf_id || null]
            );
        }
        cerrarModal();
        cargarDatos();
    }

    async function borrar(id: number) {
        if (!confirm("¿Eliminar país?")) return;
        const db = await Database.load("sqlite:globalfutsal.db");
        await db.execute("DELETE FROM Pais WHERE id=$1", [id]);
        cargarDatos();
    }

    function abrirEditar(p: Pais) {
        setEditId(p.id);
        setForm({
            nombre: p.nombre,
            iso2: p.codigo_iso2,
            iso3: p.codigo_iso3,
            conf_id: p.confederacion_id?.toString() || "",
            bandera: p.bandera_path || ""
        });
        setIsModalOpen(true);
    }

    function cerrarModal() { setIsModalOpen(false); setEditId(null); setForm({ nombre: "", iso2: "", iso3: "", conf_id: "", bandera: "" }); }

    // Filtrado de búsqueda
    const paisesFiltrados = paises.filter(p =>
        p.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
        p.codigo_iso3.toLowerCase().includes(busqueda.toLowerCase())
    );

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0">

            {/* CABECERA */}
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-navy flex items-center gap-3">
                        <Flag className="text-orange" /> Países
                    </h1>
                    <p className="text-silver-dim mt-1">Base de datos de naciones y banderas.</p>
                </div>
                <div className="flex gap-3">
                    {/* BOTÓN DE IMPORTAR CSV */}
                    <button
                        onClick={importarCSV}
                        disabled={loading}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2.5 rounded-lg font-medium shadow-md flex items-center gap-2 transition-transform active:scale-95"
                    >
                        <FileSpreadsheet size={20} />
                        <span>{loading ? "Importando..." : "Importar CSV + Banderas"}</span>
                    </button>

                    <button onClick={() => setIsModalOpen(true)} className="bg-navy hover:bg-navy-light text-white px-4 py-2.5 rounded-lg font-medium shadow-md flex items-center gap-2">
                        <Plus size={20} /> <span>Nuevo</span>
                    </button>
                </div>
            </div>

            {/* BARRA DE BÚSQUEDA */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex items-center gap-3">
                <Search className="text-gray-400" />
                <input
                    type="text"
                    placeholder="Buscar país por nombre o código ISO..."
                    className="w-full outline-none text-navy placeholder-gray-400"
                    value={busqueda}
                    onChange={(e) => setBusqueda(e.target.value)}
                />
                <div className="text-sm text-gray-400 font-medium">
                    {paisesFiltrados.length} registros
                </div>
            </div>

            {/* TABLA DE PAÍSES */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-navy-dark text-silver text-xs uppercase tracking-wider">
                        <tr>
                            <th className="p-4 w-16">Bandera</th>
                            <th className="p-4">Nombre</th>
                            <th className="p-4 w-24">ISO 3</th>
                            <th className="p-4 w-32">Confed.</th>
                            <th className="p-4 w-24 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {paisesFiltrados.map(pais => (
                            <tr key={pais.id} className="hover:bg-gray-50 transition-colors">
                                <td className="p-4">
                                    <div className="w-10 h-7 rounded border border-gray-200 overflow-hidden bg-gray-100 flex items-center justify-center">
                                        {/* Usamos convertFileSrc para ver la bandera local */}
                                        {pais.bandera_path ? (
                                            <img src={convertFileSrc(pais.bandera_path)} className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[10px] text-gray-400">N/A</span>
                                        )}
                                    </div>
                                </td>
                                <td className="p-4 font-medium text-navy">{pais.nombre}</td>
                                <td className="p-4">
                                    <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-bold">{pais.codigo_iso3}</span>
                                </td>
                                <td className="p-4 text-sm text-gray-500">
                                    {confederaciones.find(c => c.id === pais.confederacion_id)?.codigo || "-"}
                                </td>
                                <td className="p-4 text-right flex justify-end gap-2">
                                    <button onClick={() => abrirEditar(pais)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><Edit size={16} /></button>
                                    <button onClick={() => borrar(pais.id)} className="p-1.5 text-red hover:bg-red-50 rounded"><Trash2 size={16} /></button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {paisesFiltrados.length === 0 && (
                    <div className="p-8 text-center text-gray-400">No se encontraron países.</div>
                )}
            </div>

            {/* MODAL EDICIÓN MANUAL */}
            <Modal isOpen={isModalOpen} onClose={cerrarModal} title={editId ? "Editar País" : "Nuevo País"}>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">Nombre</label>
                        <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className="w-full p-2 border rounded" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">ISO 2 (ej: ES)</label>
                            <input value={form.iso2} onChange={e => setForm({ ...form, iso2: e.target.value })} className="w-full p-2 border rounded uppercase" maxLength={2} />
                        </div>
                        <div>
                            <label className="block text-sm font-bold text-navy mb-1">ISO 3 (ej: ESP)</label>
                            <input value={form.iso3} onChange={e => setForm({ ...form, iso3: e.target.value })} className="w-full p-2 border rounded uppercase" maxLength={3} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-navy mb-1">Confederación</label>
                        <select
                            value={form.conf_id}
                            onChange={e => setForm({ ...form, conf_id: e.target.value })}
                            className="w-full p-2 border rounded bg-white"
                        >
                            <option value="">-- Sin asignar --</option>
                            {confederaciones.map(c => (
                                <option key={c.id} value={c.id}>{c.codigo}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-4">
                        <button onClick={cerrarModal} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardarManual} className="bg-navy text-white px-6 py-2 rounded">Guardar</button>
                    </div>
                </div>
            </Modal>

        </div>
    );
}