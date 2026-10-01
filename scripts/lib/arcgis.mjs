import { setDefaultResultOrder } from "node:dns";

// Node's undici fetch prefers IPv6 first, which times out against this host from this
// network. Force IPv4 resolution so requests actually connect.
setDefaultResultOrder("ipv4first");

const DEFAULT_TIMEOUT_MS = 25000;
const MAX_RETRIES = 6;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The jakartasatu.jakarta.go.id server intermittently refuses/times out the initial
// TCP connection (observed even with IPv4 forced) but succeeds on retry. Retry with
// backoff rather than failing the whole pull over a transient connect error.
async function fetchJson(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let lastErr;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
      }
      const json = await res.json();
      if (json.error) {
        throw new Error(`ArcGIS error ${json.error.code}: ${json.error.message} for ${url}`);
      }
      return json;
    } catch (err) {
      lastErr = err;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw new Error(`Failed after ${MAX_RETRIES} attempts: ${lastErr?.message} for ${url}`);
}

/**
 * Fetch every feature from an ArcGIS MapServer/FeatureServer layer query endpoint,
 * paginating with resultOffset/resultRecordCount until exhausted.
 *
 * @param {string} layerUrl e.g. ".../MapServer/0"
 * @param {object} opts
 * @param {string} [opts.where] SQL-ish where clause, default "1=1"
 * @param {string} [opts.outFields] comma-separated fields, default "*"
 * @param {number} [opts.outSR] output spatial reference wkid, default 4326
 * @param {number} [opts.pageSize] override page size (else read from service maxRecordCount)
 * @param {(loaded:number, total:number|null) => void} [opts.onProgress]
 * @returns {Promise<{type:"FeatureCollection", features: any[]}>}
 */
export async function fetchAllFeatures(layerUrl, opts = {}) {
  const {
    where = "1=1",
    outFields = "*",
    outSR = 4326,
    pageSize: pageSizeOverride,
    onProgress
  } = opts;

  const meta = await fetchJson(`${layerUrl}?f=json`);
  const maxRecordCount = pageSizeOverride || meta.maxRecordCount || 1000;

  const countParams = new URLSearchParams({
    where,
    returnCountOnly: "true",
    f: "json"
  });
  const countRes = await fetchJson(`${layerUrl}/query?${countParams.toString()}`);
  const total = typeof countRes.count === "number" ? countRes.count : null;

  const allFeatures = [];
  let offset = 0;
  let pageSize = maxRecordCount;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({
      where,
      outFields,
      outSR: String(outSR),
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "geojson"
    });
    let page;
    try {
      page = await fetchJson(`${layerUrl}/query?${params.toString()}`);
    } catch (err) {
      // Some pages trigger a persistent server-side 500 (observed on this service),
      // not a transient connect error — retrying the identical request just fails
      // again. Shrink the page size for this offset and keep going rather than
      // aborting the whole multi-hour pull.
      if (pageSize > 100) {
        pageSize = Math.max(100, Math.floor(pageSize / 4));
        console.warn(`\n  Page at offset ${offset} failed (${err.message.split("\n")[0]}); retrying with smaller page size ${pageSize}`);
        continue;
      }
      throw err;
    }
    const features = page.features || [];
    allFeatures.push(...features);
    offset += features.length;
    if (onProgress) onProgress(allFeatures.length, total);
    const isLastPage = features.length < pageSize;
    // Restore full page size once we've moved past the problem region.
    if (pageSize < maxRecordCount) pageSize = maxRecordCount;
    if (isLastPage || features.length === 0) break;
  }

  return { type: "FeatureCollection", features: allFeatures };
}

export async function fetchLayerMeta(layerUrl) {
  return fetchJson(`${layerUrl}?f=json`);
}

export { fetchJson };
