// =========================================================================
// Archivo: public/js/buscar-dashboard.js
// Versión: 1.0 - Lógica del módulo Buscar para Dashboard Bootstrap 5
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
      isValidador: false 
  };
  
  let modalAccionesRuta = null;
  let modalConfirmacion = null;
  let currentRutaId = null;

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

  function loadFiltros(){
    fetch('/api/buscar/filtros').then(r=>r.json()).then(d=>{
        var selC=$('#central'); if(!selC) return;
        selC.innerHTML='<option value="">(Todas las centrales)</option>';
        
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
      selO.innerHTML='<option value="">(Todos los ODFs)</option>';
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
    var badge = $('#totalResultadosBadge');
    if(badge) badge.textContent = `${rows.length} resultado${rows.length !== 1 ? 's' : ''}`;
    
    tb.innerHTML = '';
    if (!state.hasSearched) { 
      tb.innerHTML='<tr><td colspan="8" class="text-center text-muted py-5"><i class="bi bi-inbox" style="font-size: 48px; opacity: 0.3;"></i><p class="mt-3 mb-0 fw-medium">Realiza una búsqueda para ver resultados</p><small class="text-muted">Usa los filtros de arriba para encontrar expedientes</small></td></tr>'; 
      return; 
    }
    if(!rows || !rows.length){ 
      tb.innerHTML='<tr><td colspan="8" class="text-center text-muted py-5"><i class="bi bi-search" style="font-size: 48px; opacity: 0.3;"></i><p class="mt-3 mb-0 fw-medium">No se encontraron resultados</p><small class="text-muted">Intenta con otros términos de búsqueda</small></td></tr>'; 
      return; 
    }

    const isEditor = state.roles.includes('editor') || state.roles.includes('admin');
    const showRuta = state.roles.includes('editor') || state.roles.includes('admin') || state.roles.includes('tecnico');

    rows.forEach(r => {
        var tr=document.createElement('tr');
        var idRuta = r.id_ruta;
        var idCliente = r.id_cliente || r.id_cliente_interno || r.cliente_id || '';
        var botonesHTML = '';
        var isLibre = String(r.Cliente).toUpperCase() === 'LIBRE';
        var numIncidencias = (r.incidencias && r.incidencias.length) ? r.incidencias.length : 0;

        // Botón de acciones que abre modal
        botonesHTML = `<button class="btn btn-sm btn-outline-primary" onclick="window.buscarDashboard.mostrarAccionesRuta(${idRuta}, ${numIncidencias}, '${encodeURIComponent(idCliente)}', ${!!r.Tiene_Tramo})">
          <i class="bi bi-three-dots-vertical"></i>
        </button>`;

        tr.innerHTML = `
            <td class="ps-3 fw-semibold">${idRuta}</td>
            <td>${text(r.ID_central)}</td>
            <td>${isLibre ? '<span class="badge bg-success">LIBRE</span>' : text(r.Cliente)}</td>
            <td>${text(r.Tarea)}</td>
            <td>${text(r.Nombre_ODF)}</td>
            <td>${text(r.Puerto_ODF)}</td>
            <td>${text(r.Equipo)}</td>
            <td class="text-end pe-3">${botonesHTML}</td>
        `;
        tb.appendChild(tr);

        if (numIncidencias > 0) {
            var trDet = document.createElement('tr');
            trDet.id = `exp_${idRuta}`; trDet.style.display = 'none';
            trDet.className = 'table-light';
            let incHtml = `<div class="p-3 bg-light border-start border-4 border-danger">`;
            r.incidencias.forEach(i => {
              incHtml += `
                <div class="mb-2 pb-2 border-bottom">
                  <div class="d-flex justify-content-between align-items-center mb-1">
                    <strong class="text-danger"><i class="bi bi-exclamation-triangle me-1"></i>${text(i.tipo_dano)}</strong>
                    <small class="text-muted">${new Date(i.fecha_registro).toLocaleDateString()}</small>
                  </div>
                  <div class="ms-4">
                    <small class="text-muted">Daño red: ${text(i.dano_red)}</small><br>
                    <small class="text-primary">Solución: ${text(i.tipo_solucion)}</small>
                  </div>
                </div>
              `;
            });
            incHtml += `</div>`;
            trDet.innerHTML = `<td colspan="8" class="p-0">${incHtml}</td>`;
            tb.appendChild(trDet);
        }
    });
  }

  window.buscarDashboard = {
    mostrarAccionesRuta: function(idRuta, numIncidencias, idCliente, tieneTramo) {
      currentRutaId = idRuta;
      
      if (!modalAccionesRuta) {
        modalAccionesRuta = new bootstrap.Modal($('#modalAccionesRuta'));
      }
      
      // Configurar botones del modal
      const btnAverias = $('#btnModalAverias');
      const btnRuta = $('#btnModalRuta');
      const btnEditar = $('#btnModalEditar');
      const btnLiberar = $('#btnModalLiberar');
      
      // Mostrar/ocultar botón de averías
      if (numIncidencias > 0) {
        btnAverias.style.display = 'block';
        btnAverias.innerHTML = `<i class="bi bi-exclamation-triangle me-2"></i>Ver Averías (${numIncidencias})`;
      } else {
        btnAverias.style.display = 'none';
      }
      
      // Configurar evento Ver Ruta
      if (tieneTramo && idCliente) {
        btnRuta.style.display = 'block';
        btnRuta.onclick = () => {
          window.open(`/mapa.html?cliente=${decodeURIComponent(idCliente)}`, '_blank');
          modalAccionesRuta.hide();
        };
      } else {
        btnRuta.style.display = 'none';
      }
      
      // Configurar evento Editar
      const isEditor = state.roles.includes('editor') || state.roles.includes('admin');
      if (isEditor) {
        btnEditar.style.display = 'block';
        btnEditar.onclick = () => {
          window.location.href = `/ruta.html?id=${idRuta}`;
        };
      } else {
        btnEditar.style.display = 'none';
      }
      
      // Configurar evento Liberar
      if (isEditor) {
        btnLiberar.style.display = 'block';
        btnLiberar.onclick = () => {
          modalAccionesRuta.hide();
          buscarDashboard.confirmarLiberacion(idRuta);
        };
      } else {
        btnLiberar.style.display = 'none';
      }
      
      modalAccionesRuta.show();
    },
    
    confirmarLiberacion: function(idRuta) {
      if (!modalConfirmacion) {
        modalConfirmacion = new bootstrap.Modal($('#modalConfirmacion'));
      }
      
      $('#modalConfirmacionMensaje').textContent = `¿Estás seguro de liberar la ruta #${idRuta}? Esta acción cambiará el estado a LIBRE.`;
      
      const btnConfirmar = $('#btnModalConfirmar');
      btnConfirmar.onclick = () => {
        borrar(idRuta);
        modalConfirmacion.hide();
      };
      
      modalConfirmacion.show();
    }
  };

  window.buscarGeneral = function(page){
      if(!state.isReady) return; 
      state.hasSearched = true; 
      const btn = $('#btnBuscarGeneral');
      const originalText = btn.innerHTML;
      btn.disabled = true; 
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Buscando...';
      
      state.page = page || 1;
      var params = new URLSearchParams({ q: $('#q').value, central: $('#central').value, odf: $('#odf').value, page: state.page, pageSize: state.pageSize });

      fetch('/api/buscar?'+params)
        .then(r => r.json())
        .then(res => { 
          state.total = res.total; 
          state.totalPages = res.totalPages; 
          pintarResultadosGeneral(res.items); 
          renderPager('pagerGeneral'); 
        })
        .catch(e => { console.error('Error en búsqueda:', e); })
        .finally(() => { 
          btn.disabled = false; 
          btn.innerHTML = originalText; 
        });
  };

  window.buscarGPON = function(page){
      if(!state.isReady) return; 
      state.hasSearched = true; 
      const btn = $('#btnBuscarGPON');
      const originalText = btn.innerHTML;
      btn.disabled = true; 
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Buscando...';
      
      state.page = page || 1;
      var params = new URLSearchParams({ q: $('#qGPON').value, page: state.page, pageSize: state.pageSize });

      fetch('/api/buscar/gpon?'+params)
        .then(r => r.json())
        .then(res => { 
          pintarResultadosGPON(res.items || []); 
          renderPager('pagerGPON'); 
        })
        .catch(e => { console.error('Error en búsqueda GPON:', e); })
        .finally(() => { 
          btn.disabled = false; 
          btn.innerHTML = originalText; 
        });
  };

  function pintarResultadosGPON(rows){
    var tbVis = $('#tbodyResVisitas');
    var tbRec = $('#tbodyResRecepciones');
    if(!tbVis || !tbRec) return;
    
    tbVis.innerHTML = ''; tbRec.innerHTML = '';
    if (!state.hasSearched) { 
      tbVis.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4"><i class="bi bi-inbox" style="font-size: 32px; opacity: 0.3;"></i><p class="mt-2 mb-0">Buscar Visitas...</p></td></tr>'; 
      tbRec.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-inbox" style="font-size: 32px; opacity: 0.3;"></i><p class="mt-2 mb-0">Buscar Recepciones GPON...</p></td></tr>'; 
      return; 
    }
    if(!rows || !rows.length){ 
      tbVis.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Sin Visitas</td></tr>'; 
      tbRec.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-4">Sin Recepciones GPON</td></tr>'; 
      return; 
    }

    rows.forEach(r => {
        var tr = document.createElement('tr');
        var tipo = r.tipo_recepcion || 'VISITA TÉCNICA';
        var fDate = r.fecha_registro ? new Date(r.fecha_registro).toLocaleDateString() : '-';

        if (tipo === 'VISITA TÉCNICA') {
            const kebabHtml = `
                <div class="dropdown">
                  <button class="btn btn-sm btn-outline-primary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    Acciones
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    <li><a class="dropdown-item" href="#" onclick="window.buscarDashboard.generarPDFVisita('${r.id}')"><i class="bi bi-file-pdf me-2"></i>Ver Visita</a></li>
                    ${state.isValidador ? `<li><a class="dropdown-item" href="/recepciones.html?edit=${r.id}&tipo=${encodeURIComponent(tipo)}"><i class="bi bi-pencil me-2"></i>Editar</a></li>` : ''}
                    ${state.isValidador ? `<li><a class="dropdown-item text-danger" href="#" onclick="window.buscarDashboard.borrarRegistroGPON('${r.id}', '${tipo}')"><i class="bi bi-trash me-2"></i>Eliminar</a></li>` : ''}
                  </ul>
                </div>
            `;
            tr.innerHTML = `<td>#${r.id}</td><td>${text(r.raw_tecnico)}</td><td>${text(raw_asesor)}</td><td>${text(r.raw_direccion)}</td><td>${fDate}</td><td class="text-end">${kebabHtml}</td>`;
            tbVis.appendChild(tr);
        } else {
            var st = r.estado || 'En Revisión';
            var estadoHtml = '-';
            if (st === 'Alta') estadoHtml = '<span class="badge bg-success">Alta</span>';
            else if (st === 'Pendiente') estadoHtml = '<span class="badge bg-warning">Pendiente</span>';
            else if (st === 'Borrador') estadoHtml = '<span class="badge bg-secondary">📝 Borrador</span>';
            else estadoHtml = '<span class="badge bg-info">En Revisión</span>';

            const kebabHtml = `
                <div class="dropdown">
                  <button class="btn btn-sm btn-outline-success dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    Acciones
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end">
                    ${st !== 'Borrador' ? `<li><a class="dropdown-item" href="#" onclick="window.buscarDashboard.generarPDFRecepcion('${r.id}')"><i class="bi bi-file-pdf me-2"></i>Ver Acta</a></li>` : ''}
                    ${state.isValidador && (st === 'En Revisión' || st === 'Pendiente') ? `<li><a class="dropdown-item text-success" href="#" onclick="window.buscarDashboard.aprobarRecepcion(${r.id})"><i class="bi bi-check-circle me-2"></i>Aprobar</a></li>` : ''}
                    ${state.isValidador ? `<li><a class="dropdown-item" href="/recepciones.html?edit=${r.id}&tipo=${encodeURIComponent(tipo)}"><i class="bi bi-pencil me-2"></i>Editar</a></li>` : ''}
                    ${state.isValidador ? `<li><a class="dropdown-item text-danger" href="#" onclick="window.buscarDashboard.borrarRegistroGPON('${r.id}', '${tipo}')"><i class="bi bi-trash me-2"></i>Eliminar</a></li>` : ''}
                  </ul>
                </div>
            `;
            tr.innerHTML = `<td>#${r.id}</td><td>${text(r.distrito)}</td><td>${text(r.lugar)}</td><td>${text(r.quien_recepciona)}</td><td>${text(r.quien_entrega)}</td><td>${fDate}</td><td>${estadoHtml}</td><td class="text-end">${kebabHtml}</td>`;
            tbRec.appendChild(tr);
        }
    });
  }

  function renderPager(pagerId) {
      var pagerEl = $('#' + pagerId);
      if (!pagerEl) return;
      
      if (state.totalPages <= 1) {
          pagerEl.innerHTML = '';
          return;
      }
      
      let html = `<small class="text-muted">Página ${state.page} de ${state.totalPages}</small>`;
      html += `<div class="btn-group">`;
      
      if (state.page > 1) {
          html += `<button class="btn btn-sm btn-outline-secondary" onclick="window.buscarDashboard.${pagerId === 'pagerGeneral' ? 'buscarGeneral' : 'buscarGPON'}(${state.page - 1})"><i class="bi bi-chevron-left"></i></button>`;
      }
      
      for (let i = 1; i <= state.totalPages; i++) {
          if (i === state.page) {
              html += `<button class="btn btn-sm btn-primary">${i}</button>`;
          } else if (i === 1 || i === state.totalPages || (i >= state.page - 2 && i <= state.page + 2)) {
              html += `<button class="btn btn-sm btn-outline-secondary" onclick="window.buscarDashboard.${pagerId === 'pagerGeneral' ? 'buscarGeneral' : 'buscarGPON'}(${i})">${i}</button>`;
          } else if (i === state.page - 3 || i === state.page + 3) {
              html += `<span class="btn btn-sm btn-link disabled">...</span>`;
          }
      }
      
      if (state.page < state.totalPages) {
          html += `<button class="btn btn-sm btn-outline-secondary" onclick="window.buscarDashboard.${pagerId === 'pagerGeneral' ? 'buscarGeneral' : 'buscarGPON'}(${state.page + 1})"><i class="bi bi-chevron-right"></i></button>`;
      }
      
      html += `</div>`;
      pagerEl.innerHTML = html;
  }

  // Funciones globales para compatibilidad
  window.borrar = function(idRuta) {
    if(!confirm(`¿Liberar ruta ${idRuta}?`)) return;
    fetch('/api/ruta/'+idRuta+'/liberar', {method:'POST'}).then(r=>{
        if(r.ok) { buscarGeneral(state.page); } 
        else { alert('Error al liberar'); }
    });
  };

  // Inicialización cuando el módulo buscar se muestra
  window.initBuscarModule = function() {
    checkUser();
    loadFiltros();
    
    // Event listeners para formularios
    $('#formBusquedaGeneral')?.addEventListener('submit', (e) => {
      e.preventDefault();
      buscarGeneral(1);
    });
    
    $('#formBusquedaGPON')?.addEventListener('submit', (e) => {
      e.preventDefault();
      buscarGPON(1);
    });
    
    // Botones de limpiar
    $('#btnLimpiarGeneral')?.addEventListener('click', () => {
      $('#q').value = '';
      $('#central').value = '';
      $('#odf').value = '';
      state.hasSearched = false;
      pintarResultadosGeneral([]);
    });
    
    $('#btnLimpiarGPON')?.addEventListener('click', () => {
      $('#qGPON').value = '';
      state.hasSearched = false;
      pintarResultadosGPON([]);
    });
    
    // Manejar tabs para mostrar/ocultar secciones de resultados
    $('#tab-general-btn')?.addEventListener('shown.bs.tab', () => {
      $('#res-general').classList.remove('d-none');
      $('#res-gpon').classList.add('d-none');
    });
    
    $('#tab-gpon-btn')?.addEventListener('shown.bs.tab', () => {
      $('#res-general').classList.add('d-none');
      $('#res-gpon').classList.remove('d-none');
    });
  };

})();
