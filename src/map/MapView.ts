import maplibregl, { Map as MLMap } from "maplibre-gl";

// CARTO's Dark Matter basemap: no API key required, dark theme fits the
// investment/planning-tool aesthetic requested (spec §27).
const CARTO_DARK_STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

const JAKARTA_BOUNDS: [[number, number], [number, number]] = [
  [106.65, -6.42],
  [107.0, -5.95]
];

export function createMap(container: HTMLElement): MLMap {
  const map = new maplibregl.Map({
    container,
    style: CARTO_DARK_STYLE,
    center: [106.845, -6.21],
    zoom: 11,
    maxBounds: [
      [106.3, -6.75],
      [107.35, -5.7]
    ],
    attributionControl: { compact: true }
  });

  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-left");

  map.fitBounds(JAKARTA_BOUNDS, { padding: 20, duration: 0 });

  return map;
}

export { JAKARTA_BOUNDS };
