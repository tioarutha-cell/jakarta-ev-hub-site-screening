import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchAllFeatures } from "./lib/arcgis.mjs";

// Layer id 3 = "Resiko Banjir" (flood risk), confirmed via service metadata query
// on 2026-09-25 against the Resiko_Bencana MapServer (which also holds earthquake
// [id 1] and epidemic [id 2] risk layers, not used here).
const LAYER_URL = "https://jakartasatu.jakarta.go.id/server/rest/services/Resiko_Bencana/MapServer/3";

const OUT_DIR = path.resolve("raw-data");
const OUT_FILE = path.join(OUT_DIR, "flood-risk.geojson");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching flood risk (Resiko Banjir) from ${LAYER_URL}`);
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
    dataset: "Resiko Banjir (Flood Risk)",
    accessedAt: new Date().toISOString(),
    confidence: "High — official government GIS service, live-queried",
    featureCount: fc.features.length
  };

  await writeFile(OUT_FILE, JSON.stringify(fc));
  console.log(`Wrote ${fc.features.length} features to ${OUT_FILE}`);
  if (fc.features[0]) {
    console.log("Sample properties:", JSON.stringify(fc.features[0].properties));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
