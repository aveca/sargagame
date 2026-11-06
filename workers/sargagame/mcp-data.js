// mcp-data.js — tables statiques du MCP public (lecture seule).
// GÉNÉRÉ depuis regions/*.json + scripts/lib/sarg-to-beach.cjs — ne pas éditer
// à la main : relancer C:/Users/user/AppData/Local/Temp/opencode/gen-mcp-data.cjs
// (procédure documentée) puis vérifier le diff. Champs publics UNIQUEMENT :
// aucun secret, email, pricing, token ou identifiant interne.
// La CI (tests/mcp-data-sync.test.cjs) vérifie l'égalité avec les sources.
export const MCP_REGIONS = [
  {
    "id": "mq",
    "name": "Martinique",
    "country": "France (DROM)",
    "domain": "sargasses-martinique.com",
    "primaryLang": "fr",
    "secondaryLangs": [
      "en",
      "es"
    ],
    "currency": "EUR",
    "timezone": "America/Martinique"
  },
  {
    "id": "gp",
    "name": "Guadeloupe",
    "country": "France (DROM)",
    "domain": "sargasses-guadeloupe.com",
    "primaryLang": "fr",
    "secondaryLangs": [
      "en",
      "es"
    ],
    "currency": "EUR",
    "timezone": "America/Guadeloupe"
  },
  {
    "id": "florida",
    "name": "Florida",
    "country": "United States",
    "domain": "sargassummiami.com",
    "primaryLang": "en",
    "secondaryLangs": [
      "es"
    ],
    "currency": "USD",
    "timezone": "America/New_York"
  },
  {
    "id": "puntacana",
    "name": "Punta Cana",
    "country": "Dominican Republic",
    "domain": "sargassumpuntacana.com",
    "primaryLang": "en",
    "secondaryLangs": [
      "es"
    ],
    "currency": "USD",
    "timezone": "America/Santo_Domingo"
  },
  {
    "id": "rivieramaya",
    "name": "Riviera Maya",
    "country": "Mexico",
    "domain": "sargassumcancun.com",
    "primaryLang": "es",
    "secondaryLangs": [
      "en"
    ],
    "currency": "USD",
    "timezone": "America/Cancun"
  },
  {
    "id": "tulum",
    "name": "Tulum",
    "country": "Mexico",
    "domain": "sargazotulum.com",
    "primaryLang": "es",
    "secondaryLangs": [
      "en"
    ],
    "currency": "USD",
    "timezone": "America/Cancun"
  }
];
export const NEW_REGION_BEACHES = {
  "florida": [
    {
      "id": "fl001",
      "name": "Miami Beach",
      "commune": "Miami Beach",
      "slug": "fl001"
    },
    {
      "id": "fl002",
      "name": "South Beach",
      "commune": "Miami Beach",
      "slug": "fl002"
    },
    {
      "id": "fl003",
      "name": "Fort Lauderdale Beach",
      "commune": "Fort Lauderdale",
      "slug": "fl003"
    },
    {
      "id": "fl004",
      "name": "Palm Beach",
      "commune": "Palm Beach",
      "slug": "fl004"
    },
    {
      "id": "fl005",
      "name": "Jupiter Beach",
      "commune": "Jupiter",
      "slug": "fl005"
    },
    {
      "id": "fl006",
      "name": "Key West (Smathers)",
      "commune": "Key West",
      "slug": "fl006"
    },
    {
      "id": "fl007",
      "name": "Key Largo",
      "commune": "Key Largo",
      "slug": "fl007"
    },
    {
      "id": "fl008",
      "name": "Islamorada",
      "commune": "Islamorada",
      "slug": "fl008"
    },
    {
      "id": "fl009",
      "name": "Marathon (Sombrero)",
      "commune": "Marathon",
      "slug": "fl009"
    },
    {
      "id": "fl010",
      "name": "Cocoa Beach",
      "commune": "Cocoa Beach",
      "slug": "fl010"
    },
    {
      "id": "fl011",
      "name": "Daytona Beach",
      "commune": "Daytona Beach",
      "slug": "fl011"
    },
    {
      "id": "fl012",
      "name": "Clearwater Beach",
      "commune": "Clearwater",
      "slug": "fl012"
    },
    {
      "id": "fl013",
      "name": "Hollywood Beach",
      "commune": "Hollywood",
      "slug": "fl013"
    },
    {
      "id": "fl014",
      "name": "Haulover Beach",
      "commune": "Miami Beach",
      "slug": "fl014"
    },
    {
      "id": "fl015",
      "name": "Sunny Isles Beach",
      "commune": "Sunny Isles Beach",
      "slug": "fl015"
    },
    {
      "id": "fl016",
      "name": "Deerfield Beach",
      "commune": "Deerfield Beach",
      "slug": "fl016"
    },
    {
      "id": "fl017",
      "name": "Pompano Beach",
      "commune": "Pompano Beach",
      "slug": "fl017"
    },
    {
      "id": "fl018",
      "name": "Delray Beach",
      "commune": "Delray Beach",
      "slug": "fl018"
    },
    {
      "id": "fl019",
      "name": "Crandon Park",
      "commune": "Key Biscayne",
      "slug": "fl019"
    },
    {
      "id": "fl020",
      "name": "Bahia Honda",
      "commune": "Big Pine Key",
      "slug": "fl020"
    }
  ],
  "puntacana": [
    {
      "id": "pc001",
      "name": "Bavaro Beach",
      "commune": "Bavaro",
      "slug": "pc001"
    },
    {
      "id": "pc002",
      "name": "Playa Los Corales",
      "commune": "Bavaro",
      "slug": "pc002"
    },
    {
      "id": "pc003",
      "name": "El Cortecito",
      "commune": "Bavaro",
      "slug": "pc003"
    },
    {
      "id": "pc004",
      "name": "Arena Gorda",
      "commune": "Bavaro",
      "slug": "pc004"
    },
    {
      "id": "pc005",
      "name": "Cabeza de Toro",
      "commune": "Punta Cana",
      "slug": "pc005"
    },
    {
      "id": "pc006",
      "name": "Macao Beach",
      "commune": "Macao",
      "slug": "pc006"
    },
    {
      "id": "pc007",
      "name": "Uvero Alto",
      "commune": "Uvero Alto",
      "slug": "pc007"
    },
    {
      "id": "pc008",
      "name": "Juanillo Beach (Cap Cana)",
      "commune": "Cap Cana",
      "slug": "pc008"
    },
    {
      "id": "pc009",
      "name": "Playa Blanca (Cap Cana)",
      "commune": "Cap Cana",
      "slug": "pc009"
    },
    {
      "id": "pc010",
      "name": "Punta Cana Beach",
      "commune": "Punta Cana",
      "slug": "pc010"
    },
    {
      "id": "pc011",
      "name": "Playa Cortecito Sur",
      "commune": "Bavaro",
      "slug": "pc011"
    },
    {
      "id": "pc012",
      "name": "Playa Bibijagua",
      "commune": "Bavaro",
      "slug": "pc012"
    }
  ],
  "rivieramaya": [
    {
      "id": "rm001",
      "name": "Playa Delfines",
      "commune": "Cancún",
      "slug": "rm001"
    },
    {
      "id": "rm002",
      "name": "Playa Tortugas",
      "commune": "Cancún",
      "slug": "rm002"
    },
    {
      "id": "rm003",
      "name": "Playa del Carmen Centro",
      "commune": "Playa del Carmen",
      "slug": "rm003"
    },
    {
      "id": "rm004",
      "name": "Playa Paraíso",
      "commune": "Tulum",
      "slug": "rm004"
    },
    {
      "id": "rm005",
      "name": "Akumal Bay",
      "commune": "Akumal",
      "slug": "rm005"
    },
    {
      "id": "rm006",
      "name": "Playa Palancar",
      "commune": "Cozumel",
      "slug": "rm006"
    },
    {
      "id": "rm007",
      "name": "Playa Norte",
      "commune": "Isla Mujeres",
      "slug": "rm007"
    },
    {
      "id": "rm008",
      "name": "Puerto Morelos",
      "commune": "Puerto Morelos",
      "slug": "rm008"
    },
    {
      "id": "rm009",
      "name": "Playa Mahahual",
      "commune": "Mahahual",
      "slug": "rm009"
    },
    {
      "id": "rm010",
      "name": "Playa Holbox",
      "commune": "Holbox",
      "slug": "rm010"
    },
    {
      "id": "rm011",
      "name": "Xpu-Ha",
      "commune": "Xpu-Ha",
      "slug": "rm011"
    },
    {
      "id": "rm012",
      "name": "Playa Maroma",
      "commune": "Punta Maroma",
      "slug": "rm012"
    },
    {
      "id": "rm013",
      "name": "Playa Caracol",
      "commune": "Cancún",
      "slug": "rm013"
    },
    {
      "id": "rm014",
      "name": "Playa Chac Mool",
      "commune": "Cancún",
      "slug": "rm014"
    },
    {
      "id": "rm015",
      "name": "Playa Gaviota Azul",
      "commune": "Cancún",
      "slug": "rm015"
    },
    {
      "id": "rm016",
      "name": "Playa Langosta",
      "commune": "Cancún",
      "slug": "rm016"
    },
    {
      "id": "rm017",
      "name": "Playa Marlín",
      "commune": "Cancún",
      "slug": "rm017"
    },
    {
      "id": "rm018",
      "name": "Playa Ballenas",
      "commune": "Cancún",
      "slug": "rm018"
    },
    {
      "id": "rm019",
      "name": "Punta Esmeralda",
      "commune": "Playa del Carmen",
      "slug": "rm019"
    },
    {
      "id": "rm020",
      "name": "Playa Pescadores",
      "commune": "Tulum",
      "slug": "rm020"
    }
  ],
  "tulum": [
    {
      "id": "tu001",
      "name": "Playa Paraíso",
      "commune": "Tulum",
      "slug": "tu001"
    },
    {
      "id": "tu002",
      "name": "Playa Pescadores",
      "commune": "Tulum",
      "slug": "tu002"
    },
    {
      "id": "tu003",
      "name": "Playa Ruinas",
      "commune": "Tulum",
      "slug": "tu003"
    },
    {
      "id": "tu004",
      "name": "Playa Santa Fe",
      "commune": "Tulum",
      "slug": "tu004"
    },
    {
      "id": "tu005",
      "name": "Playa Xcacel",
      "commune": "Tulum",
      "slug": "tu005"
    }
  ]
};
export const SARG_TO_BEACH = {
  "grande-anse": "mq014",
  "anse-mitan": "mq011",
  "anse-noire": "mq012",
  "tartane": "mq034",
  "anse-madame": "mq024",
  "diamant": "mq016",
  "pt-marin": "mq008",
  "sainte-anne": "mq004",
  "les-salines": "mq001",
  "vauclin": "mq044",
  "precheur": "mq033",
  "gp-grande-anse": "gp021",
  "gp-malendure": "gp031",
  "gp-sainte-anne": "gp010",
  "gp-pt-chateaux": "gp005",
  "gp-gosier": "gp012",
  "gp-caravelle": "gp009",
  "gp-bas-du-fort": "gp014",
  "gp-deshaies": "gp024",
  "gp-moule": "gp080",
  "gp-vieux-fort": "gp042"
};
export const MCP_REGION_IDS = MCP_REGIONS.map((r) => r.id);
export const MCP_DOMAINS = MCP_REGIONS.map((r) => r.domain);
