import type { Map as MLMap } from "maplibre-gl";

export const RDTR_SOURCE = "rdtr";
export const ADMIN_KECAMATAN_SOURCE = "admin-kecamatan";
export const ADMIN_KELURAHAN_SOURCE = "admin-kelurahan";
export const KKOP_SOURCE = "kkop";
export const FLOOD_SOURCE = "flood";

const CLASS_COLORS: Record<string, string> = {
  Green: "#35b06b",
  Yellow: "#d9b63e",
  Orange: "#e08a3c",
  Red: "#d6483f"
};

// Zone-family fill colors for Regulatory Layers Mode, keyed by the first two digits
// of KODZON (31 = Zona Lindung/protection, 32 = Zona Budi Daya/development), with a
// few high-relevance sub-families broken out for legibility.
const ZONE_FILL_EXPRESSION: any = [
  "case",
  ["==", ["get", "KODZON"], 32112000], "#eab308", // K commercial/services
  ["==", ["get", "KODZON"], 32103000], "#7a6bd9", // R residential
  ["==", ["get", "KODZON"], 32080000], "#c97a3d", // KPI industrial
  ["==", ["get", "KODZON"], 32120000], "#ec4899", // TR transportation
  ["==", ["get", "KODZON"], 32113000], "#c9a679", // KT office
  ["==", ["get", "KODZON"], 31031000], "#3f9e5c", // RTH green space
  ["==", ["get", "KODZON"], 31010000], "#2f6fae", // BA water body
  ["==", ["get", "KODZON"], 32130000], "#8a4a4a", // HK defense
  ["==", ["get", "KODZON"], 32010000], "#555c68", // BJ road body
  "#4a5060"
];

export function addDataLayers(map: MLMap, data: {
  rdtr: GeoJSON.FeatureCollection;
  kecamatan: GeoJSON.FeatureCollection;
  kelurahan: GeoJSON.FeatureCollection;
  kkop: GeoJSON.FeatureCollection;
}) {
  map.addSource(RDTR_SOURCE, { type: "geojson", data: data.rdtr, promoteId: "OBJECTID" });
  map.addSource(ADMIN_KECAMATAN_SOURCE, { type: "geojson", data: data.kecamatan });
  map.addSource(ADMIN_KELURAHAN_SOURCE, { type: "geojson", data: data.kelurahan });
  map.addSource(KKOP_SOURCE, { type: "geojson", data: data.kkop });

  // --- Regulatory Layers Mode: raw zoning choropleth ---
  map.addLayer({
    id: "rdtr-regulatory-fill",
    type: "fill",
    source: RDTR_SOURCE,
    paint: {
      "fill-color": ZONE_FILL_EXPRESSION,
      "fill-opacity": 0.55
    }
  });

  // --- Buildability Mode: composite suitability classification ---
  map.addLayer({
    id: "rdtr-buildability-fill",
    type: "fill",
    source: RDTR_SOURCE,
    layout: { visibility: "none" },
    paint: {
      "fill-color": [
        "match",
        ["get", "classification"],
        "Green", CLASS_COLORS.Green,
        "Yellow", CLASS_COLORS.Yellow,
        "Orange", CLASS_COLORS.Orange,
        "Red", CLASS_COLORS.Red,
        "#4a5060"
      ],
      "fill-opacity": 0.65
    }
  });

  map.addLayer({
    id: "rdtr-outline",
    type: "line",
    source: RDTR_SOURCE,
    paint: { "line-color": "#0b0d11", "line-width": 0.4, "line-opacity": 0.5 }
  });

  map.addLayer({
    id: "rdtr-selected-outline",
    type: "line",
    source: RDTR_SOURCE,
    filter: ["==", ["get", "OBJECTID"], -1],
    paint: { "line-color": "#ffffff", "line-width": 2.5 }
  });

  // --- KKOP overlay (aviation surfaces) ---
  map.addLayer({
    id: "kkop-fill",
    type: "fill",
    source: KKOP_SOURCE,
    paint: { "fill-color": "#c94f4f", "fill-opacity": 0.08 }
  });
  map.addLayer({
    id: "kkop-outline",
    type: "line",
    source: KKOP_SOURCE,
    paint: { "line-color": "#c94f4f", "line-width": 0.6, "line-opacity": 0.6 }
  });

  // --- Admin boundaries (district navigation) ---
  map.addLayer({
    id: "kecamatan-outline",
    type: "line",
    source: ADMIN_KECAMATAN_SOURCE,
    paint: { "line-color": "#6b7484", "line-width": 1, "line-opacity": 0.8 }
  });
  map.addLayer({
    id: "kelurahan-outline",
    type: "line",
    source: ADMIN_KELURAHAN_SOURCE,
    minzoom: 13,
    paint: { "line-color": "#4a5060", "line-width": 0.5, "line-opacity": 0.6 }
  });
}

export function setMode(map: MLMap, mode: "regulatory" | "buildability") {
  map.setLayoutProperty("rdtr-regulatory-fill", "visibility", mode === "regulatory" ? "visible" : "none");
  map.setLayoutProperty("rdtr-buildability-fill", "visibility", mode === "buildability" ? "visible" : "none");
}

export function setLayerVisibility(map: MLMap, layerId: string, visible: boolean) {
  if (!map.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
}

export function setSelectedFeature(map: MLMap, objectId: number | null) {
  map.setFilter("rdtr-selected-outline", ["==", ["get", "OBJECTID"], objectId ?? -1]);
}

export function setKotaFilter(map: MLMap, wadmkk: string | null) {
  const filter: any = wadmkk ? ["==", ["get", "WADMKK"], wadmkk] : null;
  map.setFilter("rdtr-regulatory-fill", filter);
  map.setFilter("rdtr-buildability-fill", filter);
  map.setFilter("rdtr-outline", filter);
}

export { CLASS_COLORS };
