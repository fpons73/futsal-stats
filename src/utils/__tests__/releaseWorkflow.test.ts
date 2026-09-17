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
