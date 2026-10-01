# Methodology

How the Jakarta EV Hub Buildability & Site Screening Map is produced, from raw government data to the on-screen suitability classification. See [DATA-SOURCES.md](DATA-SOURCES.md) for full dataset provenance and [research/JAKARTA-EV-HUB-REGULATORY-RESEARCH.md](research/JAKARTA-EV-HUB-REGULATORY-RESEARCH.md) for the regulatory basis of each rule.

## 1. Data acquisition

All primary spatial data is pulled live from `jakartasatu.jakarta.go.id`'s public ArcGIS Server REST catalog (DKI Jakarta's own Jakarta Satu geoportal) — not scraped from a map viewer, not manually digitized, and not a third-party mirror.

| Script | Source layer | Output |
|---|---|---|
| `scripts/fetch-rdtr.mjs` | `Rencana_Pola_Ruang_RDTR_2022/MapServer/0` | `raw-data/rdtr-2022.geojson` (109,002 features) |
| `scripts/fetch-admin-boundaries.mjs` | `Batas_Administrasi_Update/.../MapServer/{5,4,3}` | `raw-data/admin-{kota,kecamatan,kelurahan}.geojson` |
| `scripts/fetch-kkop.mjs` | `Kawasan_Keselamatan_Operasi_Penerbangan/MapServer/0` | `raw-data/kkop.geojson` (210 features) |
| `scripts/fetch-flood.mjs` | `Resiko_Bencana/MapServer/3` ("Resiko Banjir") | `raw-data/flood-risk.geojson` (1,900 features) |

Each fetch script paginates the service's `query` endpoint (`resultOffset`/`resultRecordCount`, capped by the service's own `maxRecordCount`), requests `outSR=4326` so the server reprojects from its native EPSG:32748 (UTM Zone 48S) to WGS84 itself, and requests `f=geojson` so no manual Esri-JSON-to-GeoJSON geometry conversion is needed. Connections to this host are intermittently flaky (observed even with IPv4 forced); the client (`scripts/lib/arcgis.mjs`) retries with backoff rather than failing the pull.

**Coordinate reference system**: per spec §34, real-world measurements should not be computed on raw lat/lon degrees. This tool avoids that pitfall in two ways: (1) the ArcGIS server performs the actual degree-vs-metric reprojection when producing `outSR=4326` output — the geometry is correctly projected, not naively relabeled; (2) all area/centroid calculations in this codebase use `@turf/turf`, whose area/centroid functions are geodesic (they account for the ellipsoid, not planar degree math) and are therefore safe to run directly on the WGS84 output without a separate manual UTM reprojection step for those specific operations.

## 2. Scoring pipeline (`scripts/score-parcels.mjs`)

For each of the 109,002 RDTR polygons:

1. **Flood join**: the polygon's centroid (`turf.centroid`) is tested with `turf.booleanPointInPolygon` against flood-risk polygons sharing the same `WADMKD` (kelurahan) value — an attribute pre-filter that avoids an expensive full spatial join (109,002 × 1,900 pair checks) while keeping the point-in-polygon test itself precise.
2. **Land-use gate**: `src/scoring/zoningRules.js` keyword-matches the EV-hub development mix (see below) against the polygon's own `IZN`/`BST`/`TBS`/`TBT` fields (the regulation's own permitted-use lists, verbatim). Result: Allowed / Conditional / Uncertain / Excluded, per spec §6.
3. **Intensity gate**: `src/scoring/intensityParser.js` parses the polygon's `KDB`/`KLB`/`KDH` text fields (simple numeric, or a parcel-size-tiered table — see research doc §2) into numeric values, then compares available KLB against the scenario's required KLB (`required KLB ≈ (KDB/100) × storeys`).
4. **Height gate**: since no direct meters height-limit field exists on the source layer, an estimated max buildable height is derived from the zone's own KLB/KDB (`estimated max floors = KLB / (KDB/100)`) and the scenario's floor-to-floor assumptions, then compared to the target height. Always labeled as an estimate, never presented as a cited limit.
5. **KKOP / setback / special-zone flags**: read directly from the polygon's own `KKOP_1`, `KSMPDN`, `KRB_03`, `CAGBUD`, `HANKAM`, `RESAIR`, `KKARST`, `LP2B_2` fields (all part of the same authoritative RDTR feature — see research doc §1).
6. **Composite score**: weighted per spec §21 (Planning 25%, Intensity 20%, Height 15%, Flood/Environmental 10%, Site Flexibility 10%), **excluding** Road/Vehicle Access (20% in the spec's baseline weighting) because that layer is not yet integrated (Pass 3+). The remaining weights are renormalized to sum to 100% rather than silently scoring Access as 0 (which would understate every site) or silently keeping the spec's raw weights (which would imply a false precision the data doesn't support). This is surfaced in the UI and in [DATA-SOURCES.md](DATA-SOURCES.md).
7. **Hard exclusions**: a zone whose land-use gate is `Excluded` (not developable land, e.g. road body/water body) or whose setback gate is `Excluded` (designated sempadan corridor) is forced to composite score 0 / classification Red regardless of any other score component, per spec §21 ("do not allow a high transport score to override illegal zoning").
8. **Simplification**: each polygon's geometry is simplified with `turf.simplify` (Douglas-Peucker, tolerance ≈ 0.00003° ≈ 3m at Jakarta's latitude) to keep the ~109k-feature dataset renderable in the browser. Per-feature independent simplification can leave microscopic gaps/overlaps between adjacent polygons at high zoom — acceptable for a screening tool, not acceptable for cadastral-grade output (see §32/Performance note below).
9. **Payload trimming**: the very long `IZN`/`BST`/`TBS`/`TBT` regulation-text fields (which make the raw pull large) are not shipped verbatim on every one of 109k output features; instead the precomputed per-category classification (small — id, status, matched regulation term) is shipped, preserving traceability to the regulation text without the full list's payload cost.

Output: `public/map-data/rdtr-scored.geojson`, precomputed for the default 23m/4-storey scenario.

## 3. Client-side re-scoring (`src/scoring/rescore.ts`)

Changing the height slider or storeys field in the UI does not require reloading data or re-running the full pipeline: `rescoreFeature()` recomputes only the scenario-dependent parts (required KLB vs. the zone's own KLB; target height vs. the zone's own KLB/KDB-estimated max height) using the numeric fields already shipped on each feature. Land-use classification and KDB/KLB/KDH text parsing — which don't depend on height/storeys — are not re-run client-side, keeping this fast enough to run across all loaded features on every slider tick.

## 4. Suitability classification

| Score | Classification | Meaning |
|---|---|---|
| Hard exclusion | Red | Excluded / Very Poor Candidate |
| ≥75 | Green | Strong Candidate |
| 55–74 | Yellow | Candidate With Conditions |
| 30–54 | Orange | Heavily Constrained |
| <30 | Red | Excluded / Very Poor Candidate |

A polygon whose land-use gate is `Uncertain` or whose height gate is `Unknown` is capped at Yellow/Orange (never Green) — the tool never silently treats an unresolved regulatory question as a pass, per spec §20.

## 5. What is NOT yet real (Pass 3+)

Toggled in the UI but not wired to real data yet, and clearly labeled "PASS 3+" rather than silently rendering nothing:

- Road hierarchy / truck-access tiering (Open Data Jakarta + OSM join)
- Fire-access road-width screening (SNI 03-1735-2000 vs. actual road geometry)
- Precise KKOP elevation-ceiling cross-reference (vs. the current overlap-flag screening)
- Separately buffered river/coastal setback geometry (vs. the current RDTR-native `KSMPDN` flag)

## 6. Development mix used for land-use screening

EV Charging (SPKLU/SPBKLU), Conventional Parking, Vehicle Servicing/Workshop (bengkel, car wash), Retail/Supermarket/F&B, Wastewater Treatment, Waste Management, Renewable Energy/Utility Infrastructure, General Commercial/Mixed-Use. Exact regulation-term keyword lists are in `src/scoring/zoningRules.js`.
