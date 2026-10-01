import { getState } from "../state/store.js";

const BUILDABILITY_LEGEND = [
  { color: "#35b06b", label: "Strong Candidate" },
  { color: "#d9b63e", label: "Candidate w/ Conditions" },
  { color: "#e08a3c", label: "Heavily Constrained" },
  { color: "#d6483f", label: "Excluded" }
];

const REGULATORY_LEGEND = [
  { color: "#eab308", label: "Commercial/Services (K)" },
  { color: "#7a6bd9", label: "Residential (R)" },
  { color: "#c97a3d", label: "Industrial (KPI)" },
  { color: "#ec4899", label: "Transportation" },
  { color: "#c9a679", label: "Office (KT)" },
  { color: "#3f9e5c", label: "Green Space (RTH)" },
  { color: "#2f6fae", label: "Water Body" }
];

export function renderLegend(container: HTMLElement) {
  const mode = getState().mode;
  const items = mode === "buildability" ? BUILDABILITY_LEGEND : REGULATORY_LEGEND;
  container.innerHTML = items
    .map((i) => `<span class="legend-swatch"><span class="legend-dot" style="background:${i.color}"></span>${i.label}</span>`)
    .join("");
}
