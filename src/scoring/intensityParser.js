// The RDTR service's KDB/KLB/KTB/KDH fields are free text, not clean numbers.
// Two observed formats:
//   1. Simple: "60", "3 ", "0" — a single value applying to the whole sub-zone.
//   2. Tiered by parcel size ("Luas LP", land-parcel area), e.g.:
//      "- Luas LP kurang dari 60 m2 : Alternatif 1 : 100, Alternatif 2 : 90, ..."
//      with multiple "Luas LP <range>" brackets, each offering Alternatif 1/2 values.
//      Tiered fields are used for small-parcel residential zoning; larger brackets
//      ("lebih dari 400 m2") are the ones relevant to a 2,000-5,000 m2 EV hub site.
//
// This parser returns either a plain number, or a structured tier list, and a
// helper picks the applicable value for a given site area.

// Handles all four bracket forms observed in the source data:
//   "kurang dari 60 m2"            -> open below (num2 absent)
//   "60 m2 - 120 m2"                -> plain range, no direction prefix
//   "lebih dari 120 m2 - 240 m2"    -> range with "lebih dari" prefix
//   "lebih dari 240 - 400 m2"       -> range, unit only after the second number
//   "lebih dari 400 m2"             -> open above (num2 absent)
const TIER_REGEX = /Luas LP\s*(kurang dari|lebih dari)?\s*([\d.,]+)\s*(?:m2)?\s*(?:-\s*([\d.,]+)\s*m2)?\s*:\s*Alternatif 1\s*:\s*([\d.,]+)\s*,\s*Alternatif 2\s*:\s*([\d.,]+)/gi;

function toNumber(s) {
  if (s == null) return null;
  const n = parseFloat(String(s).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string|null|undefined} raw
 * @returns {{type:"simple", value:number}|{type:"tiered", tiers:Array}|{type:"unknown", raw:string}}
 */
export function parseIntensityField(raw) {
  if (raw == null) return { type: "unknown", raw: "" };
  const text = String(raw).trim();
  if (text === "" || text === "-" || text.toLowerCase() === "tidak ada") {
    return { type: "unknown", raw: text };
  }

  const simple = toNumber(text);
  if (simple !== null && !text.includes("Luas LP")) {
    return { type: "simple", value: simple };
  }

  const tiers = [];
  let match;
  const re = new RegExp(TIER_REGEX);
  while ((match = re.exec(text)) !== null) {
    const [, direction, numA, numB, alt1, alt2] = match;
    const a = toNumber(numA);
    const b = toNumber(numB);
    let minM2 = null;
    let maxM2 = null;
    if (direction === "kurang dari") {
      maxM2 = a; // open below a
    } else if (direction === "lebih dari") {
      minM2 = a;
      maxM2 = b ?? null; // open above a, or bounded a-b
    } else {
      // plain "A m2 - B m2" range, no direction keyword
      minM2 = a;
      maxM2 = b ?? a;
    }
    tiers.push({ direction: direction || "range", minM2, maxM2, alternatif1: toNumber(alt1), alternatif2: toNumber(alt2) });
  }
  if (tiers.length > 0) return { type: "tiered", tiers, raw: text };

  return { type: "unknown", raw: text };
}

/**
 * Resolve a parsed intensity field to a single usable number for a given site area,
 * per spec's baseline target site area (2,000-5,000 m2). For tiered fields, picks the
 * largest-parcel bracket available (since all observed brackets top out well below
 * 2,000 m2, the largest bracket is the closest documented analogue) and defaults to
 * "Alternatif 1". This is an assumption, not a confirmed regulatory reading — flagged
 * in the result.
 */
export function resolveIntensityValue(parsed, { siteAreaM2 = 3500, alternative = 1 } = {}) {
  if (parsed.type === "simple") {
    return { value: parsed.value, assumption: null };
  }
  if (parsed.type === "tiered") {
    // Prefer the bracket whose [min,max] contains the site area; else fall back to
    // the open-ended largest bracket (or the last-listed bracket if none is open).
    let tier = parsed.tiers.find((t) => {
      if (t.minM2 != null && siteAreaM2 < t.minM2) return false;
      if (t.maxM2 != null && siteAreaM2 > t.maxM2) return false;
      return true;
    });
    let assumption = null;
    if (!tier) {
      tier =
        parsed.tiers.find((t) => t.maxM2 == null) ?? parsed.tiers[parsed.tiers.length - 1];
      assumption = `Site area ${siteAreaM2} m² exceeds all documented "Luas LP" brackets for this sub-zone; using the largest/open-ended bracket (${tier.direction} ${tier.minM2 ?? tier.maxM2} m²) as the closest analogue. REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION.`;
    }
    const value = alternative === 2 ? tier.alternatif2 : tier.alternatif1;
    return { value, assumption, tierUsed: tier };
  }
  return { value: null, assumption: "No usable value found in source field." };
}
