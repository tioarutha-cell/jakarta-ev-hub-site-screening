import { HEIGHT_OPTIONS } from "../state/scenario.js";
import { getState, updateScenario, toggleLayer, setState, PASS3_PENDING_LAYERS, type LayerToggles } from "../state/store.js";

const KOTA_LIST = [
  { code: null, label: "All Jakarta" },
  { code: "Kota Jakarta Pusat", label: "Jakarta Pusat" },
  { code: "Kota Jakarta Barat", label: "Jakarta Barat" },
  { code: "Kota Jakarta Selatan", label: "Jakarta Selatan" },
  { code: "Kota Jakarta Timur", label: "Jakarta Timur" },
  { code: "Kota Jakarta Utara", label: "Jakarta Utara" }
];

const DEV_USE_LABELS: Record<string, string> = {
  ev_charging: "EV Charging",
  parking: "Parking",
  vehicle_servicing: "Workshop / Servicing",
  retail_fnb: "Retail / F&B",
  wastewater: "Wastewater Treatment",
  waste_management: "Waste Management",
  renewable_energy: "Renewable Energy",
  mixed_use_commercial: "Commercial Vehicles / Mixed-Use"
};

const PLANNING_TOGGLES: [keyof LayerToggles, string][] = [
  ["zoning", "Compatible Zoning"],
  ["kdb", "KDB"],
  ["klb", "KLB"],
  ["kdh", "KDH"],
  ["heightLimit", "Height Limit"]
];

const RESTRICTION_TOGGLES: [keyof LayerToggles, string][] = [
  ["kkop", "KKOP"],
  ["riverSetback", "River Setbacks"],
  ["coastalSetback", "Coastal Setbacks"],
  ["specialZones", "Special Zones"],
  ["floodRisk", "Flood Risk"]
];

const ACCESS_TOGGLES: [keyof LayerToggles, string][] = [
  ["majorRoads", "Major Roads"],
  ["truckAccess", "Truck Access"],
  ["fireAccess", "Fire Access"]
];

function checkboxRow(key: keyof LayerToggles, label: string, checked: boolean, pending: boolean): string {
  return `
    <label class="checkbox-row ${pending ? "disabled" : ""}">
      <input type="checkbox" data-layer-toggle="${key}" ${checked ? "checked" : ""} />
      <span>${label}</span>
      ${pending ? '<span class="badge">PASS 3+</span>' : ""}
    </label>`;
}

export function renderFilterPanel(container: HTMLElement) {
  const state = getState();
  const s = state.scenario;

  container.innerHTML = `
    <div class="panel-section">
      <div class="panel-section-title">Building Height</div>
      <div class="field-row">
        <div class="field-label"><span>Target height</span><b id="height-value">${s.heightM} m</b></div>
        <input type="range" id="height-slider" min="15" max="30" step="1" value="${s.heightM}" list="height-ticks" />
        <datalist id="height-ticks">${HEIGHT_OPTIONS.map((h) => `<option value="${h}"></option>`).join("")}</datalist>
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">District</div>
      <div>
        ${KOTA_LIST.map(
          (k) =>
            `<span class="district-chip ${state.activeKota === k.code ? "active" : ""}" data-kota="${k.code ?? ""}">${k.label}</span>`
        ).join("")}
      </div>
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Development Mix</div>
      ${Object.entries(DEV_USE_LABELS)
        .map(
          ([id, label]) => `
        <label class="checkbox-row">
          <input type="checkbox" data-use-toggle="${id}" ${s.uses[id as keyof typeof s.uses] ? "checked" : ""} />
          <span>${label}</span>
        </label>`
        )
        .join("")}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Planning</div>
      ${PLANNING_TOGGLES.map(([k, l]) => checkboxRow(k, l, state.layers[k], false)).join("")}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Restrictions</div>
      ${RESTRICTION_TOGGLES.map(([k, l]) => checkboxRow(k, l, state.layers[k], false)).join("")}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Access</div>
      ${ACCESS_TOGGLES.map(([k, l]) => checkboxRow(k, l, state.layers[k], PASS3_PENDING_LAYERS.includes(k))).join("")}
    </div>

    <div class="panel-section">
      <div class="panel-section-title">Scenario</div>
      <div class="field-row">
        <div class="field-label"><span>Storeys</span><b>${s.storeys}</b></div>
        <input type="range" id="storeys-slider" min="1" max="8" step="1" value="${s.storeys}" />
      </div>
      <div class="field-row">
        <div class="field-label"><span>Target site area</span><b>${s.siteAreaM2.toLocaleString()} m²</b></div>
        <input type="range" id="sitearea-slider" min="1000" max="8000" step="250" value="${s.siteAreaM2}" />
      </div>
      <div class="reg-note">Baseline: EV Hub Screening. 2,000–5,000 m² target site, ~55–65% KDB, ~2.2–3.0 KLB (Pergub 31/2022 baseline range).</div>
    </div>
  `;

  container.querySelector("#height-slider")?.addEventListener("input", (e) => {
    const v = Number((e.target as HTMLInputElement).value);
    (container.querySelector("#height-value") as HTMLElement).textContent = `${v} m`;
    updateScenario({ heightM: v });
  });

  container.querySelector("#storeys-slider")?.addEventListener("input", (e) => {
    updateScenario({ storeys: Number((e.target as HTMLInputElement).value) });
    renderFilterPanel(container);
  });

  container.querySelector("#sitearea-slider")?.addEventListener("input", (e) => {
    updateScenario({ siteAreaM2: Number((e.target as HTMLInputElement).value) });
    renderFilterPanel(container);
  });

  container.querySelectorAll<HTMLInputElement>("[data-layer-toggle]").forEach((el) => {
    el.addEventListener("change", () => toggleLayer(el.dataset.layerToggle as keyof LayerToggles));
  });

  container.querySelectorAll<HTMLInputElement>("[data-use-toggle]").forEach((el) => {
    el.addEventListener("change", () => {
      const id = el.dataset.useToggle!;
      updateScenario({ uses: { ...s.uses, [id]: el.checked } });
    });
  });

  container.querySelectorAll<HTMLElement>("[data-kota]").forEach((el) => {
    el.addEventListener("click", () => {
      setState({ activeKota: el.dataset.kota || null });
      renderFilterPanel(container);
    });
  });
}
