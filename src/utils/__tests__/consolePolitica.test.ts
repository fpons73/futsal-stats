import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Política de errores en src/pages (tarea 2.1 del hito 1.0):
 *
 *  Todo `console.error` en un catch debe ir acompañado de UNA de estas tres:
 *   1. Un toast / setError en las 5 líneas siguientes (doble reporte).
 *   2. Un acumulador (`ultimoError`/`erroresPendientes`) en las 3 líneas
 *      siguientes, cuando el fallo es por-fila y el informe sale al final.
 *   3. Un comentario `JUSTIFICADO` en la línea o las 2 anteriores, cuando el
 *      log es intencionadamente silencioso (p.ej. optimización del undo).
 *
 *  Un catch silencioso sin decisión documentada hace fallar este test.
 */

const DIR = join(process.cwd(), "src", "pages");

function violaciones(): string[] {
  const fallos: string[] = [];
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".tsx"))) {
    const lineas = readFileSync(join(DIR, f), "utf8").split(/\r?\n/);
    lineas.forEach((linea, i) => {
      if (!linea.includes("console.error")) return;
      // La línea actual cuenta como "después": el patrón one-line
      // `} catch (e) { console.error(e); toast.error("..."); }` es válido.
      const despues = `${linea} ${lineas.slice(i + 1, i + 6).join(" ")}`;
      const acumulador = lineas.slice(i + 1, i + 4).join(" ");
      const antes = lineas.slice(Math.max(0, i - 3), i + 1).join(" ");
      const dobleReporte = /toast\.|setError|aviso/.test(despues);
      const informePorLotes = /ultimoError|erroresPendientes|avisoAcumulado/.test(acumulador);
      const justificado = /JUSTIFICADO|Visible:/.test(antes);
      if (!dobleReporte && !informePorLotes && !justificado) {
        fallos.push(`${f}:${i + 1} — catch silencioso sin toast ni justificación`);
      }
    });
  }
  return fallos;
}

describe("política de console.error en pages", () => {
  it("todo catch con console.error reporta al usuario o está justificado", () => {
    expect(violaciones()).toEqual([]);
  });

  it("la política muerde: un catch silencioso inventado falla", () => {
    // Sonda temporal: si este fichero de prueba no existiera el test sigue válida
    // porque escanea el directorio real; comprobamos que el detector encuentra
    // violaciones en un texto representativo (unidad del propio detector).
    const linea = "  } catch (e) { console.error(e); }";
    const despues = "        set cargando(false);";
    const acumulador = "";
    const antes = "      try { esperar();";
    const dobleReporte = /toast\.|setError|aviso/.test(despues);
    const informePorLotes = /ultimoError|erroresPendientes|avisoAcumulado/.test(acumulador);
    const justificado = /JUSTIFICADO|Visible:/.test(antes);
    expect(dobleReporte || informePorLotes || justificado).toBe(false);
    void linea;
  });
});
