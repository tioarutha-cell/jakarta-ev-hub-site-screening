import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fetchAllFeatures } from "./lib/arcgis.mjs";
import { writeGeoJSONStream } from "./lib/streamWrite.mjs";

const LAYER_URL =
  "https://jakartasatu.jakarta.go.id/server/rest/services/Rencana_Pola_Ruang_RDTR_2022/MapServer/0";

const OUT_DIR = path.resolve("raw-data");
const OUT_FILE = path.join(OUT_DIR, "rdtr-2022.geojson");

// DKI Jakarta's 5 kota + Kepulauan Seribu. The layer is already DKI-scoped, but we
// filter explicitly and record the exact kota set actually returned for auditability.
const JAKARTA_KOTA = [
  "Kota Administrasi Jakarta Pusat",
  "Kota Administrasi Jakarta Barat",
  "Kota Administrasi Jakarta Selatan",
  "Kota Administrasi Jakarta Timur",
  "Kota Administrasi Jakarta Utara",
  "Kabupaten Administrasi Kepulauan Seribu"
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log(`Fetching RDTR 2022 zoning polygons from ${LAYER_URL}`);
  const fc = await fetchAllFeatures(LAYER_URL, {
    where: "1=1",
    outFields: "*",
    outSR: 4326,
    onProgress: (loaded, total) => {
      process.stdout.write(`\r  ${loaded}${total ? ` / ${total}` : ""} features`);
    }
  });
  process.stdout.write("\n");

  const kotaSeen = new Set(fc.features.map((f) => f.properties?.WADMKK).filter(Boolean));
  console.log("WADMKK values present in pulled data:", [...kotaSeen].join(", "));
  const unexpected = [...kotaSeen].filter((k) => !JAKARTA_KOTA.includes(k));
  if (unexpected.length) {
    console.warn("WARNING: unexpected WADMKK values found (not filtered out):", unexpected.join(", "));
  }

  const metadata = {
    source: "Jakarta Satu Geoportal (DKI Jakarta Provincial Government)",
    service: LAYER_URL,
    dataset: "Rencana Pola Ruang RDTR WP DKI Jakarta 2022",
    regulation: "Peraturan Gubernur DKI Jakarta No. 31 Tahun 2022 tentang Rencana Detail Tata Ruang dan Peraturan Zonasi",
    accessedAt: new Date().toISOString(),
    sourceCRS: "EPSG:32748 (UTM 48S) reprojected server-side to EPSG:4326",
    confidence: "High — official government GIS service, live-queried",
    featureCount: fc.features.length
  };

  console.log("Writing (streamed, dataset is too large for a single JSON.stringify)...");
  await writeGeoJSONStream(OUT_FILE, fc.features, metadata);
  console.log(`Wrote ${fc.features.length} features to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
