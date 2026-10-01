export interface LocalIndexEntry {
  name: string;
  type: "Kecamatan" | "Kelurahan";
  center: [number, number];
}

export interface SearchResult {
  label: string;
  sublabel: string;
  center: [number, number];
  source: "local" | "nominatim";
}

const JAKARTA_VIEWBOX = "106.65,-6.42,107.0,-5.95"; // left,top,right,bottom-ish for Nominatim viewbox (lon,lat pairs)

let debounceTimer: number | undefined;

export function renderSearch(container: HTMLElement, localIndex: LocalIndexEntry[], onSelect: (r: SearchResult) => void) {
  container.innerHTML = `
    <input type="text" id="search-input" placeholder="Search kecamatan, kelurahan, street, landmark, or coordinates..." autocomplete="off" />
    <div id="search-results" style="position:relative;"></div>
  `;
  const input = container.querySelector("#search-input") as HTMLInputElement;
  const resultsEl = document.createElement("div");
  resultsEl.style.cssText =
    "position:absolute; top:46px; left:0; width:420px; background:var(--bg-2); border:1px solid var(--border); border-radius:4px; max-height:320px; overflow-y:auto; z-index:40; display:none;";
  container.appendChild(resultsEl);

  function showResults(results: SearchResult[]) {
    if (results.length === 0) {
      resultsEl.style.display = "none";
      return;
    }
    resultsEl.innerHTML = results
      .map(
        (r, i) =>
          `<div class="search-result-item" data-idx="${i}" style="padding:7px 10px; cursor:pointer; border-bottom:1px solid var(--border); font-size:12px;">
            <div style="color:var(--text-0)">${r.label}</div>
            <div style="color:var(--text-2); font-size:10.5px;">${r.sublabel}</div>
          </div>`
      )
      .join("");
    resultsEl.style.display = "block";
    resultsEl.querySelectorAll<HTMLElement>(".search-result-item").forEach((el) => {
      el.addEventListener("mouseenter", () => (el.style.background = "var(--bg-3)"));
      el.addEventListener("mouseleave", () => (el.style.background = "transparent"));
      el.addEventListener("click", () => {
        onSelect(results[Number(el.dataset.idx)]);
        resultsEl.style.display = "none";
        input.value = results[Number(el.dataset.idx)].label;
      });
    });
  }

  async function search(query: string) {
    const q = query.trim();
    if (q.length < 2) {
      showResults([]);
      return;
    }

    // Coordinate input: "lat, lon" or "lat lon"
    const coordMatch = q.match(/^(-?\d+\.?\d*)\s*[, ]\s*(-?\d+\.?\d*)$/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lon = parseFloat(coordMatch[2]);
      showResults([{ label: `${lat.toFixed(5)}, ${lon.toFixed(5)}`, sublabel: "Coordinates", center: [lon, lat], source: "local" }]);
      return;
    }

    const qLower = q.toLowerCase();
    const localMatches: SearchResult[] = localIndex
      .filter((e) => e.name.toLowerCase().includes(qLower))
      .slice(0, 8)
      .map((e) => ({ label: e.name, sublabel: e.type, center: e.center, source: "local" }));

    let nominatimMatches: SearchResult[] = [];
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
        q + ", Jakarta, Indonesia"
      )}&viewbox=${JAKARTA_VIEWBOX}&bounded=1&limit=5`;
      const res = await fetch(url, { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        nominatimMatches = data.map((d: any) => ({
          label: d.display_name.split(",").slice(0, 2).join(","),
          sublabel: d.display_name,
          center: [parseFloat(d.lon), parseFloat(d.lat)] as [number, number],
          source: "nominatim" as const
        }));
      }
    } catch {
      // Nominatim unavailable — local index results still work.
    }

    showResults([...localMatches, ...nominatimMatches]);
  }

  input.addEventListener("input", () => {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => search(input.value), 300);
  });

  input.addEventListener("blur", () => {
    window.setTimeout(() => (resultsEl.style.display = "none"), 150);
  });
}
