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

export const generarActaPartido = async (partido: any, local: any[], visit: any[], eventos: any[], stats: any) => {
  try {
    const doc = new jsPDF();

    const [escudoL, escudoV] = await Promise.all([
      getImageData(partido.local_escudo),
      getImageData(partido.visit_escudo)
    ]);

    // CABECERA
    doc.setFontSize(20);
    doc.setTextColor(40, 40, 40);
    doc.text("ACTA DEL PARTIDO", 105, 20, { align: "center" });

    doc.setFontSize(10);
    doc.setTextColor(100);

    if (escudoL) doc.addImage(escudoL, "PNG", 15, 28, 20, 20);
    if (escudoV) doc.addImage(escudoV, "PNG", 175, 28, 20, 20);

    doc.setFontSize(16);
    doc.setTextColor(20, 20, 20);
    doc.text(partido.local_nombre || "Local", 50, 40);
    doc.text(String(partido.goles_local ?? 0), 95, 40, { align: "center" });
    doc.text("-", 105, 40, { align: "center" });
    doc.text(String(partido.goles_visitante ?? 0), 115, 40, { align: "center" });
    doc.text(partido.visitante_nombre || "Visitante", 160, 40);

    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(`Fecha: ${partido.fecha_hora || "N/A"}`, 105, 50, { align: "center" });
    doc.text(`Pabellon: ${partido.estadio || "N/A"}`, 105, 55, { align: "center" });
    if (partido.arbitro_nombre) {
      doc.text(`Arbitros: ${partido.arbitro_nombre}${partido.arbitro_2_nombre ? ", " + partido.arbitro_2_nombre : ""}`, 105, 60, { align: "center" });
    }

    // ALINEACIONES
    let y = 72;
    doc.setFontSize(12);
    doc.setTextColor(40, 40, 40);
    doc.text("Alineaciones", 14, y);
    y += 4;

    // Local
    autoTable(doc, {
      startY: y,
      head: [["#", "Jugador", "Pos"]],
      body: local.filter(j => !j.es_entrenador).map(j => [j.dorsal || "-", j.nombre || j.nombre_deportivo, j.posicion || ""]),
    });
    y = (doc as any).lastAutoTable.finalY + 4;

    // Visitante
    autoTable(doc, {
      startY: y,
      head: [["#", "Jugador", "Pos"]],
      body: visit.filter(j => !j.es_entrenador).map(j => [j.dorsal || "-", j.nombre || j.nombre_deportivo, j.posicion || ""]),
    });
    y = (doc as any).lastAutoTable.finalY + 6;

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

    doc.save(`acta_partido_${partido.id}.pdf`);
    return true;
  } catch (e) {
    console.error("Error generando PDF:", e);
    throw e;
  }
};
