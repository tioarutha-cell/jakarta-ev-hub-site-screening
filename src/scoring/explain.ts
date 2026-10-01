// Regenerates the human-readable gate explanations client-side from fields that ARE
// shipped, instead of shipping the same handful of sentence templates redundantly on
// all ~109k features (see scripts/score-parcels.mjs slimProperties for why).

export function explainLandUse(landUseGate: string, namobj: string, useCategories: { id: string; s: string; t: string | null }[]): string {
  if (landUseGate === "Excluded") {
    return `Zone object type "${namobj}" is not developable land (right-of-way / water body).`;
  }
  if (landUseGate === "Uncertain") {
    const missing = useCategories.filter((c) => c.s === "UNKNOWN").map((c) => c.id.replace(/_/g, " "));
    return `Required use(s) not found in this zone's regulation text: ${missing.join(", ")}. REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION.`;
  }
  if (landUseGate === "Conditional") {
    return "One or more required uses require conditional approval (Bersyarat/Terbatas Bersyarat/Terbatas) in this zone.";
  }
  return "All required EV-hub uses are directly permitted (Diizinkan) in this zone.";
}

export function explainKkop(kkopStatus: string, kkop1: string | null | undefined): string {
  if (kkopStatus === "Pass") return "No KKOP overlap recorded for this zone.";
  return `Overlaps KKOP surface: ${kkop1}. Elevation compatibility requires cross-check against the KKOP surface layer's reference elevation (Pass 3).`;
}

export function explainSetback(setbackStatus: string, ksmpdn: string | null | undefined): string {
  if (setbackStatus === "Pass") return "No sempadan/setback designation on this zone.";
  return `Zone is designated as a regulated setback corridor: ${ksmpdn}.`;
}
