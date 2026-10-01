# Jakarta EV Charging Hub — Site Screening Map

An interactive GIS screening tool for identifying where in DKI Jakarta a ~20–25m, multi-storey EV charging and mobility hub is plausibly buildable, based on real zoning, development-intensity (KDB/KLB/KDH), aviation (KKOP), setback, and flood-risk data pulled live from DKI Jakarta's own Jakarta Satu geoportal.

This is a **site-prospecting and feasibility-screening tool**, not a substitute for formal zoning confirmation, PBG approval, KKOP approval, or professional planning/legal review. See [METHODOLOGY.md](METHODOLOGY.md) for exactly how the suitability map is produced, [DATA-SOURCES.md](DATA-SOURCES.md) for dataset provenance, and [research/JAKARTA-EV-HUB-REGULATORY-RESEARCH.md](research/JAKARTA-EV-HUB-REGULATORY-RESEARCH.md) for the regulatory basis behind each rule.

## What's real vs. pending

This is Pass 1–2 of the full spec. **Real, live-queried data**: RDTR 2022 zoning (109,002 polygons, with KDB/KLB/KTB/KDH, permitted-use lists, and KKOP/setback/disaster/heritage overlay flags all attached), administrative boundaries, KKOP aviation surfaces, flood risk. **Not yet integrated** (present as UI toggles, clearly labeled "PASS 3+", not silently rendering nothing): road hierarchy/truck access, fire-access road-width screening, a separately buffered river/coastal setback layer, precise KKOP elevation cross-referencing. Full detail in DATA-SOURCES.md.

## Quick start

```bash
npm install
npm run data:build   # pulls fresh data from Jakarta Satu and rebuilds public/map-data (~15-20 min; ~110k features)
npm run dev
```

This opens **http://localhost:4321** automatically in your browser. The port is pinned (`strictPort` in `vite.config.ts`) rather than auto-incrementing, so it's always the same URL and won't collide with other projects' dev servers on the more common 3000/5173/8080 ports — if 4321 is somehow already taken, the command fails loudly instead of silently starting elsewhere.

Production build:

```bash
npm run build
npm run preview   # also serves on http://localhost:4321
```

## Rebuilding the data

`npm run data:build` runs, in order: `fetch:rdtr`, `fetch:admin`, `fetch:kkop`, `fetch:flood` (pull raw GeoJSON from Jakarta Satu's ArcGIS REST services into `raw-data/`), then `process:score` (parses/scores/simplifies the RDTR layer into `public/map-data/rdtr-scored.geojson`) and `process:publish-static` (simplifies admin boundaries and copies KKOP into `public/map-data/`). Each step can also be run individually — see `package.json` scripts. The Jakarta Satu server is occasionally slow/flaky; the fetch scripts retry with backoff and adaptively shrink the page size on persistent server errors rather than aborting the whole pull.

## Project layout

```
/index.html, src/            the application (MapLibre GL JS + vanilla TypeScript)
/scripts/                    data pipeline: fetch from Jakarta Satu -> score -> simplify -> publish
/raw-data/                   raw pulled GeoJSON (git-ignored; regenerate with npm run data:build)
/public/map-data/            final data actually shipped to the browser
/research/                   regulatory research
METHODOLOGY.md, DATA-SOURCES.md
```

## Stack

MapLibre GL JS + CARTO Dark Matter basemap (no API key required), Vite + TypeScript, `@turf/turf` for geodesic spatial operations. No UI framework — vanilla TS/DOM, to keep the scoring logic directly inspectable.
