# -*- coding: utf-8 -*-
"""Repara el pais_id de los equipos importados del CSV de equipos.

El importador comparaba el país del CSV (en PORTUGUÉS) contra la tabla Pais
(español) sin normalizar acentos y, al no casar, aplicaba el fallback `|| 1`
→ Afganistán. Este script:
  1. Construye el mapa PT→ES para los países del CSV.
  2. Repara en sitio el pais_id de los equipos importados (id > 135),
     casando cada equipo con su fila del CSV por nombre normalizado.
  3. La fila corrupta del CSV (nombre de club en la columna país) queda con
     pais_id = Portugal (su columna ciudad confirma 'Casal da Charneca').
  4. Guarda un snapshot JSON (id, pais_id_antes) para reversibilidad.

Uso: python scripts/reparar_paises_equipos.py [--dry-run]
"""
import csv
import json
import re
import shutil
import sqlite3
import sys
import unicodedata
from collections import Counter
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
CSV = RAIZ / "Futsal_Data" / "Enciclopedia_Futsal_Equipas_Masculino1.csv"
DB = Path(r"C:\Users\fpons\AppData\Roaming\com.fpons.futsal-stats\globalfutsal.db")
SNAPSHOT = RAIZ / "scripts" / "snapshot_paises_antes_reparacion.json"
PORTUGAL = "Portugal"
DRY_RUN = "--dry-run" in sys.argv


def norm(s: str) -> str:
    """Minúsculas, sin acentos, sin espacios dobles."""
    s = unicodedata.normalize("NFD", s.lower().strip())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", s)


# Mapa manual PT→ES para los nombres que el match directo por idioma no cubre.
PT_A_ES = {
    "afeganistao": "Afganistán",
    "alemanha": "Alemania",
    "antigua e barbuda": "Antigua y Barbuda",
    "azerbaijao": "Azerbaiyán",
    "barem": "Baréin",
    "bielorrussia": "Bielorrusia",
    "bosnia e herzegovina": "Bosnia y Herzegovina",
    "camaroes": "Camerún",
    "cazaquistao": "Kazajistán",
    "chequia": "República Checa",
    "costa do marfim": "Costa de Marfil",
    "curacau": "Curaçao",
    "egito": "Egipto",
    "emirados arabes unidos": "Emiratos Árabes Unidos",
    "equador": "Ecuador",
    "espanha": "España",
    "franca": "Francia",
    "gana": "Ghana",
    "fiji": "Fiyi",
    "gronelandia": "Groenlandia",
    "guadalupe": "Guadeloupe",
    "guiana": "Guyana",
    "guine": "Guinea",
    "guine equatorial": "Guinea Ecuatorial",
    "ilhas comores": "Comoras",
    "ilhas salomao": "Islas Salomón",
    "iraque": "Irak",
    "irlanda do norte": "Irlanda del Norte",
    "irao": "Irán",
    "japao": "Japón",
    "koweit": "Kuwait",
    "macau": "Macao",
    "macedonia do norte": "Macedonia del Norte",
    "marrocos": "Marruecos",
    "martinica": "Martinique",
    "mocambique": "Mozambique",
    "nova caledonia": "Nueva Caledonia",
    "nova zelandia": "Nueva Zelandia",
    "oma": "Omán",
    "paraguai": "Paraguay",
    "pais de gales": "Gales",
    "paises baixos": "Países Bajos",
    "porto rico": "Puerto Rico",
    "quirguistao": "Kirguistán",
    "republica da coreia": "Corea del Sur",
    "republica da irlanda": "Irlanda",
    "romenia": "Rumanía",
    "russia": "Rusia",
    "sudao": "Sudán",
    "suica": "Suiza",
    "sao marino": "San Marino",
    "sao martinho (paises baixos)": "Sint Maarten",
    "sao tome e principe": "Santo Tomé y Príncipe",
    "sao vicente e granadinas": "San Vicente y las Granadinas",
    "servia": "Serbia",
    "tajiquistao": "Tayikistán",
    "timor leste": "Timor-Leste",
    "trindade e tobago": "Trinidad y Tobago",
    "tunisia": "Túnez",
    "uruguai": "Uruguay",
    "uzbequistao": "Uzbekistán",
    "vietname": "Vietnam",
    "africa do sul": "Sudáfrica",
    "belize": "Belice",
}

# Fila corrupta conocida del CSV: nombre de club en la columna país.
CLUB_CORRUPTO_NORM = norm("União Desportiva Recreativa e Cultural 1º de Maio")


def main() -> None:
    # 1. Países del CSV (incluida la cadena vacía: filas sin país)
    with open(CSV, encoding="utf-8-sig", newline="") as f:
        filas = list(csv.DictReader(f, delimiter=";"))
    paises_csv = Counter((r.get("pais") or "").strip() for r in filas)
    print(f"paises_distintos_csv: {len(paises_csv) - (1 if '' in paises_csv else 0)} (+vacíos: {paises_csv.get('', 0)})")

    # 2. Países de la BD: por nombre normalizado. Si falta el país "Desconocido"
    # (para las filas del CSV sin país) se crea: pais_id es NOT NULL.
    con = sqlite3.connect(str(DB), timeout=15)
    cur = con.cursor()
    pais_por_norm = {}
    for pid, nombre in cur.execute("SELECT id, nombre FROM Pais"):
        pais_por_norm.setdefault(norm(nombre), pid)
    if norm("Desconocido") not in pais_por_norm:
        if DRY_RUN:
            raise SystemExit('DRY-RUN: falta el pais "Desconocido"; ejecuta sin --dry-run para crearlo')
        cur.execute(
            "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3) VALUES ('Desconocido', 'XX', 'XXX')"
        )
        con.commit()
        pais_por_norm[norm("Desconocido")] = cur.lastrowid
        print("pais_creado: Desconocido (XX/XXX)")
    if norm(PORTUGAL) not in pais_por_norm:
        raise SystemExit("FATAL: Portugal no existe en la tabla Pais")

    # 3. Resolver cada país del CSV → id en BD
    resueltos: dict[str, int | None] = {}
    sin_resolver: list[str] = []
    for pais in paises_csv:
        n = norm(pais)
        if not n:  # fila sin país → Desconocido (no un país real equivocado)
            resueltos[pais] = pais_por_norm[norm("Desconocido")]
            continue
        if n == CLUB_CORRUPTO_NORM:
            resueltos[pais] = pais_por_norm[norm(PORTUGAL)]  # fila corrupta → Portugal
            continue
        destino = PT_A_ES.get(n)  # mapa manual primero (fuente de verdad PT)
        pid = pais_por_norm.get(norm(destino)) if destino else None
        if pid is None:  # si no estaba en el mapa, match directo normalizado
            pid = pais_por_norm.get(n)
        if pid is None:
            sin_resolver.append(pais)
        resueltos[pais] = pid
    if sin_resolver:
        raise SystemExit(f"FATAL: países sin resolver: {sin_resolver}")

    # 4. Equipos a reparar: importados (id > 135) casados por nombre con el CSV
    nombre_equipo_por_norm: dict[str, list[int]] = {}
    for eid, nombre in cur.execute("SELECT id, nombre FROM Equipo WHERE id > 135"):
        nombre_equipo_por_norm.setdefault(norm(nombre), []).append(eid)

    # Para cada fila del CSV con equipo importado asociado (id > 135), plan de
    # cambio: (equipo_id, pais_id_nuevo). Los ids del mapa son todos importados.
    plan: list[tuple[int, int]] = []  # (equipo_id, pais_id_nuevo)
    for r in filas:
        nom = (r.get("nombre") or "").strip()
        if not nom:
            continue
        pid = resueltos.get((r.get("pais") or "").strip())
        if pid is None:
            continue
        for eid in nombre_equipo_por_norm.get(norm(nom), []):
            plan.append((eid, pid))
    print(f"equipos_en_plan: {len(plan)}")

    # 5. Snapshot reversible + validación de destinos
    actuales = {
        str(eid): (cur.execute("SELECT pais_id FROM Equipo WHERE id=?", (eid,)).fetchone() or [None])[0]
        for eid, _ in plan
    }
    SNAPSHOT.write_text(json.dumps(actuales, ensure_ascii=False, indent=0), encoding="utf-8")
    todos_paises = {pid for (pid,) in cur.execute("SELECT id FROM Pais")}
    malos = sorted({pid for _, pid in plan} - todos_paises)
    if malos:
        raise SystemExit(f"FATAL: pais_id destino inexistente: {malos}")

    cambios = [(eid, pid) for eid, pid in plan if actuales.get(str(eid)) != pid]
    antes = Counter(actuales.get(str(eid)) for eid, _ in cambios)
    print(f"cambios_a_aplicar: {len(cambios)}")
    print(f"paises_antes(top5): {antes.most_common(5)}")

    if DRY_RUN:
        print("DRY-RUN: nada escrito")
        return

    cur.executemany("UPDATE Equipo SET pais_id=? WHERE id=?", [(pid, eid) for eid, pid in cambios])
    con.commit()

    # 6. Verificación
    quedan = cur.execute("SELECT COUNT(*) FROM Equipo WHERE id > 135 AND pais_id = 1").fetchone()[0]
    print(f"afganistan_restante_en_importados: {quedan}")
    top = cur.execute(
        "SELECT p.nombre, COUNT(*) FROM Equipo e JOIN Pais p ON e.pais_id=p.id "
        "WHERE e.id > 135 GROUP BY p.id ORDER BY COUNT(*) DESC LIMIT 6"
    ).fetchall()
    for nombre, c in top:
        print(f"  {c:>6}  {nombre.encode('ascii', 'replace').decode()}")
    con.close()
    print("snapshot_en:", SNAPSHOT.name)


if __name__ == "__main__":
    main()
