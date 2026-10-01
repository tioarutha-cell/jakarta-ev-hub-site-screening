// Lightweight client-side re-scoring: recomputes only the scenario-dependent parts
// (intensity requirement vs. the zone's own KDB/KLB, and height vs. the zone's
// estimated max buildable height) using the numeric fields already precomputed and
// shipped in map-data/rdtr-scored.geojson at build time (see scripts/score-parcels.mjs).
// It deliberately does NOT re-run land-use keyword matching or KDB/KLB/KDH text
// parsing client-side — those are independent of height/storeys and stay as computed
// at build time, keeping this cheap enough to run over all ~109k features on every
// slider change.
import { NORMALIZED_WEIGHTS } from "./score.js";

// Actual class labels used by Jakarta Satu's flood-risk layer (confirmed by direct
// inspection of the pulled data): Ringan (mild), Sedang (moderate), Berat (severe).
const FLOOD_SCORE: Record<string, number> = {
  Ringan: 100,
  Sedang: 60,
  Berat: 20
};

export interface ScoredProps {
  landUseGate: string;
  resolvedKDB: number | null;
  resolvedKLB: number | null;
  resolvedKDH: number | null;
  estimatedMaxHeightM: number | null;
  kkopStatus: string;
  setbackStatus: string;
  specialFlags: string;
  floodClass: string;
}

export interface ScenarioLite {
  heightM: number;
  storeys: number;
  assumedKdbPct: number;
}

function scorePlanning(landUseGate: string): number {
  if (landUseGate === "Allowed") return 100;
  if (landUseGate === "Conditional") return 60;
  if (landUseGate === "Uncertain") return 40;
  return 0;
}

export function rescoreFeature(props: ScoredProps, scenario: ScenarioLite) {
  const hardExcluded = props.landUseGate === "Excluded" || props.setbackStatus === "Excluded";

  const kdb = props.resolvedKDB ?? scenario.assumedKdbPct;
  const footprintRatio = kdb / 100;
  const requiredKLB = footprintRatio * scenario.storeys;
  const klbGate =
    props.resolvedKLB == null ? "Unknown" : props.resolvedKLB >= requiredKLB ? "Pass" : "Fail";

  const heightGate =
    props.estimatedMaxHeightM == null
      ? "Unknown"
      : props.estimatedMaxHeightM >= scenario.heightM
      ? "Pass"
      : "Fail";

  const intensityScore = (() => {
    if (klbGate === "Unknown") return 40;
    let s = klbGate === "Pass" ? 80 : 20;
    if (props.resolvedKDH != null && props.resolvedKDH >= 20) s += 20;
    else if (props.resolvedKDH != null) s += 10;
    return Math.min(100, s);
  })();

  const heightScore = heightGate === "Unknown" ? 50 : heightGate === "Pass" ? 100 : 0;

  const floodScore = FLOOD_SCORE[props.floodClass] ?? 60;

  const flexPenalties =
    (props.kkopStatus !== "Pass" ? 1 : 0) +
    (props.setbackStatus !== "Pass" ? 2 : 0) +
    (props.specialFlags ? props.specialFlags.split(" | ").filter(Boolean).length : 0);
  const flexScore = Math.max(0, 100 - flexPenalties * 20);

  const planningScore = scorePlanning(props.landUseGate);

  const compositeScore = hardExcluded
    ? 0
    : Math.round(
        planningScore * (NORMALIZED_WEIGHTS.planning / 100) +
          intensityScore * (NORMALIZED_WEIGHTS.intensity / 100) +
          heightScore * (NORMALIZED_WEIGHTS.height / 100) +
          floodScore * (NORMALIZED_WEIGHTS.flood / 100) +
          flexScore * (NORMALIZED_WEIGHTS.flexibility / 100)
      );

  let classification: "Green" | "Yellow" | "Orange" | "Red";
  if (hardExcluded) classification = "Red";
  else if (props.landUseGate === "Uncertain" || heightGate === "Unknown")
    classification = compositeScore >= 55 ? "Yellow" : "Orange";
  else if (compositeScore >= 75) classification = "Green";
  else if (compositeScore >= 55) classification = "Yellow";
  else if (compositeScore >= 30) classification = "Orange";
  else classification = "Red";

  return {
    classification,
    compositeScore,
    requiredKLB,
    klbGate,
    heightGate,
    hardExcluded
  };
}
