(() => {
  "use strict";

  const PAGE_SIZE = 50;
  const NUMERIC_SAMPLE_SIZE = 1500;
  const $ = (id) => document.getElementById(id);
  const state = {
    tabs: [], tab: null, rows: [], columns: [], numeric: new Set(), sort: null,
    direction: 1, page: 0, query: "", format: "", countries: new Set(), gender: "", careerStatus: "",
    filters: new Map(), loading: false,
  };
  const tabsEl = $("tabs"), table = $("stats-table"), thead = table.querySelector("thead"), tbody = table.querySelector("tbody");
  const text = (value) => String(value ?? "");
  const columnLabel = (column) => {
    const labels = { name: "Name", sim_name: "Sim name", teams: "Teams" };
    return labels[column] || column.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
  };
  const isTeamColumn = (column) => /^(teams?|team(?:_[a-z0-9]+)+|[a-z0-9]+_team|opposition)$/i.test(column);
  const numericValue = (value) => {
    if (value == null || String(value).trim() === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  function parseCSV(source) {
    const rows = []; let row = [], cell = "", quoted = false;
    for (let i = 0; i < source.length; i++) {
      const ch = source[i];
      if (quoted) {
        if (ch === '"' && source[i + 1] === '"') { cell += '"'; i++; }
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

  function inferNumericColumns() {
    state.numeric = new Set();
    for (const column of state.columns) {
      let checked = 0, numeric = 0;
      const step = Math.max(1, Math.floor(state.rows.length / NUMERIC_SAMPLE_SIZE));
      for (let i = 0; i < state.rows.length && checked < NUMERIC_SAMPLE_SIZE; i += step) {
        const value = text(state.rows[i][column]).trim();
        if (!value) continue;
        checked++;
        if (numericValue(value) !== null) numeric++;
      }
      if (checked > 0 && numeric / checked >= 0.95) state.numeric.add(column);
    }
  }

  function renderTabs() {
    tabsEl.replaceChildren();
    for (const tab of state.tabs) {
      const button = document.createElement("button"); button.type = "button";
      button.className = `tab${state.tab?.id === tab.id ? " active" : ""}`;
      button.textContent = tab.label; button.title = tab.description;
      button.setAttribute("aria-pressed", String(state.tab?.id === tab.id));
      button.addEventListener("click", () => selectTab(tab)); tabsEl.append(button);
    }
  }

  async function selectTab(tab) {
    if (state.loading && state.tab?.id === tab.id) return;
    state.tab = tab; state.page = 0; state.sort = null; state.direction = 1;
    state.filters.clear(); state.loading = true; renderTabs();
    $("table-label").textContent = tab.label;
    $("row-count").textContent = "Loading table…"; $("filter-count").textContent = "";
    $("empty").classList.add("hidden"); thead.replaceChildren(); tbody.replaceChildren();
    try {
      const response = await fetch(`./data/${encodeURIComponent(tab.file)}?v=${encodeURIComponent(window.archiveVersion || "")}`);
      if (!response.ok) throw new Error(`Could not load ${tab.file} (${response.status})`);
      const parsed = parseCSV(await response.text());
      if (state.tab?.id !== tab.id) return;
      // Keep player identity at the left edge and team fields at the far right,
      // including tabs whose export calls the field "team" rather than "teams".
      const leading = ["name", "sim_name", "format"].filter((column) => parsed.columns.includes(column));
      const trailing = parsed.columns.filter((column) => isTeamColumn(column) && !leading.includes(column));
      state.columns = [
        ...leading,
        ...parsed.columns.filter((column) => !leading.includes(column) && !trailing.includes(column)),
        ...trailing,
      ];
      state.rows = parsed.records; inferNumericColumns();
      $("download").href = `./data/${encodeURIComponent(tab.file)}`; $("download").download = tab.file;
      populateFormatFilter(); populateCountryFilter(); renderTable();
    } catch (error) {
      $("row-count").textContent = "Load failed";
      $("empty").textContent = `${error.message}. Try refreshing the page.`; $("empty").classList.remove("hidden");
    } finally { state.loading = false; }
  }

  function populateFormatFilter() {
    const filter = $("format-filter"); filter.replaceChildren();
    const all = document.createElement("option"); all.value = ""; all.textContent = "All formats"; filter.append(all);
    if (!state.columns.includes("format")) { state.format = ""; filter.value = ""; filter.disabled = true; return; }
    filter.disabled = false;
    const formats = [...new Set(state.rows.map((r) => r.format).filter(Boolean))].sort();
    for (const format of formats) { const option = document.createElement("option"); option.value = format; option.textContent = format; filter.append(option); }
    filter.value = state.format;
    if (![...filter.options].some((option) => option.value === state.format)) state.format = "";
  }

  function populateCountryFilter() {
    const options = $("country-options"), selected = state.countries;
    options.replaceChildren();
    const countries = [...new Set(state.rows.map((row) => text(row.country).trim()).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
    for (const country of countries) {
      const label = document.createElement("label"); label.className = "country-option";
      label.dataset.country = country.toLocaleLowerCase();
      const checkbox = document.createElement("input"); checkbox.type = "checkbox";
      checkbox.value = country; checkbox.checked = selected.has(country);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) state.countries.add(country); else state.countries.delete(country);
        updateCountrySummary(); state.page = 0; renderTable();
      });
      const name = document.createElement("span"); name.textContent = country;
      label.append(checkbox, name); options.append(label);
    }
    for (const country of [...selected]) if (!countries.includes(country)) selected.delete(country);
    updateCountrySummary();
    filterCountryOptions();
  }

  function updateCountrySummary() {
    const count = state.countries.size;
    $("country-summary").textContent = count ? `${count} selected` : "All countries";
  }

  function filterCountryOptions() {
    const query = $("country-search").value.trim().toLocaleLowerCase();
    for (const option of $("country-options").children)
      option.hidden = !option.dataset.country.includes(query);
  }

  function matchesFilters(row, query) {
    if (state.format && row.format !== state.format) return false;
    if (state.countries.size && !state.countries.has(text(row.country))) return false;
    if (state.gender && text(row.gender).toLocaleLowerCase() !== state.gender.toLocaleLowerCase()) return false;
    if (state.careerStatus && text(row.career_status) !== state.careerStatus) return false;
    if (query && !state.columns.some((column) => text(row[column]).toLocaleLowerCase().includes(query))) return false;
    for (const [column, filter] of state.filters) {
      if (state.numeric.has(column) && filter.min === "" && filter.max === "") continue;
      const value = text(row[column]);
      if (state.numeric.has(column)) {
        const n = numericValue(value);
        if (n === null) return false;
        if (filter.min !== "" && n < Number(filter.min)) return false;
        if (filter.max !== "" && n > Number(filter.max)) return false;
      } else if (filter.value && (column === "format" ? value !== filter.value : !value.toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()))) return false;
    }
    return true;
  }

  function filteredRows() {
    const query = state.query.trim().toLocaleLowerCase();
    return state.rows.filter((row) => matchesFilters(row, query));
  }

  function sortRows(rows) {
    if (!state.sort) return rows;
    const key = state.sort, direction = state.direction;
    return [...rows].sort((a, b) => {
      const av = text(a[key]), bv = text(b[key]);
      const an = numericValue(av), bn = numericValue(bv);
      if (an !== null && bn !== null) return (an - bn) * direction;
      if (an !== null) return -1 * direction;
      if (bn !== null) return 1 * direction;
      return av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" }) * direction;
    });
  }

  function activeFilterCount() {
    return [...state.filters.values()].filter((filter) => filter.value || filter.min !== "" || filter.max !== "").length +
      Number(Boolean(state.query.trim())) + Number(Boolean(state.format)) + Number(state.countries.size > 0) +
      Number(Boolean(state.gender)) + Number(Boolean(state.careerStatus));
  }

  function renderFilterRow() {
    const row = document.createElement("tr"); row.className = "column-filters";
    for (const column of state.columns) {
      const cell = document.createElement("th"); cell.scope = "col"; cell.className = "filter-cell";
      if (column === "name") cell.classList.add("name-column");
      if (column === "sim_name") cell.classList.add("sim-name-column");
      if (column === "format") cell.classList.add("format-column");
      if (state.numeric.has(column)) cell.classList.add("numeric-column");
      const current = state.filters.get(column) || { value: "", min: "", max: "" };
      if (state.numeric.has(column)) {
        const range = document.createElement("div"); range.className = "range-filter";
        for (const bound of ["min", "max"]) {
          const input = document.createElement("input"); input.type = "number"; input.inputMode = "decimal";
          input.step = "any"; input.value = current[bound]; input.placeholder = bound;
          input.dataset.filterColumn = column; input.dataset.filterBound = bound;
          input.setAttribute("aria-label", `${column.replaceAll("_", " ")} ${bound === "min" ? "minimum" : "maximum"}`);
          input.addEventListener("input", () => {
            const value = state.filters.get(column) || { value: "", min: "", max: "" };
            value[bound] = input.value; state.filters.set(column, value); state.page = 0; scheduleRender();
          });
          range.append(input);
        }
        cell.append(range);
      } else if (column === "format") {
        const select = document.createElement("select"); select.className = "column-filter-select";
        select.dataset.filterColumn = column; select.dataset.filterBound = "value";
        select.setAttribute("aria-label", "Filter by format");
        const any = document.createElement("option"); any.value = ""; any.textContent = "All formats"; select.append(any);
        const formats = [...new Set(state.rows.map((record) => text(record.format).trim()).filter(Boolean))]
          .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
        for (const format of formats) { const option = document.createElement("option"); option.value = format; option.textContent = format; select.append(option); }
        select.value = current.value;
        select.addEventListener("change", () => {
          const value = state.filters.get(column) || { value: "", min: "", max: "" };
          value.value = select.value; state.filters.set(column, value); state.page = 0; renderTable();
        });
        cell.append(select);
      } else {
        const input = document.createElement("input"); input.type = "search"; input.value = current.value;
        input.dataset.filterColumn = column; input.dataset.filterBound = "value";
        input.placeholder = "contains"; input.setAttribute("aria-label", `Filter ${column.replaceAll("_", " ")} by contained text`);
        input.autocomplete = "off";
        input.addEventListener("input", () => {
          const value = state.filters.get(column) || { value: "", min: "", max: "" };
          value.value = input.value; state.filters.set(column, value); state.page = 0; scheduleRender();
        });
        cell.append(input);
      }
      row.append(cell);
    }
    return row;
  }

  function renderTable() {
    const activeElement = document.activeElement;
    const restoreFocus = activeElement?.matches?.(".column-filters input") ? {
      column: activeElement.dataset.filterColumn, bound: activeElement.dataset.filterBound,
      start: activeElement.selectionStart, end: activeElement.selectionEnd,
    } : null;
    const filtered = filteredRows(), rows = sortRows(filtered), total = rows.length;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    state.page = Math.max(0, Math.min(state.page, pages - 1));
    $("row-count").textContent = `${total.toLocaleString()} ${total === 1 ? "row" : "rows"}`;
    const filters = activeFilterCount();
    $("filter-count").textContent = filters ? `${filters} active ${filters === 1 ? "filter" : "filters"} · ${state.rows.length.toLocaleString()} total` : `${state.rows.length.toLocaleString()} total`;
    $("page-label").textContent = total ? `Page ${state.page + 1} of ${pages} · ${PAGE_SIZE} per page` : "0 matching rows";
    $("prev").disabled = state.page === 0; $("next").disabled = state.page >= pages - 1;
    $("empty").classList.toggle("hidden", total > 0);
    thead.replaceChildren(); tbody.replaceChildren();

    const headRow = document.createElement("tr"); headRow.className = "column-headings";
    for (const column of state.columns) {
      const th = document.createElement("th"); th.scope = "col";
      if (column === "name") th.classList.add("name-column");
      if (column === "sim_name") th.classList.add("sim-name-column");
      if (column === "format") th.classList.add("format-column");
      if (state.numeric.has(column)) th.classList.add("numeric-column");
      const button = document.createElement("button"); button.type = "button"; button.className = "sort-button";
      button.textContent = columnLabel(column);
      button.setAttribute("aria-label", `Sort by ${columnLabel(column)}${state.sort === column ? (state.direction > 0 ? ", ascending" : ", descending") : ""}`);
      if (state.sort === column) button.insertAdjacentText("beforeend", state.direction > 0 ? " ↑" : " ↓");
      button.addEventListener("click", () => {
        if (state.sort === column) state.direction *= -1;
        else { state.sort = column; state.direction = 1; }
        renderTable();
      });
      th.append(button); headRow.append(th);
    }
    thead.append(headRow, renderFilterRow());
    const start = state.page * PAGE_SIZE;
    for (const record of rows.slice(start, start + PAGE_SIZE)) {
      const tr = document.createElement("tr");
      for (const column of state.columns) {
        const td = document.createElement("td"), value = text(record[column]);
        td.textContent = value;
        if (column === "name") {
          td.classList.add("name-column");
          if (record.sim_name) {
            const alias = document.createElement("span");
            alias.className = "mobile-sim-name";
            alias.textContent = text(record.sim_name);
            td.append(alias);
          }
        }
        if (column === "sim_name") td.classList.add("sim-name-column");
        if (column === "format") td.classList.add("format-column");
        if (state.numeric.has(column)) td.className = "numeric";
        tr.append(td);
      }
      tbody.append(tr);
    }
    if (restoreFocus) {
      const input = [...thead.querySelectorAll(".column-filters input")].find((item) =>
        item.dataset.filterColumn === restoreFocus.column && item.dataset.filterBound === restoreFocus.bound);
      if (input) {
        input.focus();
        if (input.type === "search" && restoreFocus.start != null) input.setSelectionRange(restoreFocus.start, restoreFocus.end);
      }
    }
  }

  let renderTimer;
  function scheduleRender() { clearTimeout(renderTimer); renderTimer = setTimeout(renderTable, 180); }
  function clearFilters() {
    state.query = ""; state.format = ""; state.countries.clear(); state.gender = ""; state.careerStatus = "";
    state.filters.clear(); state.page = 0;
    $("search").value = ""; $("format-filter").value = ""; $("gender-filter").value = "";
    $("status-filter").value = ""; $("country-search").value = ""; updateCountrySummary();
    populateCountryFilter(); renderTable();
  }

  async function init() {
    try {
      const response = await fetch("./data/manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("No exported data found");
      const manifest = await response.json(); state.tabs = manifest.tabs || [];
      // Use the export timestamp to bust stale browser/CDN caches whenever
      // !update publishes a new set of CSVs.
      window.archiveVersion = manifest.generated_at_utc || String(Date.now());
      if (!state.tabs.length) throw new Error("The export manifest has no data tabs");
      await selectTab(state.tabs[0]);
    } catch (error) {
      $("table-label").textContent = "Stats archive is not published yet";
      $("row-count").textContent = "Awaiting data"; $("empty").textContent = error.message; $("empty").classList.remove("hidden");
    }
  }

  let searchTimer;
  $("search").addEventListener("input", (event) => {
    clearTimeout(searchTimer); state.query = event.target.value; state.page = 0;
    searchTimer = setTimeout(renderTable, 180);
  });
  $("format-filter").addEventListener("change", (event) => { state.format = event.target.value; state.page = 0; renderTable(); });
  $("gender-filter").addEventListener("change", (event) => { state.gender = event.target.value; state.page = 0; renderTable(); });
  $("status-filter").addEventListener("change", (event) => { state.careerStatus = event.target.value; state.page = 0; renderTable(); });
  $("country-search").addEventListener("input", filterCountryOptions);
  $("clear-filters").addEventListener("click", clearFilters);
  $("prev").addEventListener("click", () => { state.page--; renderTable(); });
  $("next").addEventListener("click", () => { state.page++; renderTable(); });
  document.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); $("search").focus(); }
  });
  init();
})();
