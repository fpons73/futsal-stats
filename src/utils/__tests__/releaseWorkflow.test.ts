// Workflow de release (release.yml): válido, con los jobs esperados.
import { readFileSync } from "node:fs";
import { it, expect } from "vitest";

const yaml = readFileSync(".github/workflows/release.yml", "utf8");

it("declara disparadores por tag v* y dispatch manual", () => {
    expect(yaml).toMatch(/tags:\s*(\n\s*-\s*)?\[?"v\*/);
    expect(yaml).toMatch(/workflow_dispatch:/);
});

it("marca prerelease las versiones con sufijo (rc/beta) y estables no", () => {
    expect(yaml).toMatch(/case "\$TAG" in/);
    expect(yaml).toMatch(/\*-\*\).*es_prerelease=true/);
    expect(yaml).toMatch(/prerelease:\s*\$\{\{ steps\.tag\.outputs\.es_prerelease \}\}/);
    // Nunca forzar prerelease a false de forma fija: rompería las rc
    expect(yaml).not.toMatch(/prerelease:\s*false/);
});

it("la plantilla de notas está orientada a usuario final", () => {
    // Solo el bloque del cuerpo (NSIS sí aparece legítimamente en el nombre del job)
    const cuerpo = yaml.match(/releaseBody: >\n([\s\S]*?)\n\s+releaseDraft:/)?.[1] ?? "";
    expect(cuerpo).toContain("## Primer uso");
    expect(cuerpo).toContain("Abre un issue");
    expect(cuerpo).toContain("Más"); // aviso de SmartScreen explicado
    // Sin jerga de desarrollador en las notas (lección de la revisión UX)
    expect(cuerpo).not.toContain("Node ni Rust");
    expect(cuerpo).not.toContain("NSIS");
});

it("compila en windows-latest y crea un borrador de Release", () => {
    expect(yaml).toContain("windows-latest");
    expect(yaml).toContain("tauri-apps/tauri-action@v0");
    expect(yaml).toMatch(/releaseDraft:\s*true/);
    expect(yaml).toContain("GITHUB_TOKEN");
});

it("usa la misma versión de Node y cache npm que la CI principal", () => {
    expect(yaml).toMatch(/node-version:\s*22/);
    expect(yaml).toContain("cache: npm");
});

it("la firma de código es condicional: solo actúa con los secrets de Certum", () => {
    // Paso de conexión presente y omitido sin secrets (no bloquea releases sin certificado)
    expect(yaml).toContain("Conectar tarjeta cloud de Certum");
    expect(yaml).toContain("if: ${{ env.CERTUM_OTP_URI != '' && env.CERTUM_USERNAME != '' && env.CERTUM_KEY_ID != '' }}");
    // Los tres secrets llegan al job como variables de entorno
    for (const s of ["CERTUM_OTP_URI", "CERTUM_USERNAME", "CERTUM_KEY_ID"]) {
        expect(yaml).toContain(`secrets.${s}`);
    }
});

it("el bundler firma cada artefacto con un comando que es no-op sin certificado", () => {
    const conf = readFileSync("src-tauri/tauri.conf.json", "utf8");
    expect(conf).toContain('"signCommand"');
    expect(conf).toContain("scripts/firmar/signar.ps1");
    const script = readFileSync("scripts/firmar/signar.ps1", "utf8");
    // Sin CERTUM_KEY_ID termina 0: no rompe builds locales ni CI sin certificado
    expect(script).toContain("exit 0");
    // Cuando sí firma: sello de tiempo RFC 3161 (/tr) para que la firma
    // sobreviva a la expiración del certificado
    expect(script).toContain("/tr");
});
