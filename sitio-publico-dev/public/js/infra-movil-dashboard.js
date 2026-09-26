// =========================================================================
// Archivo: public/js/infra-movil-dashboard.js
// Versión: 1.0 - Integración de Modo Construcción en Dashboard
// =========================================================================

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  
  let fotoBlob = null;
  let puntoA = null;
  let puntoCercano = null;
  let currentPuntoId = null;
  let currentMufaId = null;

  function initInfraMovilModule() {
    console.log('Inicializando módulo Infra Móvil...');
    
    // Resetear estado inicial
    fotoBlob = null;
    puntoA = null;
    puntoCercano = null;
    
    // Recuperar estado de localStorage si existe
    recoverState();
    
    setupEventListeners();
  }

  function recoverState() {
    const savedPuntoA = localStorage.getItem('infra_puntoA');
    const savedClientId = localStorage.getItem('infra_clientId');
    const savedClientName = localStorage.getItem('infra_clientName');
    
    if (savedPuntoA) {
      puntoA = JSON.parse(savedPuntoA);
      actualizarUIContinuidad();
      const btnGuardar = $('#btnGuardarInfra');
      if (btnGuardar) btnGuardar.disabled = false;
    }
    
    if (savedClientId && savedClientName) {
      $('#id_cliente_real')?.setValue(savedClientId);
      const clienteSel = $('#clienteSeleccionado');
      if (clienteSel) clienteSel.textContent = savedClientName;
      const searchInput = $('#clienteSearch');
      if (searchInput) searchInput.value = savedClientName.replace('✅ CLIENTE: ', '').split(' (')[0];
    }
  }

  function setupEventListeners() {
    // Buscador de clientes
    const searchInput = $('#clienteSearch');
    if (searchInput) {
      searchInput.oninput = debounce(async (e) => {
        const q = e.target.value;
        if (q.length < 3) {
          const results = $('#clienteResults');
          if (results) results.style.display = 'none';
          return;
        }
        
        try {
          const r = await fetch(`/api/infra/clientes-search?q=${q}`);
          const data = await r.json();
          
          const resultsDiv = $('#clienteResults');
          if (resultsDiv && data.items) {
            resultsDiv.innerHTML = data.items.map(c => `
              <div class="search-item" onclick="window.seleccionarClienteInfra(${c.id_cliente}, '${c.nombre_cliente.replace(/'/g, "\\'")}', '${c.ID_Cliente}')">
                <b>${c.nombre_cliente}</b><br>
                <small>ID: ${c.ID_Cliente} | Tarea: ${c.tarea || 'N/A'}</small>
              </div>
            `).join("");
            resultsDiv.style.display = 'block';
          }
        } catch (error) {
          console.error('Error buscando cliente:', error);
        }
      }, 500);
    }

    // Botón GPS
    const btnGPS = $('#btnGPS');
    if (btnGPS) {
      btnGPS.onclick = async () => {
        const gpsTxt = $('#gpsData');
        if (!gpsTxt) return;
        
        gpsTxt.textContent = "🛰️ Localizando...";
        gpsTxt.style.color = "#d97706";

        navigator.geolocation.getCurrentPosition(async (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          
          const latInput = $('#lat');
          const lngInput = $('#lng');
          if (latInput) latInput.value = lat;
          if (lngInput) lngInput.value = lng;
          
          gpsTxt.textContent = `📍 ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          gpsTxt.style.color = "#16a34a";
          
          const btnGuardar = $('#btnGuardarInfra');
          if (btnGuardar) btnGuardar.disabled = false;

          try {
            const r = await fetch(`/api/movil/cercanos?lat=${lat}&lng=${lng}`);
            const d = await r.json();
            if (d.ok && d.puntos.length > 0) {
              puntoCercano = d.puntos[0];
              const radarMsg = $('#radarMsg');
              const radarResult = $('#radarResult');
              const panelPunto = $('#panelPunto');
              
              if (radarMsg) radarMsg.textContent = `🔎 EXISTENTE: ${puntoCercano.nombre}`;
              if (radarResult) radarResult.style.display = 'block';
              if (panelPunto) panelPunto.style.opacity = "0.4";
            } else {
              puntoCercano = null;
              const radarResult = $('#radarResult');
              const panelPunto = $('#panelPunto');
              
              if (radarResult) radarResult.style.display = 'none';
              if (panelPunto) panelPunto.style.opacity = "1";
            }
          } catch (e) {
            console.error('Error buscando cercanos:', e);
          }
        }, () => {
          gpsTxt.textContent = "❌ Error GPS";
          gpsTxt.style.color = "#dc2626";
        }, { enableHighAccuracy: true });
      };
    }

    // Botón Usar Punto Existente
    const btnUsarExistente = $('#btnUsarExistente');
    if (btnUsarExistente) {
      btnUsarExistente.onclick = () => {
        if (puntoCercano) {
          const nombrePunto = $('#nombre_punto');
          const descPunto = $('#desc_punto');
          const tipoPunto = $('#tipo_punto');
          
          if (nombrePunto) nombrePunto.value = puntoCercano.nombre;
          if (descPunto) descPunto.value = puntoCercano.descripcion || '';
          if (tipoPunto) tipoPunto.value = puntoCercano.tipo || 'poste';
          
          const radarResult = $('#radarResult');
          const panelPunto = $('#panelPunto');
          
          if (radarResult) radarResult.style.display = 'none';
          if (panelPunto) {
            panelPunto.style.opacity = "1";
            panelPunto.style.pointerEvents = "auto";
          }
        }
      };
    }

    // Foto
    const fotoInput = $('#foto');
    if (fotoInput) {
      fotoInput.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const preview = $('#preview');
          if (preview) {
            preview.src = URL.createObjectURL(file);
            preview.style.display = "block";
          }

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
                fotoBlob = blob;
              }, 'image/jpeg', 0.75);
            };
          };
        }
      };
    }

    // Botón Guardar
    const btnGuardar = $('#btnGuardarInfra');
    if (btnGuardar) {
      btnGuardar.onclick = async () => {
        const btn = btnGuardar;
        btn.disabled = true;
        btn.textContent = puntoA ? "SIGUIENTE PUNTO" : "FIJAR INICIO";

        try {
          const lat = parseFloat($('#lat')?.value || 0);
          const lng = parseFloat($('#lng')?.value || 0);
          
          if (!lat || !lng) throw new Error("Captura la ubicación GPS primero");

          const idCliente = $('#id_cliente_real')?.value;
          const tipoPunto = $('#tipo_punto')?.value || 'poste';
          const nombrePunto = $('#nombre_punto')?.value || '';
          const descPunto = $('#desc_punto')?.value || '';
          const distanciaSig = parseFloat($('#distancia_sig')?.value || 0);
          const metrajeCable = parseFloat($('#metraje_cable')?.value || 0);
          const datosCable = $('#datos_cable')?.value || '';
          const notaTramo = $('#nota_tramo')?.value || '';

          if (!nombrePunto) throw new Error("Ingresa el nombre del punto");

          const fd = new FormData();
          fd.append('lat', lat);
          fd.append('lng', lng);
          fd.append('id_cliente', idCliente || '');
          fd.append('tipo', tipoPunto);
          fd.append('nombre', nombrePunto);
          fd.append('descripcion', descPunto);
          fd.append('distancia_sig', distanciaSig);
          fd.append('metraje_cable', metrajeCable);
          fd.append('datos_cable', datosCable);
          fd.append('nota_tramo', notaTramo);

          if (fotoBlob) {
            fd.append('foto', fotoBlob, 'punto.jpg');
          }

          // Si hay punto A, registrar tramo
          if (puntoA) {
            fd.append('id_punto_anterior', puntoA.id);
            
            const resP = await fetch("/api/infra/puntos", { method: "POST", body: fd });
            const dataP = await resP.json();
            
            if (!dataP.ok) throw new Error(dataP.error || "Fallo al registrar punto");
            
            const puntoActualId = dataP.id;
            
            const tramoPayload = {
              id_cliente: idCliente,
              id_punto_inicio: puntoA.id,
              id_punto_fin: puntoActualId,
              distancia: distanciaSig,
              metraje_cable: metrajeCable,
              datos_cable: datosCable,
              nota: notaTramo
            };

            const resT = await fetch("/api/infra/tramos", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(tramoPayload)
            });
            const dataT = await resT.json();
            
            if (!dataT.ok) throw new Error(dataT.error || "Fallo al registrar tramo");
            
            alert(`✅ TRAMO CERRADO: Conectado y auditado desde ${puntoA.nombre}`);
          } else {
            const resP = await fetch("/api/infra/puntos", { method: "POST", body: fd });
            const dataP = await resP.json();
            
            if (!dataP.ok) throw new Error(dataP.error || "Fallo al registrar punto");
            
            alert(`📍 PUNTO GUARDADO: Registrado de forma independiente`);
          }

          // Actualizar punto A
          puntoA = { 
            id: currentPuntoId || Date.now(), 
            nombre: nombrePunto, 
            lat: lat, 
            lng: lng 
          };
          localStorage.setItem('infra_puntoA', JSON.stringify(puntoA));
          actualizarUIContinuidad();
          
          limpiarInterfazPostSalto();

        } catch (e) {
          alert("❌ Error en Campo: " + e.message);
          btn.disabled = false;
        } finally {
          btn.disabled = false;
          btn.textContent = puntoA ? "SIGUIENTE PUNTO" : "FIJAR INICIO";
        }
      };
    }

    // Botón Finalizar
    const btnFinalizar = $('#btnFinalizarInfra');
    if (btnFinalizar) {
      btnFinalizar.onclick = () => {
        if (confirm('¿Finalizar levantamiento actual?\nSe cerrará el circuito de tramos.')) {
          localStorage.removeItem('infra_puntoA');
          localStorage.removeItem('infra_clientId');
          localStorage.removeItem('infra_clientName');
          location.reload();
        }
      };
    }
  }

  function actualizarUIContinuidad() {
    const status = $('#statusTramo');
    if (status && puntoA) {
      status.innerHTML = `📡 <b>ORIGEN ACTUAL:</b> ${puntoA.nombre}<br>📍 Camina al siguiente elemento de la red.`;
      status.style.background = "#dcfce7";
      status.style.borderColor = "#16a34a";
      status.style.color = "#16a34a";
    }
  }

  function limpiarInterfazPostSalto() {
    const fields = ['nombre_punto', 'desc_punto', 'metraje_cable', 'distancia_sig', 'nota_tramo'];
    fields.forEach(field => {
      const el = $(`#${field}`);
      if (el) el.value = "";
    });
    
    const preview = $('#preview');
    const panelPunto = $('#panelPunto');
    const radarResult = $('#radarResult');
    
    if (preview) preview.style.display = "none";
    if (panelPunto) {
      panelPunto.style.display = "block";
      panelPunto.style.opacity = "1";
    }
    if (radarResult) radarResult.style.display = "none";
    
    fotoBlob = null;
    puntoCercano = null;
  }

  window.seleccionarClienteInfra = (id, nombre, cod) => {
    const labelTexto = `✅ CLIENTE: ${nombre} (${cod})`;
    const idInput = $('#id_cliente_real');
    const clienteSel = $('#clienteSeleccionado');
    const results = $('#clienteResults');
    const searchInput = $('#clienteSearch');
    
    if (idInput) idInput.value = id;
    if (clienteSel) clienteSel.textContent = labelTexto;
    if (results) results.style.display = 'none';
    if (searchInput) searchInput.value = nombre;
    
    localStorage.setItem('infra_clientId', id);
    localStorage.setItem('infra_clientName', labelTexto);
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // Exponer función de inicialización
  window.initInfraMovilModule = initInfraMovilModule;
})();
