# Jakarta EV Hub — Regulatory Research

Research conducted 2026-09-25. This document records what was found, where, with what confidence, and what remains open. It is a screening-tool input, **not** a substitute for formal zoning confirmation, PBG approval, KKOP approval, or professional planning/legal review.

## 1. Zoning / Permitted Use — RDTR

- **Regulation**: Peraturan Gubernur (Pergub) DKI Jakarta No. 31 Tahun 2022 tentang Rencana Detail Tata Ruang dan Peraturan Zonasi.
- **Source (text)**: https://peraturan.bpk.go.id/Download/279796/pergub-jakarta-no-31-tahun-2022-tentang-rdtr-zonasi.pdf (official BPK repository)
- **Source (spatial)**: `Rencana_Pola_Ruang_RDTR_2022` feature service on Jakarta Satu's ArcGIS Server (`jakartasatu.jakarta.go.id/server/rest/services`) — confirmed live and directly queryable without authentication, 109,002 polygon features covering all of DKI Jakarta.
- **Interpretation**: Each polygon carries the regulation's own permitted-use lists verbatim, split into four fields: `IZN` (Diizinkan/Allowed), `BST` (Bersyarat/Conditional), `TBS` (Terbatas Bersyarat/Limited-Conditional), `TBT` (Terbatas/Limited-Restricted). This tool classifies EV-hub compatibility by keyword-matching the development mix (SPKLU/SPBKLU charging, parking, bengkel/car wash, retail/F&B, wastewater, waste management, energy infrastructure) against these four fields directly — the classification is traceable to the regulation's literal text, not an external interpretation.
- **Zoning code structure observed**: `JNSRPR` splits zones into "Zona Lindung" (protection, codes 31xxxxxx) and "Zona Budi Daya" (development, codes 32xxxxxx). Sub-zone codes (`KODSZNTEXT`) follow the familiar Indonesian RDTR convention (e.g. `K-3` = Perdagangan dan Jasa Skala SWP/commercial-services, `R-1` = Perumahan Kepadatan Sangat Tinggi/very-high-density residential, `SPU-3` = public service facility, `KPI` = Kawasan Peruntukan Industri/industrial). A handful of the 30 top-level `KODZON` codes had no live features returned in spot-checks and are left unconfirmed rather than guessed (see DATA-SOURCES.md).
- **Confidence**: High for the zoning geometry and use-list text (live official service). Medium for the interpretation of which use-list terms correspond to each EV-hub development-mix category (keyword list is a reasonable but not exhaustive translation — **REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION** for edge cases).

## 2. KDB / KLB / KTB / KDH

- Present directly as fields on the same RDTR polygons (`KDB`, `KLB`, `KTB`, `KDH`).
- Two formats observed: a simple percentage/ratio (e.g. `"60"`, `"3"`) for most non-residential sub-zones, and a parcel-size-tiered table with two named alternatives ("Alternatif 1"/"Alternatif 2") for residential sub-zones, e.g. `"Luas LP lebih dari 400 m2: Alternatif 1: 60, Alternatif 2: 40"`.
- **Open question**: the regulation's basis for choosing "Alternatif 1" vs "Alternatif 2" (likely tied to a separate site/building typology criterion in the Pergub text) was not resolved from the feature service alone. The tool defaults to Alternatif 1 and to the largest documented parcel-size bracket for a 2,000–5,000 m² site, flagging this as an assumption. **REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION.**
- **Open question**: whether parking floors, MEP/mechanical rooms, or circulation space receive any KLB exemption is not stated in the feature service and was not confirmed against the full Pergub text in this pass. The tool does **not** assume any such exemption. **REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION.**

## 3. Building Height

- No direct "maximum height in meters" field was found on the RDTR feature service (fields inspected: full field list checked, see DATA-SOURCES.md). A separate `Peta_Ketinggian_DKI_Jakarta` service exists but its `KETINGGIAN` field describes ground elevation bands ("0 - 16", "16 - 32" — consistent with terrain elevation, not a building height limit), so it does not answer this question either.
- The tool instead **estimates** a zone's plausible maximum buildable height from its own KLB and KDB (`estimated max floors = KLB / (KDB/100)`, converted to meters using the scenario's floor-to-floor assumptions). This mirrors the spec's own example site-detail panel (§20), which checks height via a KLB requirement rather than a separate height field.
- This is an engineering estimate, not a cited regulatory ceiling, and is labeled as such everywhere it appears in the UI. **REQUIRES PROFESSIONAL / AUTHORITY VERIFICATION** against the full Pergub 31/2022 text and any applicable KKOP-driven height ceiling.

## 4. KKOP (Aviation)

- **Regulatory basis**: SNI 03-7112-2005 defines the standard KKOP surface geometry (horizontal, conical, approach, transitional surfaces) referenced to each runway's aerodrome/threshold elevation (MSL). Airport-specific decrees establish each airport's actual KKOP (e.g. KM 14 Tahun 2010 for Soekarno-Hatta; KM 48/KM 49 Tahun 2000 for Halim Perdanakusuma referenced in secondary sources — not independently verified against JDIH text in this pass).
- **Spatial data**: `Kawasan_Keselamatan_Operasi_Penerbangan` feature service on Jakarta Satu — live, queryable, 210 polygon features, with per-surface fields for surface type (`KAWASAN`), slope (`KEMIRINGAN`), reference/MSL elevations (`ELEVASI_1/2`, `ELEVASIMSL_1/2`), and airport/runway identity. This is official surface geometry, not a reconstruction from regulation text.
- **Pass 1-2 usage**: every RDTR zoning polygon already carries its own `KKOP_1` field flagging which KKOP surface type (if any) overlaps it (coded values include e.g. `K01B` Kawasan Ancangan Pendaratan dan Lepas Landas, `K01D` Kawasan di Bawah Permukaan Transisi, `K01F` Kawasan di Bawah Permukaan Kerucut, `K01G` Kawasan di Bawah Permukaan Horizontal-Luar). The tool surfaces this as a screening flag ("Constrained — requires elevation check") rather than a hard exclusion, since different KKOP surface types carry very different actual elevation ceilings.
- **Pass 3+ plan**: cross-reference the flagged zone's location against the KKOP layer's own `ELEVASIMSL_1/2` fields for a precise elevation-limit check.
- **Confidence**: High for surface geometry (official, live-queried). Medium for the precise elevation ceiling applicable to any given point until Pass 3's cross-reference is implemented.

## 5. Setbacks (Sempadan)

- **Regulation**: Permen PUPR No. 28/PRT/M/2015 (Penetapan Garis Sempadan Sungai dan Garis Sempadan Danau) sets river/lake setback distances: 10m (river depth ≤3m, no embankment), 15m (3–20m depth), 30m (>20m depth); 3m minimum from the outer toe of an embanked levee.
- **Spatial data**: the RDTR layer's `KSMPDN` field directly flags zones already designated as a setback corridor (river/coastal/lake/spring/electricity/pipe corridor sub-types are distinguished). The tool treats a populated `KSMPDN` value as a hard exclusion for that specific polygon (it is, by the regulation's own zoning, a no-build corridor), consistent with spec §10's "hard exclusion" category for setbacks.
- **Open item**: a separately buffered river-centerline layer (for computing setback distance from an arbitrary point rather than relying on the pre-drawn RDTR corridor polygon) is not yet integrated — planned Pass 3.

## 6. Fire / Emergency Access

- **Regulation**: SNI 03-1735-2000 (Tata Cara Perencanaan Akses Bangunan dan Akses Lingkungan untuk Pencegahan Bahaya Kebakaran). Confirmed rule: buildings taller than 10m require an environmental access road ≥6m wide on at least 2 sides of the building, with ≥2m clearance to each side — directly relevant to a 20-25m EV hub.
- **Status**: not yet spatially integrated (requires road-width data joined to candidate sites) — Pass 3+. Surfaced in the filter panel as a pending toggle rather than silently omitted.

## 7. Roads / Access

- **Regulation basis**: PP No. 34 Tahun 2006 tentang Jalan (national road classification framework).
- **Data**: Open Data Jakarta (`data.jakarta.go.id`) publishes downloadable arteri-primer and kolektor road lists (name, length, width) — tabular, not pre-joined to geometry. OSM provides road geometry city-wide but with inconsistent `width`/`maxweight` tagging.
- **Status**: not yet integrated — Pass 3+.

## 8. Flood Risk

- **Data**: `Resiko_Bencana` / `Resiko Banjir` feature service on Jakarta Satu — live, queryable, 1,900 polygon features with a `KELAS` field. Confirmed class values (by inspecting all 1,900 features): `Ringan` (mild), `Sedang` (moderate), `Berat` (severe) — a 3-tier scale, not the 4-tier Rendah/Sedang/Tinggi/Sangat Tinggi example terminology in spec §14. The tool uses the regulator's own class labels.
- **Usage**: joined to each RDTR polygon by kelurahan match + point-in-polygon test on the polygon's centroid against same-kelurahan flood polygons. Used as an engineering/CAPEX scoring penalty, not a hard regulatory exclusion, per spec §14.
- **Confidence**: High (official, live-queried).

## 9. Unresolved Regulatory Questions (summary)

All flagged inline above; consolidated here:

1. KDB/KLB/KDH "Alternatif 1 vs Alternatif 2" selection criterion for tiered sub-zones — **REQUIRES VERIFICATION**.
2. Whether parking/MEP floor area receives any KLB exemption — **REQUIRES VERIFICATION**.
3. No direct building-height-limit field exists in the queried data; height is estimated from KLB/KDB — **REQUIRES VERIFICATION** against full Pergub text and KKOP.
4. Precise KKOP elevation ceiling at a given point (vs. the current overlap-flag screening) — **PLANNED PASS 3**.
5. Exact KODZON meaning for the small number of codes with no live sample feature found in spot-checks (see DATA-SOURCES.md) — left unconfirmed rather than guessed.
6. Airport-specific KKOP decree numbers for Halim Perdanakusuma and Pondok Cabe were found only in secondary sources (academic citations, news), not independently verified against JDIH primary text.

## 10. Official Source Links

- Pergub DKI Jakarta No. 31/2022 (RDTR & Peraturan Zonasi): https://peraturan.bpk.go.id/Download/279796/pergub-jakarta-no-31-tahun-2022-tentang-rdtr-zonasi.pdf
- Jakarta Satu Geoportal: https://jakartasatu.jakarta.go.id/geoportal/peta/jakarta
- Jakarta Satu ArcGIS REST services root: https://jakartasatu.jakarta.go.id/server/rest/services
- Permen PUPR No. 28/PRT/M/2015 (sempadan sungai/danau): https://peraturan.bpk.go.id/Home/Details/159992/permen-pupr-no-28prtm2015-tahun-2015
- SNI 03-7112-2005 / KM 44 Tahun 2005 (KKOP standard): referenced via secondary academic/administrative sources; primary PDF not independently re-verified in this pass.
- KM 14 Tahun 2010 (KKOP Soekarno-Hatta): scanned copy located via secondary source (Scribd) — https://www.scribd.com/doc/76118503/
- Open Data Jakarta (road lists): https://data.jakarta.go.id
- InaRISK / BNPB flood data (independent cross-check source, not used as primary in Pass 1-2): https://inarisk.bnpb.go.id/portal/Unduh
