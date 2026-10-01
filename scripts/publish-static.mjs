import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import * as turf from "@turf/turf";

const RAW_DIR = path.resolve("raw-data");
const OUT_DIR = path.resolve("public/map-data");

// Admin boundaries carry far more vertex detail than needed for web display at
// city/kecamatan zoom levels; kelurahan raw was ~11MB for 267 features.
const ADMIN_SIMPLIFY_TOLERANCE = 0.0002;

async function loadJSON(file) {
  return JSON.parse(await readFile(path.join(RAW_DIR, file), "utf8"));
}

function simplifyFC(fc, tolerance) {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f) => {
      try {
        return turf.simplify(f, { tolerance, highQuality: false });
      } catch {
        return f;
      }
    }),
    metadata: fc.metadata
  };
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const [inFile, outFile] of [
    ["admin-kota.geojson", "admin-kota.geojson"],
    ["admin-kecamatan.geojson", "admin-kecamatan.geojson"],
    ["admin-kelurahan.geojson", "admin-kelurahan.geojson"]
  ]) {
    const fc = await loadJSON(inFile);
    const simplified = simplifyFC(fc, ADMIN_SIMPLIFY_TOLERANCE);
    await writeFile(path.join(OUT_DIR, outFile), JSON.stringify(simplified));
    const sizeKB = (JSON.stringify(simplified).length / 1024).toFixed(0);
    console.log(`${outFile}: ${simplified.features.length} features, ~${sizeKB} KB`);
  }

  // KKOP is already small (210 features) — copy as-is.
  const kkop = await loadJSON("kkop.geojson");
  await writeFile(path.join(OUT_DIR, "kkop.geojson"), JSON.stringify(kkop));
  console.log(`kkop.geojson: ${kkop.features.length} features`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
