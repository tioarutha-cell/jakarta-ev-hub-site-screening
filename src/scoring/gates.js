import { landUseGate, classifyLandUse } from "./zoningRules.js";
import { parseIntensityField, resolveIntensityValue } from "./intensityParser.js";

// Actual values observed in Jakarta Satu's Resiko_Bencana "Resiko Banjir" layer
// (confirmed by direct inspection of the pulled data): Ringan (mild) < Sedang
// (moderate) < Berat (severe). Only three classes exist in the source data, not the
// four generic tiers (Rendah/Sedang/Tinggi/Sangat Tinggi) spec §14 names as an
// example — the tool uses the regulator's own class labels rather than remapping them.
const FLOOD_CLASS_ORDER = ["Ringan", "Sedang", "Berat"];

/**
 * Evaluate every gate for one RDTR polygon's properties against a scenario.
 *
 * @param {object} props RDTR feature properties
 * @param {object} scenario { heightM, storeys, siteAreaM2, groundFloorM, upperFloorM, floodClass }
 */
export function evaluateGates(props, scenario) {
  // landUseGate() gives the overall Allowed/Conditional/Uncertain/Excluded gate +
  // reason; classifyLandUse() gives the per-development-mix-item breakdown (which
  // specific uses are IZN/BST/TBS/TBT). Both are needed — merge them here rather
  // than making callers run two separate classification passes.
  const landUse = { ...landUseGate(props), categories: classifyLandUse(props).categories };

  // --- Intensity (KDB/KLB/KDH) ---
  const kdbParsed = parseIntensityField(props.KDB);
  const klbParsed = parseIntensityField(props.KLB);
  const kdhParsed = parseIntensityField(props.KDH);
  const kdb = resolveIntensityValue(kdbParsed, { siteAreaM2: scenario.siteAreaM2 });
  const klb = resolveIntensityValue(klbParsed, { siteAreaM2: scenario.siteAreaM2 });
  const kdh = resolveIntensityValue(kdhParsed, { siteAreaM2: scenario.siteAreaM2 });

  const footprintRatio = (kdb.value ?? scenario.assumedKdbPct) / 100;
  const requiredKLB = footprintRatio * scenario.storeys;
  let klbGate = "Unknown";
  if (klb.value != null) {
    klbGate = klb.value >= requiredKLB ? "Pass" : "Fail";
  }

  // Estimated max buildable height from available KLB/KDB (regulation does not
  // publish a direct meters height-limit field on this layer) — an engineering
  // estimate, not a cited regulatory ceiling. See METHODOLOGY.md.
  let estimatedMaxFloors = null;
  let estimatedMaxHeightM = null;
  if (klb.value != null && kdb.value != null && kdb.value > 0) {
    estimatedMaxFloors = klb.value / (kdb.value / 100);
    estimatedMaxHeightM =
      scenario.groundFloorM + Math.max(0, estimatedMaxFloors - 1) * scenario.upperFloorM;
  }
  let heightGate = "Unknown";
  if (estimatedMaxHeightM != null) {
    heightGate = estimatedMaxHeightM >= scenario.heightM ? "Pass" : "Fail";
  }

  const kdhGate = kdh.value != null ? (kdh.value >= 0 ? "Informational" : "Unknown") : "Unknown";

  // --- KKOP (aviation) ---
  const kkopValue = props.KKOP_1;
  const kkopPresent = kkopValue && kkopValue !== "Tidak Ada";
  const kkopGate = kkopPresent
    ? { status: "Constrained", detail: `Overlaps KKOP surface: ${kkopValue}. Elevation compatibility requires cross-check against the KKOP surface layer's reference elevation (Pass 3).` }
    : { status: "Pass", detail: "No KKOP overlap recorded for this zone." };

  // --- Setback / sempadan ---
  const ksmpdnValue = props.KSMPDN;
  const ksmpdnPresent = ksmpdnValue && ksmpdnValue !== "Tidak Ada";
  const setbackGate = ksmpdnPresent
    ? { status: "Excluded", detail: `Zone is designated as a regulated setback corridor: ${ksmpdnValue}.` }
    : { status: "Pass", detail: "No sempadan/setback designation on this zone." };

  // --- Other special-area overlay flags carried directly on the RDTR feature ---
  const specialFlags = [];
  if (props.KRB_03 && props.KRB_03 !== "Tidak Ada") specialFlags.push(`Kawasan Rawan Bencana: ${props.KRB_03}`);
  if (props.CAGBUD && props.CAGBUD !== "Tidak Ada") specialFlags.push(`Cagar Budaya (heritage): ${props.CAGBUD}`);
  if (props.HANKAM && props.HANKAM !== "Tidak Ada") specialFlags.push(`Pertahanan dan Keamanan (defense/security): ${props.HANKAM}`);
  if (props.RESAIR && props.RESAIR !== "Tidak Ada") specialFlags.push(`Kawasan Resapan Air (water catchment): ${props.RESAIR}`);
  if (props.KKARST && props.KKARST !== "Tidak Ada") specialFlags.push(`Kawasan Karst: ${props.KKARST}`);
  if (props.LP2B_2 && props.LP2B_2 !== "Tidak Ada") specialFlags.push(`Lahan Pertanian Pangan Berkelanjutan: ${props.LP2B_2}`);
  if (props.PTBGMB && props.PTBGMB !== "Tidak Ada") specialFlags.push(`Kawasan Pertambangan: ${props.PTBGMB}`);

  // --- Flood (joined separately; may be absent for Pass 1-2 if join not available) ---
  const floodClass = scenario.floodClass ?? null;

  return {
    landUse,
    intensity: {
      kdb: { ...kdb, parsed: kdbParsed },
      klb: { ...klb, parsed: klbParsed, requiredKLB, gate: klbGate },
      kdh: { ...kdh, parsed: kdhParsed, gate: kdhGate }
    },
    height: {
      estimatedMaxFloors,
      estimatedMaxHeightM,
      targetHeightM: scenario.heightM,
      gate: heightGate,
      note: "Estimated from KLB/KDB (no direct meters height-limit field found in the RDTR service). REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION."
    },
    kkop: kkopGate,
    setback: setbackGate,
    specialFlags,
    flood: floodClass ? { class: floodClass, rank: FLOOD_CLASS_ORDER.indexOf(floodClass) } : { class: "Unknown", rank: -1 }
  };
}
