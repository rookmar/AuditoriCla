/**
 * ============================================================================
 * ARCHIVO: public/js/recepciones.js
 * DESCRIPCIÓN: Lógica Frontend para Crear y Editar Visitas y Recepciones.
 * ACTUALIZACIÓN: BLINDAJE + ROLES + FOTO DE BITÁCORA + ÁREA DE TRABAJO
 * ============================================================================
 */
const $ = (selector) => document.querySelector(selector);

// Funciones maestras de seguridad
const setVal = (sel, val) => { const el = $(sel); if (el) el.value = val || ''; };
const setText = (sel, val) => { const el = $(sel); if (el) el.textContent = val || ''; };

let vis_lat = null;
let vis_lng = null;
let vis_foto_b64 = null; // Variable para la foto
let napCounter = 0;
let editModeId = null;
let editModeTipo = null;
let esSupervisor = false; 

// Hacemos que switchTab sea a prueba de fallos
window.switchTab = function(tab) {
  const formV = $('#formVisita');
  const formR = $('#formRecepcion');
  const btnV = $('#btnTabVisita');
  const btnR = $('#btnTabRecepcion');

  if (formV) formV.style.display = tab === 'visita' ? 'block' : 'none';
  if (formR) formR.style.display = tab === 'recepcion' ? 'block' : 'none';
  if (btnV) btnV.className = tab === 'visita' ? 'tab-btn active' : 'tab-btn';
  if (btnR) btnR.className = tab === 'recepcion' ? 'tab-btn active' : 'tab-btn';
};

function capturarCoordenadas(btnEl, inputEl, dataDivEl = null) {
    if (!btnEl) return;
    const textoOriginal = btnEl.textContent;
    btnEl.textContent = "⏳..."; btnEl.disabled = true;
    navigator.geolocation.getCurrentPosition(
        (pos) => {
            const lat = pos.coords.latitude.toFixed(6); const lng = pos.coords.longitude.toFixed(6);
            if (dataDivEl) {
                vis_lat = pos.coords.latitude; vis_lng = pos.coords.longitude;
                dataDivEl.textContent = `✅ GPS: ${lat}, ${lng}`;
            } else if (inputEl) {
                const coordsText = `[Lat: ${lat}, Lng: ${lng}]`;
                let val = inputEl.value.trim();
                if (val.includes("[Lat:")) val = val.substring(0, val.indexOf("[Lat:")).trim();
                inputEl.value = val + (val ? " " : "") + coordsText;
            }
            btnEl.textContent = "✅ Listo"; btnEl.style.background = "#16a34a"; 
            setTimeout(() => { btnEl.textContent = textoOriginal; btnEl.disabled = false; btnEl.style.background = "#3b82f6"; }, 3000);
        },
        () => { alert("⚠️ Activa el GPS."); btnEl.textContent = textoOriginal; btnEl.disabled = false; },
        { enableHighAccuracy: true, timeout: 10000 } 
    );
}

if ($('#vis_btnGPS')) $('#vis_btnGPS').onclick = function() { capturarCoordenadas(this, null, $('#vis_gpsData')); };
if ($('#rec_btnGpsFdh')) $('#rec_btnGpsFdh').onclick = function() { capturarCoordenadas(this, $('#rec_fdh'), null); };

// ==========================================
// 0. LÓGICA DE CÁMARA Y COMPRESIÓN
// ==========================================
if ($('#vis_foto')) {
    $('#vis_foto').addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(event) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 1200; 
                let scaleSize = 1;
                
                if (img.width > MAX_WIDTH) { scaleSize = MAX_WIDTH / img.width; }
                
                canvas.width = img.width * scaleSize;
                canvas.height = img.height * scaleSize;

                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                vis_foto_b64 = canvas.toDataURL('image/jpeg', 0.8);

                if ($('#vis_foto_preview')) $('#vis_foto_preview').src = vis_foto_b64;
                if ($('#vis_foto_preview_container')) $('#vis_foto_preview_container').style.display = 'block';
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

if ($('#btnRemoverFoto')) {
    $('#btnRemoverFoto').onclick = () => {
        vis_foto_b64 = null;
        if ($('#vis_foto')) $('#vis_foto').value = '';
        if ($('#vis_foto_preview_container')) $('#vis_foto_preview_container').style.display = 'none';
        if ($('#vis_foto_preview')) $('#vis_foto_preview').src = '';
    };
}

// ==========================================
// 1. GUARDAR / ACTUALIZAR VISITA
// ==========================================
if ($('#btnGuardarVisita')) {
    $('#btnGuardarVisita').onclick = async () => {
      const btn = $('#btnGuardarVisita'); const originalText = btn.textContent;
      btn.disabled = true; btn.textContent = "⌛ Procesando...";

      const payload = {
        tecnico: $('#vis_tecnico') ? $('#vis_tecnico').value : '', 
        asesor: $('#vis_asesor') ? $('#vis_asesor').value : '',
        contrata: $('#vis_contrata') ? $('#vis_contrata').value : '', 
        lat: vis_lat, lng: vis_lng,
        direccion: $('#vis_direccion') ? $('#vis_direccion').value : '', 
        observaciones: $('#vis_obs') ? $('#vis_obs').value : '',
        foto_bitacora: vis_foto_b64, 
        area_trabajo: $('#vis_area_trabajo') ? $('#vis_area_trabajo').value : '' // NUEVO: Captura el Área de Trabajo de Visitas
      };

      if (!payload.tecnico) { btn.disabled = false; btn.textContent = originalText; return alert("El nombre del técnico es obligatorio."); }
      // NUEVO: Validar que seleccionó un área (Opcional, pero recomendado)
      if (!payload.area_trabajo) { btn.disabled = false; btn.textContent = originalText; return alert("Por favor seleccione un Área de Trabajo."); }
      
      try {
        const url = editModeId ? `/api/modulos/visitas/${editModeId}` : '/api/modulos/visitas';
        const method = editModeId ? 'PUT' : 'POST';

        const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
        if (!res.ok) throw new Error("Error en el servidor al intentar guardar.");
        
        const data = await res.json();
        if (data.ok) { 
            alert(editModeId ? "✅ Visita actualizada exitosamente" : "📋 Visita guardada exitosamente"); 
            window.location.href = "/buscar.html"; 
        } else throw new Error(data.error);
      } catch (e) { alert("Error al guardar: " + e.message); btn.disabled = false; btn.textContent = originalText; }
    };
}

// Funciones NAP omitidas del resumen visual pero completas en lógica
window.agregarTarjetaNAP = function() {
  napCounter++; const idStr = `nap-${napCounter}`;
  const cardHTML = `
    <div class="card tarjeta-elemento" id="${idStr}" style="border-left: 4px solid #16a34a;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h4 style="margin:0 0 10px 0; color:#16a34a;">Caja / Elemento</h4>
        <button type="button" onclick="document.getElementById('${idStr}').remove()" class="btn-remove btn-accion" style="padding:4px 8px;">X</button>
      </div>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <div><label>ID / Nombre</label><input type="text" class="input elm-id" placeholder="Ej: NAP-01"></div>
        <div><label>Slot / Puerto Origen</label><input type="text" class="input elm-slot" placeholder="Ej: S2/P4"></div>
      </div>
      <label style="margin-top:10px;">Potencias Ópticas (dBm)</label>
      <div style="background:#f8fafc; padding:10px; border-radius:8px; border:1px solid #e2e8f0;">
        <div style="display:grid; grid-template-columns: 1fr 1fr 1fr 40px; gap:5px; margin-bottom:5px; font-size:0.7rem; font-weight:bold; color:#64748b; text-align:center;">
          <div>Pto / Hilo</div><div>1310 nm</div><div>1550 nm</div><div></div>
        </div>
        <div class="contenedor-mediciones">
          ${generarFilaMedicion(3)} ${generarFilaMedicion(5)} ${generarFilaMedicion(8)}
        </div>
        <button type="button" onclick="agregarFilaMedicion(this)" class="btn btn-accion" style="background:#dbeafe; color:#1e40af; padding:10px; margin-top:10px;">➕ Añadir puerto/hilo</button>
      </div>
      <label style="margin-top:15px;">Test Navegación (Solo 5G)</label>
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
        <input type="text" inputmode="decimal" class="input elm-dl" placeholder="DL (Mbps)">
        <input type="text" inputmode="decimal" class="input elm-ul" placeholder="UL (Mbps)">
      </div>
      <label>Observaciones</label><textarea class="textarea elm-obs" rows="2"></textarea>
    </div>`;
  const contenedor = $('#contenedorNAPs');
  if (contenedor) contenedor.insertAdjacentHTML('beforeend', cardHTML);
};

window.generarFilaMedicion = function(puertoDefecto = "") {
  return `
    <div class="medicion-row">
      <input type="text" class="input med-pto" value="${puertoDefecto}" placeholder="Pto">
      <input type="text" inputmode="text" class="input med-1310" placeholder="dBm">
      <input type="text" inputmode="text" class="input med-1550" placeholder="dBm">
      <button type="button" onclick="this.parentElement.remove()" class="btn-remove btn-accion">X</button>
    </div>`;
};

window.agregarFilaMedicion = function(btnElement) {
  if (!btnElement) return;
  const contenedor = btnElement.previousElementSibling;
  if (contenedor) contenedor.insertAdjacentHTML('beforeend', generarFilaMedicion());
};

// ==========================================
// 2. GUARDAR / ACTUALIZAR RECEPCIÓN
// ==========================================
async function procesarGuardadoRecepcion(estadoFinal) {
  const btnB = $('#btnGuardarBorrador'); const btnF = $('#btnGuardarFinal');
  
  if (btnB) btnB.disabled = true; 
  if (btnF) btnF.disabled = true;

  if (estadoFinal === 'Borrador') { if (btnB) btnB.textContent = "⌛ Guardando..."; }
  else { if (btnF) btnF.textContent = "⌛ Finalizando..."; }

  try {
    const payload = {
      tipo_red: $('#rec_tipo_red') ? $('#rec_tipo_red').value : '', 
      distrito: $('#rec_distrito') ? $('#rec_distrito').value : '',
      ubicacion_fdh: $('#rec_fdh') ? $('#rec_fdh').value : '', 
      lugar_general: $('#rec_lugar') ? $('#rec_lugar').value : '',
      recepciona: $('#rec_claro') ? $('#rec_claro').value : '', 
      entrega: $('#rec_contrata') ? $('#rec_contrata').value : '', 
      area_trabajo: $('#rec_area_trabajo') ? $('#rec_area_trabajo').value : '', // NUEVO: Captura el Área de Trabajo de Recepción
      estado: (esSupervisor && estadoFinal !== 'Borrador' && editModeId) ? undefined : estadoFinal,
      elementos: []
    };

    // NUEVO: Validar que seleccionó un área antes de enviar (Borrador o Finalizado)
    if (!payload.area_trabajo && estadoFinal !== 'Borrador') { 
        throw new Error("Por favor seleccione un Área de Trabajo."); 
    }

    document.querySelectorAll('.tarjeta-elemento').forEach(card => {
      const elemento = {
        identificacion: card.querySelector('.elm-id') ? card.querySelector('.elm-id').value : '', 
        slot_puerto: card.querySelector('.elm-slot') ? card.querySelector('.elm-slot').value : '',
        vel_dl: card.querySelector('.elm-dl') ? card.querySelector('.elm-dl').value : '', 
        vel_ul: card.querySelector('.elm-ul') ? card.querySelector('.elm-ul').value : '',
        observacion: card.querySelector('.elm-obs') ? card.querySelector('.elm-obs').value : '', 
        mediciones: []
      };
      card.querySelectorAll('.medicion-row').forEach(row => {
        elemento.mediciones.push({
          puerto: row.querySelector('.med-pto') ? row.querySelector('.med-pto').value : '',
          p1310: row.querySelector('.med-1310') ? row.querySelector('.med-1310').value : '',
          p1550: row.querySelector('.med-1550') ? row.querySelector('.med-1550').value : ''
        });
      });
      payload.elementos.push(elemento);
    });

    if(payload.elementos.length === 0) throw new Error("Añade al menos una Caja NAP.");

    const url = editModeId ? `/api/modulos/recepciones/${editModeId}` : '/api/modulos/recepciones';
    const method = editModeId ? 'PUT' : 'POST';

    const res = await fetch(url, { method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error("Error en el servidor al intentar guardar.");

    const data = await res.json();
    
    if (data.ok) { 
        if (estadoFinal === 'Borrador') {
            alert("✅ Progreso guardado. Puedes continuar editando.");
            
            if (!editModeId && data.id) {
                editModeId = data.id;
                window.history.replaceState({}, '', `/recepciones.html?edit=${editModeId}&tipo=RECEPCI%C3%93N%20GPON`);
            }
            
            localStorage.setItem('draft_recepcion_id', editModeId);

            if (btnB) { btnB.textContent = "✏️ ACTUALIZAR BORRADOR"; btnB.disabled = false; }
            if (btnF) { btnF.textContent = esSupervisor ? "💾 GUARDAR COMO FINALIZADO" : "🚀 FINALIZAR Y ENVIAR"; btnF.disabled = false; }
        } else {
            localStorage.removeItem('draft_recepcion_id');
            alert(esSupervisor ? "✅ Cambios guardados exitosamente." : "✅ ¡Recepción enviada a revisión! El trabajo de campo ha finalizado.");
            window.location.href = "/buscar.html"; 
        }
    } else throw new Error(data.error);

  } catch (e) { 
      alert("Error: " + e.message); 
      if (btnB) { btnB.disabled = false; btnB.textContent = "💾 GUARDAR PROGRESO (BORRADOR)"; }
      if (btnF) { btnF.disabled = false; btnF.textContent = esSupervisor ? "💾 GUARDAR CAMBIOS" : "🚀 FINALIZAR Y ENVIAR"; }
  }
}

if ($('#btnGuardarBorrador')) $('#btnGuardarBorrador').onclick = () => procesarGuardadoRecepcion('Borrador');
if ($('#btnGuardarFinal')) $('#btnGuardarFinal').onclick = () => procesarGuardadoRecepcion('En Revisión');

// ==========================================
// 3. INICIALIZADOR Y CARGA DE DATOS
// ==========================================
window.onload = async () => {
    try {
        const resMe = await fetch('/api/me?_=' + Date.now());
        if (resMe.ok) {
            const dataMe = await resMe.json();
            if (dataMe.user && dataMe.user.modulos_activos) {
                const modulos = dataMe.user.modulos_activos.toLowerCase();
                if (modulos.includes('admin') || modulos.includes('reporte') || modulos.includes('supervi')) {
                    esSupervisor = true;
                }
            }
        }
    } catch(e) { console.error("Error al validar rol", e); }

    const urlParams = new URLSearchParams(window.location.search);
    editModeId = urlParams.get('edit');
    editModeTipo = urlParams.get('tipo');

    if (editModeId && editModeTipo) {
        if (editModeTipo === 'VISITA TÉCNICA') {
            switchTab('visita');
            if ($('#btnTabRecepcion')) $('#btnTabRecepcion').style.display = 'none'; 
            await cargarDatosVisita(editModeId);
        } else {
            switchTab('recepcion');
            if ($('#btnTabVisita')) $('#btnTabVisita').style.display = 'none'; 
            await cargarDatosRecepcion(editModeId);
        }
    } else {
        const draftId = localStorage.getItem('draft_recepcion_id');
        
        if (draftId) {
            const quiereContinuar = confirm(`⚠️ Tienes una recepción en progreso (Borrador #${draftId}) guardada en este dispositivo.\n\n¿Deseas retomarla donde te quedaste?\n\n(Si seleccionas Cancelar, empezarás una hoja en blanco).`);
            
            if (quiereContinuar) {
                window.location.href = `/recepciones.html?edit=${draftId}&tipo=RECEPCI%C3%93N%20GPON`;
                return; 
            } else {
                localStorage.removeItem('draft_recepcion_id');
            }
        }
        agregarTarjetaNAP();
    }
};

async function cargarDatosVisita(id) {
    try {
        const r = await fetch('/api/modulos/visitas/' + id);
        if (!r.ok) return;
        const data = await r.json();
        
        setVal('#vis_tecnico', data.tecnico);
        setVal('#vis_asesor', data.asesor);
        setVal('#vis_contrata', data.contrata);
        setVal('#vis_direccion', data.direccion);
        setVal('#vis_obs', data.observaciones);
        
        // NUEVO: Cargar el área de trabajo guardada en el select
        setVal('#vis_area_trabajo', data.area_trabajo);
        
        vis_lat = data.latitud; vis_lng = data.longitud;
        if(vis_lat && $('#vis_gpsData')) $('#vis_gpsData').textContent = `✅ GPS: ${vis_lat}, ${vis_lng}`;

        vis_foto_b64 = data.foto_bitacora || null;
        if (vis_foto_b64 && $('#vis_foto_preview_container') && $('#vis_foto_preview')) {
            $('#vis_foto_preview').src = vis_foto_b64;
            $('#vis_foto_preview_container').style.display = 'block';
        }

        const btn = $('#btnGuardarVisita');
        if (btn) {
            btn.textContent = "✏️ ACTUALIZAR VISITA"; 
            btn.style.background = "#f59e0b";
        }
    } catch(e) { console.error("Error al cargar visita", e); }
}

async function cargarDatosRecepcion(id) {
    try {
        const r = await fetch('/api/modulos/recepciones/' + id);
        if (!r.ok) return;
        const data = await r.json();
        
        setVal('#rec_tipo_red', data.tipo_red || 'Balanceada');
        setVal('#rec_distrito', data.distrito);
        setVal('#rec_fdh', data.ubicacion_fdh);
        setVal('#rec_lugar', data.lugar_general);
        setVal('#rec_claro', data.recepciona);
        setVal('#rec_contrata', data.entrega);

        // NUEVO: Cargar el área de trabajo guardada en el select
        setVal('#rec_area_trabajo', data.area_trabajo);

        const contenedor = $('#contenedorNAPs');
        if (contenedor) contenedor.innerHTML = ''; 
        
        if(data.elementos && data.elementos.length > 0) {
            data.elementos.forEach(el => {
                agregarTarjetaNAP();
                const cards = document.querySelectorAll('.tarjeta-elemento');
                const lastCard = cards[cards.length - 1];
                if (lastCard) {
                    const iId = lastCard.querySelector('.elm-id'); if(iId) iId.value = el.identificacion || '';
                    const iSlot = lastCard.querySelector('.elm-slot'); if(iSlot) iSlot.value = el.slot_puerto || '';
                    const iDl = lastCard.querySelector('.elm-dl'); if(iDl) iDl.value = el.vel_5g_dl || '';
                    const iUl = lastCard.querySelector('.elm-ul'); if(iUl) iUl.value = el.vel_5g_ul || '';
                    const iObs = lastCard.querySelector('.elm-obs'); if(iObs) iObs.value = el.observacion || '';

                    const medCont = lastCard.querySelector('.contenedor-mediciones');
                    if (medCont) {
                        medCont.innerHTML = ''; 
                        if(el.mediciones && el.mediciones.length > 0) {
                            el.mediciones.forEach(med => {
                                medCont.insertAdjacentHTML('beforeend', generarFilaMedicion(med.puerto_hilo));
                                const rows = medCont.querySelectorAll('.medicion-row');
                                const lastRow = rows[rows.length - 1];
                                if(lastRow) {
                                    const p13 = lastRow.querySelector('.med-1310'); if(p13) p13.value = med.potencia_1310 || '';
                                    const p15 = lastRow.querySelector('.med-1550'); if(p15) p15.value = med.potencia_1550 || '';
                                }
                            });
                        }
                    }
                }
            });
        }

        if ((data.estado === 'En Revisión' || data.estado === 'Alta' || data.estado === 'Pendiente') && !esSupervisor) {
            document.querySelectorAll('#formRecepcion .input, #formRecepcion .select, #formRecepcion .textarea').forEach(el => el.disabled = true);
            document.querySelectorAll('.btn-accion').forEach(btn => { if(btn) btn.style.display = 'none'; });
            const banner = $('#banner-solo-lectura');
            if (banner) banner.style.display = 'block';
        } else {
            const btnBorrador = $('#btnGuardarBorrador');
            const btnFinal = $('#btnGuardarFinal');
            
            if (btnBorrador) btnBorrador.textContent = "✏️ ACTUALIZAR BORRADOR";
            if (btnFinal) {
                btnFinal.textContent = (esSupervisor && data.estado !== 'Borrador') ? "💾 GUARDAR CAMBIOS (SUPERVISOR)" : "🚀 FINALIZAR Y ENVIAR";
            }
            
            const banner = $('#banner-solo-lectura');
            if (banner) banner.style.display = 'none';
        }
    } catch(e) { console.error("Error al cargar recepcion", e); }
}