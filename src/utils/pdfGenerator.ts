import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { convertFileSrc } from "@tauri-apps/api/core";

const getImageData = async (url: string): Promise<string> => {
  if (!url || url === "null" || url === "undefined") return "";
  try {
    const src = url.startsWith("http") || url.startsWith("/") ? url : convertFileSrc(url);
    const response = await fetch(src);
    if (!response.ok) return "";
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        if (result.startsWith("data:image")) resolve(result);
        else resolve("");
      };
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    return "";
  }
};

/** Resumen de extranjeros por nacionalidad, p.ej. "3× Brasil · 1× Italia".
 * Necesita el id del país del equipo y la lista de países para resolver nombres. */
const resumenExtranjeros = (jugadores: any[], paisEquipo: number | undefined, paises: { id: number; nombre: string }[] | undefined): string => {
  if (paisEquipo == null) return "";
  const foraneos = (jugadores || []).filter(j => !j.es_entrenador && j.nacionalidad_id != null && Number(j.nacionalidad_id) !== Number(paisEquipo));
  if (!foraneos.length) return "";
  const grupos: Record<string, { n: number; id: number }> = {};
  foraneos.forEach(j => {
    const nombre = paises?.find(p => p.id === Number(j.nacionalidad_id))?.nombre || "Sin nacionalidad";
    if (!grupos[nombre]) grupos[nombre] = { n: 0, id: Number(j.nacionalidad_id) };
    grupos[nombre].n++;
  });
  return Object.entries(grupos)
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .map(([nombre, g]) => `${g.n}× ${nombre}`)
    .join(" · ");
};

/** Nombres del cuerpo técnico para el acta: "Entrenador: X" o "Entrenadores: X, Y". */
const lineaEntrenadores = (entrenadores: any[] | undefined): string => {
  const nombres = (entrenadores || []).map(e => e.nombre || e.nombre_deportivo).filter(Boolean);
  if (!nombres.length) return "";
  return `${nombres.length > 1 ? "Entrenadores" : "Entrenador"}: ${nombres.join(", ")}`;
};

export const generarActaPartido = async (partido: any, local: any[], visit: any[], eventos: any[], stats: any, paises?: { id: number; nombre: string }[], entrenadoresL?: any[], entrenadoresV?: any[]) => {
  try {
    const doc = new jsPDF();

    const [escudoL, escudoV, banderaL, banderaV] = await Promise.all([
      getImageData(partido.local_escudo),
      getImageData(partido.visitante_escudo),
      getImageData(partido.local_bandera || ""),
      getImageData(partido.visitante_bandera || "")
    ]);

    // CABECERA
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("ACTA DEL PARTIDO", 105, 16, { align: "center" });

    // Línea de contexto: Competicion · Temporada [· Edicion] · Jornada (igual que la cabecera de la app)
    const contexto = [
      partido.competicion_nombre,
      partido.temporada_nombre,
      partido.edicion_nombre
    ].filter(Boolean).join(" · ")
      + (partido.jornada ? ` · J${partido.jornada}` : "");
    doc.setFontSize(9);
    doc.setTextColor(110);
    if (contexto) doc.text(contexto.toUpperCase(), 105, 22, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100);

    if (escudoL) doc.addImage(escudoL, "PNG", 15, 28, 20, 20);
    if (escudoV) doc.addImage(escudoV, "PNG", 175, 28, 20, 20);
    // Bandera del país de cada equipo, bajo el escudo
    if (banderaL) doc.addImage(banderaL, "PNG", 18, 51, 14, 9.3);
    if (banderaV) doc.addImage(banderaV, "PNG", 178, 51, 14, 9.3);

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(partido.local_nombre || "Local", 50, 40);
    doc.text(String(partido.goles_local ?? 0), 95, 40, { align: "center" });
    doc.text("-", 105, 40, { align: "center" });
    doc.text(String(partido.goles_visitante ?? 0), 115, 40, { align: "center" });
    doc.text(partido.visitante_nombre || "Visitante", 160, 40);

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Fecha: ${partido.fecha_hora || "N/A"}`, 105, 52, { align: "center" });
    doc.text(`Pabellon: ${partido.estadio_nombre || "N/A"}`, 105, 57, { align: "center" });
    // Trio arbitral completo: principal, segundo y tercer arbitro
    const arbitros = [partido.arbitro_nombre, partido.arbitro_2_nombre, partido.arbitro_3_nombre].filter(Boolean).join(", ");
    if (arbitros) {
      doc.text(`Arbitros: ${arbitros}`, 105, 62, { align: "center" });
    }
    // Asistencia (espectadores)
    if (partido.espectadores != null && Number(partido.espectadores) > 0) {
      doc.text(`Asistencia: ${Number(partido.espectadores).toLocaleString("es-ES")} espectadores`, 105, 67, { align: "center" });
    }

    // ALINEACIONES
    let y = 74;
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Alineaciones", 14, y);
    y += 4;

    // Local
    autoTable(doc, {
      startY: y,
      head: [["#", "Jugador", "Pos"]],
      body: local.filter(j => !j.es_entrenador).map(j => [j.dorsal || "-", j.nombre || j.nombre_deportivo, j.posicion_inicial || j.posicion || ""]),
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // Cuerpo técnico del equipo local
    const entrenadorL = lineaEntrenadores(entrenadoresL);
    if (entrenadorL) {
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(entrenadorL, 14, y);
      y += 5;
    }

    // Resumen de nacionalidades extranjeras del equipo local
    const resumenL = resumenExtranjeros(local, partido.local_pais_id, paises);
    if (resumenL) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Extranjeros: ${resumenL}`, 14, y);
      y += 5;
    }

    // Visitante
    autoTable(doc, {
      startY: y,
      head: [["#", "Jugador", "Pos"]],
      body: visit.filter(j => !j.es_entrenador).map(j => [j.dorsal || "-", j.nombre || j.nombre_deportivo, j.posicion_inicial || j.posicion || ""]),
    });
    y = (doc as any).lastAutoTable.finalY + 3;

    // Cuerpo técnico del equipo visitante
    const entrenadorV = lineaEntrenadores(entrenadoresV);
    if (entrenadorV) {
      doc.setFontSize(9);
      doc.setTextColor(60);
      doc.text(entrenadorV, 14, y);
      y += 5;
    }

    // Resumen de nacionalidades extranjeras del equipo visitante
    const resumenV = resumenExtranjeros(visit, partido.visitante_pais_id, paises);
    if (resumenV) {
      doc.setFontSize(8);
      doc.setTextColor(120);
      doc.text(`Extranjeros: ${resumenV}`, 14, y);
      y += 5;
    }

    y += 3;

    // EVENTOS
    if (eventos.length > 0) {
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text("Eventos del Partido", 14, y);
      y += 4;

      autoTable(doc, {
        startY: y,
        head: [["Min", "Tipo", "Jugador", "Equipo", "Detalle"]],
        body: eventos.map(e => [
          String(e.minuto || ""),
          e.tipo || "",
          e.jugador_nombre || "",
          e.equipo_nombre || "",
          e.subtipo || e.descripcion || ""
        ]),
        styles: { fontSize: 8 }
      });
      y = (doc as any).lastAutoTable.finalY + 6;
    }

    // ESTADISTICAS
    if (stats && (stats.local || stats.visitante)) {
      doc.setFontSize(12);
      doc.setTextColor(40, 40, 40);
      doc.text("Estadisticas", 14, y);
      y += 4;

      const statRows = Object.keys(stats.local || {}).filter(k => k !== "id" && k !== "partido_id" && k !== "equipo_id").map(k => [
        k.replace(/_/g, " "),
        String(stats.local?.[k] ?? 0),
        String(stats.visitante?.[k] ?? 0)
      ]);

      autoTable(doc, {
        startY: y,
        head: [["Metrica", partido.local_nombre, partido.visitante_nombre]],
        body: statRows,
        styles: { fontSize: 8 }
      });
    }

    // BLOQUE DE FIRMAS (entrega oficial): árbitro principal, delegado y anotador,
    // fijado al pie de la última página. Si el contenido llega, se abre página nueva.
    const pageH = doc.internal.pageSize.getHeight();
    const firmaY = pageH - 32;
    const finContenido = (doc as any).lastAutoTable?.finalY ?? y;
    if (finContenido + 30 > firmaY) doc.addPage();

    doc.setDrawColor(120);
    doc.setLineWidth(0.3);
    doc.setFontSize(9);
    doc.setTextColor(60);
    const firmas = ["Árbitro Principal", "Delegado", "Anotador"];
    firmas.forEach((label, i) => {
      const centroX = 37.5 + i * 67.5; // tres columnas equidistantes en A4
      doc.line(centroX - 22.5, firmaY, centroX + 22.5, firmaY);
      doc.text(label, centroX, firmaY + 5, { align: "center" });
    });

    doc.save(`acta_partido_${partido.id}.pdf`);
    return true;
  } catch (e) {
    console.error("Error generando PDF:", e);
    throw e;
  }
};
