import { readFile, mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import * as turf from "@turf/turf";
import Parser from "stream-json";
import { pick } from "stream-json/filters/pick.js";
import { streamArray } from "stream-json/streamers/stream-array.js";
import { evaluateSite } from "../src/scoring/score.js";
import { DEFAULT_SCENARIO } from "../src/state/scenario.js";
import { writeGeoJSONStream } from "./lib/streamWrite.mjs";

const RAW_DIR = path.resolve("raw-data");
// Written under public/ so Vite's dev server and static build serve it directly at
// /map-data/*. The canonical dataset name/location documented in METHODOLOGY.md and
// DATA-SOURCES.md is "map-data/" — it lives inside public/ purely for Vite's static
// file serving, not a change in meaning.
const OUT_DIR = path.resolve("public/map-data");

// ~9m at Jakarta's latitude. Raised from 0.00003 (~3m) specifically to get the
// shipped file under GitHub's 100MB single-file push limit (needed for GitHub Pages
// hosting) — also a straightforward web-performance win either way. Documented in
// METHODOLOGY.md.
const SIMPLIFY_TOLERANCE = 0.00008;

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
function slimProperties(props, evaluation) {
  return {
    OBJECTID: props.OBJECTID,
    NAMOBJ: props.NAMOBJ,
    KODZON: props.KODZON,
    KODSZN: props.KODSZN,
    KODSZNTEXT: props.KODSZNTEXT,
    WADMKK: props.WADMKK,
    WADMKC: props.WADMKC,
    WADMKD: props.WADMKD,
    LUASHA: props.LUASHA,
    KKOP_1: props.KKOP_1,
    KSMPDN: props.KSMPDN,
    KRB_03: props.KRB_03,
    CAGBUD: props.CAGBUD,
    HANKAM: props.HANKAM,
    RESAIR: props.RESAIR,
    KKARST: props.KKARST,
    LP2B_2: props.LP2B_2,
    TOD_04: props.TOD_04,
    TEB_05: props.TEB_05,
    classification: evaluation.classification,
    compositeScore: evaluation.compositeScore,
    landUseGate: evaluation.gates.landUse.gate,
    useCategories: JSON.stringify(
      evaluation.gates.landUse.categories?.map((c) => ({ id: c.id, s: c.status, t: c.matchedTerm })) ??
        []
    ),
    heightGate: evaluation.gates.height.gate,
    estimatedMaxHeightM: evaluation.gates.height.estimatedMaxHeightM,
    requiredKLB: evaluation.gates.intensity.klb.requiredKLB,
    resolvedKLB: evaluation.gates.intensity.klb.value,
    resolvedKDB: evaluation.gates.intensity.kdb.value,
    resolvedKDH: evaluation.gates.intensity.kdh.value,
    kkopStatus: evaluation.gates.kkop.status,
    setbackStatus: evaluation.gates.setback.status,
    specialFlags: evaluation.gates.specialFlags.join(" | "),
    floodClass: evaluation.gates.flood.class
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

        stats.classCounts[evaluation.classification] = (stats.classCounts[evaluation.classification] || 0) + 1;

        yield {
          type: "Feature",
          geometry: simplified.geometry,
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
