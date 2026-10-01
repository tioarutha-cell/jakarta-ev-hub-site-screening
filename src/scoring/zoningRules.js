// Regulatory keyword rules for the EV Hub development mix, matched against the
// literal Indonesian-language permitted-use lists embedded in the RDTR 2022 feature
// service (fields IZN=Diizinkan/Allowed, BST=Bersyarat/Conditional,
// TBS=Terbatas Bersyarat/Limited-Conditional, TBT=Terbatas/Limited-Restricted).
// These lists are transcribed directly from Pergub DKI Jakarta No. 31/2022's zoning
// matrix by the source system, so keyword matches here are traceable to the
// regulation text itself, not an interpretation layer.
//
// Each use category lists the Indonesian regulation terms that count as a match.
// Matching is case-insensitive substring matching against the four use-list fields.
export const USE_CATEGORIES = [
  {
    id: "ev_charging",
    label: "EV Charging (SPKLU/SPBKLU)",
    required: true,
    terms: ["SPKLU", "SPBKLU", "Stasiun Pengisian Kendaraan Listrik"]
  },
  {
    id: "parking",
    label: "Conventional Parking",
    required: true,
    terms: ["Parkir Kendaraan Bermotor", "Parkir Sepeda", "Pool Kendaraan"]
  },
  {
    id: "vehicle_servicing",
    label: "Vehicle Servicing / Workshop",
    required: true,
    terms: ["Bengkel", "Pencucian dan Salon Kendaraan Bermotor"]
  },
  {
    id: "retail_fnb",
    label: "Retail / Supermarket / F&B",
    required: true,
    terms: [
      "Minimarket",
      "Toko Swalayan",
      "Pasar Rakyat",
      "Pertokoan",
      "Restoran",
      "Kafe",
      "Warung Makan",
      "Toko Eceran"
    ]
  },
  {
    id: "wastewater",
    label: "Wastewater Treatment",
    required: true,
    terms: ["Bangunan Pengolahan Air Limbah"]
  },
  {
    id: "waste_management",
    label: "Waste Management",
    required: true,
    terms: [
      "Tempat Penampungan Sementara",
      "Fasilitas Pengolahan Sampah Antara",
      "Tempat Pengolahan Sampah",
      "Bank Sampah"
    ]
  },
  {
    id: "renewable_energy",
    label: "Renewable Energy / Utility Infrastructure",
    required: false,
    terms: ["Bangunan Instalasi Energi", "Pembangkitan Tenaga Listrik"]
  },
  {
    id: "mixed_use_commercial",
    label: "General Commercial / Mixed-Use",
    required: false,
    terms: ["Multifungsi (Mixed-Use)", "Kantor dan Bisnis Profesional"]
  }
];

// Short codes for each category id, used ONLY in the wire format (map-data/
// rdtr-scored.geojson's useCategories field) to keep the ~109k-feature file small.
// score-parcels.mjs encodes id -> code when writing; main.ts decodes code -> id
// immediately after fetch, before the data reaches any other module, so every
// other consumer (rescore.ts, sitePanel.ts, explain.ts) only ever sees the full id
// and never needs to know the wire encoding exists.
export const CATEGORY_CODE = {
  ev_charging: "ev",
  parking: "pk",
  vehicle_servicing: "vs",
  retail_fnb: "rf",
  wastewater: "ww",
  waste_management: "wm",
  renewable_energy: "re",
  mixed_use_commercial: "mc"
};
export const CATEGORY_CODE_TO_ID = Object.fromEntries(
  Object.entries(CATEGORY_CODE).map(([id, code]) => [code, id])
);

const STATUS_RANK = { IZN: 0, BST: 1, TBS: 2, TBT: 3, UNKNOWN: 4 };
export const STATUS_LABEL = {
  IZN: "Allowed",
  BST: "Conditional",
  TBS: "Limited / Conditional",
  TBT: "Limited / Restricted",
  UNKNOWN: "Uncertain — not listed"
};

function findStatus(term, fields) {
  const t = term.toLowerCase();
  if ((fields.IZN || "").toLowerCase().includes(t)) return "IZN";
  if ((fields.BST || "").toLowerCase().includes(t)) return "BST";
  if ((fields.TBS || "").toLowerCase().includes(t)) return "TBS";
  if ((fields.TBT || "").toLowerCase().includes(t)) return "TBT";
  return null;
}

/**
 * Classify a zoning polygon's compatibility with the EV Hub development mix by
 * matching each use category's regulation terms against the polygon's
 * IZN/BST/TBS/TBT fields.
 *
 * @param {{IZN?:string, BST?:string, TBS?:string, TBT?:string}} fields
 * @returns {{categories: Array, worstRequiredStatus: string, allRequiredAllowed: boolean}}
 */
export function classifyLandUse(fields) {
  const categories = USE_CATEGORIES.map((cat) => {
    let best = null;
    let matchedTerm = null;
    for (const term of cat.terms) {
      const status = findStatus(term, fields);
      if (status && (best === null || STATUS_RANK[status] < STATUS_RANK[best])) {
        best = status;
        matchedTerm = term;
      }
    }
    return {
      id: cat.id,
      label: cat.label,
      required: cat.required,
      status: best || "UNKNOWN",
      matchedTerm
    };
  });

  const requiredStatuses = categories.filter((c) => c.required).map((c) => c.status);
  const worstRequiredStatus = requiredStatuses.reduce(
    (worst, s) => (STATUS_RANK[s] > STATUS_RANK[worst] ? s : worst),
    "IZN"
  );
  const allRequiredAllowed = requiredStatuses.every((s) => s === "IZN");

  return { categories, worstRequiredStatus, allRequiredAllowed };
}

// Zones that are, by definition of their object type, not developable land
// (rights-of-way, water bodies, etc). Matched against NAMOBJ / KODSZNTEXT.
const HARD_EXCLUSION_OBJECT_NAMES = [
  "Badan Jalan",
  "Badan Air",
  "Rel",
  "Sempadan Rel Kereta Api"
];

/**
 * Land-use gate result per spec: Allowed / Conditional / Uncertain / Excluded.
 */
export function landUseGate(props) {
  const namobj = props.NAMOBJ || "";
  if (HARD_EXCLUSION_OBJECT_NAMES.some((n) => namobj.includes(n))) {
    return { gate: "Excluded", reason: `Zone object type "${namobj}" is not developable land (right-of-way / water body).` };
  }

  const { worstRequiredStatus, categories } = classifyLandUse(props);
  if (worstRequiredStatus === "UNKNOWN") {
    const missing = categories.filter((c) => c.required && c.status === "UNKNOWN").map((c) => c.label);
    return {
      gate: "Uncertain",
      reason: `Required use(s) not found in this zone's regulation text: ${missing.join(", ")}. REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION.`
    };
  }
  if (worstRequiredStatus === "TBT") {
    return { gate: "Conditional", reason: "One or more required uses are only Terbatas (restricted/limited) in this zone." };
  }
  if (worstRequiredStatus === "TBS" || worstRequiredStatus === "BST") {
    return { gate: "Conditional", reason: "One or more required uses require conditional approval (Bersyarat/Terbatas Bersyarat) in this zone." };
  }
  return { gate: "Allowed", reason: "All required EV-hub uses are directly permitted (Diizinkan) in this zone." };
}
