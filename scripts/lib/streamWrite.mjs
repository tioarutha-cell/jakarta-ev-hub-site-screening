import { createWriteStream } from "node:fs";

/**
 * Write a large FeatureCollection to disk by streaming each feature's JSON
 * individually. A single JSON.stringify() over the whole collection can exceed
 * V8's max string length for very large datasets (observed with the 109k-feature
 * RDTR pull, whose IZN/BST/TBS/TBT text fields make individual features large).
 *
 * `features` may be a plain array OR an async iterable (e.g. a generator that reads
 * and transforms features one at a time), so the whole dataset never has to be
 * materialized in memory as one array either.
 */
export async function writeGeoJSONStream(outFile, features, metadata) {
  await new Promise(async (resolve, reject) => {
    const stream = createWriteStream(outFile, { encoding: "utf8" });
    stream.on("error", reject);
    stream.on("finish", resolve);

    try {
      stream.write('{"type":"FeatureCollection","features":[');
      let i = 0;
      for await (const feature of features) {
        if (i > 0) stream.write(",");
        // Backpressure: wait for drain if the write buffer is full, so a fast
        // producer (or fast generator) doesn't balloon memory ahead of disk I/O.
        const ok = stream.write(JSON.stringify(feature));
        if (!ok) await new Promise((r) => stream.once("drain", r));
        i++;
      }
      stream.write("],");
      stream.write(`"metadata":${JSON.stringify({ ...metadata, featureCount: i })}`);
      stream.write("}");
      stream.end();
    } catch (err) {
      stream.destroy(err);
      reject(err);
    }
  });
}
