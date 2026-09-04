import Database from "@tauri-apps/plugin-sql";

export async function seedCompeticionesFutsal() {
  const db = await Database.load("sqlite:globalfutsal.db");

  // Obtener confederaciones
  const confs = await db.select<any[]>("SELECT id, codigo FROM Confederacion");
  const confMap = new Map(confs.map(c => [c.codigo, c.id]));

  // Obtener paises principales
  const paises = await db.select<any[]>("SELECT id, nombre FROM Pais");
  const paisMap = new Map(paises.map(p => [p.nombre.toLowerCase(), p.id]));

  const competiciones = [
    // Ligas nacionales
    { nombre: "LNFS Primera Division", tipo: "Liga", pais: "Espana", conf: null, ambito: "Clubes", color1: "#f97316", color2: "#ea580c" },
    { nombre: "LNFS Segunda Division", tipo: "Liga", pais: "Espana", conf: null, ambito: "Clubes", color1: "#f97316", color2: "#c2410c" },
    { nombre: "Serie A Futsal", tipo: "Liga", pais: "Italia", conf: null, ambito: "Clubes", color1: "#3b82f6", color2: "#1e40af" },
    { nombre: "Ligue Nationale de Futsal", tipo: "Liga", pais: "Francia", conf: null, ambito: "Clubes", color1: "#3b82f6", color2: "#1d4ed8" },
    { nombre: "Liga Nacional de Futsal", tipo: "Liga", pais: "Portugal", conf: null, ambito: "Clubes", color1: "#dc2626", color2: "#991b1b" },
    { nombre: "Liga Futsal Brasil", tipo: "Liga", pais: "Brasil", conf: null, ambito: "Clubes", color1: "#16a34a", color2: "#15803d" },
    { nombre: "Russian Futsal Super League", tipo: "Liga", pais: "Rusia", conf: null, ambito: "Clubes", color1: "#dc2626", color2: "#1e40af" },
    { nombre: "Ekstraklasa Futsal", tipo: "Liga", pais: "Polonia", conf: null, ambito: "Clubes", color1: "#dc2626", color2: "#ffffff" },

    // Competiciones internacionales de clubes
    { nombre: "UEFA Futsal Champions League", tipo: "Copa", pais: null, conf: "UEFA", ambito: "Clubes", color1: "#3b82f6", color2: "#1e3a8a" },
    { nombre: "Copa Libertadores de Futsal", tipo: "Copa", pais: null, conf: "CONMEBOL", ambito: "Clubes", color1: "#fbbf24", color2: "#b45309" },
    { nombre: "AFC Futsal Club Championship", tipo: "Copa", pais: null, conf: "AFC", ambito: "Clubes", color1: "#dc2626", color2: "#7f1d1d" },
    { nombre: "CONCACAF Futsal Club Championship", tipo: "Copa", pais: null, conf: "CONCACAF", ambito: "Clubes", color1: "#3b82f6", color2: "#1e40af" },

    // Competiciones de selecciones
    { nombre: "Mundial de Futsal FIFA", tipo: "Torneo", pais: null, conf: null, ambito: "Selecciones", color1: "#16a34a", color2: "#15803d" },
    { nombre: "Eurocopa de Futsal UEFA", tipo: "Torneo", pais: null, conf: "UEFA", ambito: "Selecciones", color1: "#3b82f6", color2: "#1e3a8a" },
    { nombre: "Copa America de Futsal", tipo: "Torneo", pais: null, conf: "CONMEBOL", ambito: "Selecciones", color1: "#fbbf24", color2: "#b45309" },
    { nombre: "AFC Futsal Asian Cup", tipo: "Torneo", pais: null, conf: "AFC", ambito: "Selecciones", color1: "#dc2626", color2: "#7f1d1d" },
    { nombre: "CAF Futsal Cup of Nations", tipo: "Torneo", pais: null, conf: "CAF", ambito: "Selecciones", color1: "#f97316", color2: "#c2410c" },
    { nombre: "CONCACAF Futsal Championship", tipo: "Torneo", pais: null, conf: "CONCACAF", ambito: "Selecciones", color1: "#3b82f6", color2: "#1e40af" },

    // Copas nacionales
    { nombre: "Copa de Espana de Futsal", tipo: "Copa", pais: "Espana", conf: null, ambito: "Clubes", color1: "#dc2626", color2: "#fbbf24" },
    { nombre: "Copa Italia Futsal", tipo: "Copa", pais: "Italia", conf: null, ambito: "Clubes", color1: "#3b82f6", color2: "#1e40af" },
    { nombre: "Copa de Portugal Futsal", tipo: "Copa", pais: "Portugal", conf: null, ambito: "Clubes", color1: "#dc2626", color2: "#15803d" },
  ];

  for (const c of competiciones) {
    const existe = await db.select<any[]>("SELECT id FROM Competicion WHERE nombre = ?", [c.nombre]);
    if (existe.length > 0) continue;

    const paisId = c.pais ? (paisMap.get(c.pais.toLowerCase()) || null) : null;
    const confId = c.conf ? (confMap.get(c.conf) || null) : null;

    await db.execute(`
      INSERT INTO Competicion (nombre, tipo, pais_id, confederacion_id, color1, color2, ambito)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [c.nombre, c.tipo, paisId, confId, c.color1, c.color2, c.ambito]);
  }

  console.log("Competiciones de futsal verificadas.");
}
