import { DEFAULT_SCENARIO, cloneScenario } from "./scenario.js";

export type ViewMode = "regulatory" | "buildability";

export interface LayerToggles {
  zoning: boolean;
  kdb: boolean;
  klb: boolean;
  kdh: boolean;
  heightLimit: boolean;
  kkop: boolean;
  riverSetback: boolean;
  coastalSetback: boolean;
  specialZones: boolean;
  floodRisk: boolean;
  majorRoads: boolean;
  truckAccess: boolean;
  fireAccess: boolean;
}

export const PASS3_PENDING_LAYERS: (keyof LayerToggles)[] = [
  "majorRoads",
  "truckAccess",
  "fireAccess"
];

export interface AppState {
  mode: ViewMode;
  scenario: typeof DEFAULT_SCENARIO;
  layers: LayerToggles;
  activeKota: string | null;
  selectedObjectId: number | null;
}

type Listener = (state: AppState) => void;

const state: AppState = {
  mode: "regulatory",
  scenario: cloneScenario(DEFAULT_SCENARIO),
  layers: {
    zoning: true,
    kdb: true,
    klb: true,
    kdh: true,
    heightLimit: true,
    kkop: true,
    riverSetback: true,
    coastalSetback: true,
    specialZones: true,
    floodRisk: true,
    majorRoads: true,
    truckAccess: true,
    fireAccess: true
  },
  activeKota: null,
  selectedObjectId: null
};

const listeners = new Set<Listener>();

export function getState(): AppState {
  return state;
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setState(patch: Partial<AppState>): void {
  Object.assign(state, patch);
  listeners.forEach((fn) => fn(state));
}

export function updateScenario(patch: Partial<typeof DEFAULT_SCENARIO>): void {
  state.scenario = { ...state.scenario, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function toggleLayer(key: keyof LayerToggles): void {
  state.layers = { ...state.layers, [key]: !state.layers[key] };
  listeners.forEach((fn) => fn(state));
}
