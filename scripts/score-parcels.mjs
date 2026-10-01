import { readFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";
import Parser from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { evaluateSite } from "../src/scoring/score.js";
import { CATEGORY_CODE } from "../src/scoring/zoningRules.js";
import { DEFAULT_SCENARIO } from "../src/state/scenario.js";
import { writeGeoJSONStream } from "./lib/streamWrite.mjs";

const RAW_DIR = path.resolve("raw-data");
// Written under public/ so Vite's dev server and static build serve it directly at
// /map-data/*. The canonical dataset name/location documented in METHODOLOGY.md and
// DATA-SOURCES.md is "map-data/" — it lives inside public/ purely for Vite's static
// file serving, not a change in meaning.
const OUT_DIR = path.resolve("public/map-data");

// ~13m at Jakarta's latitude. Raised from 0.00003 (~3m) specifically to get the
// shipped file under GitHub's 100MB single-file push limit (needed for GitHub Pages
// hosting) — also a straightforward web-performance win either way. Documented in
// METHODOLOGY.md.
const SIMPLIFY_TOLERANCE = 0.00012;

// The raw RDTR pull is ~1.4GB — well past V8's safe max string length, so it cannot
// be read with readFile()+JSON.parse() (that's exactly the failure the streamed
// *writer* in fetch-rdtr.mjs was built to avoid on the way out; the same limit
// applies on the way back in). Stream-parse it feature-by-feature instead.
async function* streamFeatures(filePath) {
  const input = createReadStream(filePath);
  const pipeline = input
    .pipe(Parser())
    .pipe(pick.asStream({ filter: "features" }))
    .pipe(streamArray.asStream());
  for await (const { value } of pipeline) {
    yield value;
  }
}

async function loadJSON(file) {
  return JSON.parse(await readFile(path.join(RAW_DIR, file), "utf8"));
}

// The RDTR layer's WADMKD is prefixed ("Kelurahan Bukit Duri") while the flood-risk
// layer's WADMKD is not ("Kamal Muara") — confirmed by directly sampling both
// services. Normalize both to the bare kelurahan name before joining.
function normalizeKelurahan(name) {
  return (name || "").replace(/^Kelurahan\s+/i, "").trim().toLowerCase();
}

function buildFloodIndex(floodFC) {
  const byKelurahan = new Map();
  for (const f of floodFC.features) {
    const kd = normalizeKelurahan(f.properties.WADMKD);
    if (!byKelurahan.has(kd)) byKelurahan.set(kd, []);
    byKelurahan.get(kd).push(f);
  }
  return byKelurahan;
}

function lookupFlood(centroid, wadmkd, floodIndex) {
  const candidates = floodIndex.get(normalizeKelurahan(wadmkd));
  if (!candidates || candidates.length === 0) return null;
  for (const poly of candidates) {
    try {
      if (turf.booleanPointInPolygon(centroid, poly)) {
        return poly.properties.KELAS ?? null;
      }
    } catch {
      // malformed geometry; skip
    }
  }
  return null;
}

// Coordinates arrive with ~15-17 significant digits of floating-point noise from
// reprojection/turf.simplify (e.g. 106.85818277499999) — far beyond any meaningful
// precision (6 decimal places is ~11cm). Rounding is a pure size win with no visible
// effect at any zoom level this tool supports.
function roundCoords(coords) {
  if (typeof coords[0] === "number") {
    return coords.map((n) => Math.round(n * 1e6) / 1e6);
  }
  return coords.map(roundCoords);
}

// Most zones have no special-area overlay — ship undefined (omitted by
// JSON.stringify) instead of the literal "Tidak Ada" string. Every reader of these
// fields already treats a falsy/absent value the same as "Tidak Ada" (see gates.js),
// so this is a pure size win, not a behavior change.
function flag(v) {
  return v && v !== "Tidak Ada" ? v : undefined;
}

// Fields retained on the shipped feature: identifiers, display fields, resolved
// (numeric) intensity values, and the special-area overlay flags. Two categories of
// data are deliberately NOT shipped raw on all 109k features, to keep the bulk
// dataset loadable in a browser (spec §32 — a 205MB first pass of this file, before
// this trim, made an unacceptably slow initial load):
//   1. The very long IZN/BST/TBS/TBT permitted-use lists (>1KB of Indonesian text
//      per feature) — the precomputed per-category classification (small) is
//      shipped instead, citing which regulation term matched.
//   2. The raw KDB/KLB/KTB/KDH text fields (also long, especially the tiered
//      residential brackets) and the human-readable landUseReason/kkopDetail/
//      setbackDetail sentences — these are either unused by the current UI
//      (raw KDB/KLB/KTB/KDH; resolvedKDB/KLB/KDH already carry the number the UI
//      needs) or fully deterministic from fields already shipped (the sentences are
//      regenerated client-side in src/scoring/rescore.ts from landUseGate/
//      useCategories/kkopStatus/KKOP_1/setbackStatus/KSMPDN). Full raw text remains
//      available in raw-data/rdtr-2022.geojson and is reproducible via
//      `npm run process:score` — nothing is lost, only de-duplicated. See
//      METHODOLOGY.md.
// Shipped property keys are short codes, NOT the application's real field names —
// src/main.ts's expandProperties() renames every one of these back to its full name
// (see the EXPAND_KEYS map there) immediately after fetch, before the data reaches
// any other module. Every other consumer (rescore.ts, sitePanel.ts, explain.ts,
// layers.ts) only ever sees the expanded, full-name version and has no knowledge of
// this wire encoding. Keep this object's keys and main.ts's EXPAND_KEYS in sync.
function slimProperties(props, evaluation) {
  return {
    OBJECTID: props.OBJECTID,
    NAMOBJ: props.NAMOBJ,
    KODZON: props.KODZON,
    KODSZNTEXT: props.KODSZNTEXT,
    WADMKK: props.WADMKK,
    WADMKC: props.WADMKC,
    WADMKD: props.WADMKD,
    KKOP_1: flag(props.KKOP_1),
    KSMPDN: flag(props.KSMPDN),
    KRB_03: flag(props.KRB_03),
    CAGBUD: flag(props.CAGBUD),
    HANKAM: flag(props.HANKAM),
    RESAIR: flag(props.RESAIR),
    KKARST: flag(props.KKARST),
    LP2B_2: flag(props.LP2B_2),
    TOD_04: flag(props.TOD_04),
    TEB_05: flag(props.TEB_05),
    cls: evaluation.classification, // classification
    score: evaluation.compositeScore, // compositeScore
    lug: evaluation.gates.landUse.gate, // landUseGate
    // The specific regulation term matched (c.matchedTerm) is not shipped: no
    // current UI reads it (only id + status drive the panel), and across 109k
    // features it was the single largest contributor to file size. It remains
    // fully reproducible from raw-data/rdtr-2022.geojson's IZN/BST/TBS/TBT fields
    // via `npm run process:score` if a future UI needs to cite it. Category ids are
    // also coded down to 2 letters (CATEGORY_CODE) for the same reason.
    uses: JSON.stringify(
      evaluation.gates.landUse.categories?.map((c) => ({ id: CATEGORY_CODE[c.id] ?? c.id, s: c.status })) ?? []
    ), // useCategories
    hg: evaluation.gates.height.gate, // heightGate
    // requiredKLB is NOT shipped: it's purely scenario-derived (storeys x KDB), and
    // the client's rescore.ts always recomputes it live from resolvedKDB — shipping
    // the default-scenario value here would be dead weight, never read.
    maxH:
      evaluation.gates.height.estimatedMaxHeightM != null
        ? Math.round(evaluation.gates.height.estimatedMaxHeightM * 100) / 100
        : null, // estimatedMaxHeightM
    klb: evaluation.gates.intensity.klb.value, // resolvedKLB
    kdb: evaluation.gates.intensity.kdb.value, // resolvedKDB
    kdh: evaluation.gates.intensity.kdh.value, // resolvedKDH
    kkop: evaluation.gates.kkop.status, // kkopStatus
    sb: evaluation.gates.setback.status, // setbackStatus
    flags: evaluation.gates.specialFlags.join(" | ") || undefined, // specialFlags
    flood: evaluation.gates.flood.class // floodClass
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Loading flood-risk data (small; loaded whole)...");
  const flood = await loadJSON("flood-risk.geojson");
  const floodIndex = buildFloodIndex(flood);

  const stats = { processed: 0, errors: 0, classCounts: {} };

  async function* scoredFeatures() {
    for await (const f of streamFeatures(path.join(RAW_DIR, "rdtr-2022.geojson"))) {
      stats.processed++;
      if (stats.processed % 10000 === 0) {
        process.stdout.write(`\r  ${stats.processed} / 109002`);
      }
      try {
        let centroid;
        try {
          centroid = turf.centroid(f);
        } catch {
          stats.errors++;
          continue;
        }
        const floodClass = lookupFlood(centroid, f.properties.WADMKD, floodIndex);
        const scenario = { ...DEFAULT_SCENARIO, floodClass };
        const evaluation = evaluateSite(f.properties, scenario);

        let simplified = f;
        try {
          simplified = turf.simplify(f, { tolerance: SIMPLIFY_TOLERANCE, highQuality: false });
        } catch {
          simplified = f;
        }
        const geometry = {
          ...simplified.geometry,
          coordinates: roundCoords(simplified.geometry.coordinates)
        };

        stats.classCounts[evaluation.classification] = (stats.classCounts[evaluation.classification] || 0) + 1;

        yield {
          type: "Feature",
          geometry,
          properties: slimProperties(f.properties, evaluation)
        };
      } catch (err) {
        stats.errors++;
      }
    }
  }

  console.log("Streaming, scoring, and simplifying RDTR polygons (this reads a ~1.4GB file; a few minutes)...");
  const outFile = path.join(OUT_DIR, "rdtr-scored.geojson");
  await writeGeoJSONStream(outFile, scoredFeatures(), {
    source: "Jakarta Satu Geoportal (DKI Jakarta Provincial Government)",
    dataset: "Rencana Pola Ruang RDTR WP DKI Jakarta 2022 — scored",
    regulation: "Peraturan Gubernur DKI Jakarta No. 31 Tahun 2022 tentang Rencana Detail Tata Ruang dan Peraturan Zonasi",
    scenarioUsedForPrecomputedScore: DEFAULT_SCENARIO,
    simplifyToleranceDeg: SIMPLIFY_TOLERANCE,
    generatedAt: new Date().toISOString(),
    note:
      "compositeScore/classification are precomputed for the default 23m/4-storey scenario. The client recomputes gates live when the user changes scenario inputs, using the same fields shipped here."
  });

  process.stdout.write(`\r  ${stats.processed} / 109002\n`);
  console.log(`Wrote ${stats.processed - stats.errors} scored features to ${outFile} (${stats.errors} skipped due to geometry errors)`);
  console.log("Classification breakdown:", JSON.stringify(stats.classCounts));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
