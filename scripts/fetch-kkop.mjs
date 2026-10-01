import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchAllFeatures } from "./lib/arcgis.mjs";

const LAYER_URL =
  "https://jakartasatu.jakarta.go.id/server/rest/services/Kawasan_Keselamatan_Operasi_Penerbangan/MapServer/0";

const OUT_DIR = path.resolve("raw-data");
const OUT_FILE = path.join(OUT_DIR, "kkop.geojson");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching KKOP aviation obstacle-limitation surfaces from ${LAYER_URL}`);
  const fc = await fetchAllFeatures(LAYER_URL, {
    where: "1=1",
    outFields: "*",
    outSR: 4326,
    onProgress: (loaded, total) => {
      process.stdout.write(`\r  ${loaded}${total ? ` / ${total}` : ""} features`);
    }
  });
  process.stdout.write("\n");

  fc.metadata = {
    source: "Jakarta Satu Geoportal (DKI Jakarta Provincial Government)",
    service: LAYER_URL,
    dataset: "Kawasan Keselamatan Operasi Penerbangan (KKOP)",
    regulation:
      "SNI 03-7112-2005 (KKOP surface geometry standard); airport-specific KKOP decrees (e.g. KM 14 Tahun 2010 for Soekarno-Hatta)",
    accessedAt: new Date().toISOString(),
    confidence: "High — official government GIS service, live-queried (not a reconstruction)",
    featureCount: fc.features.length
  };

  await writeFile(OUT_FILE, JSON.stringify(fc));
  console.log(`Wrote ${fc.features.length} features to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
