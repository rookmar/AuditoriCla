// =========================================================================
// Archivo: public/js/infra_movil.js 
// Versión: 7.0 (Salto de Rana Pro + Compresor Canvas + Memoria Persistente)
// =========================================================================

(function () {
  const $ = (s) => document.querySelector(s);
  let fotoBlob = null;
  let puntoA = null; // Memoria viva del punto de origen (A)
  let puntoCercano = null;
  
  // Variables globales para Mufas
  let currentPuntoId = null;
  let currentMufaId = null;

  // --- 0. PUENTE DESDE OFICINA Y RECUPERACIÓN DE ESTADO ---
  window.addEventListener('DOMContentLoaded', () => {
      const urlParams = new URLSearchParams(window.location.search);
      const idPuntoDirecto = urlParams.get('id_punto_directo');
      
      if (idPuntoDirecto) {
          currentPuntoId = idPuntoDirecto;
          const mufaContainer = $('#containerAccionMufa');
          if(mufaContainer) {
              mufaContainer.style.setProperty('display', 'block', 'important');
              $('#panelPunto').style.display = 'none'; 
          }
      } else {
          // ESCUDO DE ESTADO: Recuperar ruta activa si el navegador se recargó en la caminata
          const savedPuntoA = localStorage.getItem('infra_puntoA');
          const savedClientId = localStorage.getItem('infra_clientId');
          const savedClientName = localStorage.getItem('infra_clientName');
          
          if (savedPuntoA) {
              puntoA = JSON.parse(savedPuntoA);
              actualizarUIContinuidad();
              $('#btnGuardar').disabled = false;
          }
          if (savedClientId && savedClientName) {
              $('#id_cliente_real').value = savedClientId;
              $('#clienteSeleccionado').textContent = savedClientName;
              $('#clienteSearch').value = savedClientName.replace('✅ CLIENTE: ', '').split(' (')[0];
          }
      }
  });

  // --- 1. BUSCADOR DE CLIENTES ---
  function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

  $('#clienteSearch').oninput = debounce(async (e) => {
    const q = e.target.value;
    if (q.length < 3) return $('#clienteResults').style.display = 'none';
    
    const r = await fetch(`/api/infra/clientes-search?q=${q}`);
    const data = await r.json();
    
    $('#clienteResults').innerHTML = data.items.map(c => `
      <div class="search-item" onclick="seleccionarCliente(${c.id_cliente}, '${c.nombre_cliente}', '${c.ID_Cliente}')">
        <b>${c.nombre_cliente}</b><br><small>ID: ${c.ID_Cliente} | Tarea: ${c.tarea || 'N/A'}</small>
      </div>
    `).join("");
    $('#clienteResults').style.display = 'block';
  }, 500);

  window.seleccionarCliente = (id, nombre, cod) => {
    const labelTexto = `✅ CLIENTE: ${nombre} (${cod})`;
    $('#id_cliente_real').value = id;
    $('#clienteSeleccionado').textContent = labelTexto;
    $('#clienteResults').style.display = 'none';
    $('#clienteSearch').value = nombre;
    
    // Guardar en memoria profunda para el día siguiente
    localStorage.setItem('infra_clientId', id);
    localStorage.setItem('infra_clientName', labelTexto);
  };

  // --- 2. GPS Y RADAR ---
  $('#btnGPS').onclick = () => {
    const gpsTxt = $('#gpsData');
    gpsTxt.textContent = "🛰️ Localizando...";
    gpsTxt.style.color = "#d97706";

    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      $('#lat').value = lat; $('#lng').value = lng;
      gpsTxt.textContent = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      gpsTxt.style.color = "#16a34a";
      $('#btnGuardar').disabled = false;

      try {
        const r = await fetch(`/api/movil/cercanos?lat=${lat}&lng=${lng}`);
        const d = await r.json();
        if (d.ok && d.puntos.length > 0) {
          puntoCercano = d.puntos[0];
          $('#radarMsg').textContent = `🔎 EXISTENTE: ${puntoCercano.nombre}`;
          $('#radarResult').style.display = 'block';
          $('#panelPunto').style.opacity = "0.4";
        } else {
          puntoCercano = null;
          $('#radarResult').style.display = 'none';
          $('#panelPunto').style.opacity = "1";
        }
      } catch (e) { console.error("Error radar", e); }
    }, (err) => {
        gpsTxt.textContent = "❌ Error GPS: Activa tu ubicación";
        gpsTxt.style.color = "#c62828";
    }, { enableHighAccuracy: true });
  };

  // --- 3. LÓGICA DE ENGANCHE (EL RADAR) ---
  $('#btnUsarExistente').onclick = () => {
    if (!puntoCercano) return;
    
    currentPuntoId = puntoCercano.id_punto || puntoCercano.id; 
    $('#containerAccionMufa').style.setProperty('display', 'block', 'important'); 

    if (!puntoA) {
        puntoA = { 
            id: currentPuntoId, 
            nombre: puntoCercano.nombre, 
            lat: puntoCercano.lat, 
            lng: puntoCercano.lng 
        };
        localStorage.setItem('infra_puntoA', JSON.stringify(puntoA));
        actualizarUIContinuidad();
        alert("🛰️ ENGANCHE EXITOSO: Iniciando tramo desde " + puntoA.nombre);
    } else {
        alert("📍 LLEGADA CONFIRMADA: " + puntoCercano.nombre);
    }
    $('#panelPunto').style.display = "none";
  };

  // --- 4. GUARDADO MAESTRO CON TRANSACCIÓN UNIFICADA ---
  $('#btnGuardar').onclick = async () => {
    const btn = $('#btnGuardar');
    const idCliente = $('#id_cliente_real').value;
    const latActual = $('#lat').value;
    const lngActual = $('#lng').value;

    btn.disabled = true;
    btn.textContent = "⌛ Procesando...";

    try {
      let puntoActualId = null;
      let puntoActualNombre = "";

      // PASO 1: Guardar infraestructura o usar existente (Infraestructura Libre)
      if (puntoCercano) {
        puntoActualId = puntoCercano.id_punto || puntoCercano.id;
        puntoActualNombre = puntoCercano.nombre;
      } else {
        const nom = $('#nombre_punto').value.trim() || `P-Field-${Date.now().toString().slice(-4)}`;
        const fd = new FormData();
        fd.append("nombre", nom);
        fd.append("tipo", $('#tipo_punto').value);
        fd.append("lat", latActual);
        fd.append("lng", lngActual);
        fd.append("descripcion", $('#desc_punto').value);
        if (fotoBlob) fd.append("foto", fotoBlob, "punto.jpg");

        const resP = await fetch("/api/infra/puntos", { method: "POST", body: fd });
        const dataP = await resP.json();
        if (!dataP.ok) throw new Error("Fallo al guardar punto/foto.");
        
        puntoActualId = dataP.id_punto;
        puntoActualNombre = nom;
      }

      // Activar mufas inmediatamente en este punto físico
      currentPuntoId = puntoActualId;
      $('#containerAccionMufa').style.setProperty('display', 'block', 'important');

      // PASO 2: Continuidad Lógica de Fibra (Manejo de Tramos)
      if (!puntoA) {
        // Es el primer punto del día o inicio de ruta
        puntoA = { id: puntoActualId, nombre: puntoActualNombre, lat: latActual, lng: lngActual };
        localStorage.setItem('infra_puntoA', JSON.stringify(puntoA));
        actualizarUIContinuidad();
        alert("✅ INICIO FIJADO: " + puntoA.nombre);
      } else {
        // Es un punto consecutivo (B, C, D...). Si hay un cliente seleccionado, se amarra el tramo de cable
        if (idCliente) {
          const tramoPayload = {
            id_cliente: idCliente,
            desde_id: puntoA.id,
            hasta_id: puntoActualId,
            capacidad: "Fibra",
            datos_cable: $('#datos_cable').value,
            geojson: JSON.stringify([
              { lat: Number(puntoA.lat), lng: Number(puntoA.lng) },
              { lat: Number(latActual), lng: Number(lngActual) }
            ]),
            // ESCUDO BACKEND: Paquete unificado enviado en un solo viaje para evitar cables huérfanos
            auditoria: {
                metraje: $('#metraje_cable').value,
                distancia: $('#distancia_sig').value,
                nota: $('#nota_tramo').value
            }
          };

          const resT = await fetch("/api/infra/tramos", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(tramoPayload)
          });
          const dataT = await resT.json();
          if (!dataT.ok) throw new Error(dataT.error || "Fallo al registrar tramo unificado.");
          
          alert(`✅ TRAMO CERRADO: Conectado y auditado desde ${puntoA.nombre}`);
        } else {
          alert(`📍 PUNTO GUARDADO: Registrado de forma independiente (Sin enlace lógico de cliente).`);
        }

        // SALTO DE RANA PERSISTENTE: El punto actual se convierte en el origen del mañana
        puntoA = { id: puntoActualId, nombre: puntoActualNombre, lat: latActual, lng: lngActual };
        localStorage.setItem('infra_puntoA', JSON.stringify(puntoA));
        actualizarUIContinuidad();
      }
      
      limpiarInterfazPostSalto();

    } catch (e) {
      alert("❌ Error en Campo: " + e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = puntoA ? "SIGUIENTE PUNTO" : "FIJAR INICIO";
    }
  };

  function actualizarUIContinuidad() {
    const status = $('#statusTramo');
    status.innerHTML = `📡 <b>ORIGEN ACTUAL:</b> ${puntoA.nombre}<br>📍 Camina al siguiente elemento de la red.`;
    status.style.background = "#dcfce7";
    status.style.borderColor = "#16a34a";
    status.style.color = "#16a34a";
  }

  function limpiarInterfazPostSalto() {
    $('#nombre_punto').value = "";
    $('#desc_punto').value = "";
    $('#metraje_cable').value = "";
    $('#distancia_sig').value = "";
    $('#nota_tramo').value = "";
    $('#preview').style.display = "none";
    $('#panelPunto').style.display = "block";
    $('#panelPunto').style.opacity = "1";
    $('#radarResult').style.display = "none";
    fotoBlob = null;
    puntoCercano = null;
  }

  // ESCUDO FOTOGRÁFICO: Compresor Canvas en tiempo real para ahorrar megas y agilizar la subida
  $('#foto').onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      $('#preview').src = URL.createObjectURL(file);
      $('#preview').style.display = "block";

      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          const MAX_WIDTH = 1024;
          const MAX_HEIGHT = 1024;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; }
          } else {
            if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob((blob) => {
            fotoBlob = blob; // Archivo optimizado listo (~200KB)
          }, 'image/jpeg', 0.75);
        };
      };
    }
  };

  // Interceptar la finalización explícita de la jornada/ruta para purgar la memoria
  window.finalizarLevantamiento = () => {
      if(confirm('¿Finalizar levantamiento actual?\nSe cerrará el circuito de tramos.')){
          localStorage.removeItem('infra_puntoA');
          localStorage.removeItem('infra_clientId');
          localStorage.removeItem('infra_clientName');
          location.reload();
      }
  };

  // =========================================================================
  // --- 5. GESTIÓN DE MUFAS Y MATRIZ (AMARRE AUTOMÁTICO DE CLIENTE) ---
  // =========================================================================

  $('#btnAbrirMufa').onclick = async () => {
      if (!currentPuntoId) return alert("Error: No hay un punto seleccionado.");
      
      try {
          const r = await fetch(`/api/mufas/punto/${currentPuntoId}`);
          const d = await r.json();
          const listaMufas = d.mufas || [];
          
          if (listaMufas.length === 0) {
              const rc = await fetch("/api/mufas", { 
                  method: "POST", 
                  headers: { "Content-Type": "application/json" }, 
                  body: JSON.stringify({ id_punto: currentPuntoId, nombre_mufa: "Mufa Principal" }) 
              });
              const dc = await rc.json();
              currentMufaId = dc.id_mufa || dc.insertId;
          } else { 
              currentMufaId = listaMufas[0].id_mufa; 
          }

          $('#modalMufa').style.display = 'block';
          window.cargarCablesMufa(); 
          window.cargarMatrizMufa();
      } catch (e) { alert("Error abriendo Mufa: " + e.message); }
  };

  $('#btnCerrarMufa').onclick = () => $('#modalMufa').style.display = 'none';

  $('#tabMufaCablesBtn').onclick = () => { 
      $('#subTabCables').style.display = 'block'; $('#subTabMatriz').style.display = 'none'; 
      $('#tabMufaCablesBtn').style.background = 'white'; $('#tabMufaCablesBtn').style.color = '#1e40af'; 
      $('#tabMufaMatrizBtn').style.background = 'transparent'; $('#tabMufaMatrizBtn').style.color = '#6b7280'; 
  };
  $('#tabMufaMatrizBtn').onclick = () => { 
      $('#subTabCables').style.display = 'none'; $('#subTabMatriz').style.display = 'block'; 
      $('#tabMufaMatrizBtn').style.background = 'white'; $('#tabMufaMatrizBtn').style.color = '#1e40af'; 
      $('#tabMufaCablesBtn').style.background = 'transparent'; $('#tabMufaCablesBtn').style.color = '#6b7280'; 
  };

  window.cargarCablesMufa = async () => {
      const r = await fetch(`/api/mufas/${currentMufaId}/cables`);
      const d = await r.json();
      const cablesCache = d.cables || [];
      
      $('#listaCablesMufa').innerHTML = cablesCache.map(c => `
        <div style="background:white; padding:10px; border-radius:6px; border-left:4px solid #1e40af; font-size:12px; box-shadow:0 1px 2px rgba(0,0,0,0.1); margin-bottom:8px;">
          <b style="color:#1e40af;">${c.etiqueta_identificador}</b> (${c.capacidad_hilos} Hilos)<br>
          <span style="color:#4b5563;">${c.datos_chaqueta}</span>
        </div>
      `).join('') || "<small style='color:#666;'>No hay cables registrados.</small>";
      
      const opciones = cablesCache.map(c => `<option value="${c.id_cable_mufa}">${c.etiqueta_identificador}</option>`).join('');
      $('#fusionCableOri').innerHTML = opciones || '<option value="">Sin cables</option>'; 
      $('#fusionCableDes').innerHTML = opciones || '<option value="">Sin cables</option>';
      
      let hilosHtml = ''; for(let i=1; i<=144; i++) hilosHtml += `<option value="Hilo ${i}">Hilo ${i}</option>`;
      $('#fusionHiloOri').innerHTML = hilosHtml; $('#fusionHiloDes').innerHTML = hilosHtml;
  };

  $('#btnGuardarCableMufa').onclick = async () => {
      const chaqueta = $('#mufaCableChaqueta').value.trim();
      if(!chaqueta) return alert("Escribe los datos de la chaqueta.");
      
      const payload = { 
          id_mufa: currentMufaId, 
          etiqueta_identificador: $('#mufaCableLetra').value, 
          datos_chaqueta: chaqueta, 
          capacidad_hilos: $('#mufaCableCapacidad').value, 
          tipo_cable: $('#mufaCableTipo').value 
      };
      
      try {
          const r = await fetch("/api/mufas/cables", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const d = await r.json();
          if(!d.ok) throw new Error(d.error);
          $('#mufaCableChaqueta').value = ""; 
          window.cargarCablesMufa();
      } catch (e) { alert("Error: " + e.message); }
  };

  window.cargarMatrizMufa = async () => {
      const r = await fetch(`/api/mufas/${currentMufaId}/matriz`);
      const d = await r.json();
      const listaFusiones = d.fusiones || [];
      
      $('#tablaFusionesCuerpo').innerHTML = listaFusiones.map(f => `
          <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:6px;"><b>${f.origen_cable}</b><br><span style="color:#64748b;">${f.hilo_origen}</span></td>
              <td style="padding:6px;"><b>${f.destino_cable}</b><br><span style="color:#64748b;">${f.hilo_destino}</span></td>
              <td style="padding:6px; text-align:center;">
                  <button onclick="window.eliminarFusion(${f.id_fusion})" style="background:#fee2e2; color:#b91c1c; border:none; padding:6px; border-radius:4px; font-weight:bold; cursor:pointer;">X</button>
              </td>
          </tr>
      `).join('') || "<tr><td colspan='3' style='padding:10px; text-align:center; color:#666;'>Sin fusiones</td></tr>";
  };

  $('#btnGuardarFusion').onclick = async () => {
      if (!$('#fusionCableOri').value || !$('#fusionCableDes').value) return alert("Registra al menos 2 cables primero.");
      
      // AMARRE LÓGICO DEL CLIENTE: Hereda automáticamente el cliente de la pantalla principal al hilo fusionado
      const activeClientId = $('#id_cliente_real').value;

      const payload = { 
          id_mufa: currentMufaId, 
          id_cable_origen: $('#fusionCableOri').value, 
          hilo_origen: $('#fusionHiloOri').value, 
          id_cable_destino: $('#fusionCableDes').value, 
          hilo_destino: $('#fusionHiloDes').value,
          id_cliente_asignado: activeClientId ? Number(activeClientId) : null
      };
      
      try {
          const r = await fetch("/api/mufas/fusiones", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
          const d = await r.json();
          if(!d.ok) throw new Error(d.error);
          window.cargarMatrizMufa();
      } catch (e) { alert("Error: " + e.message); }
  };

  window.eliminarFusion = async (id_fusion) => { 
      if(!confirm("¿Deshacer este empalme?")) return; 
      await fetch(`/api/mufas/fusiones/${id_fusion}`, { method: 'DELETE' }); 
      window.cargarMatrizMufa(); 
  };

})();