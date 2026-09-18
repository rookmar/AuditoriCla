// =========================================================================
// Archivo: public/js/reportes.js
// V17.1 - Optimizado + Filtro Anti-Duplicados Centrales
// =========================================================================
let chart;
let chartAnimatedOnce = false;
let lastDataset = null;

const $ = (s) => document.getElementById(s);
const txt = (v) => (v == null ? "" : String(v));

// Fetch seguro que detecta bloqueo de roles
async function fetchJson(url) {
  const r = await fetch(url, { credentials: "include", cache: "no-store" });
  if (r.status === 403) {
      alert("⚠️ Acceso Denegado: No tienes permisos de Supervisor.");
      throw new Error("403 Forbidden");
  }
  if (!r.ok) throw new Error(String(r.status));
  return r.json();
}

// --- SOLUCIÓN: ESCUDO ANTI-DUPLICADOS PARA CENTRALES ---
async function loadCentrales() {
  const sel = $("selCentral");
  try {
    const data = await fetchJson("/api/reportes/centrales");
    const items = Array.isArray(data.items) ? data.items : [];
    sel.innerHTML = `<option value="">— Selecciona central —</option>`;
    
    const seenC = new Set();
    items.forEach(c => {
      const nombreVisible = c.nombre_central || c.ID_central;
      if (nombreVisible && !seenC.has(nombreVisible)) {
        seenC.add(nombreVisible); // Lo marcamos como visto
        const o = document.createElement("option");
        o.value = c.id; 
        o.textContent = nombreVisible;
        sel.appendChild(o);
      }
    });
  } catch (e) {
    if(sel) sel.innerHTML = `<option value="">(Error de carga)</option>`;
  }
}

async function loadOdfsByCentral(centralId) {
  const selOdf = $("selOdf");
  if (!centralId) {
    selOdf.innerHTML = `<option value="">— Selecciona central primero —</option>`;
    selOdf.disabled = true;
    return;
  }
  try {
    const data = await fetchJson(`/api/reportes/odfs?central_id=${encodeURIComponent(centralId)}`);
    const list = Array.isArray(data.items) ? data.items : [];
    selOdf.innerHTML = `<option value="">— ODF (todos) —</option>`;
    const seen = new Set();
    list.forEach(o => {
      const nem = String(o.nemonico_odf || "").trim();
      if (!nem || seen.has(nem)) return;
      seen.add(nem);
      const opt = document.createElement("option");
      opt.value = nem; opt.textContent = nem;
      selOdf.appendChild(opt);
    });
    selOdf.disabled = false;
  } catch {
    selOdf.innerHTML = `<option value="">— Error cargando ODFs —</option>`;
  }
}

// Renderizado de las tarjetas superiores (KPIs)
function renderStats(totals, titulo) {
  const wrap = $("stats");
  if (!wrap) return;
  const pct = Math.round((totals.porcentaje||0)*100)/100;
  
  // Color dinámico del porcentaje (Verde < 70%, Amarillo < 90%, Rojo > 90%)
  let color = "#22c55e"; // Verde
  if(pct > 70) color = "#eab308"; // Amarillo
  if(pct > 90) color = "#ef4444"; // Rojo

  wrap.innerHTML = `
    <div class="stat"><div>${titulo}</div><div class="k" style="color:${color}">${pct}%</div><div>Ocupación</div></div>
    <div class="stat"><div>Total puertos</div><div class="k">${totals.total_puertos||0}</div></div>
    <div class="stat"><div>Usados</div><div class="k">${totals.usados||0}</div></div>
    <div class="stat"><div>Libres</div><div class="k">${totals.libres||0}</div></div>
  `;
}

function renderTable(scope, payload) {
  const thead = $("thead"), tbody = $("tbody");
  if (!thead || !tbody) return;

  if (scope === "central") {
    thead.innerHTML = `<tr><th>ODF</th><th>Total</th><th>Usados</th><th>Libres</th><th>% Ocupación</th></tr>`;
    if (!payload.items?.length) { tbody.innerHTML = `<tr><td colspan="5">Sin datos.</td></tr>`; return; }
    tbody.innerHTML = payload.items.map(r => `
      <tr><td>${txt(r.nemonico_odf)}</td><td>${r.total_puertos}</td><td>${r.usados}</td><td>${r.libres}</td><td>${r.porcentaje}%</td></tr>
    `).join("");
  } else {
    thead.innerHTML = `<tr><th>Central</th><th>Usados</th><th>Libres</th><th>Total</th><th>% Ocupación</th></tr>`;
    if (!payload.items?.length) { tbody.innerHTML = `<tr><td colspan="5">Sin datos.</td></tr>`; return; }
    tbody.innerHTML = payload.items.map(r => `
      <tr><td>${txt(r.central)}</td><td>${r.usados}</td><td>${r.libres}</td><td>${r.total_puertos}</td><td>${r.porcentaje}%</td></tr>
    `).join("");
  }
}

function renderChart(scope, payload, title) {
  const ctx = $("chart");
  if (!ctx) return;
  
  const labels = payload.items.map(x => scope==="central" ? x.nemonico_odf : x.central);
  const dataUsados = payload.items.map(x => x.usados);
  const dataLibres = payload.items.map(x => x.libres);

  const data = {
    labels: labels,
    datasets: [
      { label: "Usados", data: dataUsados, backgroundColor: "#ef4444" },
      { label: "Libres", data: dataLibres, backgroundColor: "#22c55e" }
    ]
  };

  if (chart) chart.destroy();
  const firstTime = !chartAnimatedOnce;
  
  chart = new Chart(ctx, {
    type: "bar", 
    data,
    options: {
      responsive: true,
      animation: firstTime ? { duration: 800 } : false,
      plugins: { title: { display: true, text: title } },
      scales: { x: { stacked: true }, y: { stacked: true } }
    }
  });
  chartAnimatedOnce = true;
}

// Botones de Acción
async function viewCentral() {
  const cid = Number($("selCentral").value || 0);
  if (!cid) { alert("Selecciona una central."); return; }
  
  try {
      const payload = await fetchJson(`/api/reportes/capacidad?scope=central&central_id=${cid}`);
      renderStats(payload.totals, `Central: ${payload.central}`);
      renderTable("central", payload);
      renderChart("central", payload, `Ocupación por ODF en ${payload.central}`);
      lastDataset = { scope: "central", payload };
  } catch {}
}

async function viewOdf() {
  const nem = $("selOdf").value.trim();
  if (!nem) { alert("Selecciona un ODF."); return; }
  
  try {
      const payload = await fetchJson(`/api/reportes/capacidad?scope=odf&nemonico=${encodeURIComponent(nem)}`);
      renderStats(payload.totals, `ODF: ${payload.nemonico_odf}`);
      renderTable("odf", payload);
      renderChart("odf", payload, `Ocupación de ${payload.nemonico_odf} por Central`);
      lastDataset = { scope: "odf", payload };
  } catch {}
}

function exportExcel() {
  if (!lastDataset) { alert("Genera un reporte primero."); return; }
  const wb = XLSX.utils.book_new();
  const items = lastDataset.payload.items || [];
  
  // Prepara datos para Excel
  const sheetData = lastDataset.scope === "central"
    ? [["ODF","Total","Usados","Libres","%"], ...items.map(r => [r.nemonico_odf, r.total_puertos, r.usados, r.libres, r.porcentaje])]
    : [["Central","Usados","Libres","Total","%"], ...items.map(r => [r.central, r.usados, r.libres, r.total_puertos, r.porcentaje])];
    
  const ws = XLSX.utils.aoa_to_sheet(sheetData);
  XLSX.utils.book_append_sheet(wb, ws, "Reporte");
  XLSX.writeFile(wb, `Reporte_Capacidad_${Date.now()}.xlsx`);
}

function exportChartPNG() {
  if (!chart) { alert("Genera una gráfica primero."); return; }
  const a = document.createElement('a');
  a.href = chart.toBase64Image('image/png', 1);
  a.download = `Grafica_Capacidad_${Date.now()}.png`;
  a.click();
}

window.addEventListener("DOMContentLoaded", () => {
  loadCentrales();
  $("selCentral")?.addEventListener("change", (e) => loadOdfsByCentral(Number(e.target.value)));
  $("btnVerCentral")?.addEventListener("click", viewCentral);
  $("btnVerOdf")?.addEventListener("click", viewOdf);
  $("btnExport")?.addEventListener("click", exportExcel);
  $("btnExportChart")?.addEventListener("click", exportChartPNG);
});