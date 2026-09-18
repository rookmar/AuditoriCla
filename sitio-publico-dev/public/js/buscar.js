// =========================================================================
// Archivo: public/js/buscar.js
// Versión: 12.1 - Funciones PDF con Evidencia Fotográfica (Base64)
// =========================================================================
(function () {
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }
  function text(v) { 
      if (v === undefined || v === null) return ""; 
      return String(v).replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
  }

  var state = { 
      page: 1, pageSize: 10, total: 0, totalPages: 0, 
      roles: [], isReady: false, hasSearched: false,
      currentTab: 'general',
      isValidador: false 
  };
  var typingTimer; 
  var doneTypingInterval = 500; 

  function normalizeRoles(user) {
      var arr = [];
      if (Array.isArray(user.roles)) arr = user.roles;
      else if (user.rol) arr = [user.rol];
      if (user.admin) arr.push('admin');
      
      let modJson = {};
      try{ modJson = typeof user.modulos_activos === 'string' ? JSON.parse(user.modulos_activos) : (user.modulos_activos || {}); }catch(e){}
      if (modJson.infraestructura) arr.push('editor'); 
      if (modJson.recepciones) arr.push('tecnico');

      return arr.map(r => String(r).toLowerCase().trim());
  }

  async function checkUser() {
      try {
          const r = await fetch('/api/me?_=' + Date.now());
          if (r.ok) {
              const d = await r.json();
              if (d.user) {
                  state.roles = normalizeRoles(d.user);
                  let modJson = {};
                  try{ modJson = typeof d.user.modulos_activos === 'string' ? JSON.parse(d.user.modulos_activos) : (d.user.modulos_activos || {}); }catch(e){}
                  state.isValidador = !!(d.user.admin || modJson.reportes || modJson.reportes_incidencias);
              }
          }
      } catch (e) { console.error("Error validando sesión", e); }
      state.isReady = true; 
      pintarResultadosGeneral([]); 
  }

  function setupTabs() {
      const tabs = $$('.tab');
      tabs.forEach(tab => {
          tab.addEventListener('click', () => {
              $$('.tab').forEach(t => t.classList.remove('active'));
              $$('.tab-content').forEach(tc => tc.classList.remove('active'));
              
              tab.classList.add('active');
              const target = tab.getAttribute('data-target');
              $(`#${target}`).classList.add('active');
              
              if (target === 'tab-general') {
                  $('#res-general').classList.add('active');
                  state.currentTab = 'general';
              } else {
                  $('#res-gpon').classList.add('active');
                  state.currentTab = 'gpon';
              }
          });
      });
  }

  function loadFiltros(){
    fetch('/api/buscar/filtros').then(r=>r.json()).then(d=>{
        var selC=$('#central'); if(!selC) return;
        selC.innerHTML='<option value="">(Todas)</option>';
        
        var seenC = {}; 
        (d.centrales||[]).forEach(c => {
            var nom = c.nombre_central;
            if (nom && !seenC[nom]) {
                seenC[nom] = true; 
                var opt = document.createElement('option');
                opt.value = nom; opt.textContent = nom;
                selC.appendChild(opt);
            }
        });
        
        renderODFs(d.odfs||[]);
        
        selC.addEventListener('change', function(){
            var val = encodeURIComponent(this.value);
            $('#odf').innerHTML = '<option value="">Cargando...</option>'; 
            fetch('/api/buscar/odfs?central_id=' + val)
                .then(r=>r.json())
                .then(list => { renderODFs(list); buscarGeneral(1); });
        });
    }).catch(console.error);
  }

  function renderODFs(list){
      var selO=$('#odf');
      selO.innerHTML='<option value="">(Todos)</option>';
      var seen = {};
      list.forEach(o => {
          var n = o.nemonico_odf || o.Nemonico_ODF;
          if(n && !seen[n]){
              seen[n]=true;
              var opt=document.createElement('option'); opt.value=n; opt.textContent=n; selO.appendChild(opt);
          }
      });
  }

  function pintarResultadosGeneral(rows){
    var tb=$('#tbodyResGeneral'); if(!tb) return;
    tb.innerHTML = '';
    if (!state.hasSearched) { tb.innerHTML='<tr><td colspan="17" class="muted" style="text-align:center; padding: 30px;">🔍 Escribe un nombre o ID</td></tr>'; return; }
    if(!rows || !rows.length){ tb.innerHTML='<tr><td colspan="17" class="muted" style="text-align:center; padding: 20px; color: #dc2626;">No hay resultados</td></tr>'; return; }

    const isEditor = state.roles.includes('editor') || state.roles.includes('admin');
    const showRuta = state.roles.includes('editor') || state.roles.includes('admin') || state.roles.includes('tecnico');

    rows.forEach(r => {
        var tr=document.createElement('tr');
        var idRuta = r.id_ruta;
        var idCliente = r.id_cliente || r.id_cliente_interno || r.cliente_id || '';
        var botonesHTML = '';
        var isLibre = String(r.Cliente).toUpperCase() === 'LIBRE';
        var numIncidencias = (r.incidencias && r.incidencias.length) ? r.incidencias.length : 0;

        if (numIncidencias > 0) botonesHTML += `<button class="btn tiny danger" style="margin-right:4px;" onclick="toggleExpediente(${idRuta})">⚠️ Averías (${numIncidencias})</button>`;
        if (showRuta && idCliente && r.Tiene_Tramo) botonesHTML += `<button class="btn tiny info" style="margin-right:4px;" onclick="window.open('/mapa.html?cliente=${idCliente}&nombre=${encodeURIComponent(r.Cliente)}&idext=${encodeURIComponent(r.ID_Cliente)}', '_blank')">Ver Ruta</button>`;
        if (isEditor) {
            botonesHTML += `<button class="btn tiny" style="margin-right:4px;" onclick="window.location.href='/ruta.html?id=${idRuta}'">Editar</button>`;
            if (!isLibre) botonesHTML += `<button class="btn tiny secondary" onclick="borrar(${idRuta})">Liberar</button>`;
        }
        if (botonesHTML === '') botonesHTML = '<span class="muted">-</span>';

        tr.innerHTML = `
            <td>${idRuta}</td><td>${text(r.ID_central)}</td><td>${text(r.Nombre_Central)}</td>
            <td>${text(r.ID_Cliente)}</td><td>${isLibre ? '<span style="color:#10b981;font-weight:bold;">LIBRE</span>' : text(r.Cliente)}</td><td>${text(r.Tarea)}</td>
            <td>${text(r.Nombre_ODF)}</td><td>${text(r.Nemonico_ODF)}</td><td>${text(r.Puerto_ODF)}</td>
            <td>${text(r.Distancia_Optica)}</td><td>${text(r.Nemonico_Patcheo)}</td><td>${text(r.Puerto_Patcheo)}</td>
            <td>${text(r.Equipo)}</td><td>${text(r.Marca)}</td><td>${text(r.Slot)}</td>
            <td>${text(r.Posicion)}</td><td>${botonesHTML}</td>
        `;
        tb.appendChild(tr);

        if (numIncidencias > 0) {
            var trDet = document.createElement('tr');
            trDet.id = `exp_${idRuta}`; trDet.style.display = 'none';
            let incHtml = r.incidencias.map(i => `
                <div style="border-left: 4px solid #c62828; margin-bottom: 12px; background: #fff; padding: 12px;">
                    <div style="font-size: 12px; color: #6b7280;">📅 ${new Date(i.fecha_registro).toLocaleDateString()} | 🛠️ Red ${text(i.dano_red)}</div>
                    <div style="font-weight: 700; color: #1f2a37;">Daño: ${text(i.tipo_dano)}</div>
                    <div style="font-size: 14px; color: #4b5563;"><strong>Solución:</strong> ${text(i.tipo_solucion)}</div>
                </div>
            `).join('');
            trDet.innerHTML = `<td colspan="17" style="background-color: #f8fafc; padding: 24px;">${incHtml}</td>`;
            tb.appendChild(trDet);
        }
    });
  }

  window.buscarGeneral = function(page){
      if(!state.isReady) return; 
      state.hasSearched = true; 
      const btn = $('#btnBuscarGeneral');
      btn.disabled = true; btn.textContent = "Buscando..."; $('#msg').textContent = '';
      state.page = page || 1;
      var params = new URLSearchParams({ q: $('#q').value, central: $('#central').value, odf: $('#odf').value, page: state.page, pageSize: state.pageSize });

      fetch('/api/buscar?'+params)
        .then(r => r.json())
        .then(res => { state.total = res.total; state.totalPages = res.totalPages; pintarResultadosGeneral(res.items); renderPager('pagerGeneral'); })
        .catch(e => { $('#msg').textContent = 'Error'; })
        .finally(() => { btn.disabled = false; btn.textContent = "Buscar General"; });
  };

  // ===========================================================
  // LÓGICA: MENÚ KEBAB GLOBAL (Manejador de clics)
  // ===========================================================
  window.toggleKebab = function(btn, event) {
      event.stopPropagation();
      document.querySelectorAll('.kebab-dropdown').forEach(d => {
          if (d !== btn.nextElementSibling) d.style.display = 'none';
      });
      const dropdown = btn.nextElementSibling;
      dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  };

  document.addEventListener('click', (e) => {
      if (!e.target.matches('.kebab-trigger')) {
          document.querySelectorAll('.kebab-dropdown').forEach(d => d.style.display = 'none');
      }
  });

  // ===========================================================
  // LÓGICA: GPON Y VISITAS CON MENÚ KEBAB POR ROLES
  // ===========================================================
  function pintarResultadosGPON(rows){
    var tbVis = $('#tbodyResVisitas');
    var tbRec = $('#tbodyResRecepciones');
    if(!tbVis || !tbRec) return;
    
    tbVis.innerHTML = ''; tbRec.innerHTML = '';
    if (!state.hasSearched) { tbVis.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center; padding: 20px;">🔍 Buscar Visitas...</td></tr>'; tbRec.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center; padding: 20px;">🔍 Buscar Recepciones GPON...</td></tr>'; return; }
    if(!rows || !rows.length){ tbVis.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center; padding: 20px; color: #dc2626;">Sin Visitas</td></tr>'; tbRec.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center; padding: 20px; color: #dc2626;">Sin Recepciones GPON</td></tr>'; return; }

    let countVis = 0; let countRec = 0;

    // Estilos inline para los botones del menú Kebab
    const kebabBtnStyle = "display: block; width: 100%; text-align: left; padding: 10px 15px; background: none; border: none; cursor: pointer; font-size: 0.9rem; border-bottom: 1px solid #f8fafc; color: #334155; transition: background 0.2s;";

    rows.forEach(r => {
        var tr = document.createElement('tr');
        var tipo = r.tipo_recepcion || 'VISITA TÉCNICA';
        var fDate = r.fecha_registro ? new Date(r.fecha_registro).toLocaleDateString() : '-';

        if (tipo === 'VISITA TÉCNICA') {
            let menuItems = `<button style="${kebabBtnStyle}" onclick="generarPDFVisita(this, '${r.id}', '${fDate}')" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">📄 Ver Visita</button>`;
            
            if (state.isValidador) {
                menuItems += `<button style="${kebabBtnStyle}" onclick="window.location.href='/recepciones.html?edit=${r.id}&tipo=${encodeURIComponent(tipo)}'" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">✏️ Editar</button>`;
                menuItems += `<button style="${kebabBtnStyle} color: #dc2626;" onclick="borrarRegistroGPON('${r.id}', '${tipo}')" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">🗑️ Eliminar</button>`;
            }

            const kebabHtml = `
                <div style="position: relative; display: inline-block;">
                    <button class="kebab-trigger" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 0 10px;" onclick="window.toggleKebab(this, event)">⋮</button>
                    <div class="kebab-dropdown" style="display: none; position: absolute; right: 0; top: 100%; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-radius: 8px; z-index: 100; min-width: 150px; overflow: hidden; border: 1px solid #e2e8f0;">
                        ${menuItems}
                    </div>
                </div>
            `;
            tr.innerHTML = `<td>#${r.id}</td><td>${text(r.raw_tecnico)}</td><td>${text(r.raw_asesor)}</td><td>${text(r.raw_direccion)}</td><td>${fDate}</td><td>${kebabHtml}</td>`;
            tbVis.appendChild(tr); countVis++;
        } else {
            // LÓGICA DE ESTADOS Y BORRADORES
            var st = r.estado || 'En Revisión';
            var estadoHtml = '-';
            if (st === 'Alta') estadoHtml = '<span class="badge badge-alta">Alta</span>';
            else if (st === 'Pendiente') estadoHtml = `<span class="badge badge-pendiente">Pendiente</span><br><small style="color:#dc2626; font-size:11px; white-space: normal; display: block; max-width: 150px; margin-top: 4px;">${text(r.motivo_pendiente)}</small>`;
            else if (st === 'Borrador') estadoHtml = '<span class="badge" style="background:#f1f5f9; color:#475569; border: 1px solid #cbd5e1;">📝 Borrador</span>';
            else estadoHtml = '<span class="badge badge-revision">En Revisión</span>';

            let menuItems = "";

            // 1. Ver Acta (Si no es borrador - para todos)
            if (st !== 'Borrador') {
                menuItems += `<button style="${kebabBtnStyle}" onclick="generarPDFRecepcion(this, '${r.id}', '${fDate}')" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">📄 Ver Acta</button>`;
            }

            if (state.isValidador) {
                // 🟢 VISTA SUPERVISOR (Acceso total)
                if (st === 'En Revisión' || st === 'Pendiente') {
                    menuItems += `<button style="${kebabBtnStyle} color: #16a34a; font-weight: bold;" onclick="aprobarRecepcion(${r.id})" onmouseover="this.style.background='#f0fdf4'" onmouseout="this.style.background='none'">✅ Aprobar</button>`;
                }

                if (r.archivo_pdf) {
                    menuItems += `<button style="${kebabBtnStyle} color: #2563eb;" onclick="window.open('${r.archivo_pdf}', '_blank')" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'">📎 Ver Plano</button>`;
                    menuItems += `<button style="${kebabBtnStyle}" onclick="prepararSubida(${r.id})" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">🔄 Reemplazar Plano</button>`;
                } else if (st !== 'Borrador') {
                    menuItems += `<button style="${kebabBtnStyle}" onclick="prepararSubida(${r.id})" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">⬆️ Subir Plano</button>`;
                }

                if (st === 'En Revisión' || st === 'Alta') {
                    menuItems += `<button style="${kebabBtnStyle} color: #ea580c;" onclick="marcarPendiente(${r.id})" onmouseover="this.style.background='#fff7ed'" onmouseout="this.style.background='none'">⚠️ Marcar Pendiente</button>`;
                }
                
                const labelBtn = st === 'Borrador' ? 'Editar Borrador' : 'Ver Detalles / Editar';
                menuItems += `<button style="${kebabBtnStyle}" onclick="window.location.href='/recepciones.html?edit=${r.id}&tipo=${encodeURIComponent(tipo)}'" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background='none'">✏️ ${labelBtn}</button>`;
                menuItems += `<button style="${kebabBtnStyle} color: #dc2626;" onclick="borrarRegistroGPON('${r.id}', '${tipo}')" onmouseover="this.style.background='#fef2f2'" onmouseout="this.style.background='none'">🗑️ Eliminar</button>`;
            
            } else {
                // 🔴 VISTA TÉCNICO ESTRICTA
                if (r.archivo_pdf) {
                    menuItems += `<button style="${kebabBtnStyle} color: #2563eb;" onclick="window.open('${r.archivo_pdf}', '_blank')" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='none'">📎 Ver Plano</button>`;
                }
                // 🚫 Restricción Aplicada: No se agrega botón de Ver Detalles ni Continuar
            }

            const kebabHtml = `
                <div style="position: relative; display: inline-block;">
                    <button class="kebab-trigger" style="background: none; border: none; font-size: 1.5rem; cursor: pointer; padding: 0 10px;" onclick="window.toggleKebab(this, event)">⋮</button>
                    <div class="kebab-dropdown" style="display: none; position: absolute; right: 0; top: 100%; background: white; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); border-radius: 8px; z-index: 100; min-width: 180px; overflow: hidden; border: 1px solid #e2e8f0;">
                        ${menuItems}
                    </div>
                </div>
            `;

            tr.innerHTML = `<td>#${r.id}</td><td>${text(r.raw_distrito)}</td><td>${text(r.raw_lugar)}</td><td>${text(r.raw_recibe)}</td><td>${text(r.raw_entrega)}</td><td>${fDate}</td><td>${estadoHtml}</td><td>${kebabHtml}</td>`;
            tbRec.appendChild(tr); countRec++;
        }
    });
    if (countVis === 0) tbVis.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center; padding: 20px;">No hay Visitas</td></tr>';
    if (countRec === 0) tbRec.innerHTML = '<tr><td colspan="8" class="muted" style="text-align:center; padding: 20px;">No hay Recepciones</td></tr>';
  }

  window.buscarGPON = function(page){
      if(!state.isReady) return; 
      state.hasSearched = true; 
      const btn = $('#btnBuscarGPON');
      btn.disabled = true; btn.textContent = "Buscando..."; $('#msg').textContent = '';
      state.page = page || 1;
      var params = new URLSearchParams({ q: $('#qGPON').value, page: state.page, pageSize: state.pageSize });

      fetch('/api/buscar/recepciones?'+params)
        .then(r => r.json())
        .then(res => { state.total = res.total; state.totalPages = res.totalPages; pintarResultadosGPON(res.items); renderPager('pagerGPON'); })
        .catch(e => { $('#msg').textContent = 'Error'; })
        .finally(() => { btn.disabled = false; btn.textContent = "Buscar Expedientes"; });
  };

  // --- LAS FUNCIONES DE APROBACIÓN Y ESTADOS ---
  window.aprobarRecepcion = async function(id) {
      if (!confirm(`¿Estás seguro de Aprobar definitivamente la recepción #${id} y darle el ALTA?\n\nEl documento se bloqueará y no podrá ser editado.`)) return;
      const btn = $('#btnBuscarGPON'); const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Aprobando...';
      try {
          const res = await fetch(`/api/modulos/recepciones/aprobar/${id}`, { method: 'POST' });
          const data = await res.json();
          if (data.ok) { alert('✅ Recepción Aprobada y pasada a estado de Alta.'); buscarGPON(state.page); }
          else alert('❌ Error: ' + (data.error || 'No se pudo aprobar.'));
      } catch (e) { alert('Error de conexión.'); } 
      finally { btn.disabled = false; btn.textContent = orig; }
  };

  window.marcarPendiente = async function(id) {
      const motivo = prompt("Ingrese el motivo para dejar la recepción en Pendiente (Ej. Falta firma, atenuación alta):");
      if (!motivo || motivo.trim() === "") return;
      const btn = $('#btnBuscarGPON'); const origBtnLabel = btn.textContent;
      btn.textContent = "Actualizando..."; btn.disabled = true;
      try {
          const r = await fetch('/api/buscar/recepciones/pendiente', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: id, motivo: motivo.trim() }) });
          const res = await r.json();
          if (res.ok) { alert("⚠️ Distrito marcado como Pendiente correctamente."); buscarGPON(state.page); } 
          else { alert("❌ Error: " + (res.error || 'No se pudo actualizar el estado.')); }
      } catch(err) { alert("Error de conexión al intentar cambiar el estado."); } 
      finally { btn.textContent = origBtnLabel; btn.disabled = false; }
  };

  window.borrarRegistroGPON = async function(id, tipo) {
      if (!confirm(`¿Estás seguro de ELIMINAR definitivamente esta ${tipo} #${id}?`)) return;
      const btn = $('#btnBuscarGPON'); const orig = btn.textContent;
      btn.disabled = true; btn.textContent = 'Eliminando...';
      try {
          const res = await fetch(`/api/buscar/recepciones/${id}?tipo=${encodeURIComponent(tipo)}`, { method: 'DELETE' });
          const data = await res.json();
          if (data.ok) { alert('✅ Eliminado.'); buscarGPON(state.page); } else alert('❌ Error.');
      } catch (e) { alert('Error de conexión.'); } finally { btn.disabled = false; btn.textContent = orig; }
  };

  let currentUploadId = null;
  window.prepararSubida = function(id) { currentUploadId = id; $('#filePlanoUpload').click(); };

  document.getElementById('filePlanoUpload')?.addEventListener('change', async function(e) {
      const file = e.target.files[0];
      if (!file || !currentUploadId) return;
      const ext = file.name.split('.').pop().toLowerCase();
      if (ext !== 'pdf' && ext !== 'dwg') { alert("Por favor, selecciona un archivo PDF o DWG válido."); e.target.value = ''; return; }

      const formData = new FormData(); formData.append('plano', file); formData.append('id', currentUploadId);
      const btn = $('#btnBuscarGPON'); const origBtnLabel = btn.textContent;
      btn.textContent = "Subiendo archivo..."; btn.disabled = true;
      try {
          const r = await fetch('/api/buscar/recepciones/upload', { method: 'POST', body: formData });
          const res = await r.json();
          if (res.ok) { alert("✅ Documento cargado exitosamente."); buscarGPON(state.page); } else alert("❌ Error.");
      } catch(err) { alert("Error de conexión."); } finally { e.target.value = ''; btn.textContent = origBtnLabel; btn.disabled = false; }
  });

  window.borrar = function(id){
      if(!confirm("¿Liberar este puerto?")) return;
      fetch('/api/ruta/'+id, {method:'DELETE'}).then(r => r.json()).then(res => { if(res.ok) buscarGeneral(state.page); else alert("Error: " + res.error); });
  };
  window.toggleExpediente = function(id) { var el = document.getElementById('exp_' + id); if (el) el.style.display = el.style.display === 'none' ? 'table-row' : 'none'; };

  function renderPager(divId){
      var div = $(`#${divId}`); if(state.total === 0 || !state.hasSearched) { div.innerHTML = ''; return; }
      var p = Number(state.page), tp = Number(state.totalPages), fnName = (divId === 'pagerGeneral') ? 'buscarGeneral' : 'buscarGPON';
      var html = `<div class="pager-left muted">Total: ${state.total} (Página ${p}/${tp||1})</div><div class="pager-right">`;
      if(p > 1) html += `<button class="btn pag" onclick="window.${fnName}(${p-1})">Anterior</button> `;
      if(p < tp) html += `<button class="btn pag" onclick="window.${fnName}(${p+1})">Siguiente</button>`;
      div.innerHTML = html + '</div>';
  }

  // ===========================================================
  // ACTAS EN PDF (RESTAURADAS CON jsPDF) + FOTO BITÁCORA
  // ===========================================================
  window.generarPDFVisita = async function(btn, id, fecha) {
      if (!window.jspdf) return alert("La librería de PDF no cargó correctamente.");
      const origText = btn.textContent;
      btn.textContent = "⏳ Cargando..."; btn.disabled = true;

      try {
          const response = await fetch('/api/modulos/visitas/' + id);
          if(!response.ok) throw new Error("No se pudo obtener la información.");
          const data = await response.json();

          const { jsPDF } = window.jspdf; 
          const doc = new jsPDF();
          let y = 20;

          doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(199, 53, 43); 
          doc.text("Acta de Inspección - Visita Técnica GPON", 20, y); y += 10;

          doc.setFontSize(12); doc.setTextColor(100, 100, 100);
          doc.text(`ID de Registro: #${id}`, 20, y); doc.text(`Fecha: ${fecha}`, 140, y); y += 5;
          doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 10;
          
          doc.setTextColor(30, 41, 59); 
          
          doc.setFont("helvetica", "bold"); doc.text("Técnico / Responsable:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.tecnico || "No especificado", 70, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("Asesor Inmobiliaria:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.asesor || "No especificado", 70, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("Contrata (Empresa):", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.contrata || "No especificado", 70, y); y += 15;

          doc.setDrawColor(199, 53, 43); doc.line(20, y-5, 190, y-5);

          let gpsText = "";
          if (data.latitud && data.longitud) gpsText = `[Lat: ${data.latitud}, Lng: ${data.longitud}]`;

          doc.setFont("helvetica", "bold"); doc.text("Dirección / Ubicación:", 20, y);
          doc.setFont("helvetica", "normal"); 
          const dirStr = (data.direccion || "Sin dirección registrada") + (gpsText ? `   ${gpsText}` : "");
          const splitDir = doc.splitTextToSize(dirStr, 130);
          doc.text(splitDir, 65, y);
          y += (splitDir.length * 7) + 10;

          doc.setFont("helvetica", "bold"); doc.text("Observaciones de Campo:", 20, y); y += 8;
          doc.setFont("helvetica", "normal"); 
          const splitObs = doc.splitTextToSize(data.observaciones || "Sin observaciones", 170);
          doc.text(splitObs, 20, y);
          y += (splitObs.length * 7) + 10;

          // ==========================================
          // NUEVO: RENDERIZADO DE LA FOTO EN EL PDF
          // ==========================================
          if (data.foto_bitacora) {
              // Verificamos si hay espacio en la hoja actual para la foto (necesitamos ~120 unidades de alto)
              if (y + 120 > 275) { 
                  doc.addPage(); 
                  y = 20; 
              }

              doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
              doc.text("Evidencia Fotográfica:", 20, y); 
              y += 8;

              try {
                  // doc.addImage(Base64, Formato, X, Y, Ancho, Alto)
                  // Usamos ancho 170 para que ocupe de margen a margen y alto 100 proporcional.
                  doc.addImage(data.foto_bitacora, 'JPEG', 20, y, 170, 100);
                  y += 110; 
              } catch (imgError) {
                  console.error("Error al procesar la imagen en el PDF:", imgError);
                  doc.setFontSize(10); doc.setTextColor(220, 38, 38);
                  doc.text("[Error al cargar la imagen de la bitácora]", 20, y);
                  y += 10;
              }
          }
          // ==========================================

          if (y > 275) { doc.addPage(); y = 20; }
          doc.setFontSize(9); doc.setTextColor(150, 150, 150);
          doc.text("Generado automáticamente por el Sistema de Infraestructura de Fibra Óptica", 20, 280);
          
          window.open(URL.createObjectURL(doc.output("blob")), "_blank");

      } catch (error) {
          console.error(error);
          alert("Error al intentar construir el Acta de Visita: " + error.message);
      } finally {
          btn.textContent = origText; btn.disabled = false;
      }
  };

  window.generarPDFRecepcion = async function(btn, id, fecha) {
      if (!window.jspdf) return alert("La librería de PDF no cargó correctamente.");
      
      const origText = btn.textContent;
      btn.textContent = "⏳ Cargando..."; btn.disabled = true;

      try {
          const response = await fetch('/api/modulos/recepciones/' + id);
          if(!response.ok) throw new Error("No se pudo obtener la información de la Recepción.");
          const data = await response.json();

          const { jsPDF } = window.jspdf; 
          const doc = new jsPDF();
          let y = 20;

          doc.setFont("helvetica", "bold"); doc.setFontSize(18); doc.setTextColor(22, 163, 74); 
          doc.text("Acta de Aceptación - Recepción GPON", 20, y); y += 10;

          doc.setFontSize(12); doc.setTextColor(100, 100, 100);
          doc.text(`ID de Acta: #${id}`, 20, y); doc.text(`Fecha: ${fecha}`, 140, y); y += 5;
          doc.setDrawColor(200, 200, 200); doc.line(20, y, 190, y); y += 10;
          
          doc.setTextColor(30, 41, 59); 

          doc.setFont("helvetica", "bold"); doc.text("Tipo de Red:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.tipo_red || "N/A", 65, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("Distrito:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.distrito || "N/A", 65, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("Ubicación General:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.lugar_general || "N/A", 65, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("FDH / Hub Box:", 20, y);
          doc.setFont("helvetica", "normal"); 
          const fdhLines = doc.splitTextToSize(data.ubicacion_fdh || "N/A", 125);
          doc.text(fdhLines, 65, y); y += (fdhLines.length * 6) + 4;

          doc.setDrawColor(22, 163, 74); doc.line(20, y, 190, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("Técnico Contrata:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.entrega || "No especificado", 65, y); y += 10;

          doc.setFont("helvetica", "bold"); doc.text("Auditor Claro:", 20, y);
          doc.setFont("helvetica", "normal"); doc.text(data.recepciona || "No especificado", 65, y); y += 15;

          if (data.elementos && data.elementos.length > 0) {
              doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(22, 163, 74);
              doc.text("Detalle de Cajas NAP y Mediciones", 20, y); y += 10;

              data.elementos.forEach((el, index) => {
                  if (y > 250) { doc.addPage(); y = 20; }

                  doc.setFontSize(11); doc.setTextColor(255, 255, 255); doc.setFont("helvetica", "bold");
                  doc.setFillColor(30, 64, 175); 
                  doc.rect(20, y, 170, 8, 'F');
                  doc.text(`Caja ${index + 1}: ${el.identificacion || 'Sin ID'}  |  Slot/Puerto: ${el.slot_puerto || 'N/A'}`, 23, y + 5.5);
                  y += 12;

                  doc.setTextColor(30, 41, 59); doc.setFont("helvetica", "normal"); doc.setFontSize(10);
                  
                  let dl = el.vel_5g_dl ? el.vel_5g_dl + " Mbps" : "N/A";
                  let ul = el.vel_5g_ul ? el.vel_5g_ul + " Mbps" : "N/A";
                  doc.text(`Prueba 5G -> Descarga (DL): ${dl}  |  Subida (UL): ${ul}`, 20, y); y += 8;

                  if(el.observacion) {
                      const obsLines = doc.splitTextToSize(`Observaciones: ${el.observacion}`, 170);
                      doc.text(obsLines, 20, y); y += (obsLines.length * 5) + 4;
                  }

                  if (el.mediciones && el.mediciones.length > 0) {
                      if (y > 260) { doc.addPage(); y = 20; }
                      doc.setFont("helvetica", "bold");
                      doc.setFillColor(241, 245, 249); doc.rect(20, y, 140, 6, 'F');
                      doc.text("Puerto / Hilo", 25, y + 4.5);
                      doc.text("Potencia 1310 nm", 70, y + 4.5);
                      doc.text("Potencia 1550 nm", 115, y + 4.5);
                      y += 9;

                      doc.setFont("helvetica", "normal");
                      el.mediciones.forEach(med => {
                          if (y > 275) { doc.addPage(); y = 20; }
                          doc.text(String(med.puerto_hilo || '-'), 30, y);
                          doc.text(String(med.potencia_1310 || '-') + ' dBm', 75, y);
                          doc.text(String(med.potencia_1550 || '-') + ' dBm', 120, y);
                          y += 6;
                      });
                  } else {
                      doc.setTextColor(150, 150, 150); doc.text("Sin mediciones de hilo registradas.", 20, y); y += 6;
                  }
                  y += 6; 
              });
          } else {
              doc.setTextColor(150, 150, 150); doc.setFontSize(10);
              doc.text("No se adjuntaron cajas NAP ni mediciones en esta recepción.", 20, y);
          }

          if (y > 275) { doc.addPage(); y = 20; }
          doc.setFontSize(9); doc.setTextColor(150, 150, 150);
          doc.text("Generado automáticamente por el Sistema de Infraestructura de Fibra Óptica", 20, 285);
          
          window.open(URL.createObjectURL(doc.output("blob")), "_blank");

      } catch (error) {
          console.error(error);
          alert("Error al intentar construir el Acta: " + error.message);
      } finally {
          btn.textContent = origText; btn.disabled = false;
      }
  };

  document.addEventListener('DOMContentLoaded', function(){
      checkUser(); loadFiltros(); setupTabs();
      $('#btnBuscarGeneral').addEventListener('click', () => buscarGeneral(1));
      $('#q').addEventListener('input', function() { clearTimeout(typingTimer); typingTimer = setTimeout(function() { if ($('#q').value.trim() !== "" || $('#central').value !== "" || $('#odf').value !== "") buscarGeneral(1); else { state.hasSearched = false; state.total = 0; renderPager('pagerGeneral'); pintarResultadosGeneral([]); } }, doneTypingInterval); });
      $('#odf').addEventListener('change', () => buscarGeneral(1));
      $('#btnLimpiarGeneral').addEventListener('click', () => { $('#q').value=''; $('#central').value=''; $('#odf').value=''; state.hasSearched = false; state.total = 0; renderPager('pagerGeneral'); pintarResultadosGeneral([]); fetch('/api/buscar/odfs').then(r=>r.json()).then(renderODFs); });
      $('#btnBuscarGPON').addEventListener('click', () => buscarGPON(1));
      $('#qGPON').addEventListener('input', function() { clearTimeout(typingTimer); typingTimer = setTimeout(function() { if ($('#qGPON').value.trim() !== "") buscarGPON(1); else { state.hasSearched = false; state.total = 0; renderPager('pagerGPON'); pintarResultadosGPON([]); } }, doneTypingInterval); });
      $('#btnLimpiarGPON').addEventListener('click', () => { $('#qGPON').value=''; state.hasSearched = false; state.total = 0; renderPager('pagerGPON'); pintarResultadosGPON([]); });
  });
})();