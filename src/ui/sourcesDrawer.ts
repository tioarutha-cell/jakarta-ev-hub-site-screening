interface SourceEntry {
  dataset: string;
  source: string;
  regulation: string;
  dataYear: string;
  accessedDate: string;
  confidence: "High" | "Medium" | "Low";
  type: string;
  notes: string;
}

const SOURCES: SourceEntry[] = [
  {
    dataset: "Rencana Pola Ruang RDTR WP DKI Jakarta 2022 (zoning, KDB, KLB, KTB, KDH, permitted-use lists, KKOP/setback/heritage/disaster overlay flags)",
    source: "Jakarta Satu Geoportal — jakartasatu.jakarta.go.id (DKI Jakarta Provincial Government), ArcGIS Server REST service",
    regulation: "Peraturan Gubernur DKI Jakarta No. 31 Tahun 2022 tentang Rencana Detail Tata Ruang dan Peraturan Zonasi",
    dataYear: "2022",
    accessedDate: "2026-09-25",
    confidence: "High",
    type: "Official GIS — live-queried, not a scraped/reconstructed copy",
    notes:
      "Permitted-use classification (Allowed/Conditional/Uncertain/Excluded) is computed by keyword-matching the EV-hub development mix against this feature's own IZN/BST/TBS/TBT fields, which contain the regulation's use-list text verbatim. Building height limit is NOT a field in this layer — height compatibility is an engineering estimate derived from each zone's own KLB/KDB, not a cited regulatory ceiling."
  },
  {
    dataset: "Batas Administrasi DKI Jakarta (Kota/Kabupaten, Kecamatan, Kelurahan boundaries)",
    source: "Jakarta Satu Geoportal — jakartasatu.jakarta.go.id, ArcGIS Server REST service",
    regulation: "Administrative boundary of record maintained by DKI Jakarta Provincial Government",
    dataYear: "Current (service-maintained)",
    accessedDate: "2026-09-25",
    confidence: "High",
    type: "Official GIS — live-queried",
    notes: "6 kota/kabupaten, 44 kecamatan, 267 kelurahan — counts match DKI Jakarta's official administrative structure."
  },
  {
    dataset: "Kawasan Keselamatan Operasi Penerbangan (KKOP) — aviation obstacle limitation surfaces",
    source: "Jakarta Satu Geoportal — jakartasatu.jakarta.go.id, ArcGIS Server REST service",
    regulation:
      "SNI 03-7112-2005 (KKOP surface geometry standard); airport-specific KKOP decrees (e.g. KM 14 Tahun 2010 for Soekarno-Hatta)",
    dataYear: "Service-maintained",
    accessedDate: "2026-09-25",
    confidence: "High",
    type: "Official GIS — live-queried surface geometry with elevation fields (not a manually reconstructed approximation)",
    notes:
      "Pass 1-2 uses the RDTR layer's own KKOP_1 overlap flag per zone as a screening indicator. Precise elevation-limit cross-referencing against this layer's ELEVASI/ELEVASIMSL fields is planned for Pass 3."
  },
  {
    dataset: "Resiko Banjir (Flood Risk)",
    source: "Jakarta Satu Geoportal — jakartasatu.jakarta.go.id, ArcGIS Server REST service (Resiko_Bencana)",
    regulation: "N/A — hazard assessment layer, not a zoning regulation",
    dataYear: "Service-maintained",
    accessedDate: "2026-09-25",
    confidence: "High",
    type: "Official GIS — live-queried",
    notes:
      "Joined to each RDTR polygon by kelurahan match + point-in-polygon test on the polygon centroid. Used as an engineering/CAPEX penalty in the composite score, not a hard exclusion, per spec."
  },
  {
    dataset: "Road hierarchy, truck access, fire access",
    source: "Not yet integrated",
    regulation: "Open Data Jakarta arteri/kolektor road lists; SNI 03-1735-2000 (fire access); OSM as supplementary",
    dataYear: "—",
    accessedDate: "—",
    confidence: "Low",
    type: "Planned — Pass 3+",
    notes: "Toggle is present in the filter panel but has no effect yet. Access is excluded from the composite score (weights renormalized) rather than silently scored as 0."
  },
  {
    dataset: "River/coastal setbacks (precise geometry), special utility corridors",
    source: "Not yet integrated as separate buffered geometry",
    regulation: "Permen PUPR No. 28/PRT/M/2015 (sempadan sungai/danau)",
    dataYear: "—",
    accessedDate: "—",
    confidence: "Medium",
    type: "Partially available — the RDTR layer's own KSMPDN field flags zones already designated as sempadan corridors; a separately buffered river-centerline layer is planned for Pass 3.",
    notes: ""
  }
];

export function renderSourcesDrawer(container: HTMLElement) {
  container.innerHTML = `
    <button class="drawer-close" id="sources-close">Close</button>
    <h2>Data &amp; Regulations</h2>
    ${SOURCES.map(
      (s) => `
      <div class="source-card">
        <h3>${s.dataset}</h3>
        <div class="data-row"><span class="k">Source</span><span class="v">${s.source}</span></div>
        <div class="data-row"><span class="k">Regulation</span><span class="v">${s.regulation}</span></div>
        <div class="data-row"><span class="k">Data year</span><span class="v">${s.dataYear}</span></div>
        <div class="data-row"><span class="k">Accessed</span><span class="v">${s.accessedDate}</span></div>
        <div class="data-row"><span class="k">Confidence</span><span class="v">${s.confidence}</span></div>
        <div class="data-row"><span class="k">Type</span><span class="v">${s.type}</span></div>
        ${s.notes ? `<div class="reg-note">${s.notes}</div>` : ""}
      </div>`
    ).join("")}
  `;
  container.querySelector("#sources-close")?.addEventListener("click", () => {
    container.classList.add("hidden");
  });
}
