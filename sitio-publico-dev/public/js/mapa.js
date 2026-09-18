/**
 * ============================================================================
 * Archivo: public/js/mapa.js
 * Módulo: Controlador Frontend del Mapa Técnico
 * Descripción: Gestiona la comunicación con la API, dibuja trazados, marcadores,
 *              ventanas de información y renderiza el Corredor Operativo de 
 *              3 Puntos en el mapa y en el panel lateral tras el cálculo OTDR.
 * ============================================================================
 */

(function () {
  const $ = (id) => document.getElementById(id);
  let map, tramoPolys = [], pointMarkers = [], tacticalMarkers = [], infoWin;
  let currentClienteId = null;

  /* --- Inicialización --- */
  window.initMap = async function () {
    map = new google.maps.Map($("map"), {
      center: { lat: 14.6349, lng: -90.5069 },
      zoom: 14,
      mapTypeControl: true,
      streetViewControl: false
    });
    infoWin = new google.maps.InfoWindow();
    wireUI();

    const urlParams = new URLSearchParams(window.location.search);
    const clienteParam = urlParams.get('cliente');
    const nombreParam = urlParams.get('nombre') || 'Ruta del Cliente';
    const idextParam = urlParams.get('idext') || 'Sin ID Ext';
    
    if (clienteParam) {
        seleccionarCliente(clienteParam, nombreParam, idextParam);
    }
  };

  function wireUI() {
    $("txtSmartSearch")?.addEventListener("input", debounce(doSmartSearch, 500));
    $("btnBuscarFalla")?.addEventListener("click", onLocalizarFalla);
  }

  /* --- Lógica de Búsqueda --- */
  async function doSmartSearch() {
    const q = $("txtSmartSearch").value;
    if (q.length < 3) { $("searchResults").style.display = "none"; return; }

    try {
      const r = await fetch(`/api/infra/clientes-search?q=${q}`);
      const data = await r.json();
      const list = $("searchResults");
      list.innerHTML = (data.items || []).map(c => `
        <div class="search-item" onclick="seleccionarCliente(${c.id_cliente}, '${c.nombre_cliente}', '${c.ID_Cliente}')">
          <b>${c.nombre_cliente}</b> <br> <small>ID: ${c.ID_Cliente}</small>
        </div>
      `).join("");
      list.style.display = "block";
    } catch(e) { console.error("Error al buscar cliente:", e); }
  }

  window.seleccionarCliente = async (id, nombre, idExt) => {
    currentClienteId = id;
    $("searchResults").style.display = "none";
    $("txtSmartSearch").value = nombre;
    
    $("lblClienteNombre").textContent = nombre;
    $("lblClienteID").textContent = idExt;
    $("clientInfoCard").style.display = "block";
    $("faultPanel").classList.add("active");
    
    cargarMapaTecnico(id);
  };

  /* --- Dibujo de Mapa General --- */
  async function cargarMapaTecnico(idCliente) {
    limpiarMapa();
    const bounds = new google.maps.LatLngBounds();
    const paths = [];

    try {
      // 1. Cargar Tramos
      const resTr = await fetch(`/api/mapa/tramos?cliente_id=${idCliente}`, { credentials: "include" });
      const tramos = await resTr.json();

      tramos.forEach(t => {
          try {
              const coords = JSON.parse(t.geojson).map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
              const poly = new google.maps.Polyline({ 
                path: coords, 
                strokeColor: t.color || "#c7352b", 
                strokeWeight: 5, 
                map 
              });
              
              poly.addListener("click", (e) => {
                  let detalles = "Sin detalles";
                  try { detalles = JSON.parse(t.datos_cable).texto || t.datos_cable; } catch(err){}
                  
                  const content = `
                    <div style="padding:10px; font-family:sans-serif; max-width:200px;">
                      <b style="color:${t.color || '#c7352b'}">Detalles del Cable</b><hr style="margin:5px 0; border:0; border-top:1px solid #eee;">
                      <b>Capacidad:</b> ${t.capacidad || '?'} Hilos<br>
                      <p style='font-size:12px; margin:5px 0;'>${detalles}</p>
                    </div>`;
                  infoWin.setContent(content);
                  infoWin.setPosition(e.latLng);
                  infoWin.open(map);
              });

              tramoPolys.push(poly);
              coords.forEach(p => { bounds.extend(p); paths.push(coords); });
          } catch(e) {}
      });

      // 2. Cargar Puntos Relevantes
      const resPts = await fetch(`/api/mapa/puntos?cliente_id=${idCliente}`, { credentials: "include" });
      const pts = await resPts.json();

      pts.forEach(p => {
          const pos = { lat: parseFloat(p.lat), lng: parseFloat(p.lng) };
          let esRelevante = (p.metraje_cable !== null) || paths.some(path => isNearPolyline(pos, path, 15));

          if (esRelevante) {
              const m = new google.maps.Marker({ position: pos, map, icon: getIcon(p.tipo) });
              m.addListener("click", () => showInfo(m, p));
              pointMarkers.push(m);
          }
      });

      if (!bounds.isEmpty()) map.fitBounds(bounds);
    } catch (e) {
      console.error("Error al cargar mapa técnico:", e);
    }
  }

  /* --- Localización de Falla OTDR (Corredor 3 Puntos) --- */
  async function onLocalizarFalla() {
    const metros = $("txtFallaMetros").value;
    const sentido = $("selSentido").value;
    const errDiv = $("resFallaError");
    const corrBox = $("corredorBox");
    const btn = $("btnBuscarFalla");

    if (!metros || !currentClienteId) return;

    // Estado de carga
    errDiv.style.display = "none";
    corrBox.style.display = "none";
    btn.disabled = true;
    btn.textContent = "CALCULANDO CORTE...";
    limpiarMarcadoresTacticos();

    try {
      const res = await fetch("/api/falla/localizar", {
          method: "POST", 
          headers: {"Content-Type":"application/json"}, 
          credentials: "include",
          body: JSON.stringify({ cliente_id: currentClienteId, D: metros, sentido: sentido })
      });
      
      const data = await res.json();
      btn.disabled = false;
      btn.textContent = "UBICAR CORTE";
      
      if (res.ok && data.ok && data.corredor_tactico) {
          dibujarCorredorTactico(data.corredor_tactico);
      } else {
          errDiv.textContent = data.error || "Distancia fuera de la ruta trazada.";
          errDiv.style.display = "block";
      }
    } catch (e) {
      btn.disabled = false;
      btn.textContent = "UBICAR CORTE";
      errDiv.textContent = "Error de conexión con el servidor.";
      errDiv.style.display = "block";
    }
  }

  /* --- Trazado del Corredor Táctico en Mapa y Panel --- */
  function dibujarCorredorTactico(corredor) {
    const bounds = new google.maps.LatLngBounds();
    const listDiv = $("corredorList");
    listDiv.innerHTML = "";

    const estilos = {
      "-1": { color: "#f59e0b", tag: "tag-prev", textTag: "ANTERIOR [-1]", css: "prev" },
      "0":  { color: "#c62828", tag: "tag-corte", textTag: "CORTE [0]", css: "corte" },
      "1":  { color: "#3b82f6", tag: "tag-next", textTag: "POSTERIOR [+1]", css: "next" }
    };

    corredor.forEach((item) => {
      if (!item) return;
      const pos = { lat: Number(item.lat), lng: Number(item.lng) };
      const est = estilos[item.orden.toString()] || estilos["0"];
      bounds.extend(pos);

      // Dibujar Marcador en Google Maps
      let markerIcon;
      if (item.orden === 0) {
        // Ícono especial y círculo rojo para el corte
        markerIcon = { path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW, scale: 7, fillColor: est.color, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 };
        const circulo = new google.maps.Circle({ center: pos, radius: 15, fillColor: est.color, fillOpacity: 0.3, map, strokeColor: est.color, strokeWeight: 2 });
        tacticalMarkers.push(circulo);
      } else {
        markerIcon = { path: google.maps.SymbolPath.CIRCLE, scale: 6, fillColor: est.color, fillOpacity: 1, strokeColor: "white", strokeWeight: 2 };
      }

      const m = new google.maps.Marker({ position: pos, map, icon: markerIcon, zIndex: item.orden === 0 ? 999 : 100 });
      m.addListener("click", () => {
        infoWin.setContent(`
          <div style="padding:8px; font-family:sans-serif; max-width:200px;">
            <b style="color:${est.color}">${item.nombre}</b><br>
            <small style="color:#666;">${item.metraje_otdr || item.distancia_relativa || ''}</small>
            <p style="font-size:11px; margin:6px 0 0 0;">${item.detalle || ''}</p>
          </div>
        `);
        infoWin.open(map, m);
      });
      tacticalMarkers.push(m);

      // Dibujar Tarjeta en la Barra Lateral
      listDiv.innerHTML += `
        <div class="tactical-item ${est.css}" onclick="panToPoint(${pos.lat}, ${pos.lng})">
          <div class="tactical-title">
            <span>${item.nombre}</span>
            <span class="tactical-tag ${est.tag}">${est.textTag}</span>
          </div>
          <div class="tactical-desc">
            <b>${item.metraje_otdr || item.distancia_relativa || ''}</b><br>
            ${item.detalle || 'Estructura de referencia para auditoría.'}
          </div>
        </div>
      `;
    });

    $("corredorBox").style.display = "block";
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds);
      const listener = google.maps.event.addListener(map, "idle", () => {
        if (map.getZoom() > 18) map.setZoom(18);
        google.maps.event.removeListener(listener);
      });
    }
  }

  window.panToPoint = function(lat, lng) {
    if (map) {
      map.panTo({ lat: Number(lat), lng: Number(lng) });
      map.setZoom(18);
    }
  };

  /* --- Funciones Auxiliares --- */
  function showInfo(marker, p) {
    const content = `
      <div style="padding:10px; font-family:sans-serif; max-width:220px; text-align:center;">
        <b style="color:#c62828; font-size:15px;">${p.nombre}</b> <br>
        <span style="font-size:11px; color:#666; font-weight:bold;">${p.tipo.toUpperCase()}</span>
        ${p.foto ? `<img src="${p.foto}" style="width:100%; max-height:150px; object-fit:cover; border-radius:6px; margin:8px 0; border:1px solid #ddd;">` : ''}
        <div style="text-align:left; background:#f9fafb; padding:8px; border-radius:6px; margin-top:8px; font-size:12px;">
            ${p.metraje_cable ? `<b style="color:#333;">Metraje:</b> ${p.metraje_cable}m<br>` : ""}
            ${p.nota ? `<div style="margin-top:5px; border-top:1px dashed #ccc; padding-top:5px; color:#555;"><i>"${p.nota}"</i></div>` : ""}
            ${(!p.metraje_cable && !p.nota) ? `<i style="color:#999;">Sin datos de auditoría</i>` : ""}
        </div>
        <a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank" 
           style="display:block; margin-top:10px; background:#c62828; color:white; text-align:center; padding:8px; border-radius:6px; text-decoration:none; font-weight:bold;">🚗 Cómo llegar</a>
      </div>`;
    infoWin.setContent(content);
    infoWin.open(map, marker);
  }

  function getIcon(tipo) {
    const colors = { poste: "#f97316", pozo: "#6b7280", central: "#c62828", cliente: "#22c55e" };
    return { path: google.maps.SymbolPath.CIRCLE, fillColor: colors[tipo.toLowerCase()] || "#3b82f6", fillOpacity: 1, scale: 6, strokeWeight: 2, strokeColor: "white" };
  }

  function limpiarMarcadoresTacticos() {
    tacticalMarkers.forEach(m => m.setMap(null));
    tacticalMarkers = [];
  }

  function limpiarMapa() {
    tramoPolys.forEach(p => p.setMap(null)); tramoPolys = [];
    pointMarkers.forEach(m => m.setMap(null)); pointMarkers = [];
    limpiarMarcadoresTacticos();
    if ($("resFallaError")) $("resFallaError").style.display = "none";
    if ($("corredorBox")) $("corredorBox").style.display = "none";
  }

  function isNearPolyline(pt, path, tolMetros) {
    const tol = tolMetros / 111320;
    for (let i = 0; i < path.length - 1; i++) {
        const d = distToSegment(pt.lng, pt.lat, path[i].lng, path[i].lat, path[i+1].lng, path[i+1].lat);
        if (Math.sqrt(d) < tol) return true;
    }
    return false;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    let l2 = (x1-x2)**2 + (y1-y2)**2;
    if (l2 === 0) return (px-x1)**2 + (py-y1)**2;
    let t = ((px-x1)*(x2-x1) + (py-y1)*(y2-y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return (px - (x1 + t*(x2-x1)))**2 + (py - (y1 + t*(y2-y1)))**2;
  }

  function debounce(fn, ms) {
    let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }
})();