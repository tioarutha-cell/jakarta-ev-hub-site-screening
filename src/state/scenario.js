// Baseline scenario per spec §29 / §2. All values are editable in the Scenario Panel.
export const DEFAULT_SCENARIO = {
  heightM: 23,
  storeys: 4,
  siteAreaM2: 3500, // midpoint of 2,000-5,000 m2 target range
  groundFloorM: 5.25, // midpoint of 5-5.5m
  upperFloorM: 4.15, // midpoint of 3.8-4.5m
  assumedKdbPct: 60, // midpoint of 55-65%, used only when a zone's own KDB can't be resolved
  uses: {
    ev_charging: true,
    parking: true,
    vehicle_servicing: true,
    retail_fnb: true,
    wastewater: true,
    waste_management: true,
    renewable_energy: true,
    mixed_use_commercial: true
  },
  floodClass: null // populated per-site at click-time from the flood-risk join, not a scenario input
};

export const HEIGHT_OPTIONS = [15, 20, 23, 25, 30];

export function cloneScenario(scenario = DEFAULT_SCENARIO) {
  return JSON.parse(JSON.stringify(scenario));
}
