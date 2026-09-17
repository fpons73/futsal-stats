"""Cierre de la 1.0.0 — pasos 3 y 4 del runbook docs/cierre-v1-0-0.md.

GUARDIA: se niega a versionar la 1.0.0 si no existe la evidencia de la
validación en máquina limpia (sandbox-prueba/evidencias/resultado-fase-a.json)
o si algún check de la Fase A/E falló. Es la regla del runbook convertida en
herramienta: "no se etiqueta 1.0.0 sin esta validación".

Excepción explícita: `--sin-validar` ejecuta el cierre sin evidencia (decisión
solo del propietario). En ese caso el CHANGELOG registra la renuncia en lugar
de dar la validación por hecha.

Si la evidencia es válida:
  1. Bump cuádruple a 1.0.0 (tauri.conf.json, Cargo.toml, Cargo.lock,
     package.json).
  2. Regenera el CHANGELOG: renombra la entrada rc.1 a [1.0.0] con fecha de
     hoy, inserta encima una entrada rc breve y cierra [Sin publicar].

Después quedan solo los pasos humanos: cerrar 0.1/0.2 en el hito con los
resultados reales, commit "chore: release v1.0.0", tag v1.0.0 y push.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import date
from pathlib import Path

# Consola Windows (cp1252): los símbolos del output requieren UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

RAIZ = Path(__file__).resolve().parent.parent
EVIDENCIA = RAIZ / "sandbox-prueba" / "evidencias" / "resultado-fase-a.json"
V_NUEVA = "1.0.0"
SHA_OK = "ba8df7fcaa53e571777abd99251dd533aa10dfb027220c92cf89f2a00f807a4a"


def guardar(mensaje: str) -> None:
    print(f"  ✗ {mensaje}")
    sys.exit(1)


def verificar_evidencia(exento: bool) -> dict | None:
    print("== Guardia de validación (paso 1 del runbook) ==")
    if exento:
        print(
            "  ⚠ EXENCIÓN (--sin-validar): cierre sin evidencia de validación "
            "por decisión del propietario; quedará documentado en el hito y "
            "el CHANGELOG."
        )
        return None
    if not EVIDENCIA.exists():
        guardar(
            f"sin evidencia en {EVIDENCIA.relative_to(RAIZ)}. "
            "Reinicia el equipo (la característica Sandbox quedó pendiente de "
            "reinicio), abre sandbox-prueba/prueba-rc.wsb y espera el JSON."
        )
    ev = json.loads(EVIDENCIA.read_text(encoding="utf-8-sig"))
    fallos = []
    if not ev.get("hash_coincide"):
        fallos.append("el SHA-256 del instalador no coincide con el publicado")
    if ev.get("instalador_exit") != 0:
        fallos.append(f"el instalador terminó con código {ev.get('instalador_exit')}")
    exe = str(ev.get("exe_instalado", ""))
    if not exe.endswith(".exe") or "NO ENCONTRADO" in exe:
        fallos.append("no se localizó el ejecutable instalado")
    if "Futsal" not in str(ev.get("registro_displayname", "")):
        fallos.append("la entrada de Agregar/Quitar programas no es la esperada")
    if ev.get("desinst_registro_limpio") is not True:
        fallos.append("la desinstalación dejó registro")
    if ev.get("desinst_perfil_conservado") is not True:
        fallos.append("la desinstalación borró el perfil de usuario (datos)")
    if ev.get("sha256") and ev["sha256"] != SHA_OK:
        fallos.append("el binario probado no es el de la release publicada")
    if fallos:
        for f in fallos:
            print(f"  ✗ {f}")
        sys.exit(1)
    print("  ✓ evidencia completa: hash, instalación, identidad y desinstalación")
    return ev


def bump() -> None:
    print("== Bump de versión a 1.0.0 (paso 3) ==")
    # tauri.conf.json y package.json
    for p in (RAIZ / "src-tauri/tauri.conf.json", RAIZ / "package.json"):
        c = p.read_text(encoding="utf-8")
        c2 = re.sub(r'("version"\s*:\s*")[^"]+(")', rf"\g<1>{V_NUEVA}\g<2>", c, count=1)
        assert c2 != c, f"versión no encontrada en {p.name}"
        p.write_text(c2, encoding="utf-8", newline="")
        print(f"  ✓ {p.relative_to(RAIZ)}")

    # Cargo.toml (solo [package])
    p = RAIZ / "src-tauri/Cargo.toml"
    out, en_pkg = [], True
    for ln in p.read_text(encoding="utf-8").splitlines(keepends=True):
        if ln.startswith("["):
            en_pkg = ln.strip() == "[package]"
        if en_pkg and ln.startswith("version"):
            ln = re.sub(r'=\s*"[^"]+"', f'= "{V_NUEVA}"', ln, count=1)
        out.append(ln)
    p.write_text("".join(out), encoding="utf-8", newline="")
    print("  ✓ src-tauri/Cargo.toml")

    # Cargo.lock (entrada del propio paquete)
    p = RAIZ / "src-tauri/Cargo.lock"
    out, en_pkg, hecho = [], False, False
    for ln in p.read_text(encoding="utf-8").splitlines(keepends=True):
        if ln.startswith("[[package]]"):
            en_pkg = True
        elif ln.startswith("name = "):
            en_pkg = ln.strip() == 'name = "futsal-stats"'
        elif ln.startswith("version = ") and en_pkg and not hecho:
            ln = f'version = "{V_NUEVA}"\n'
            hecho = True
        out.append(ln)
    assert hecho, "entrada futsal-stats no encontrada en Cargo.lock"
    p.write_text("".join(out), encoding="utf-8", newline="")
    print("  ✓ src-tauri/Cargo.lock")


def changelog() -> None:
    print("== Regeneración de notas del CHANGELOG (paso 4) ==")
    p = RAIZ / "CHANGELOG.md"
    c = p.read_text(encoding="utf-8")
    hoy = date.today().isoformat()

    # 1. Cerrar [Sin publicar]: se elimina el bloque entero (su contenido es
    #    preparación del cierre, ya histórico en la 1.0.0).
    c, n = re.subn(r"## \[Sin publicar\].*?(?=## \[1\.0\.0-rc\.1\])", "", c, flags=re.S)
    assert n == 1, "bloque [Sin publicar] no encontrado"
    print("  ✓ [Sin publicar] cerrado")

    # 2. Renombrar la PRIMERA cabecera rc (con fecha variable) a la estable.
    patron = re.compile(r"## \[1\.0\.0-rc\.1\] — \d{4}-\d{2}-\d{2}")
    c, n = patron.subn(f"## [1.0.0] — {hoy}", c, count=1)
    assert n == 1, "cabecera rc.1 no encontrada"
    print(f"  ✓ entrada [1.0.0] — {hoy}")

    # 3. Entrada rc breve encima, con el historial honesto.
    rc_breve = (
        "## [1.0.0-rc.1] — 2026-09-17\n\n"
        "Candidata a release: contenido idéntico a la 1.0.0. Instalador NSIS "
        "publicado como prerelease. "
        + (
            "Validado en máquina limpia "
            "([guía](docs/prueba-maquina-limpia.md)) antes del tag final.\n\n"
            if EV_VALIDADA
            else "La validación en máquina limpia "
            "([guía](docs/prueba-maquina-limpia.md)) quedó **pendiente** al "
            "etiquetar la 1.0.0, por decisión del propietario.\n\n"
        )
    )
    c = c.replace(f"## [1.0.0] — {hoy}", rc_breve + f"## [1.0.0] — {hoy}", 1)
    print("  ✓ entrada rc.1 conservada")

    p.write_text(c, encoding="utf-8", newline="")
    print("  ✓ CHANGELOG.md escrito")


EV_VALIDADA = False

if __name__ == "__main__":
    exento = "--sin-validar" in sys.argv
    if verificar_evidencia(exento):
        EV_VALIDADA = True
    bump()
    changelog()
    print("\nListo. Pasos restantes (manuales, con los resultados reales):")
    print("  1. Cerrar 0.1 y 0.2 como HECHO en docs/milestone-1.0.md")
    print('  2. git commit -am "chore: release v1.0.0"')
    print('  3. git tag -a v1.0.0 -m "Global Futsal Stats 1.0.0"')
    print("  4. git push origin main v1.0.0  → revisar y publicar el borrador")
