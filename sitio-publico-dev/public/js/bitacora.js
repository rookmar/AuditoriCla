// public/js/bitacora.js
// V7 - Nombres Reales + Traducción a Español + Fix Comillas

(function () {
  const READY = (cb) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", cb) : cb();
  const $ = (s) => document.querySelector(s);

  const state = { page: 1, pageSize: 20, totalPages: 1 };

  // --- Diccionarios de Traducción (Para que hable en nuestro idioma) ---
  const traductorAccion = {
    'LOGIN': 'Inició sesión en',
    'LOGOUT': 'Cerró sesión en',
    'CREATE': 'Creó',
    'UPDATE': 'Actualizó',
    'DELETE': 'Eliminó'
  };

  const traductorEntidad = {
    'login': 'el sistema',
    'ruta': 'una nueva ruta',
    'cliente': 'un registro de cliente',
    'usuario': 'un perfil de usuario',
    'planta': 'un elemento de planta externa'
  };

  function humanizarEvento(accion, entidad) {
    const act = traductorAccion[String(accion).toUpperCase()] || accion;
    const ent = traductorEntidad[String(entidad).toLowerCase()] || entidad;
    return `${act} ${ent}`;
  }

  // --- Helpers de Roles ---
  function formatRoles(user) {
    if (!user) return "";
    let roles = Array.isArray(user.roles) ? user.roles : (user.roles || "").split(',');
    return roles.map(r => String(r).trim()).filter(Boolean).join(", ");
  }

  // --- Carga Usuario (Cabecera) ---
  async function fetchMe() {
    try {
      const r = await fetch("/api/me?_=" + Date.now(), { credentials: "include" });
      if (r.ok) {
        const d = await r.json();
        const u = d.user || {};
        const nombre = u.nombre || u.usuario || "Usuario"; // Preferimos nombre real
        $("#who").textContent = `${nombre} (${formatRoles(u) || 'Staff'})`;
      }
    } catch {}
  }

  // --- Filtros ---
  function getFilters() {
    return {
      q: "",
      actor: $("#actor").value.trim(),
      entidad: $("#entidad").value,
      accion: $("#accion").value,
      desde: $("#desde").value,
      hasta: ""
    };
  }

  function updateExportLink(qs) {
    const btn = $("#btnExport");
    if (btn) {
      const csvParams = new URLSearchParams(qs);
      csvParams.set("limit", "50000"); 
      btn.href = `/api/bitacora/csv?${csvParams.toString()}`;
    }
  }

  // --- Carga de Datos ---
  async function load() {
    const { page, pageSize } = state;
    const f = getFilters();
    const tbody = $("#rows");

    // Ajustado a 4 columnas por la vista resumida
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:25px;color:#64748b">Cargando datos...</td></tr>`;

    const qs = new URLSearchParams({ page, pageSize, ...f });
    updateExportLink(qs);

    try {
      const r = await fetch("/api/bitacora?" + qs.toString(), { credentials: "include" });
      if (!r.ok) throw new Error("Error API");
      const data = await r.json();
      renderTable(data);
    } catch (e) {
      console.error(e);
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#ef4444">Error cargando bitácora. Intente de nuevo.</td></tr>`;
    }
  }

  // --- Renderizado Limpio con NOMBRES REALES Y ESPAÑOL ---
  function renderTable(data) {
    const tbody = $("#rows");
    const rows = Array.isArray(data?.items) ? data.items : [];
    const total = Number(data?.total || 0);
    
    state.page = Number(data?.page || 1);
    state.totalPages = Math.max(1, Math.ceil(total / state.pageSize));

    $("#pageLabel").textContent = `Mostrando ${rows.length} de ${total} registros (Pág ${state.page}/${state.totalPages})`;
    $("#prev").disabled = state.page <= 1;
    $("#next").disabled = state.page >= state.totalPages;

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;color:#64748b">No se encontraron movimientos.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows.map(r => {
      // Fecha
      const fechaRaw = new Date(r.fecha || r.created_at);
      const fechaStr = !isNaN(fechaRaw) ? fechaRaw.toLocaleDateString() : '-';
      const horaStr = !isNaN(fechaRaw) ? fechaRaw.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '-';

      // Lógica del nombre
      const nombreMostrar = r.nombre_real || r.actor_nombre || ("Usuario #" + r.actor_user_id);
      const subTitulo = r.usuario_alias ? r.usuario_alias : ("ID: " + r.actor_user_id);
      
      const antes = safePreview(r.antes_json);
      const despues = safePreview(r.despues_json);
      const oracionHumanizada = humanizarEvento(r.accion, r.entidad);
      
      return `
        <tr>
          <td class="col-fecha">
            <div style="font-weight:700;color:#334155">${fechaStr}</div>
            <div style="font-size:12px">${horaStr}</div>
          </td>
          <td class="col-actor">
            <div style="font-size:14px">${escapeHTML(nombreMostrar)}</div>
            <small style="color:#94a3b8;font-weight:400">${escapeHTML(subTitulo)}</small>
          </td>
          
          <td>
            <div style="font-weight:600; color:#1e293b; font-size:14px;">
              ${escapeHTML(oracionHumanizada)}
            </div>
            <small style="color:#64748b">Ref: ${escapeHTML(r.entidad_id || 'N/A')} | Tag: ${escapeHTML(r.accion)}</small>
          </td>

          <td>
            ${(antes || despues) ? `
              <details style="cursor: pointer; outline: none;">
                <summary style="font-size: 13px; color: #2563eb; font-weight: 500; user-select: none;">
                  Ver evidencia técnica
                </summary>
                <div class="diff-grid" style="margin-top: 10px; cursor: text;">
                  ${antes ? `<div><span class="diff-label" style="font-size:11px;">ANTES</span><div class="json-box">${antes}</div></div>` : ''}
                  ${despues ? `<div><span class="diff-label" style="font-size:11px;">DESPUÉS</span><div class="json-box">${despues}</div></div>` : ''}
                </div>
              </details>
            ` : '<span style="color:#cbd5e1; font-style:italic; font-size: 13px;">Sin evidencia adicional</span>'}
          </td>
        </tr>`;
    }).join("");
  }

  function safePreview(val) {
    if (!val || val === "null") return null;
    try {
      const obj = typeof val === "string" ? JSON.parse(val) : val;
      if (!obj || (typeof obj === 'object' && Object.keys(obj).length === 0)) return null;
      return escapeHTML(JSON.stringify(obj, null, 2));
    } catch {
      return escapeHTML(String(val));
    }
  }

  // ¡AQUÍ ESTÁ LA CORRECCIÓN DE LA LETRA 'l' POR LAS COMILLAS '"'!
  function escapeHTML(str) {
    if(str == null) return "";
    return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function wire() {
    $("#btnSearch").addEventListener("click", () => { state.page = 1; load(); });
    $("#btnClear").addEventListener("click", () => {
       $("#actor").value = ""; $("#entidad").value = ""; $("#accion").value = ""; $("#desde").value = "";
       state.page = 1; load();
    });
    $("#prev").addEventListener("click", () => { if(state.page > 1){ state.page--; load(); }});
    $("#next").addEventListener("click", () => { if(state.page < state.totalPages){ state.page++; load(); }});
  }

  READY(async () => {
    wire();
    await fetchMe();
    load();
  });
})();