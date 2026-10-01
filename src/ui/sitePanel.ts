import { rescoreFeature, type ScoredProps } from "../scoring/rescore.js";
import { CLASSIFICATION_LABEL } from "../scoring/score.js";
import { getState } from "../state/store.js";
import { STATUS_LABEL } from "../scoring/zoningRules.js";
import { explainLandUse, explainKkop, explainSetback } from "../scoring/explain.js";

function pill(text: string, cls: string): string {
  return `<span class="status-pill ${cls}">${text}</span>`;
}

function gateClass(gate: string): string {
  if (gate === "Pass" || gate === "Allowed" || gate === "Green") return "pass";
  if (gate === "Fail" || gate === "Excluded" || gate === "Red") return "fail";
  if (gate === "Unknown" || gate === "Uncertain") return "unknown";
  return gate; // Yellow / Orange etc use classification-name classes directly
}

export function renderSitePanel(container: HTMLElement, props: (ScoredProps & Record<string, any>) | null) {
  if (!props) {
    container.innerHTML = `<div class="site-panel-empty">SITE SCREENING<br/><br/>Click a zone on the map to see its EV-hub buildability breakdown.</div>`;
    return;
  }

  const scenario = getState().scenario;
  const result = rescoreFeature(props, {
    heightM: scenario.heightM,
    storeys: scenario.storeys,
    assumedKdbPct: scenario.assumedKdbPct
  });

  let useCategories: any[] = [];
  try {
    useCategories = JSON.parse(props.useCategories || "[]");
  } catch {
    useCategories = [];
  }

  const kelurahan = props.WADMKD || "Unknown kelurahan";
  const kecamatan = props.WADMKC || "";

  container.innerHTML = `
    <div class="site-panel-title">${props.KODSZNTEXT || props.NAMOBJ || "Zone"}</div>
    <div class="site-panel-sub">${kelurahan}, ${kecamatan}</div>

    <div class="panel-section" style="text-align:center; padding:10px 0; border:1px solid var(--border); border-radius:4px;">
      <div class="score-big" style="color:var(--${{Green:"green",Yellow:"yellow",Orange:"orange",Red:"red"}[result.classification]})">${result.compositeScore}<span style="font-size:14px;color:var(--text-2)"> / 100</span></div>
      <div class="score-sub">${pill(result.classification.toUpperCase(), result.classification)} &nbsp; ${CLASSIFICATION_LABEL[result.classification]}</div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Land Use</div>
      <div class="data-row"><span class="k">Object</span><span class="v">${props.NAMOBJ ?? "Unknown"}</span></div>
      <div class="data-row"><span class="k">Zoning gate</span><span class="v">${pill(props.landUseGate, gateClass(props.landUseGate))}</span></div>
      <div class="reg-note">${explainLandUse(props.landUseGate, props.NAMOBJ ?? "", useCategories)}</div>
      ${useCategories
        .map(
          (c: any) =>
            `<div class="data-row"><span class="k">${c.id.replace(/_/g, " ")}</span><span class="v">${pill((STATUS_LABEL as Record<string, string>)[c.s] ?? c.s, gateClass(c.s === "IZN" ? "Allowed" : c.s))}</span></div>`
        )
        .join("")}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Development Intensity</div>
      <div class="data-row"><span class="k">KDB (zone)</span><span class="v">${props.resolvedKDB ?? "UNKNOWN"}${props.resolvedKDB != null ? "%" : ""}</span></div>
      <div class="data-row"><span class="k">KLB (zone)</span><span class="v">${props.resolvedKLB ?? "UNKNOWN"}</span></div>
      <div class="data-row"><span class="k">Required KLB (scenario)</span><span class="v">${result.requiredKLB.toFixed(2)}</span></div>
      <div class="data-row"><span class="k">KLB gate</span><span class="v">${pill(result.klbGate, gateClass(result.klbGate))}</span></div>
      <div class="data-row"><span class="k">KDH (zone)</span><span class="v">${props.resolvedKDH ?? "UNKNOWN"}${props.resolvedKDH != null ? "%" : ""}</span></div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Height</div>
      <div class="data-row"><span class="k">Target height</span><span class="v">${scenario.heightM} m</span></div>
      <div class="data-row"><span class="k">Estimated max (KLB/KDB-derived)</span><span class="v">${props.estimatedMaxHeightM != null ? props.estimatedMaxHeightM.toFixed(1) + " m" : "UNKNOWN"}</span></div>
      <div class="data-row"><span class="k">Height gate</span><span class="v">${pill(result.heightGate, gateClass(result.heightGate))}</span></div>
      <div class="reg-note">Estimated from the zone's own KLB/KDB — no direct meters height-limit field exists in the source RDTR layer. REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION.</div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Restrictions</div>
      <div class="data-row"><span class="k">KKOP</span><span class="v">${pill(props.kkopStatus, gateClass(props.kkopStatus === "Pass" ? "Pass" : "Unknown"))}</span></div>
      <div class="reg-note">${explainKkop(props.kkopStatus, props.KKOP_1)}</div>
      <div class="data-row"><span class="k">Setback (sempadan)</span><span class="v">${pill(props.setbackStatus, gateClass(props.setbackStatus))}</span></div>
      <div class="reg-note">${explainSetback(props.setbackStatus, props.KSMPDN)}</div>
      <div class="data-row"><span class="k">Flood risk</span><span class="v">${props.floodClass ?? "UNKNOWN"}</span></div>
      ${props.specialFlags ? `<div class="reg-note">Other flags: ${props.specialFlags}</div>` : ""}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Status</div>
      <div class="reg-note" style="font-size:11.5px;color:var(--text-0)">
        ${result.hardExcluded
          ? "EXCLUDED — hard regulatory conflict (illegal zoning or setback corridor)."
          : result.classification === "Green"
          ? "PROMISING CANDIDATE — no major planning conflict identified in the data checked so far."
          : result.classification === "Yellow"
          ? "CANDIDATE WITH CONDITIONS — feasible but one or more items need detailed verification."
          : "HEAVILY CONSTRAINED — possible but likely expensive or approval-intensive."}
      </div>
    </div>
  `;
}
