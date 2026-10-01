# Data Sources

Every dataset the running application actually uses, with source, regulation basis, access date, confidence, and known transformations. See the in-app "Data & Regulations" drawer for the same information surfaced to end users, and [research/JAKARTA-EV-HUB-REGULATORY-RESEARCH.md](research/JAKARTA-EV-HUB-REGULATORY-RESEARCH.md) for the regulatory interpretation behind each layer.

## Primary datasets (in use)

### 1. RDTR 2022 zoning (`Rencana_Pola_Ruang_RDTR_2022`)
- **Source**: Jakarta Satu Geoportal, DKI Jakarta Provincial Government — `https://jakartasatu.jakarta.go.id/server/rest/services/Rencana_Pola_Ruang_RDTR_2022/MapServer/0`
- **Regulation**: Pergub DKI Jakarta No. 31 Tahun 2022
- **Data year**: 2022 (service-maintained)
- **Accessed**: 2026-09-25
- **Confidence**: High — official government ArcGIS Server, live-queried (not scraped or hand-digitized)
- **Type**: Official GIS, vector polygons, 109,002 features
- **Source CRS**: EPSG:32748 (UTM Zone 48S), reprojected server-side to EPSG:4326 on request
- **Transformation applied**: Douglas-Peucker simplification (tolerance ≈ 0.00003°, ~3m) via `turf.simplify`; long permitted-use text fields (`IZN`/`BST`/`TBS`/`TBT`) replaced in the shipped file with a precomputed per-category classification citing the matched regulation term, to control payload size (see METHODOLOGY.md §2.9)
- **Key fields used**: `NAMOBJ`, `KODZON`, `KODSZN`, `KODSZNTEXT`, `WADMKK/KC/KD`, `KDB`, `KLB`, `KTB`, `KDH`, `KKOP_1`, `KSMPDN`, `KRB_03`, `CAGBUD`, `HANKAM`, `RESAIR`, `KKARST`, `LP2B_2`, `TOD_04`, `TEB_05`, `IZN`, `BST`, `TBS`, `TBT`

### 2. Administrative boundaries (`Batas_Administrasi_Update`)
- **Source**: Jakarta Satu Geoportal — `.../Batas_Administrasi_Update/Batas_Administrasi_DKI_Jakarta_Update_View/MapServer` layers 5 (Kota/Kabupaten), 4 (Kecamatan), 3 (Kelurahan)
- **Regulation**: administrative boundary of record maintained by DKI Jakarta Provincial Government
- **Accessed**: 2026-09-25
- **Confidence**: High — official government ArcGIS Server, live-queried
- **Type**: Official GIS, vector polygons — 6 kota/kabupaten, 44 kecamatan, 267 kelurahan (counts match DKI Jakarta's known administrative structure, a useful cross-check of data integrity)
- **Transformation applied**: Douglas-Peucker simplification (tolerance ≈ 0.0002°) — the raw kelurahan layer alone was ~11MB for 267 features

### 3. KKOP — aviation obstacle limitation surfaces (`Kawasan_Keselamatan_Operasi_Penerbangan`)
- **Source**: Jakarta Satu Geoportal — `.../Kawasan_Keselamatan_Operasi_Penerbangan/MapServer/0`
- **Regulation**: SNI 03-7112-2005 (surface geometry standard); airport-specific decrees (e.g. KM 14 Tahun 2010 for Soekarno-Hatta)
- **Accessed**: 2026-09-25
- **Confidence**: High — official government ArcGIS Server, live-queried surface geometry with elevation attribution (not a reconstruction from regulation text)
- **Type**: Official GIS, vector polygons, 210 features
- **Key fields**: `NAMOBJ`, `KAWASAN` (surface type), `KEMIRINGAN` (slope), `ELEVASI_1/2`, `ELEVASIMSL_1/2` (reference elevations), `LNDSNPC` (runway)
- **Usage note**: Pass 1-2 screens using each RDTR zone's own `KKOP_1` overlap flag rather than a full point-vs-surface elevation calculation against this layer directly — see METHODOLOGY.md and research doc §4 for the Pass 3 plan.

### 4. Flood risk (`Resiko_Bencana` → "Resiko Banjir")
- **Source**: Jakarta Satu Geoportal — `.../Resiko_Bencana/MapServer/3`
- **Regulation**: N/A — hazard assessment, not a zoning regulation
- **Accessed**: 2026-09-25
- **Confidence**: High — official government ArcGIS Server, live-queried
- **Type**: Official GIS, vector polygons, 1,900 features
- **Key field**: `KELAS` (flood class — confirmed 3-tier scale across all 1,900 features: `Ringan`/mild, `Sedang`/moderate, `Berat`/severe; used as an engineering/CAPEX scoring penalty, not a hard exclusion)
- **Join method**: RDTR polygon centroid tested via `turf.booleanPointInPolygon` against same-kelurahan (`WADMKD`) flood polygons

## Not yet integrated (Pass 3+)

| Layer | Planned source | Status |
|---|---|---|
| Road hierarchy / truck access | Open Data Jakarta arteri/kolektor lists (`data.jakarta.go.id`) + OSM geometry join | UI toggle present, marked "PASS 3+", no effect on scoring |
| Fire access (road width) | SNI 03-1735-2000 vs. road geometry | Same as above |
| Precise KKOP elevation check | `Kawasan_Keselamatan_Operasi_Penerbangan`'s own `ELEVASIMSL` fields, cross-referenced by location | Overlap-flag screening only for now |
| Buffered river/coastal setback | Permen PUPR 28/2015 distances + a river-centerline dataset (BIG DEMNAS/RBI or OSM waterways) | RDTR's own pre-drawn `KSMPDN` corridor flag used instead |

## Supplementary / candidate sources considered but not used in Pass 1-2

- **HDX (`data.humdata.org`)** — Indonesia administrative boundaries (COD-AB), CC-BY-IGO — not needed since Jakarta Satu's own boundary service was confirmed live and more current.
- **GADM** — Indonesia admin boundaries — license is non-commercial/restrictive, avoided.
- **OpenStreetMap / Geofabrik** — supplementary road geometry, ODbL license — planned for the Pass 3 road layer where official width/classification data is incomplete; any OSM-derived feature in a future pass must be labeled "Supplementary — OpenStreetMap, Medium confidence" per spec §25, distinct from the "High confidence — Official GIS" Jakarta Satu layers.
- **BNPB / InaRISK (`gis.bnpb.go.id`)** — an independent, also-live ArcGIS REST flood layer — a candidate cross-check against Jakarta Satu's own flood layer in a future pass, not used as primary since Jakarta Satu already provides a DKI-specific, directly usable layer.
- **PUPR/ATR-BPN `gistaru.atrbpn.go.id`** — national RDTR viewer — confirmed viewer-only (no export/API found), not used; Jakarta Satu's own RDTR service supersedes the need for it.

## Known data-quality caveats

- A small number of `KODZON` codes returned no live feature in single-record spot-checks during this session and are left unconfirmed in the research doc rather than guessed from the abbreviation.
- Simplifying each polygon independently (rather than topologically) can leave microscopic gaps/slivers between adjacent zone boundaries at high zoom — acceptable for a screening tool, not for cadastral-grade boundary determination.
- The flood-risk join uses kelurahan-level filtering before the precise point-in-polygon test; a flood polygon that crosses a kelurahan boundary is still tested correctly against any RDTR polygon in either kelurahan it's indexed under, so this is a performance optimization, not an accuracy compromise.
