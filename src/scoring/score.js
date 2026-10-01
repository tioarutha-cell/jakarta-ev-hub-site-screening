import { evaluateGates } from "./gates.js";

// Spec §21 baseline weights. "Road / Vehicle Access" is not yet integrated (Pass 3+),
// so its weight is excluded and the remaining weights are renormalized to 100%,
// rather than silently counted as zero (which would understate every site) or
// silently dropped (which would overstate precision). This is documented in
// METHODOLOGY.md and surfaced in the UI.
const RAW_WEIGHTS = {
  planning: 25,
  intensity: 20,
  height: 15,
  access: 20, // not yet integrated
  flood: 10,
  flexibility: 10
};
const IMPLEMENTED = ["planning", "intensity", "height", "flood", "flexibility"];
const IMPLEMENTED_TOTAL = IMPLEMENTED.reduce((s, k) => s + RAW_WEIGHTS[k], 0);
export const NORMALIZED_WEIGHTS = Object.fromEntries(
  IMPLEMENTED.map((k) => [k, (RAW_WEIGHTS[k] / IMPLEMENTED_TOTAL) * 100])
);

function scorePlanning(gateResult) {
  switch (gateResult.landUse.gate) {
    case "Allowed":
      return 100;
    case "Conditional":
      return 60;
    case "Uncertain":
      return 40;
    case "Excluded":
    default:
      return 0;
  }
}

function scoreIntensity(gateResult) {
  const { klb, kdh } = gateResult.intensity;
  if (klb.gate === "Unknown") return 40;
  let s = klb.gate === "Pass" ? 80 : 20;
  if (kdh.value != null && kdh.value >= 20) s += 20;
  else if (kdh.value != null) s += 10;
  return Math.min(100, s);
}

function scoreHeight(gateResult) {
  if (gateResult.height.gate === "Unknown") return 50;
  return gateResult.height.gate === "Pass" ? 100 : 0;
}

function scoreFlood(gateResult) {
  const rank = gateResult.flood.rank;
  if (rank < 0) return 60; // unknown -> neutral-ish, not a free pass
  return [100, 60, 20][rank] ?? 60; // Ringan / Sedang / Berat
}

function scoreFlexibility(gateResult) {
  // Fewer overlapping special-area flags / KKOP / setback constraints = more flexible site.
  let penalties = 0;
  if (gateResult.kkop.status !== "Pass") penalties += 1;
  if (gateResult.setback.status !== "Pass") penalties += 2;
  penalties += gateResult.specialFlags.length;
  return Math.max(0, 100 - penalties * 20);
}

/**
 * Full suitability evaluation for one RDTR polygon under a given scenario.
 * Hard exclusions (illegal zoning, setback corridor) short-circuit to Excluded
 * regardless of other scores, per spec §21 ("do not allow a high transport score
 * to override illegal zoning").
 */
export function evaluateSite(props, scenario) {
  const gateResult = evaluateGates(props, scenario);

  const hardExcluded =
    gateResult.landUse.gate === "Excluded" || gateResult.setback.status === "Excluded";

  const components = {
    planning: scorePlanning(gateResult),
    intensity: scoreIntensity(gateResult),
    height: scoreHeight(gateResult),
    flood: scoreFlood(gateResult),
    flexibility: scoreFlexibility(gateResult)
  };

  const compositeScore = hardExcluded
    ? 0
    : Math.round(
        IMPLEMENTED.reduce((sum, k) => sum + components[k] * (NORMALIZED_WEIGHTS[k] / 100), 0)
      );

  let classification;
  if (hardExcluded) classification = "Red";
  else if (gateResult.landUse.gate === "Uncertain" || gateResult.height.gate === "Unknown")
    classification = compositeScore >= 55 ? "Yellow" : "Orange";
  else if (compositeScore >= 75) classification = "Green";
  else if (compositeScore >= 55) classification = "Yellow";
  else if (compositeScore >= 30) classification = "Orange";
  else classification = "Red";

  return {
    gates: gateResult,
    components,
    weights: NORMALIZED_WEIGHTS,
    compositeScore,
    hardExcluded,
    classification
  };
}

export const CLASSIFICATION_LABEL = {
  Green: "Strong Candidate",
  Yellow: "Candidate With Conditions",
  Orange: "Heavily Constrained",
  Red: "Excluded / Very Poor Candidate"
};
