import { useState, useEffect } from "react";
import Database from "@tauri-apps/plugin-sql";
import { useNavigate } from "react-router-dom";
import { Calendar, Plus, Edit, Trash2, Eye, Ticket, AlertCircle } from "lucide-react";
import Modal from "../components/Modal";
import ImagenLocal from "../components/ImagenLocal";

interface Partido {
    id: number;
    edicion_id: number;
    fase_id: number | null;
    fase_nombre?: string; // Nombre traído por JOIN
    jornada: string;
    fecha_hora: string;
    estadio_nombre?: string;
    local_nombre: string; local_escudo: string | null;
    visitante_nombre: string; visitante_escudo: string | null;
    goles_local: number; goles_visitante: number;
    estado: string;
    local_id: number; visitante_id: number;
    estadio_id: number | null; arbitro_id: number | null;
    espectadores: number;
    goles_descanso_local: number; goles_descanso_visitante: number;
    prorroga: number;
    penaltis_local: number; penaltis_visitante: number;
}

interface Selector { id: number; nombre: string; }

export default function Partidos() {
    const navigate = useNavigate();
    const [partidos, setPartidos] = useState<Partido[]>([]);

    const [ediciones, setEdiciones] = useState<Selector[]>([]);
    const [fases, setFases] = useState<Selector[]>([]);
    const [equipos, setEquipos] = useState<Selector[]>([]);
    const [pabellones, setPabellones] = useState<Selector[]>([]);
    const [arbitros, setArbitros] = useState<Selector[]>([]);

    // Filtros UI
    const [filtroEdicion, setFiltroEdicion] = useState("");
    const [filtroFase, setFiltroFase] = useState("todas");

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);

    const [form, setForm] = useState({
        edicion: "", fase: "",
        local: "", visitante: "",
        fecha: "", hora: "20:00",
        pabellon: "", arbitro: "", espectadores: 0,
        estado: "programado",
        goles_local: 0, goles_visitante: 0,
        descanso_local: 0, descanso_visitante: 0,
        con_prorroga: false,
        penaltis_local: 0, penaltis_visitante: 0
    });

    // 1. Carga inicial
    useEffect(() => { cargarEdiciones(); cargarPabellones(); }, []);

    // 2. Al cambiar edición
    useEffect(() => {
        if (filtroEdicion) {
            cargarFasesYEquipos(filtroEdicion);
            setFiltroFase("todas");
        }
    }, [filtroEdicion]);

    // 3. Al cambiar filtros
    useEffect(() => {
        if (filtroEdicion) {
            cargarPartidos();
        } else {
            setPartidos([]);
        }
    }, [filtroEdicion, filtroFase]);

    // --- FUNCIONES DB ---
    async function cargarEdiciones() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>(`
      SELECT e.id, c.nombre || ' (' || t.nombre || ')' as nombre
      FROM Edicion e JOIN Competicion c ON e.competicion_id = c.id JOIN Temporada t ON e.temporada_id = t.id
      ORDER BY t.fecha_inicio DESC
    `);
        setEdiciones(res);
        if (res.length > 0 && !filtroEdicion) setFiltroEdicion(res[0].id.toString());
    }

    async function cargarPabellones() {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>("SELECT id, nombre FROM Estadio ORDER BY nombre ASC");
        setPabellones(res);
    }

    async function cargarFasesYEquipos(edicionId: string) {
        const db = await Database.load("sqlite:globalfutsal.db");
        const res = await db.select<Selector[]>("SELECT id, nombre FROM Fase WHERE edicion_id = $1 ORDER BY orden ASC", [edicionId]);
        console.log("📋 Fases cargadas:", res);
        setFases(res);
        const resEq = await db.select<Selector[]>(`SELECT e.id, e.nombre FROM Equipo e JOIN Inscripcion i ON e.id = i.equipo_id WHERE i.edicion_id = $1 ORDER BY e.nombre ASC`, [edicionId]);
        setEquipos(resEq);
        const resArb = await db.select<Selector[]>(`SELECT p.id, p.nombre_deportivo as nombre FROM Persona p JOIN Designacion d ON p.id = d.persona_id WHERE d.edicion_id = $1 ORDER BY p.nombre_deportivo ASC`, [edicionId]);
        setArbitros(resArb);
    }

    async function cargarPartidos() {
        const db = await Database.load("sqlite:globalfutsal.db");

        // JOIN CON FASE PARA VER NOMBRE REAL
        let query = `
      SELECT p.*, 
             l.nombre as local_nombre, l.escudo_path as local_escudo, 
             v.nombre as visitante_nombre, v.escudo_path as visitante_escudo, 
             est.nombre as estadio_nombre,
             f.nombre as fase_nombre
      FROM Partido p
      JOIN Equipo l ON p.local_id = l.id
      JOIN Equipo v ON p.visitante_id = v.id
      LEFT JOIN Estadio est ON p.estadio_id = est.id
      LEFT JOIN Fase f ON p.fase_id = f.id
      WHERE p.edicion_id = $1
    `;

        const params: any[] = [parseInt(filtroEdicion)];

        if (filtroFase && filtroFase !== "todas") {
            query += " AND p.fase_id = $2";
            params.push(parseInt(filtroFase));
        }

        query += " ORDER BY p.fecha_hora ASC";

        try {
            const res = await db.select<Partido[]>(query, params);
            console.log("🔍 Partidos cargados:", res.map(p => ({
                id: p.id,
                fase_id: p.fase_id,
                fase_nombre: p.fase_nombre,
                jornada: p.jornada,
                local: p.local_nombre,
                visitante: p.visitante_nombre
            })));
            setPartidos(res);
        } catch (e) { console.error(e); }
    }

    // --- CRUD ---
    function abrirProgramar() {
        setEditingId(null);
        setForm({
            edicion: filtroEdicion,
            fase: filtroFase !== "todas" ? filtroFase : "",
            local: "", visitante: "", fecha: new Date().toISOString().split('T')[0], hora: "20:00",
            pabellon: "", arbitro: "", espectadores: 0, estado: "programado",
            goles_local: 0, goles_visitante: 0, descanso_local: 0, descanso_visitante: 0,
            con_prorroga: false, penaltis_local: 0, penaltis_visitante: 0
        });
        setIsModalOpen(true);
    }

    function abrirEditar(p: Partido) {
        setEditingId(p.id);
        const [fecha, hora] = p.fecha_hora ? p.fecha_hora.split(" ") : ["", ""];
        setForm({
            edicion: p.edicion_id.toString(),
            fase: p.fase_id?.toString() || "",
            local: p.local_id.toString(),
            visitante: p.visitante_id.toString(),
            fecha: fecha, hora: hora,
            pabellon: p.estadio_id?.toString() || "",
            arbitro: p.arbitro_id?.toString() || "",
            espectadores: p.espectadores || 0,
            estado: p.estado,
            goles_local: p.goles_local || 0,
            goles_visitante: p.goles_visitante || 0,
            descanso_local: p.goles_descanso_local || 0,
            descanso_visitante: p.goles_descanso_visitante || 0,
            con_prorroga: p.prorroga === 1,
            penaltis_local: p.penaltis_local || 0,
            penaltis_visitante: p.penaltis_visitante || 0
        });
        setIsModalOpen(true);
    }

    async function guardar() {
        if (!form.local || !form.visitante || !form.fecha) return alert("Faltan datos básicos");
        if (form.local === form.visitante) return alert("El local y visitante no pueden ser el mismo");

        const fechaHora = `${form.fecha} ${form.hora}`;
        const parseId = (val: string) => val ? parseInt(val) : null;

        // BUSCAR EL NOMBRE DE LA JORNADA PARA GUARDARLO EN TEXTO TAMBIÉN
        // Esto asegura consistencia total
        const faseObj = fases.find(f => f.id.toString() === form.fase);
        const nombreJornada = faseObj ? faseObj.nombre : "";

        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            const params = [
                parseId(form.fase),
                nombreJornada, // <-- AQUÍ GUARDAMOS EL TEXTO
                fechaHora,
                parseId(form.pabellon),
                parseId(form.local),
                parseId(form.visitante),
                parseId(form.arbitro),
                form.espectadores,
                form.estado,
                form.goles_local, form.goles_visitante,
                form.descanso_local, form.descanso_visitante,
                form.con_prorroga ? 1 : 0,
                form.penaltis_local, form.penaltis_visitante
            ];

            if (editingId) {
                await db.execute(`
                UPDATE Partido SET 
                fase_id=$1, jornada=$2, fecha_hora=$3, estadio_id=$4, local_id=$5, visitante_id=$6, arbitro_id=$7, espectadores=$8, estado=$9,
                goles_local=$10, goles_visitante=$11, goles_descanso_local=$12, goles_descanso_visitante=$13, prorroga=$14, penaltis_local=$15, penaltis_visitante=$16
                WHERE id=$17
            `, [...params, editingId]);
            } else {
                await db.execute(`
                INSERT INTO Partido (edicion_id, fase_id, jornada, fecha_hora, estadio_id, local_id, visitante_id, arbitro_id, espectadores, estado,
                goles_local, goles_visitante, goles_descanso_local, goles_descanso_visitante, prorroga, penaltis_local, penaltis_visitante)
                VALUES (${filtroEdicion}, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
            `, params);
            }
            setIsModalOpen(false);
            cargarPartidos();
        } catch (e) { console.error(e); alert("Error al guardar"); }
    }

    async function borrar(id: number) {
        if (!confirm("¿Borrar partido? Se eliminarán también todas las alineaciones, eventos y estadísticas asociadas.")) return;
        try {
            const db = await Database.load("sqlite:globalfutsal.db");

            // Eliminar en orden: primero las tablas que dependen del partido
            await db.execute("DELETE FROM Alineacion WHERE partido_id = $1", [id]);
            await db.execute("DELETE FROM Evento WHERE partido_id = $1", [id]);
            await db.execute("DELETE FROM EstadisticaPartidoEquipo WHERE partido_id = $1", [id]);
            await db.execute("DELETE FROM EstadisticaPartidoJugador WHERE partido_id = $1", [id]);

            // Finalmente, eliminar el partido
            await db.execute("DELETE FROM Partido WHERE id = $1", [id]);

            cargarPartidos();
            alert("Partido eliminado correctamente ✅");
        } catch (e) {
            console.error(e);
            alert("Error al borrar el partido. Revisa la consola para más detalles.");
        }
    }

    const getEstadoBadge = (estado: string) => {
        switch (estado) {
            case 'finalizado': return <span className="bg-gray-200 text-gray-700 text-[10px] px-2 py-0.5 rounded font-bold">FINALIZADO</span>;
            case 'en_juego': return <span className="bg-green-100 text-green-700 text-[10px] px-2 py-0.5 rounded font-bold animate-pulse">EN JUEGO</span>;
            default: return <span className="bg-blue-50 text-blue-600 text-[10px] px-2 py-0.5 rounded font-bold">PROGRAMADO</span>;
        }
    };

    return (
        <div className="p-8 min-h-screen bg-gray-50 text-navy ml-0 flex flex-col">
            <div className="flex justify-between items-center mb-6 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
                <h1 className="text-2xl font-bold text-navy flex items-center gap-3"><Calendar className="text-green-600" /> Partidos</h1>
                <button onClick={abrirProgramar} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-md flex items-center gap-2"><Plus size={20} /> <span>Programar</span></button>
            </div>

            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 mb-6 flex gap-4 items-end">
                <div className="flex-1">
                    <label className="text-[10px] uppercase font-bold text-gray-400 mb-1 block">Edición</label>
                    <select value={filtroEdicion} onChange={e => setFiltroEdicion(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 font-medium">
                        {ediciones.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                    </select>
                </div>
                <div className="w-64">
                    <label className="text-[10px] uppercase font-bold text-gray-400 mb-1 block">Jornada / Fase</label>
                    <select value={filtroFase} onChange={e => setFiltroFase(e.target.value)} className="w-full p-2 border rounded-lg bg-gray-50 font-medium">
                        <option value="todas">Todas</option>
                        {fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}
                    </select>
                </div>
            </div>

            <div className="space-y-3">
                {partidos.map(p => (
                    <div key={p.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-200 flex items-center justify-between hover:shadow-md transition-shadow">
                        <div className="w-40 text-center border-r border-gray-100 pr-4">
                            <div className="text-sm font-bold text-navy">{p.fecha_hora?.split(" ")[0]}</div>
                            <div className="text-xs text-gray-400 mb-1">{p.fecha_hora?.split(" ")[1]}</div>
                            {getEstadoBadge(p.estado)}
                            <div className="text-[10px] text-gray-400 mt-1 truncate">{p.estadio_nombre || "Pabellón por definir"}</div>

                            {/* AQUI MOSTRAMOS LA JORNADA PARA VERIFICAR */}
                            <div className="mt-1 text-[10px] uppercase font-bold text-purple-600 bg-purple-50 rounded px-1 inline-block">
                                {p.fase_nombre || <span className="flex items-center gap-1 text-red-500"><AlertCircle size={10} /> Sin Fase</span>}
                            </div>
                        </div>
                        <div className="flex-1 flex items-center justify-center gap-8">
                            <div className="flex items-center gap-4 w-1/3 justify-end"><span className="font-bold text-lg text-right">{p.local_nombre}</span><div className="w-10 h-10"><ImagenLocal path={p.local_escudo} alt="" className="w-full h-full object-contain" /></div></div>
                            <div className="bg-gray-100 px-4 py-2 rounded-lg font-mono font-black text-2xl tracking-widest min-w-[100px] text-center border border-gray-200">
                                {p.estado === 'programado' ? "VS" : `${p.goles_local} - ${p.goles_visitante}`}
                            </div>
                            <div className="flex items-center gap-4 w-1/3 justify-start"><div className="w-10 h-10"><ImagenLocal path={p.visitante_escudo} alt="" className="w-full h-full object-contain" /></div><span className="font-bold text-lg text-left">{p.visitante_nombre}</span></div>
                        </div>
                        <div className="flex gap-2 pl-4 border-l border-gray-100">
                            <button onClick={() => navigate(`/partido/${p.id}`)} className="p-2 bg-green-600 text-white rounded hover:bg-green-700"><Eye size={18} /></button>
                            <button onClick={() => abrirEditar(p)} className="p-2 bg-blue-50 text-blue-600 rounded hover:bg-blue-100"><Edit size={18} /></button>
                            <button onClick={() => borrar(p.id)} className="p-2 bg-red-50 text-red-600 rounded hover:bg-red-100"><Trash2 size={18} /></button>
                        </div>
                    </div>
                ))}
                {partidos.length === 0 && <div className="text-center py-10 text-gray-400">No se encontraron partidos.</div>}
            </div>

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Datos del Partido">
                <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded border">
                        <div><label className="block text-xs font-bold mb-1">LOCAL</label><select value={form.local} onChange={e => setForm({ ...form, local: e.target.value })} className="w-full p-2 border rounded font-bold"><option value="">Seleccionar...</option>{equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                        <div><label className="block text-xs font-bold mb-1">VISITANTE</label><select value={form.visitante} onChange={e => setForm({ ...form, visitante: e.target.value })} className="w-full p-2 border rounded font-bold"><option value="">Seleccionar...</option>{equipos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div className="col-span-1"><label className="block text-xs font-bold mb-1">Jornada</label><select value={form.fase} onChange={e => setForm({ ...form, fase: e.target.value })} className="w-full p-2 border rounded">{fases.map(f => <option key={f.id} value={f.id}>{f.nombre}</option>)}</select></div>
                        <div className="col-span-2"><label className="block text-xs font-bold mb-1">Pabellón</label><select value={form.pabellon} onChange={e => setForm({ ...form, pabellon: e.target.value })} className="w-full p-2 border rounded"><option value="">-- Por definir --</option>{pabellones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}</select></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                        <div><label className="block text-xs font-bold mb-1">Fecha</label><input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} className="w-full p-2 border rounded" /></div>
                        <div><label className="block text-xs font-bold mb-1">Hora</label><input type="time" value={form.hora} onChange={e => setForm({ ...form, hora: e.target.value })} className="w-full p-2 border rounded" /></div>
                        <div><label className="block text-xs font-bold mb-1">Estado</label><select value={form.estado} onChange={e => setForm({ ...form, estado: e.target.value })} className="w-full p-2 border rounded"><option value="programado">Programado</option><option value="en_juego">En Juego</option><option value="finalizado">Finalizado</option></select></div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className="block text-xs font-bold mb-1">Árbitro</label><select value={form.arbitro} onChange={e => setForm({ ...form, arbitro: e.target.value })} className="w-full p-2 border rounded"><option value="">-- Por definir --</option>{arbitros.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}</select></div>
                        <div><label className="block text-xs font-bold mb-1"><Ticket size={12} className="inline mr-1" />Espectadores</label><input type="number" value={form.espectadores} onChange={e => setForm({ ...form, espectadores: parseInt(e.target.value) || 0 })} className="w-full p-2 border rounded" /></div>
                    </div>
                    <div className="border-t pt-4 mt-2">
                        <h4 className="text-xs font-bold text-gray-400 uppercase mb-2">Marcadores Detallados</h4>
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div><div className="text-[10px] uppercase font-bold text-navy mb-1">Descanso</div><div className="flex gap-1 justify-center"><input type="number" value={form.descanso_local} onChange={e => setForm({ ...form, descanso_local: parseInt(e.target.value) })} className="w-12 p-1 border rounded text-center" /><span className="pt-1">-</span><input type="number" value={form.descanso_visitante} onChange={e => setForm({ ...form, descanso_visitante: parseInt(e.target.value) })} className="w-12 p-1 border rounded text-center" /></div></div>
                            <div><div className="text-[10px] uppercase font-bold text-navy mb-1">Final</div><div className="flex gap-1 justify-center"><input type="number" value={form.goles_local} onChange={e => setForm({ ...form, goles_local: parseInt(e.target.value) })} className="w-12 p-1 border rounded text-center bg-gray-50 font-bold" /><span className="pt-1">-</span><input type="number" value={form.goles_visitante} onChange={e => setForm({ ...form, goles_visitante: parseInt(e.target.value) })} className="w-12 p-1 border rounded text-center bg-gray-50 font-bold" /></div></div>
                            <div><div className="flex items-center justify-center gap-2 mb-1"><input type="checkbox" checked={form.con_prorroga} onChange={e => setForm({ ...form, con_prorroga: e.target.checked })} id="chkProrroga" /><label htmlFor="chkProrroga" className="text-[10px] uppercase font-bold text-navy cursor-pointer">Prórroga</label></div><div className="flex gap-1 justify-center opacity-50"><input type="number" disabled className="w-12 p-1 border rounded text-center bg-gray-100" /><span className="pt-1">-</span><input type="number" disabled className="w-12 p-1 border rounded text-center bg-gray-100" /></div></div>
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-4 bg-gray-50 p-2 rounded border border-dashed">
                            <span className="text-xs font-bold uppercase">Penaltis:</span><input type="number" value={form.penaltis_local} onChange={e => setForm({ ...form, penaltis_local: parseInt(e.target.value) })} className="w-12 p-1 border rounded text-center" placeholder="L" /><span>-</span><input type="number" value={form.penaltis_visitante} onChange={e => setForm({ ...form, penaltis_visitante: parseInt(e.target.value) })} className="w-12 p-1 border rounded text-center" placeholder="V" />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <button onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-500">Cancelar</button>
                        <button onClick={guardar} className="bg-green-600 text-white px-6 py-2 rounded font-bold shadow hover:bg-green-700">Guardar Partido</button>
                    </div>
                </div>
            </Modal>
        </div>
    );
}