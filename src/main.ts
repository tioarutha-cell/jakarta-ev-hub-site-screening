import * as turf from "@turf/turf";
import { createMap } from "./map/MapView.js";
import { addDataLayers, setMode, setLayerVisibility, setSelectedFeature, setKotaFilter } from "./map/layers.js";
import { renderFilterPanel } from "./ui/filterPanel.js";
import { renderSitePanel } from "./ui/sitePanel.js";
import { renderLegend } from "./ui/legend.js";
import { renderSourcesDrawer } from "./ui/sourcesDrawer.js";
import { renderSearch, type LocalIndexEntry } from "./ui/search.js";
import { getState, subscribe, setState, type LayerToggles } from "./state/store.js";
import { CATEGORY_CODE_TO_ID } from "./scoring/zoningRules.js";

const LAYER_TO_MAP_LAYERS: Record<string, string[]> = {
  kkop: ["kkop-fill", "kkop-outline"]
};

async function loadJSON(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return res.json();
}

// scripts/score-parcels.mjs ships short property keys to keep the ~109k-feature
// rdtr-scored.geojson file small (it must fit GitHub's 100MB single-file push
// limit). This expands every feature's properties back to the full names the rest
// of the app (rescore.ts, sitePanel.ts, explain.ts, layers.ts) already expects, so
// nothing downstream needs to know the wire encoding exists. Keep in sync with
// slimProperties() in scripts/score-parcels.mjs.
const EXPAND_KEYS: Record<string, string> = {
  cls: "classification",
  score: "compositeScore",
  lug: "landUseGate",
  uses: "useCategories",
  hg: "heightGate",
  maxH: "estimatedMaxHeightM",
  klb: "resolvedKLB",
  kdb: "resolvedKDB",
  kdh: "resolvedKDH",
  kkop: "kkopStatus",
  sb: "setbackStatus",
  flags: "specialFlags",
  flood: "floodClass"
};

function expandProperties(fc: GeoJSON.FeatureCollection): void {
  for (const f of fc.features) {
    const props = f.properties as Record<string, any>;
    for (const [short, full] of Object.entries(EXPAND_KEYS)) {
      if (short in props) {
        props[full] = props[short];
        delete props[short];
      }
    }
    // useCategories is a JSON string whose category ids are also coded down
    // (CATEGORY_CODE in zoningRules.js) — decode those too so every consumer sees
    // the real snake_case id (e.g. "ev_charging"), never the 2-letter wire code.
    if (typeof props.useCategories === "string") {
      try {
        const cats = JSON.parse(props.useCategories);
        props.useCategories = JSON.stringify(
          cats.map((c: { id: string; s: string }) => ({ id: CATEGORY_CODE_TO_ID[c.id] ?? c.id, s: c.s }))
        );
      } catch {
        // leave as-is if malformed
      }
    }
  }
}

async function main() {
  const mapContainer = document.getElementById("map-container")!;
  const mapDiv = document.createElement("div");
  mapDiv.id = "map";
  mapContainer.appendChild(mapDiv);
  const map = createMap(mapDiv);

  const leftPanel = document.getElementById("left-panel")!;
  const rightPanel = document.getElementById("right-panel")!;
  const legendContainer = document.getElementById("legend-container")!;
  const searchContainer = document.getElementById("search-container")!;
  const sourcesDrawer = document.getElementById("sources-drawer")!;

  renderFilterPanel(leftPanel);
  renderSitePanel(rightPanel, null);
  renderLegend(legendContainer);

  document.getElementById("sources-btn")?.addEventListener("click", () => {
    renderSourcesDrawer(sourcesDrawer);
    sourcesDrawer.classList.remove("hidden");
  });
  document.getElementById("methodology-btn")?.addEventListener("click", () => {
    window.open("/METHODOLOGY.md", "_blank");
  });

  document.querySelectorAll<HTMLElement>(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      setState({ mode: btn.dataset.mode as "regulatory" | "buildability" });
    });
  });

  console.log("Loading map data...");
  const [rdtr, kecamatan, kelurahan, kota, kkop] = await Promise.all([
    loadJSON("/map-data/rdtr-scored.geojson"),
    loadJSON("/map-data/admin-kecamatan.geojson"),
    loadJSON("/map-data/admin-kelurahan.geojson"),
    loadJSON("/map-data/admin-kota.geojson"),
    loadJSON("/map-data/kkop.geojson")
  ]);
  console.log(`Loaded ${rdtr.features.length} RDTR zones, ${kecamatan.features.length} kecamatan, ${kelurahan.features.length} kelurahan.`);
  expandProperties(rdtr);

  let featuresById = new Map<number, any>();
  for (const f of rdtr.features) featuresById.set(f.properties.OBJECTID, f.properties);

  function waitForStyle(): Promise<void> {
    return new Promise((resolve) => {
      if (map.isStyleLoaded()) resolve();
      else map.once("load", () => resolve());
    });
  }

  await waitForStyle();
  addDataLayers(map, { rdtr, kecamatan, kelurahan, kkop });

  // --- Search index: kecamatan + kelurahan centroids ---
  const localIndex: LocalIndexEntry[] = [];
  for (const f of kecamatan.features) {
    try {
      const c = turf.centroid(f).geometry.coordinates as [number, number];
      localIndex.push({ name: f.properties.WADMKC, type: "Kecamatan", center: c });
    } catch {}
  }
  for (const f of kelurahan.features) {
    try {
      const c = turf.centroid(f).geometry.coordinates as [number, number];
      localIndex.push({ name: f.properties.WADMKD, type: "Kelurahan", center: c });
    } catch {}
  }
  renderSearch(searchContainer, localIndex, (r) => {
    map.flyTo({ center: r.center, zoom: 15, duration: 900 });
  });

  // --- Click-to-inspect ---
  map.on("click", ["rdtr-regulatory-fill", "rdtr-buildability-fill"], (e) => {
    const f = e.features?.[0];
    if (!f) return;
    const objectId = f.properties?.OBJECTID;
    const props = featuresById.get(objectId);
    setState({ selectedObjectId: objectId });
    setSelectedFeature(map, objectId);
    renderSitePanel(rightPanel, props);
  });

  map.on("mouseenter", "rdtr-regulatory-fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "rdtr-regulatory-fill", () => (map.getCanvas().style.cursor = ""));
  map.on("mouseenter", "rdtr-buildability-fill", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "rdtr-buildability-fill", () => (map.getCanvas().style.cursor = ""));

  // --- District navigation: fly to kota extent + filter kecamatan outline emphasis ---
  // The admin-kota layer's WADMKK ("Kota Adm. Jakarta Pusat", "Kab. Adm. Kep. Seribu")
  // uses different abbreviations than the RDTR layer's WADMKK ("Kota Jakarta Pusat",
  // "Kabupaten Kepulauan Seribu") — confirmed by direct sampling of both services.
  // Normalize both to the same form before joining.
  function normalizeKotaName(name: string): string {
    return (name || "")
      .replace(/Adm\.\s*/gi, "")
      .replace(/\bKab\.\s*/gi, "Kabupaten ")
      .replace(/\bKep\.\s*/gi, "Kepulauan ")
      .replace(/\s+/g, " ")
      .trim();
  }
  const kotaByName = new Map<string, any>();
  for (const f of kota.features) kotaByName.set(normalizeKotaName(f.properties.WADMKK), f);

  // --- React to state changes ---
  let lastActiveKota: string | null | undefined = undefined; // undefined = not yet initialized
  subscribe((state) => {
    setMode(map, state.mode);
    renderLegend(legendContainer);

    (Object.keys(state.layers) as (keyof LayerToggles)[]).forEach((key) => {
      const mapLayers = LAYER_TO_MAP_LAYERS[key];
      if (mapLayers) mapLayers.forEach((id) => setLayerVisibility(map, id, state.layers[key]));
    });

    if (state.selectedObjectId != null) {
      const props = featuresById.get(state.selectedObjectId);
      renderSitePanel(rightPanel, props);
    }

    // Only move the camera / change the district filter when the district selection
    // itself changed — not on every state update (e.g. height slider) that also
    // triggers this subscriber.
    if (state.activeKota !== lastActiveKota) {
      lastActiveKota = state.activeKota;
      setKotaFilter(map, state.activeKota);
      if (state.activeKota) {
        const f = kotaByName.get(normalizeKotaName(state.activeKota));
        if (f) {
          const bbox = turf.bbox(f);
          map.fitBounds(
            [
              [bbox[0], bbox[1]],
              [bbox[2], bbox[3]]
            ],
            { padding: 30, duration: 800 }
          );
        }
      } else {
        map.fitBounds(
          [
            [106.65, -6.42],
            [107.0, -5.95]
          ],
          { padding: 20, duration: 800 }
        );
      }
    }
  });

  console.log("Jakarta EV Hub Site Screening ready.");
}

main().catch((err) => {
  console.error(err);
  document.getElementById("map-container")!.innerHTML =
    `<div style="padding:20px;color:#d6483f;font-family:monospace;">Failed to load: ${err.message}</div>`;
});
