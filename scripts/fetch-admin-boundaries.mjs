import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchAllFeatures } from "./lib/arcgis.mjs";

const SERVICE_URL =
  "https://jakartasatu.jakarta.go.id/server/rest/services/Batas_Administrasi_Update/Batas_Administrasi_DKI_Jakarta_Update_View/MapServer";

// Layer ids confirmed via service metadata query on 2026-09-25.
const LAYERS = [
  { id: 5, name: "kota", label: "Batas Administrasi Kabupaten/Kota" },
  { id: 4, name: "kecamatan", label: "Batas Administrasi Kecamatan" },
  { id: 3, name: "kelurahan", label: "Batas Administrasi Kelurahan" }
];

const OUT_DIR = path.resolve("raw-data");

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  for (const layer of LAYERS) {
    const layerUrl = `${SERVICE_URL}/${layer.id}`;
    console.log(`Fetching ${layer.label} from ${layerUrl}`);
    const fc = await fetchAllFeatures(layerUrl, {
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
      service: layerUrl,
      dataset: layer.label,
      accessedAt: new Date().toISOString(),
      confidence: "High — official government GIS service, live-queried",
      featureCount: fc.features.length
    };

    const outFile = path.join(OUT_DIR, `admin-${layer.name}.geojson`);
    await writeFile(outFile, JSON.stringify(fc));
    console.log(`Wrote ${fc.features.length} features to ${outFile}`);
    if (fc.features[0]) {
      console.log("Sample properties:", Object.keys(fc.features[0].properties || {}).join(", "));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
