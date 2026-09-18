// =========================================================================
// Archivo: public/js/infraestructura.js
// Versión: 31.0 - (Edición de Mufas + Efecto Liga y Quiebres de Cable)
// Descripción: Gestión de Mapa de Infraestructura Externa.
// =========================================================================

const $ = (id) => document.getElementById(id);

/* ---------------- Estado Global Original ---------------- */
let map;
let markers = [];
let pickMode = false;
let pickMarker = null;

let drawMode = false;
let drawPolyline = null;
let drawPath = []; 

let puntosCache = [];
let selectedPointId = null;

// Nuevo: Objeto avanzado para rastrear polilíneas y sus datos para el "Efecto Liga"
let tramoObjetos = []; 
let infoWinTramo = null;
let editingTramoId = null;
let currentClienteId = null;

let infoWinPunto = null;

// Estado Global de la Mufa en Escritorio
let currentMufaIdEscritorio = null;

/* ---------------- Inicialización Original ---------------- */
window.initMap = function() {
  map = new google.maps.Map($("map"), {
    center: { lat: 14.6349, lng: -90.5069 },
    zoom: 14,
    streetViewControl: false
  });

  infoWinPunto = new google.maps.InfoWindow();

  map.addListener("click", (e) => {
    if (pickMode) handlePickClick(e.latLng);
    if (drawMode) handleDrawClick(e.latLng);
  });

  wireUI();
  wireUIMufas(); 
  cargarPuntos(); 
};

function wireUI() {
  $("btnPickOnMap")?.addEventListener("click", () => {
    pickMode = !pickMode;
    $("btnPickOnMap").textContent = pickMode ? "Salir de Selección" : "🎯 Capturar Ubicación (Clic)";
    if (!pickMode && pickMarker) { pickMarker.setMap(null); pickMarker = null; }
  });

  $("btnGuardarPunto")?.addEventListener("click", onGuardarPunto);
  $("btnNuevoPunto")?.addEventListener("click", resetPuntoForm);
  $("btnEliminarPunto")?.addEventListener("click", onEliminarPunto);
  
  $("btnTrazar")?.addEventListener("click", toggleDraw);
  $("btnGuardarTramo")?.addEventListener("click", onGuardarTramo);
  $("btnNuevoTramo")?.addEventListener("click", clearEditingTramo);
  
  $("clienteSearch")?.addEventListener("input", debounce(doClienteSearch, 500));

  $("btnIrCoords")?.addEventListener("click", () => {
    const lat = parseFloat($("ptLat").value);
    const lng = parseFloat($("ptLng").value);
    if (!isNaN(lat) && !isNaN(lng)) {
        map.setCenter({ lat, lng });
        map.setZoom(17);
    } else {
        alert("Introduce coordenadas numéricas válidas.");
    }
  });
}

/* ---------------- Gestión de Pestañas Nav ---------------- */
window.switchTab = function(t) {
    document.querySelectorAll(".tab-pane").forEach(p => {
        p.classList.remove("active");
        p.style.display = "none"; 
    });
    document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
    
    const selectedTab = $("tab-" + t);
    if (selectedTab) {
        selectedTab.classList.add("active");
        selectedTab.style.display = "block"; 
    }
    
    if (event && event.currentTarget) {
        event.currentTarget.classList.add("active");
    }
};

/* ---------------- Lógica de Puntos y EFECTO LIGA ---------------- */
async function cargarPuntos() {
  const url = "/api/infra/puntos"; 
  try {
    const r = await fetch(url, { credentials: "include", cache: "no-store" });
    if (!r.ok) throw new Error("Fallo al traer puntos");
    
    const data = await r.json();
    puntosCache = data;
    renderMarkers(data);
  } catch (e) { console.error("Error cargando puntos:", e); }
}

function renderMarkers(puntos) {
  markers.forEach(m => m.setMap(null));
  markers = [];

  const dataArray = Array.isArray(puntos) ? puntos : (puntos?.puntos || []);

  dataArray.forEach(p => {
    const lat = parseFloat(p.lat);
    const lng = parseFloat(p.lng);
    if (isNaN(lat) || isNaN(lng)) return;

    const m = new google.maps.Marker({
      position: { lat, lng },
      map: map,
      title: p.nombre,
      icon: getIconByTipo(p.tipo, p.total_mufas),
      draggable: false 
    });

    m.addListener("click", () => {
      if (drawMode) {
        if (!$("trOrigenId").value) {
            $("trOrigenId").value = p.id_punto;
            $("trOrigenNombre").value = p.nombre || `Punto #${p.id_punto}`;
        } else {
            $("trDestinoId").value = p.id_punto;
            $("trDestinoNombre").value = p.nombre || `Punto #${p.id_punto}`;
        }
        handleDrawClick(new google.maps.LatLng(lat, lng));
      } else {
        cargarFormPunto(p);
        
        markers.forEach(mk => mk.setDraggable(false));
        m.setDraggable(true);
        
        const nombreSeguro = (p.nombre || 'Sin nombre').replace(/'/g, "\\'");
        
        let contentHtml = `<div style="text-align:center; min-width: 150px; padding: 5px;">
                            <h3 style="margin: 0 0 8px 0; color: #c7352b; font-size: 14px;">${p.nombre || 'Sin nombre'}</h3>`;
        if (p.foto) {
            contentHtml += `<img src="${p.foto}" style="width: 100%; max-width: 200px; border-radius: 6px; box-shadow: 0 2px 5px rgba(0,0,0,0.2);">`;
        } else {
            contentHtml += `<p style="margin:0; font-size: 12px; color: #666;">Sin evidencia fotográfica</p>`;
        }
        
        const cantMufas = p.total_mufas || 0;
        contentHtml += `<div style="margin-top: 8px;">
                            <button onclick="window.abrirMufaEscritorio(${p.id_punto}, '${nombreSeguro}')" 
                                    style="background:#1e40af; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold; font-size:11px; box-shadow: 0 2px 4px rgba(0,0,0,0.15);">
                                    🪢 Gestionar Mufa (${cantMufas})
                            </button>
                        </div>`;

        contentHtml += `<div style="margin-top: 6px;">
                            <button onclick="window.abrirModalAuditoria(${p.id_punto}, '${nombreSeguro}')" 
                                    style="background:#f59e0b; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; width:100%; font-weight:bold; font-size:11px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);">
                                🛠️ Auditar Punto
                            </button>
                        </div>`;
        
        contentHtml += `<p style="margin-top:8px; font-size:11px; color:#10b981; font-weight:bold;">✨ Puedes arrastrar el punto para reubicarlo</p>`;
        contentHtml += `</div>`;
        
        infoWinPunto.setContent(contentHtml);
        infoWinPunto.open(map, m);
      }
    });

    // --- MAGIA: EFECTO LIGA EN TIEMPO REAL ---
    m.addListener("drag", (e) => {
        tramoObjetos.forEach(obj => {
            const path = obj.polyline.getPath();
            // Si el punto arrastrado es el origen del cable
            if (obj.data.punto_origen_id === p.id_punto) {
                path.setAt(0, e.latLng);
            }
            // Si el punto arrastrado es el destino del cable
            if (obj.data.punto_destino_id === p.id_punto) {
                path.setAt(path.getLength() - 1, e.latLng);
            }
        });
    });

    // --- MAGIA: AUTO-GUARDADO DE LIGA AL SOLTAR EL PUNTO ---
    m.addListener("dragend", async (e) => {
        $("ptLat").value = e.latLng.lat().toFixed(6);
        $("ptLng").value = e.latLng.lng().toFixed(6);
        
        const btnGuardar = $("btnGuardarPunto");
        if(btnGuardar) {
            btnGuardar.textContent = "⌛ Sincronizando Tramos...";
            btnGuardar.style.backgroundColor = "#f59e0b";
            btnGuardar.disabled = true;
        }

        await autoGuardarLiga(p, e.latLng);

        if(btnGuardar) {
            btnGuardar.textContent = "✅ Posición Actualizada";
            btnGuardar.style.backgroundColor = "#10b981";
            setTimeout(() => {
                btnGuardar.textContent = "Guardar Punto";
                btnGuardar.style.backgroundColor = "";
                btnGuardar.disabled = false;
            }, 2500);
        }
    });

    m.addListener("dblclick", () => window.abrirModalAuditoria(p.id_punto, p.nombre));
    
    markers.push(m);
  });
}

function getIconByTipo(tipoRaw, totalMufas) {
  const tipo = String(tipoRaw || "").trim().toLowerCase();
  if (totalMufas > 0) return { path: google.maps.SymbolPath.CIRCLE, fillColor: "#1e40af", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2, scale: 11 };
  const colors = { poste: "#f97316", pozo: "#6b7280", cliente: "#22c55e", central: "#ef4444" };
  return { path: google.maps.SymbolPath.CIRCLE, fillColor: colors[tipo] || "#3b82f6", fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 1, scale: 7 };
}

// Función auxiliar para grabar en la BD la nueva posición del punto y los cables estirados
async function autoGuardarLiga(puntoBase, newLatLng) {
    try {
        // 1. Guardar la nueva coordenada del punto (Poste/Pozo)
        const fd = new FormData();
        fd.append("id_punto", puntoBase.id_punto);
        fd.append("nombre", $("ptNombre").value || puntoBase.nombre);
        fd.append("tipo", $("ptTipo").value || puntoBase.tipo);
        fd.append("lat", newLatLng.lat().toFixed(6));
        fd.append("lng", newLatLng.lng().toFixed(6));
        fd.append("descripcion", $("ptDesc").value || puntoBase.descripcion);
        await fetch("/api/infra/puntos", { method: "POST", body: fd });

        // 2. Buscar qué cables se estiraron y guardar su nueva forma (GeoJSON)
        const tramosAfectados = tramoObjetos.filter(t => 
            t.data.punto_origen_id === puntoBase.id_punto || 
            t.data.punto_destino_id === puntoBase.id_punto
        );
        
        for (let tramoObj of tramosAfectados) {
            const pl = tramoObj.polyline;
            const geojsonRaw = pl.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
            
            const payload = {
                id_tramo: tramoObj.data.id_tramo || tramoObj.data.id,
                id_cliente: tramoObj.data.id_cliente,
                id_origen: tramoObj.data.punto_origen_id,
                id_destino: tramoObj.data.punto_destino_id,
                capacidad: tramoObj.data.capacidad,
                color: tramoObj.data.color,
                datos_cable: typeof tramoObj.data.datos_cable === 'string' ? tramoObj.data.datos_cable : JSON.stringify(tramoObj.data.datos_cable),
                geojson: JSON.stringify(geojsonRaw)
            };
            
            await fetch("/api/infra/tramos", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify(payload) 
            });
        }
    } catch (e) {
        console.error("Error sincronizando liga:", e);
    }
}

/* ---------------- GESTIÓN TOTAL DE MUFAS DESDE EL ESCRITORIO ---------------- */
function wireUIMufas() {
    let hilosHtml = '';
    for(let i=1; i<=144; i++) hilosHtml += `<option value="Hilo ${i}">Hilo ${i}</option>`;
    $("fusionHiloOri").innerHTML = hilosHtml;
    $("fusionHiloDes").innerHTML = hilosHtml;

    $("btnGuardarCableMufa").onclick = async () => {
        if (!currentMufaIdEscritorio) return;
        const chaqueta = $("mufaCableChaqueta").value.trim();
        if(!chaqueta) return alert("Escribe los datos de la chaqueta.");
        
        const payload = { 
            id_mufa: currentMufaIdEscritorio, 
            etiqueta_identificador: $("mufaCableLetra").value, 
            datos_chaqueta: chaqueta, 
            capacidad_hilos: $("mufaCableCapacidad").value, 
            tipo_cable: $("mufaCableTipo").value 
        };
        
        try {
            const r = await fetch("/api/mufas/cables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await r.json();
            if(!d.ok) throw new Error(d.error);
            $("mufaCableChaqueta").value = ""; 
            renderDatosMufaActual(); 
        } catch (e) { alert("Error: " + e.message); }
    };

    $("btnGuardarFusionMufa").onclick = async () => {
        if (!currentMufaIdEscritorio) return;
        if (!$("fusionCableOri").value || !$("fusionCableDes").value) return alert("Debes tener al menos 2 cables para fusionar.");

        const payload = { 
            id_mufa: currentMufaIdEscritorio, 
            id_cable_origen: $("fusionCableOri").value, 
            tubo_origen: $("fusionTuboOri").value || 'S/T', 
            hilo_origen: $("fusionHiloOri").value, 
            id_cable_destino: $("fusionCableDes").value, 
            tubo_destino: $("fusionTuboDes").value || 'S/T', 
            hilo_destino: $("fusionHiloDes").value, 
            atenuacion_db: $("fusionDb").value || null, 
            id_cliente_asignado: $("mufaIdClienteReal").value || null, 
            observacion_fusion: $("fusionObs").value 
        };
        
        try {
            const r = await fetch("/api/mufas/fusiones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
            const d = await r.json();
            if(!d.ok) throw new Error(d.error);
            
            $("fusionObs").value = ""; $("fusionDb").value = ""; 
            $("mufaIdClienteReal").value = ""; $("mufaClienteSeleccionado").textContent = ""; $("mufaClienteSearch").value = "";
            renderDatosMufaActual(); 
        } catch (e) { alert("Error: " + e.message); }
    };

    $("mufaClienteSearch").oninput = debounce(async (e) => {
        const q = e.target.value; 
        if (q.length < 3) return $("mufaClienteResults").style.display = 'none';
        const r = await fetch(`/api/infra/clientes-search?q=${q}`); 
        const data = await r.json();
        $("mufaClienteResults").innerHTML = data.items.map(c => `<div class="search-item" onclick="seleccionarClienteMufa(${c.id_cliente}, '${c.nombre_cliente}')"><b>${c.nombre_cliente}</b></div>`).join("");
        $("mufaClienteResults").style.display = 'block';
    }, 500);

    window.seleccionarClienteMufa = (id, nombre) => { 
        $("mufaIdClienteReal").value = id; 
        $("mufaClienteSeleccionado").textContent = `✅ Asignado a: ${nombre}`; 
        $("mufaClienteResults").style.display = 'none'; 
        $("mufaClienteSearch").value = nombre; 
    };

    window.eliminarFusionMufa = async (id_fusion) => { 
        if(!confirm("¿Estás seguro de deshacer este empalme?")) return; 
        await fetch(`/api/mufas/fusiones/${id_fusion}`, { method: 'DELETE' }); 
        renderDatosMufaActual(); 
    };
}

window.abrirMufaEscritorio = async function(idPunto, nombrePunto) {
    try {
        const rM = await fetch(`/api/mufas/punto/${idPunto}`);
        const dM = await rM.json();
        
        const listaMufas = dM.mufas || [];
        
        if (listaMufas.length === 0) {
            if (confirm(`El ${nombrePunto} no tiene una mufa registrada. ¿Deseas inicializar su matriz de empalmes ahora desde la oficina?`)) {
                const rc = await fetch("/api/mufas", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ id_punto: idPunto, nombre_mufa: "Mufa Principal" })
                });
                const dc = await rc.json();
                if (dc.id_mufa || dc.insertId || dc.ok) {
                    alert("¡Mufa inicializada!");
                    cargarPuntos(); 
                    currentMufaIdEscritorio = dc.id_mufa || dc.insertId;
                } else return alert("Error del servidor: " + (dc.error || JSON.stringify(dc)));
            } else return; 
        } else {
            currentMufaIdEscritorio = listaMufas[0].id_mufa;
        }
        
        await renderDatosMufaActual();
        
        $("modalOverlay").style.display = "block";
        $("modalMufaEscritorio").style.display = "block";
    } catch (e) { alert("Error mapeando mufa: " + e.message); }
};

async function renderDatosMufaActual() {
    if (!currentMufaIdEscritorio) return;

    const rC = await fetch(`/api/mufas/${currentMufaIdEscritorio}/cables`);
    const dC = await rC.json();
    const listaCables = dC.cables || [];
    let totalHilosSistema = 0;
    
    $("escritorioCablesLista").innerHTML = listaCables.map(c => {
        totalHilosSistema += c.capacidad_hilos;
        return `<div style="border-bottom:1px solid #e2e8f0; padding:4px 0;">
                    <b>${c.etiqueta_identificador}:</b> ${c.datos_chaqueta} <span style="color:#1e40af;font-weight:bold;">(${c.capacidad_hilos}H)</span>
                </div>`;
    }).join('') || "<small style='color:#666;'>Sin cables registrados en esta mufa.</small>";

    const opcionesCables = listaCables.map(c => `<option value="${c.id_cable_mufa}">${c.etiqueta_identificador} (${c.capacidad_hilos}H)</option>`).join('');
    $("fusionCableOri").innerHTML = opcionesCables || '<option value="">Sin cables</option>';
    $("fusionCableDes").innerHTML = opcionesCables || '<option value="">Sin cables</option>';

    const rF = await fetch(`/api/mufas/${currentMufaIdEscritorio}/matriz`);
    const dF = await rF.json();
    const listaFusiones = dF.fusiones || [];
    
    $("escritorioMatrizCuerpo").innerHTML = listaFusiones.map(f => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:6px;"><b>${f.origen_cable}</b> [${f.tubo_origen}/${f.hilo_origen}]</td>
            <td style="padding:6px;"><b>${f.destino_cable}</b> [${f.tubo_destino}/${f.hilo_destino}]</td>
            <td style="padding:6px; color:#16a34a; font-weight:bold;">${f.nombre_cliente || '<span style="color:#94a3b8">Ninguno</span>'}</td>
            <td style="padding:6px; color:#64748b;">${f.observacion_fusion || ''}</td>
            <td style="padding:6px; text-align:center;">
                <button onclick="eliminarFusionMufa(${f.id_fusion})" style="background:#fee2e2; color:#b91c1c; border:none; padding:4px 6px; border-radius:4px; font-weight:bold; cursor:pointer;">X</button>
            </td>
        </tr>
    `).join('') || "<tr><td colspan='5' style='padding:10px; text-align:center; color:#666;'>Sin fusiones en la matriz. Añade cables y regístralas arriba.</td></tr>";

    const hilosOcupados = listaFusiones.length * 2;
    const hilosLibres = Math.max(0, totalHilosSistema - hilosOcupados);
    $("escritorioDispoMufa").textContent = `${hilosLibres} / ${totalHilosSistema} Hilos Libres`;
}

/* ---------------- Lógica de Creación Original de Puntos ---------------- */
function handlePickClick(latLng) {
  $("ptLat").value = latLng.lat().toFixed(6);
  $("ptLng").value = latLng.lng().toFixed(6);
  if (pickMarker) pickMarker.setMap(null);
  pickMarker = new google.maps.Marker({ position: latLng, map });
}

function cargarFormPunto(p) {
  selectedPointId = p.id_punto;
  $("ptNombre").value = p.nombre || "";
  $("ptTipo").value = p.tipo || "poste";
  $("ptLat").value = p.lat || "";
  $("ptLng").value = p.lng || "";
  $("ptDesc").value = p.descripcion || "";
  
  $("ptFoto").value = "";
  if (p.foto) {
      $("ptFotoPreview").src = p.foto;
      $("ptFotoPreview").style.display = "block";
  } else {
      $("ptFotoPreview").src = "";
      $("ptFotoPreview").style.display = "none";
  }
  
  const btnGuardar = $("btnGuardarPunto");
  if(btnGuardar) {
      btnGuardar.textContent = "Guardar Punto";
      btnGuardar.style.backgroundColor = ""; 
      btnGuardar.style.boxShadow = "";
  }
  
  const btnDel = $("btnEliminarPunto");
  if(btnDel) btnDel.style.display = "block";
}

function resetPuntoForm() {
    selectedPointId = null;
    $("ptNombre").value = ""; 
    $("ptTipo").value = "poste"; 
    $("ptDesc").value = ""; 
    $("ptLat").value = ""; 
    $("ptLng").value = "";
    $("ptFoto").value = "";
    $("ptFotoPreview").src = "";
    $("ptFotoPreview").style.display = "none";
    if (infoWinPunto) infoWinPunto.close();
    
    if (pickMarker) { pickMarker.setMap(null); pickMarker = null; }
    
    const btnGuardar = $("btnGuardarPunto");
    if(btnGuardar) {
        btnGuardar.textContent = "Guardar Punto";
        btnGuardar.style.backgroundColor = "";
        btnGuardar.style.boxShadow = "";
    }
    
    markers.forEach(mk => mk.setDraggable(false));
    
    const btnDel = $("btnEliminarPunto");
    if(btnDel) btnDel.style.display = "none";
}

async function onGuardarPunto() {
  if (!$("ptLat").value || !$("ptLng").value) return alert("Captura una ubicación primero.");

  const fd = new FormData();
  if (selectedPointId) fd.append("id_punto", selectedPointId);
  fd.append("nombre", $("ptNombre").value);
  fd.append("tipo", $("ptTipo").value);
  fd.append("lat", $("ptLat").value);
  fd.append("lng", $("ptLng").value);
  fd.append("descripcion", $("ptDesc").value);
  
  const fotoFile = $("ptFoto").files[0];
  if (fotoFile) fd.append("foto", fotoFile);

  try {
    const btnGuardar = $("btnGuardarPunto");
    btnGuardar.disabled = true;
    btnGuardar.textContent = "Guardando...";

    const r = await fetch("/api/infra/puntos", {
      method: "POST", credentials: "include",
      body: fd 
    });

    if (r.ok) {
      alert("¡Punto Guardado!");
      cargarPuntos();
      resetPuntoForm();
    } else { alert("Error guardando punto"); }
  } catch (e) { alert("Error de conexión"); }
  finally {
     const btnGuardar = $("btnGuardarPunto");
     btnGuardar.disabled = false;
     btnGuardar.textContent = "Guardar Punto";
     btnGuardar.style.backgroundColor = "";
     btnGuardar.style.boxShadow = "";
  }
}

async function onEliminarPunto() {
    if (!selectedPointId) return;
    if (!confirm("¿Estás seguro de que deseas eliminar este punto?")) return;

    try {
        const r = await fetch(`/api/infra/puntos/${selectedPointId}`, { method: "DELETE", credentials: "include" });
        if (r.ok) {
            alert("Punto eliminado.");
            resetPuntoForm(); 
            cargarPuntos();   
        } else { alert("Error al eliminar el punto"); }
    } catch (e) { alert("Error de conexión"); }
}

/* ---------------- Tramos y Buscador Original ---------------- */
function toggleDraw() {
  drawMode = !drawMode;
  if (drawMode) {
    drawPath = [];
    if(drawPolyline) drawPolyline.setMap(null);
    drawPolyline = new google.maps.Polyline({ strokeColor: $("trColor")?.value || "#E11D48", strokeWeight: 4, map, editable: true });
    $("btnTrazar").textContent = "💾 Finalizar Trazo (Terminar Dibujo)";
  } else { $("btnTrazar").textContent = "✏️ Comenzar Trazo"; }
}

function handleDrawClick(latLng) {
  if (!drawPolyline) return;
  const path = drawPolyline.getPath();
  path.push(latLng);
  drawPath = path.getArray();
}

function clearEditingTramo() {
  editingTramoId = null;
  if (drawMode) toggleDraw();
  if (drawPolyline) drawPolyline.setMap(null);
  $("trOrigenId").value = ""; $("trDestinoId").value = "";
  $("trOrigenNombre").value = ""; $("trDestinoNombre").value = "";
  $("trDetalle").value = ""; $("trCapacidad").value = "";
}

// --- MAGIA: CARGA DE TRAMOS Y ACTIVACIÓN DE QUIEBRES (VÉRTICES) ---
async function cargarTramosCliente() {
  clearTramos();
  if (!currentClienteId) return;
  
  const r = await fetch(`/api/infra/tramos?cliente_id=${currentClienteId}`, { credentials: "include", cache: "no-store" });
  if (!r.ok) return;
  const tramos = await r.json();

  infoWinTramo = new google.maps.InfoWindow();
  const bounds = new google.maps.LatLngBounds();
  let tieneRuta = false;

  tramos.forEach(t => {
    let pathCoords = [];
    
    try {
        let parsed = t.geojson;
        if (typeof t.geojson === "string") {
            parsed = JSON.parse(t.geojson);
        }
        if (Array.isArray(parsed)) {
            pathCoords = parsed.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) }));
        }
    } catch (err) { console.error("Error leyendo coordenadas del tramo:", err); }

    if (pathCoords.length < 2) return;

    let datosTexto = t.datos_cable || "";
    if (typeof datosTexto === "string" && datosTexto.startsWith("{")) {
        try { datosTexto = JSON.parse(datosTexto).texto || ""; } catch{}
    } else if (typeof datosTexto === "object" && datosTexto !== null) {
        datosTexto = datosTexto.texto || "";
    }

    const pl = new google.maps.Polyline({ 
        map, 
        path: pathCoords, 
        geodesic: false, 
        strokeColor: t.color || "#3b82f6",
        strokeOpacity: 1, 
        strokeWeight: 5 
    });

    pathCoords.forEach(p => bounds.extend(p));
    tieneRuta = true;

    const tramoId = t.id_tramo || t.id;

    // Menú de Edición de la Línea
    pl.addListener("click", (e) => {
       infoWinTramo.setContent(`
         <div style="font-weight:bold; font-size:14px;">Tramo #${tramoId}</div>
         <div style="font-size:0.9em;color:#555; margin-bottom:8px;">${escapeHtml(datosTexto)}</div>
         <div style="display:flex; flex-direction:column; gap:5px;">
           <button id="btnEditTr_${tramoId}" class="btn tiny" style="background:#f59e0b; color:white; padding:6px; font-weight:bold; border:none; border-radius:4px; cursor:pointer;">🛠 Auditar y Continuar</button>
           <button id="btnReshapeTr_${tramoId}" class="btn tiny" style="background:#10b981; color:white; padding:6px; font-weight:bold; border:none; border-radius:4px; cursor:pointer;">✏️ Amoldar Línea a Calle</button>
           <button id="btnDelTr_${tramoId}" class="btn tiny danger" style="padding:6px; font-weight:bold; border:none; border-radius:4px; cursor:pointer; background:#fee2e2; color:#b91c1c;">🗑 Eliminar Segmento</button>
         </div>
       `);
       infoWinTramo.setPosition(e.latLng);
       infoWinTramo.open(map);

       google.maps.event.addListenerOnce(infoWinTramo, "domready", () => {
          $("btnEditTr_" + tramoId)?.addEventListener("click", () => { 
              editingTramoId = tramoId; 
              alert("Tramo seleccionado. Ahora haz clic en un poste para auditarlo o continuar la ruta."); 
              infoWinTramo.close(); 
          });
          $("btnReshapeTr_" + tramoId)?.addEventListener("click", () => { 
              activarEdicionTramo(pl, t);
              infoWinTramo.close(); 
          });
          $("btnDelTr_" + tramoId)?.addEventListener("click", () => { 
              eliminarTramo(tramoId); 
              infoWinTramo.close(); 
          });
       });
    });

    tramoObjetos.push({ polyline: pl, data: t });
  });

  if (tieneRuta) {
      map.fitBounds(bounds);
  }
}

// Activa los vértices intermedios para que la línea siga la forma de la banqueta/calle
function activarEdicionTramo(polyline, tramoData) {
    polyline.setEditable(true);
    polyline.setOptions({ strokeColor: '#10b981', zIndex: 9999, strokeWeight: 6 }); 
    
    let floatBtn = $("btnSaveReshape");
    floatBtn.style.display = "block";
    
    floatBtn.onclick = async () => {
        floatBtn.innerHTML = "⌛ Asegurando Geometría...";
        const geojsonRaw = polyline.getPath().getArray().map(pt => ({ lat: pt.lat(), lng: pt.lng() }));
        
        const payload = {
            id_tramo: tramoData.id_tramo || tramoData.id,
            id_cliente: tramoData.id_cliente,
            id_origen: tramoData.punto_origen_id,
            id_destino: tramoData.punto_destino_id,
            capacidad: tramoData.capacidad,
            color: tramoData.color,
            datos_cable: typeof tramoData.datos_cable === 'string' ? tramoData.datos_cable : JSON.stringify(tramoData.datos_cable),
            geojson: JSON.stringify(geojsonRaw)
        };
        
        try {
            await fetch("/api/infra/tramos", { 
                method: "POST", 
                headers: { "Content-Type": "application/json" }, 
                body: JSON.stringify(payload) 
            });
            polyline.setEditable(false);
            polyline.setOptions({ strokeColor: tramoData.color || '#3b82f6', zIndex: 1, strokeWeight: 5 });
            floatBtn.style.display = "none";
            floatBtn.innerHTML = "💾 GUARDAR NUEVA RUTA DEL CABLE";
            alert("Curvatura del cable guardada exitosamente.");
        } catch (e) {
            alert("Error guardando curvatura.");
        }
    };
}

function clearTramos() {
  tramoObjetos.forEach((t) => t.polyline.setMap(null));
  tramoObjetos = [];
  if (infoWinTramo) infoWinTramo.close();
}

async function onGuardarTramo() {
  if (!currentClienteId) return alert("Selecciona un cliente primero.");
  
  const payload = {
    id_tramo: editingTramoId,
    id_cliente: currentClienteId,
    id_origen: $("trOrigenId").value || null,
    id_destino: $("trDestinoId").value || null,
    capacidad: $("trCapacidad").value,
    color: $("trColor").value,
    datos_cable: JSON.stringify({ texto: $("trDetalle").value }),
    geojson: JSON.stringify(drawPath.map(p => ({ lat: p.lat(), lng: p.lng() })))
  };

  const r = await fetch("/api/infra/tramos", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });

  if (r.ok) {
    const data = await r.json();
    editingTramoId = data.id_tramo;
    alert("Tramo Guardado. Ahora haz clic en los puntos y usa el botón 'Auditar Punto'.");
    cargarTramosCliente();
    if(drawMode) toggleDraw();
  }
}

async function eliminarTramo(id) {
  if (!confirm("¿Eliminar este tramo?")) return;
  const r = await fetch(`/api/infra/tramos/${id}`, { method: "DELETE", credentials: "include" });
  if (r.ok) { alert("Eliminado."); cargarTramosCliente(); }
}

// Helpers
function debounce(fn, ms) { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => fn.apply(this, args), ms); }; }
function escapeHtml(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

async function doClienteSearch() {
  const q = $("clienteSearch").value;
  if (q.length < 3) return;
  const r = await fetch(`/api/infra/clientes-search?q=${q}`);
  const data = await r.json();
  const resCont = $("clienteResults");
  resCont.innerHTML = data.items.map(c => `<div class="search-item" onclick="window.seleccionarCliente(${c.id_cliente}, '${c.nombre_cliente}')">${c.nombre_cliente} (${c.ID_Cliente})</div>`).join("");
  resCont.style.display = "block";
}

window.seleccionarCliente = (id, nombre) => {
  currentClienteId = id; $("trClienteId").value = id; $("clienteSelectedLabel").textContent = "Cliente: " + nombre; $("clienteResults").style.display = "none";
  cargarTramosCliente();
};

/* ---------------- Lógica de Auditoría Original Corregida ---------------- */
window.abrirModalAuditoria = async function(idPunto, nombrePunto) {
  if (!currentClienteId || !editingTramoId) { return alert("Debes seleccionar un cliente y tener un tramo seleccionado para auditar un punto."); }

  $("auditPuntoNombre").textContent = nombrePunto || `Punto #${idPunto}`;
  $("auditMetraje").value = ""; $("auditDistancia").value = ""; $("auditNota").value = "";

  const labelCliente = $("clienteSelectedLabel").textContent.replace("Cliente: ", "");
  $("auditClienteNombre").textContent = labelCliente || "Cliente Seleccionado";

  try {
      const url = `/api/infra/auditoria?id_cliente=${currentClienteId}&id_punto=${idPunto}&id_tramo=${editingTramoId}`;
      const r = await fetch(url, { credentials: "include", cache: "no-store" });
      if (r.ok) {
          const data = await r.json();
          if (data && data.metraje_cable !== undefined) {
              $("auditMetraje").value = data.metraje_cable || "";
              $("auditDistancia").value = data.distancia_sig || "";
              $("auditNota").value = data.nota || "";
          }
      }
  } catch(e) { console.warn("Punto sin auditar previamente"); }

  $("modalOverlay").style.display = "block"; $("modalAuditoria").style.display = "block";

  $("btnAuditGuardar").onclick = async () => {
    const btn = $("btnAuditGuardar");
    btn.disabled = true; btn.textContent = "Guardando...";
    const payload = { id_cliente: currentClienteId, id_punto: idPunto, id_tramo: editingTramoId, metraje: $("auditMetraje").value, distancia: $("auditDistancia").value, nota: $("auditNota").value };
    const res = await fetch("/api/infra/auditoria", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(payload) });
    btn.disabled = false; btn.textContent = "💾 Guardar Datos";
    if (res.ok) { alert("Auditoría Guardada"); $("modalOverlay").style.display = "none"; $("modalAuditoria").style.display = "none"; cargarPuntos(); }
  };
};

$("btnAuditContinuar")?.addEventListener("click", () => { $("modalOverlay").style.display = "none"; $("modalAuditoria").style.display = "none"; });