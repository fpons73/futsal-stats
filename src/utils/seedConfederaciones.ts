import Database from "@tauri-apps/plugin-sql";

export async function seedConfederacionesFutsal() {
  const db = await Database.load("sqlite:globalfutsal.db");

  const confederaciones = [
    { nombre: "UEFA Futsal", codigo: "UEFA" },
    { nombre: "CONMEBOL Futsal", codigo: "CONMEBOL" },
    { nombre: "AFC Futsal", codigo: "AFC" },
    { nombre: "CAF Futsal", codigo: "CAF" },
    { nombre: "CONCACAF Futsal", codigo: "CONCACAF" },
    { nombre: "OFC Futsal", codigo: "OFC" },
  ];

  for (const c of confederaciones) {
    const existe = await db.select<any[]>("SELECT id FROM Confederacion WHERE codigo = ?", [c.codigo]);
    if (existe.length === 0) {
      await db.execute("INSERT INTO Confederacion (nombre, codigo) VALUES (?, ?)", [c.nombre, c.codigo]);
    }
  }

  console.log("Confederaciones de futsal verificadas.");
}
