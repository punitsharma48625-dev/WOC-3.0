(() => {
  const PAGE_SIZE = 50;
  const $ = (id) => document.getElementById(id);
  const state = { tabs: [], tab: null, rows: [], columns: [], sort: null, direction: 1, page: 0, query: "", format: "", loading: false };
  const tabsEl = $("tabs"), table = $("stats-table"), thead = table.querySelector("thead"), tbody = table.querySelector("tbody");
  const esc = (value) => String(value ?? "");

  function parseCSV(text) {
    const rows = []; let row = [], cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell.replace(/\r$/, "")); if (row.some((v) => v !== "")) rows.push(row); row = []; cell = ""; }
      else cell += ch;
    }
    row.push(cell.replace(/\r$/, "")); if (row.some((v) => v !== "")) rows.push(row);
    if (!rows.length) return { columns: [], records: [] };
    const columns = rows.shift(); columns[0] = columns[0].replace(/^\uFEFF/, "");
    return { columns, records: rows.map((values) => Object.fromEntries(columns.map((c, i) => [c, values[i] ?? ""]))) };
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    for (const tab of state.tabs) {
      const button = document.createElement("button"); button.type = "button"; button.className = `tab${state.tab?.id === tab.id ? " active" : ""}`;
      button.textContent = tab.label; button.title = tab.description; button.setAttribute("aria-pressed", String(state.tab?.id === tab.id));
      button.addEventListener("click", () => selectTab(tab)); tabsEl.append(button);
    }
  }

  async function selectTab(tab) {
    if (state.loading && state.tab?.id === tab.id) return;
    state.tab = tab; state.page = 0; state.sort = null; state.direction = 1; state.loading = true; renderTabs();
    $("table-label").textContent = tab.label; $("table-description").textContent = tab.description;
    $("row-count").textContent = "Loading…"; $("empty").classList.add("hidden");
    thead.replaceChildren(); tbody.replaceChildren();
    try {
      const response = await fetch(`./data/${encodeURIComponent(tab.file)}?v=${encodeURIComponent(window.archiveVersion || "")}`);
      if (!response.ok) throw new Error(`Could not load ${tab.file} (${response.status})`);
      const parsed = parseCSV(await response.text());
      if (state.tab?.id !== tab.id) return;
      state.columns = parsed.columns; state.rows = parsed.records;
      $("download").href = `./data/${encodeURIComponent(tab.file)}`; $("download").download = tab.file;
      $("format-filter").value = ""; populateFormatFilter();
      renderTable();
    } catch (error) {
      $("row-count").textContent = "Load failed"; $("empty").textContent = `${error.message}. Try refreshing the page.`; $("empty").classList.remove("hidden");
    } finally { state.loading = false; }
  }

  function populateFormatFilter() {
    const filter = $("format-filter"); filter.replaceChildren();
    const all = document.createElement("option"); all.value = ""; all.textContent = "All formats"; filter.append(all);
    if (!state.columns.includes("format")) { filter.disabled = true; return; }
    filter.disabled = false;
    const formats = [...new Set(state.rows.map((r) => r.format).filter(Boolean))].sort();
    for (const fmt of formats) { const o = document.createElement("option"); o.value = fmt; o.textContent = fmt; filter.append(o); }
  }

  function filteredRows() {
    const q = state.query.trim().toLocaleLowerCase();
    return state.rows.filter((row) => (!state.format || row.format === state.format) &&
      (!q || state.columns.some((col) => esc(row[col]).toLocaleLowerCase().includes(q))));
  }

  function sortRows(rows) {
    if (!state.sort) return rows;
    const key = state.sort, dir = state.direction;
    return [...rows].sort((a, b) => {
      const av = esc(a[key]), bv = esc(b[key]);
      const an = av !== "" && Number.isFinite(Number(av)), bn = bv !== "" && Number.isFinite(Number(bv));
      if (an && bn) return (Number(av) - Number(bv)) * dir;
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * dir;
    });
  }

  function renderTable() {
    const rows = sortRows(filteredRows()), total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    $("row-count").textContent = `${total.toLocaleString()} rows`;
    $("page-label").textContent = total ? `Page ${state.page + 1} of ${pages}` : "0 results";
    $("prev").disabled = state.page === 0; $("next").disabled = state.page >= pages - 1;
    $("empty").classList.toggle("hidden", total > 0);
    thead.replaceChildren(); tbody.replaceChildren();
    const headRow = document.createElement("tr");
    for (const col of state.columns) {
      const th = document.createElement("th"); th.scope = "col";
      th.textContent = `${col.replaceAll("_", " ")}${state.sort === col ? (state.direction > 0 ? " ↑" : " ↓") : ""}`;
      th.addEventListener("click", () => { if (state.sort === col) state.direction *= -1; else { state.sort = col; state.direction = 1; } renderTable(); }); headRow.append(th);
    }
    thead.append(headRow);
    const start = state.page * PAGE_SIZE;
    for (const record of rows.slice(start, start + PAGE_SIZE)) {
      const tr = document.createElement("tr");
      for (const col of state.columns) { const td = document.createElement("td"); td.textContent = esc(record[col]); if (record[col] !== "" && Number.isFinite(Number(record[col]))) td.className = "numeric"; tr.append(td); }
      tbody.append(tr);
    }
  }

  async function init() {
    try {
      const response = await fetch("./data/manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("No exported data found");
      const manifest = await response.json(); state.tabs = manifest.tabs || [];
      $("match-count").textContent = Number(manifest.match_count || 0).toLocaleString();
      $("updated-at").textContent = `Updated ${new Date(manifest.generated_at_utc).toLocaleString()}`;
      $("coverage-note").textContent = manifest.coverage_note || manifest.scope || "Simulated stats only.";
      if (manifest.coverage_note) { $("note").textContent = manifest.coverage_note; $("note").classList.remove("hidden"); }
      if (!state.tabs.length) throw new Error("The export manifest has no data tabs");
      await selectTab(state.tabs[0]);
    } catch (error) {
      $("table-label").textContent = "Stats archive is not published yet";
      $("table-description").textContent = "Run !update in the bot, then commit and push the generated data files.";
      $("row-count").textContent = "Awaiting data"; $("empty").textContent = error.message; $("empty").classList.remove("hidden");
    }
  }

  let debounce;
  $("search").addEventListener("input", (event) => { clearTimeout(debounce); state.query = event.target.value; state.page = 0; debounce = setTimeout(renderTable, 120); });
  $("format-filter").addEventListener("change", (event) => { state.format = event.target.value; state.page = 0; renderTable(); });
  $("prev").addEventListener("click", () => { state.page--; renderTable(); });
  $("next").addEventListener("click", () => { state.page++; renderTable(); });
  document.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("search").focus(); } });
  init();
})();
