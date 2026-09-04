const fs = require('fs');
const path = require('path');

const pdfPath = 'c:\\Proyectos\\futsal-stats\\calendario_primera_division_futbol_sala_2025-2026.pdf';
const outputPath = 'c:\\Proyectos\\futsal-stats\\calendario_texto.txt';

async function main() {
    try {
        console.log("Cargando pdf-parse...");
        let pdf = require('pdf-parse');
        if (typeof pdf !== 'function' && typeof pdf.default === 'function') {
            pdf = pdf.default;
        }
        
        if (typeof pdf !== 'function') {
            console.error("No se pudo cargar la función pdf-parse:", pdf);
            return;
        }
        
        const dataBuffer = fs.readFileSync(pdfPath);
        
        console.log("Parseando PDF...");
        const data = await pdf(dataBuffer);
        
        console.log("Guardando texto extraído...");
        fs.writeFileSync(outputPath, data.text, 'utf-8');
        console.log("¡Texto extraído con éxito en " + outputPath + "!");
    } catch (err) {
        console.error("Error en la extracción:", err);
    }
}

main();
