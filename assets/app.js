/* State (no intensities) */
const STATE = {
  summaryCounts: new Map([["AA",0],["AB",0],["BB",0],["NoCall",0]]),
  clusterPNGs: new Map(),   // snp -> { k1, k2, k3, names:{k1,k2,k3} }
  selectedSnp: null,
};

/* DOM */
const $ = (id) => document.getElementById(id);
const snpSelectorWrap = $("snpSelector");
const snpSelect = $("snpSelect");

/* Tabs */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    $("panel-" + tab)?.classList.add("active");
    updateSnpSelectorVisibility();
    rebuildSnpListForActiveTab();
    refreshActivePanel();
  });
});

/* Start-panel controls */
$("loadSummaryBtn").onclick = () => loadSummaryFromFile($("summaryFile").files?.[0]);
$("loadDefaultSummaryBtn").onclick = () => loadSummaryFromURL("data/cohort_calls.csv");
$("loadClustersPngBtn").onclick = () => {
  const dirFiles = $("clustersDir").files;
  const manyFiles = $("clustersMany").files;
  if (dirFiles && dirFiles.length) loadClusterPNGs(dirFiles);
  else if (manyFiles && manyFiles.length) loadClusterPNGs(manyFiles);
  else alert("Select a folder or multiple PNG files first.");
};
$("clearClustersBtn").onclick = clearClusterPNGs;

/* SNP selector */
snpSelect.onchange = () => { STATE.selectedSnp = snpSelect.value; refreshActivePanel(); };

function activeTab() { return document.querySelector(".tab.active")?.dataset.tab || "start"; }
function updateSnpSelectorVisibility() {
  const t = activeTab();
  snpSelectorWrap.style.display = (t === "k1" || t === "k2" || t === "k3") ? "inline-flex" : "none";
}

/* ---------- Loading UI ---------- */
function showProgress(title, msg, determinate = false) {
  $("loadingTitle").textContent = title || "Loading…";
  $("loadingMsg").textContent = msg || "Please wait";
  $("loadingOverlay").classList.add("show");
  $("loadingOverlay").setAttribute("aria-hidden", "false");
  setProgress(determinate ? 0 : null);
}
function setProgress(percentOrNull) {
  const bar = $("loadingBar");
  if (percentOrNull == null) {
    bar.style.width = "100%";
    bar.style.animation = "loadingPulse 1.2s ease-in-out infinite alternate";
    // define animation only once
    if (!document.getElementById("loadingPulseStyle")) {
      const st = document.createElement("style");
      st.id = "loadingPulseStyle";
      st.textContent = `
      @keyframes loadingPulse { from { filter: brightness(0.8); width: 30%; } to { filter: brightness(1); width: 70%; } }
      `;
      document.head.appendChild(st);
    }
  } else {
    bar.style.animation = "none";
    bar.style.width = Math.max(0, Math.min(100, percentOrNull)) + "%";
  }
}
function updateMsg(msg) {
  $("loadingMsg").textContent = msg || "";
}
function hideProgress() {
  $("loadingOverlay").classList.remove("show");
  $("loadingOverlay").setAttribute("aria-hidden", "true");
  setProgress(0);
  updateMsg("");
}

/* ---------- Cohort calls CSV (flex parser: long or wide) ---------- */
function loadSummaryFromFile(file) {
  if (!file) return;
  showProgress("Loading cohort calls", "Reading CSV… rows processed: 0", /*determinate*/ false);
  let rowsProcessed = 0;
  const parsedRows = [];

  Papa.parse(file, {
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    worker: true,
    step: (res) => {
      parsedRows.push(res.data);
      rowsProcessed++;
      if (rowsProcessed % 500 === 0) updateMsg(`Reading CSV… rows processed: ${rowsProcessed.toLocaleString()}`);
    },
    complete: () => {
      updateMsg(`Parsing complete. Total rows: ${rowsProcessed.toLocaleString()}. Computing totals…`);
      try {
        processCallsRows(parsedRows);
      } finally {
        hideProgress();
        if (activeTab() === "summary") refreshActivePanel();
      }
    },
    error: (err) => {
      updateMsg("Error reading CSV: " + String(err));
      console.error(err);
      setTimeout(hideProgress, 1200);
    }
  });
}

function loadSummaryFromURL(url) {
  showProgress("Loading cohort calls", "Fetching CSV…", /*determinate*/ false);
  Papa.parse(url, {
    download: true,
    header: true,
    dynamicTyping: true,
    skipEmptyLines: true,
    worker: true,
    complete: (res) => {
      try {
        processCallsRows(res.data || []);
      } finally {
        hideProgress();
        if (activeTab() === "summary") refreshActivePanel();
      }
    },
    error: (err) => {
      updateMsg("Error fetching CSV: " + String(err));
      console.error(err);
      setTimeout(hideProgress, 1200);
    }
  });
}

function processCallsRows(rows) {
  const keys = ["AA","AB","BB","NoCall"];
  const synonyms = {
    AA: ["aa","a a","n_aa","count_aa"],
    AB: ["ab","a b","het","n_ab","count_ab"],
    BB: ["bb","b b","n_bb","count_bb"],
    NoCall: ["nocall","no call","no-call","n_nocall","count_nocall","missing","nocalls"]
  };
  const labelCol = findColumn(rows, ["label","genotype","call","gt"]);
  const countCol = findColumn(rows, ["count","n","freq","value","num","total"]);

  const sums = new Map(keys.map(k => [k, 0]));

  if (labelCol) {
    // long format
    rows.forEach(r => {
      const raw = (r[labelCol] ?? "").toString().trim().toLowerCase();
      const k = matchLabel(raw, keys, synonyms);
      if (!k) return;
      const val = Number(r[countCol] ?? 1) || 0;
      sums.set(k, (sums.get(k) || 0) + val);
    });
  } else {
    // wide matrix: AA/AB/BB/NoCall values in cells
    const idCol = findColumn(rows, ["snp_id","snpid","snp","id","rsid","rs_id","marker","locus"]) || Object.keys(rows[0]||{})[0];
    const otherCols = Object.keys(rows[0]||{}).filter(c => c !== idCol);
    rows.forEach(r => {
      otherCols.forEach(c => {
        const raw = (r[c] ?? "").toString().trim().toLowerCase();
        const k = matchLabel(raw, keys, synonyms);
        if (k) sums.set(k, (sums.get(k) || 0) + 1);
      });
    });
  }

  STATE.summaryCounts = sums;
  if (activeTab() === "summary") renderSummary();
}

function findColumn(rows, names) {
  if (!rows || !rows.length) return null;
  const cols = Object.keys(rows[0] || {});
  const lc = cols.map(c => c.toLowerCase());
  for (const n of names) {
    const i = lc.indexOf(n.toLowerCase());
    if (i !== -1) return cols[i];
  }
  return null;
}
function matchLabel(raw, keys, synonyms) {
  for (const k of keys) {
    if (raw === k.toLowerCase()) return k;
    for (const s of (synonyms[k]||[])) if (raw === s) return k;
  }
  return null;
}

/* ---------- Cluster PNGs with determinate progress ---------- */
function clearClusterPNGs() {
  for (const {k1, k2, k3} of STATE.clusterPNGs.values()) {
    [k1, k2, k3].forEach(u => u && URL.revokeObjectURL(u));
  }
  STATE.clusterPNGs.clear();
  rebuildSnpListForActiveTab();
  refreshClusterImgs();
}
function loadClusterPNGs(fileList) {
  const files = Array.from(fileList || []);
  const total = files.length;
  if (!total) return;

  showProgress("Loading cluster images", "Preparing…", /*determinate*/ true);

  const re = /^(?<snp>.+?)[_\-\.]k(?<k>[123])\.png$/i;
  // Reset existing
  for (const {k1, k2, k3} of STATE.clusterPNGs.values()) {
    [k1, k2, k3].forEach(u => u && URL.revokeObjectURL(u));
  }
  STATE.clusterPNGs.clear();

  let done = 0;
  const bump = () => {
    done++;
    const pct = Math.round((done / total) * 100);
    setProgress(pct);
    updateMsg(`Loaded ${done} / ${total} image${total===1?"":"s"} (${pct}%)`);
    if (done >= total) {
      rebuildSnpListForActiveTab();
      refreshClusterImgs();
      setTimeout(hideProgress, 250);
    }
  };

  files.forEach(f => {
    const name = f.name.trim();
    const m = name.match(re);
    if (!m || !m.groups) { bump(); return; }
    const snp = m.groups.snp;
    const k = m.groups.k;
    const url = URL.createObjectURL(f);
    let entry = STATE.clusterPNGs.get(snp);
    if (!entry) entry = { k1:null, k2:null, k3:null, names:{k1:"",k2:"",k3:""} };
    entry["k"+k] = url; entry.names["k"+k] = name;
    STATE.clusterPNGs.set(snp, entry);
    bump();
  });
}

/* ---------- SNP list depends on active tab (K-only) ---------- */
function rebuildSnpListForActiveTab() {
  const tab = activeTab();
  let list = [];
  if (tab === "k1" || tab === "k2" || tab === "k3") {
    const key = {k1:"k1", k2:"k2", k3:"k3"}[tab];
    for (const [snp, entry] of STATE.clusterPNGs) if (entry[key]) list.push(snp);
  }
  list.sort((a,b)=>a.localeCompare(b, undefined, {numeric:true, sensitivity:'base'}));
  snpSelect.innerHTML = "";
  list.forEach(s => { const opt=document.createElement("option"); opt.value=s; opt.textContent=s; snpSelect.appendChild(opt); });
  if (list.length === 0) STATE.selectedSnp = null;
  else if (!STATE.selectedSnp || !list.includes(STATE.selectedSnp)) STATE.selectedSnp = list[0];
  if (STATE.selectedSnp) snpSelect.value = STATE.selectedSnp;
}

/* ---------- Rendering ---------- */
function refreshActivePanel() {
  const tab = activeTab();
  if (tab === "summary") renderSummary();
  if (tab === "k1" || tab === "k2" || tab === "k3") refreshClusterImgs();
}

function renderSummary() {
  const pieEl = $("summaryPie"); const tblBody = $("summaryTable").querySelector("tbody");
  const keys = ["AA","AB","BB","NoCall"]; const values = keys.map(k => STATE.summaryCounts.get(k) || 0);
  const total = values.reduce((a,b)=>a+b,0) || 1;
  Plotly.react(pieEl, [{
    labels: keys, values, type: "pie", hole: 0.35, textinfo: "label+percent",
    hovertemplate: "%{label}: %{value} (%{percent})<extra></extra>"
  }], { title: "Cohort calls", margin: { l: 12, r: 12, t: 50, b: 12 },
        paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)' }, {responsive:true});
  tblBody.innerHTML = "";
  keys.forEach((k,i)=>{ const tr=document.createElement("tr"); tr.innerHTML=`<td>${k}</td><td>${values[i].toLocaleString()}</td>`; tblBody.appendChild(tr); });
  const tr=document.createElement("tr"); tr.innerHTML=`<td><strong>Total</strong></td><td><strong>${total.toLocaleString()}</strong></td>`; tblBody.appendChild(tr);
}

function refreshClusterImgs() {
  const snp = STATE.selectedSnp; const entry = snp ? STATE.clusterPNGs.get(snp) : null;
  setImg("imgK1","imgK1Caption", entry?.k1 || null, entry?.names?.k1 || "", snp, "K=1");
  setImg("imgK2","imgK2Caption", entry?.k2 || null, entry?.names?.k2 || "", snp, "K=2");
  setImg("imgK3","imgK3Caption", entry?.k3 || null, entry?.names?.k3 || "", snp, "K=3");
}
function setImg(imgId, capId, url, filename, snp, klabel) {
  const img = $(imgId), cap = $(capId);
  if (url) { img.src = url; img.style.display = "block"; cap.textContent = filename ? `${snp ?? ""} • ${klabel} • ${filename}` : `${snp ?? ""} • ${klabel}`; }
  else { img.removeAttribute("src"); img.style.display = "none"; cap.textContent = snp ? `No image found for ${snp} • ${klabel}` : `No image loaded`; }
}

/* On load: keep Start visible; optionally preload CSV if present */
window.addEventListener("load", () => {
  fetch("data/cohort_calls.csv").then(r => { if (r.ok) loadSummaryFromURL("data/cohort_calls.csv"); }).catch(()=>{});
  updateSnpSelectorVisibility();
});
