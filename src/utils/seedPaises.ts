import Database from "@tauri-apps/plugin-sql";
import { normalizeString } from "./stringUtils";
import { seedConfederacionesFutsal } from "./seedConfederaciones";

/** Catálogo mundial de países: [nombre en español, ISO 2, ISO 3, confederación FIFA].
 *  La confederación futsal (UEFA/CONMEBOL/AFC/CAF/CONCACAF/OFC) llena
 *  Pais.confederacion_id cuando existe en la tabla Confederacion. */
const PAISES: Array<[string, string, string, string | null]> = [
    // --- UEFA (Europa) ---
    ["Albania", "AL", "ALB", "UEFA"],
    ["Alemania", "DE", "DEU", "UEFA"],
    ["Andorra", "AD", "AND", "UEFA"],
    ["Armenia", "AM", "ARM", "UEFA"],
    ["Austria", "AT", "AUT", "UEFA"],
    ["Azerbaiyán", "AZ", "AZE", "UEFA"],
    ["Bélgica", "BE", "BEL", "UEFA"],
    ["Bielorrusia", "BY", "BLR", "UEFA"],
    ["Bosnia y Herzegovina", "BA", "BIH", "UEFA"],
    ["Bulgaria", "BG", "BGR", "UEFA"],
    ["Chipre", "CY", "CYP", "UEFA"],
    ["Croacia", "HR", "HRV", "UEFA"],
    ["Dinamarca", "DK", "DNK", "UEFA"],
    ["Eslovaquia", "SK", "SVK", "UEFA"],
    ["Eslovenia", "SI", "SVN", "UEFA"],
    ["España", "ES", "ESP", "UEFA"],
    ["Estonia", "EE", "EST", "UEFA"],
    ["Finlandia", "FI", "FIN", "UEFA"],
    ["Francia", "FR", "FRA", "UEFA"],
    ["Gales", "GB-WLS", "WLS", "UEFA"],
    ["Georgia", "GE", "GEO", "UEFA"],
    ["Grecia", "GR", "GRC", "UEFA"],
    ["Hungría", "HU", "HUN", "UEFA"],
    ["Inglaterra", "GB-ENG", "ENG", "UEFA"],
    ["Irlanda", "IE", "IRL", "UEFA"],
    ["Irlanda del Norte", "GB-NIR", "NIR", "UEFA"],
    ["Islandia", "IS", "ISL", "UEFA"],
    ["Israel", "IL", "ISR", "UEFA"],
    ["Italia", "IT", "ITA", "UEFA"],
    ["Kazajistán", "KZ", "KAZ", "UEFA"],
    ["Kosovo", "XK", "XKX", "UEFA"],
    ["Letonia", "LV", "LVA", "UEFA"],
    ["Liechtenstein", "LI", "LIE", "UEFA"],
    ["Lituania", "LT", "LTU", "UEFA"],
    ["Luxemburgo", "LU", "LUX", "UEFA"],
    ["Macedonia del Norte", "MK", "MKD", "UEFA"],
    ["Malta", "MT", "MLT", "UEFA"],
    ["Moldavia", "MD", "MDA", "UEFA"],
    ["Montenegro", "ME", "MNE", "UEFA"],
    ["Noruega", "NO", "NOR", "UEFA"],
    ["Países Bajos", "NL", "NLD", "UEFA"],
    ["Polonia", "PL", "POL", "UEFA"],
    ["Portugal", "PT", "PRT", "UEFA"],
    ["Escocia", "GB-SCT", "SCT", "UEFA"],
    ["República Checa", "CZ", "CZE", "UEFA"],
    ["Rumanía", "RO", "ROU", "UEFA"],
    ["Rusia", "RU", "RUS", "UEFA"],
    ["San Marino", "SM", "SMR", "UEFA"],
    ["Serbia", "RS", "SRB", "UEFA"],
    ["Suecia", "SE", "SWE", "UEFA"],
    ["Suiza", "CH", "CHE", "UEFA"],
    ["Turquía", "TR", "TUR", "UEFA"],
    ["Ucrania", "UA", "UKR", "UEFA"],
    ["Islas Feroe", "FO", "FRO", "UEFA"],
    ["Gibraltar", "GI", "GIB", "UEFA"],
    // --- CONMEBOL (Sudamérica) ---
    ["Argentina", "AR", "ARG", "CONMEBOL"],
    ["Bolivia", "BO", "BOL", "CONMEBOL"],
    ["Brasil", "BR", "BRA", "CONMEBOL"],
    ["Chile", "CL", "CHL", "CONMEBOL"],
    ["Colombia", "CO", "COL", "CONMEBOL"],
    ["Ecuador", "EC", "ECU", "CONMEBOL"],
    ["Paraguay", "PY", "PRY", "CONMEBOL"],
    ["Perú", "PE", "PER", "CONMEBOL"],
    ["Uruguay", "UY", "URY", "CONMEBOL"],
    ["Venezuela", "VE", "VEN", "CONMEBOL"],
    // --- CONCACAF (Norte/Centro/Caribe) ---
    ["Anguila", "AI", "AIA", "CONCACAF"],
    ["Antigua y Barbuda", "AG", "ATG", "CONCACAF"],
    ["Aruba", "AW", "ABW", "CONCACAF"],
    ["Bahamas", "BS", "BHS", "CONCACAF"],
    ["Barbados", "BB", "BRB", "CONCACAF"],
    ["Belice", "BZ", "BLZ", "CONCACAF"],
    ["Bermudas", "BM", "BMU", "CONCACAF"],
    ["Canadá", "CA", "CAN", "CONCACAF"],
    ["Costa Rica", "CR", "CRI", "CONCACAF"],
    ["Cuba", "CU", "CUB", "CONCACAF"],
    ["Dominica", "DM", "DMA", "CONCACAF"],
    ["El Salvador", "SV", "SLV", "CONCACAF"],
    ["Estados Unidos", "US", "USA", "CONCACAF"],
    ["Granada", "GD", "GRD", "CONCACAF"],
    ["Guatemala", "GT", "GTM", "CONCACAF"],
    ["Guyana", "GY", "GUY", "CONCACAF"],
    ["Guyana Francesa", "GF", "GUF", "CONCACAF"],
    ["Guadalupe", "GP", "GLP", "CONCACAF"],
    ["Haití", "HT", "HTI", "CONCACAF"],
    ["Honduras", "HN", "HND", "CONCACAF"],
    ["Islas Caimán", "KY", "CYM", "CONCACAF"],
    ["Islas Vírgenes de EE. UU.", "VI", "VIR", "CONCACAF"],
    ["Islas Vírgenes Británicas", "VG", "VGB", "CONCACAF"],
    ["Islas Turcas y Caicos", "TC", "TCA", "CONCACAF"],
    ["Jamaica", "JM", "JAM", "CONCACAF"],
    ["Martinica", "MQ", "MTQ", "CONCACAF"],
    ["México", "MX", "MEX", "CONCACAF"],
    ["Montserrat", "MS", "MSR", "CONCACAF"],
    ["Nicaragua", "NI", "NIC", "CONCACAF"],
    ["Panamá", "PA", "PAN", "CONCACAF"],
    ["Puerto Rico", "PR", "PRI", "CONCACAF"],
    ["República Dominicana", "DO", "DOM", "CONCACAF"],
    ["San Cristóbal y Nieves", "KN", "KNA", "CONCACAF"],
    ["San Vicente y las Granadinas", "VC", "VCT", "CONCACAF"],
    ["Santa Lucía", "LC", "LCA", "CONCACAF"],
    ["Sint Maarten", "SX", "SXM", "CONCACAF"],
    ["Surinam", "SR", "SUR", "CONCACAF"],
    ["Trinidad y Tobago", "TT", "TTO", "CONCACAF"],
    // --- AFC (Asia) ---
    ["Afganistán", "AF", "AFG", "AFC"],
    ["Arabia Saudita", "SA", "SAU", "AFC"],
    ["Australia", "AU", "AUS", "AFC"],
    ["Baréin", "BH", "BHR", "AFC"],
    ["Bangladés", "BD", "BGD", "AFC"],
    ["Bután", "BT", "BTN", "AFC"],
    ["Brunei", "BN", "BRN", "AFC"],
    ["Camboya", "KH", "KHM", "AFC"],
    ["China", "CN", "CHN", "AFC"],
    ["Corea del Norte", "KP", "PRK", "AFC"],
    ["Corea del Sur", "KR", "KOR", "AFC"],
    ["Emiratos Árabes Unidos", "AE", "ARE", "AFC"],
    ["Filipinas", "PH", "PHL", "AFC"],
    ["Guam", "GU", "GUM", "AFC"],
    ["Hong Kong", "HK", "HKG", "AFC"],
    ["India", "IN", "IND", "AFC"],
    ["Indonesia", "ID", "IDN", "AFC"],
    ["Irán", "IR", "IRN", "AFC"],
    ["Iraq", "IQ", "IRQ", "AFC"],
    ["Japón", "JP", "JPN", "AFC"],
    ["Jordania", "JO", "JOR", "AFC"],
    ["Kuwait", "KW", "KWT", "AFC"],
    ["Kirguistán", "KG", "KGZ", "AFC"],
    ["Laos", "LA", "LAO", "AFC"],
    ["Líbano", "LB", "LBN", "AFC"],
    ["Macao", "MO", "MAC", "AFC"],
    ["Malasia", "MY", "MYS", "AFC"],
    ["Maldivas", "MV", "MDV", "AFC"],
    ["Mongolia", "MN", "MNG", "AFC"],
    ["Myanmar", "MM", "MMR", "AFC"],
    ["Nepal", "NP", "NPL", "AFC"],
    ["Omán", "OM", "OMN", "AFC"],
    ["Pakistán", "PK", "PAK", "AFC"],
    ["Palestina", "PS", "PSE", "AFC"],
    ["Catar", "QA", "QAT", "AFC"],
    ["Singapur", "SG", "SGP", "AFC"],
    ["Siria", "SY", "SYR", "AFC"],
    ["Sri Lanka", "LK", "LKA", "AFC"],
    ["Tayikistán", "TJ", "TJK", "AFC"],
    ["Tailandia", "TH", "THA", "AFC"],
    ["Taiwán", "TW", "TWN", "AFC"],
    ["Timor Oriental", "TL", "TLS", "AFC"],
    ["Turkmenistán", "TM", "TKM", "AFC"],
    ["Uzbekistán", "UZ", "UZB", "AFC"],
    ["Vietnam", "VN", "VNM", "AFC"],
    ["Yemen", "YE", "YEM", "AFC"],
    // --- CAF (África) ---
    ["Sudáfrica", "ZA", "ZAF", "CAF"],
    ["Argelia", "DZ", "DZA", "CAF"],
    ["Angola", "AO", "AGO", "CAF"],
    ["Benín", "BJ", "BEN", "CAF"],
    ["Botsuana", "BW", "BWA", "CAF"],
    ["Burkina Faso", "BF", "BFA", "CAF"],
    ["Burundi", "BI", "BDI", "CAF"],
    ["Camerún", "CM", "CMR", "CAF"],
    ["Cabo Verde", "CV", "CPV", "CAF"],
    ["Chad", "TD", "TCD", "CAF"],
    ["Comoras", "KM", "COM", "CAF"],
    ["Congo", "CG", "COG", "CAF"],
    ["RD Congo", "CD", "COD", "CAF"],
    ["Costa de Marfil", "CI", "CIV", "CAF"],
    ["Egipto", "EG", "EGY", "CAF"],
    ["Eritrea", "ER", "ERI", "CAF"],
    ["Esuatini", "SZ", "SWZ", "CAF"],
    ["Etiopía", "ET", "ETH", "CAF"],
    ["Gabón", "GA", "GAB", "CAF"],
    ["Gambia", "GM", "GMB", "CAF"],
    ["Ghana", "GH", "GHA", "CAF"],
    ["Guinea", "GN", "GIN", "CAF"],
    ["Guinea Bissau", "GW", "GNB", "CAF"],
    ["Guinea Ecuatorial", "GQ", "GNQ", "CAF"],
    ["Kenia", "KE", "KEN", "CAF"],
    ["Lesoto", "LS", "LSO", "CAF"],
    ["Liberia", "LR", "LBR", "CAF"],
    ["Libia", "LY", "LBY", "CAF"],
    ["Madagascar", "MG", "MDG", "CAF"],
    ["Malaui", "MW", "MWI", "CAF"],
    ["Malí", "ML", "MLI", "CAF"],
    ["Mauritania", "MR", "MRT", "CAF"],
    ["Mauricio", "MU", "MUS", "CAF"],
    ["Marruecos", "MA", "MAR", "CAF"],
    ["Mozambique", "MZ", "MOZ", "CAF"],
    ["Namibia", "NA", "NAM", "CAF"],
    ["Níger", "NE", "NER", "CAF"],
    ["Nigeria", "NG", "NGA", "CAF"],
    ["Uganda", "UG", "UGA", "CAF"],
    ["República Centroafricana", "CF", "CAF_REP", "CAF"],
    ["Ruanda", "RW", "RWA", "CAF"],
    ["Santo Tomé y Príncipe", "ST", "STP", "CAF"],
    ["Senegal", "SN", "SEN", "CAF"],
    ["Seychelles", "SC", "SYC", "CAF"],
    ["Sierra Leona", "SL", "SLE", "CAF"],
    ["Somalia", "SO", "SOM", "CAF"],
    ["Sudán", "SD", "SDN", "CAF"],
    ["Sudán del Sur", "SS", "SSD", "CAF"],
    ["Tanzania", "TZ", "TZA", "CAF"],
    ["Togo", "TG", "TGO", "CAF"],
    ["Túnez", "TN", "TUN", "CAF"],
    ["Zambia", "ZM", "ZMB", "CAF"],
    ["Zimbabue", "ZW", "ZWE", "CAF"],
    // --- OFC (Oceanía) ---
    ["Nueva Zelanda", "NZ", "NZL", "OFC"],
    ["Fiyi", "FJ", "FJI", "OFC"],
    ["Papúa Nueva Guinea", "PG", "PNG", "OFC"],
    ["Islas Salomón", "SB", "SLB", "OFC"],
    ["Samoa", "WS", "WSM", "OFC"],
    ["Samoa Americana", "AS", "ASM", "OFC"],
    ["Tonga", "TO", "TON", "OFC"],
    ["Vanuatu", "VU", "VUT", "OFC"],
    ["Kiribati", "KI", "KIR", "OFC"],
    ["Nueva Caledonia", "NC", "NCL", "OFC"],
    ["Tahití", "PF", "PYF", "OFC"],
    ["Tuvalu", "TV", "TUV", "OFC"],
    ["Islas Cook", "CK", "COK", "OFC"],
    // --- Territorios sin confederación de futsal ---
    ["Groenlandia", "GL", "GRL", null],
    ["Islas Malvinas", "FK", "FLK", null],
];

/** El país comodín para filas sin país o con país fuera del catálogo.
 *  El importador de equipos lo crea si falta, pero sembrarlo aquí evita
 *  que exista un instante sin red de seguridad. */
export const PAIS_DESCONOCIDO: [string, string, string] = ["Desconocido", "ZZ", "ZZZ"];

export interface ResultadoSeedPaises {
    añadidos: number;
    yaExistentes: number;
    /** Países existentes sin confederación que quedaron vinculados. */
    vinculados: number;
}

/** Siembra el catálogo mundial de países. Idempotente: los existentes (por
 *  nombre normalizado) nunca se duplican ni se sobreescriben — su id es la
 *  clave de equipos/personas ya importados. Crea antes las confederaciones
 *  (idempotente) para poder vincular Pais.confederacion_id en BD virgen. */
export async function seedPaises(): Promise<ResultadoSeedPaises> {
    const db = await Database.load("sqlite:globalfutsal.db");

    await seedConfederacionesFutsal();
    const confederaciones = await db.select<Array<{ id: number; codigo: string }>>(
        "SELECT id, codigo FROM Confederacion",
    );
    const confPorCodigo = new Map(confederaciones.map((c) => [c.codigo, c.id]));

    const existentes = await db.select<Array<{ nombre: string }>>("SELECT nombre FROM Pais");
    // Clave de deduplicación robusta: sin acentos, sin mayúsculas y sin
    // signos ("Guinea-Bissau" y "Guinea Bissau" son el mismo país). El id
    // del país es la clave de equipos/personas ya importados: un duplicado
    // partiría las estadísticas, así que exigimos solapamiento estricto.
    const claveDura = (n: string) => normalizeString(n).replace(/[^a-z0-9]/g, "");
    const nombresExistentes = new Set(existentes.map((p) => claveDura(p.nombre)));

    let añadidos = 0;
    let yaExistentes = 0;
    let vinculados = 0;

    const sembrar = async (nombre: string, iso2: string, iso3: string, conf: string | null) => {
        const clave = claveDura(nombre);
        if (nombresExistentes.has(clave)) {
            yaExistentes++;
            return;
        }
        await db.execute(
            "INSERT INTO Pais (nombre, codigo_iso2, codigo_iso3, confederacion_id) VALUES (?, ?, ?, ?)",
            [nombre, iso2, iso3, conf ? (confPorCodigo.get(conf) ?? null) : null],
        );
        nombresExistentes.add(clave);
        añadidos++;
    };

    for (const [nombre, iso2, iso3, conf] of PAISES) {
        await sembrar(nombre, iso2, iso3, conf);
    }
    await sembrar(PAIS_DESCONOCIDO[0], PAIS_DESCONOCIDO[1], PAIS_DESCONOCIDO[2], null);

    // Enriquecimiento: países que ya existían (creados a mano o por importes
    // anteriores) sin confederación reciben la suya si están en el catálogo.
    // Solo rellena NULL — un vínculo decidido por el usuario nunca se toca.
    const confDeCatalogo = new Map(PAISES.map(([n, , , c]) => [claveDura(n), c]));
    const todos = await db.select<Array<{ id: number; nombre: string; confederacion_id: number | null }>>(
        "SELECT id, nombre, confederacion_id FROM Pais",
    );
    for (const p of todos) {
        if (p.confederacion_id !== null) continue;
        const conf = confDeCatalogo.get(claveDura(p.nombre));
        const idConf = conf ? (confPorCodigo.get(conf) ?? null) : null;
        if (!idConf) continue;
        await db.execute("UPDATE Pais SET confederacion_id = ? WHERE id = ?", [idConf, p.id]);
        vinculados++;
    }

    return { añadidos, yaExistentes, vinculados };
}
