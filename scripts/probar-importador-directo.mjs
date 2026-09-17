// Prueba del importador real con ruta predefinida (sin diálogo) desde la app viva.
import { conectar, evaluar, cerrar } from "./cdp-eval.mjs";

await conectar();

const r = await evaluar(`(async () => {
  const mod = await import('/src/utils/importadorMasivo.ts');
  const ruta = 'C:\\\\Proyectos\\\\futsal-stats\\\\Futsal_Data\\\\Enciclopedia_Futsal_Equipas_Masculino1.csv';
  const res = await mod.importarEquiposCSV(ruta);
  const informe = mod.ULTIMOS_INFORMES["equipos"];
  return JSON.stringify({
    res: res.slice(0, 400),
    informe: informe ? {
      importados: informe.importados, omitidos: informe.omitidos,
      errores: informe.errores, sinPais: informe.sinPais,
      paises: informe.paisesNoEncontrados.slice(0, 3),
      filasConError: informe.filasConError.slice(0, 2),
    } : null,
  });
})()`);

console.log(r);
await cerrar();
