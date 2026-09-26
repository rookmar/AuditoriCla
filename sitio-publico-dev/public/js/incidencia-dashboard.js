// =========================================================================
// Archivo: public/js/incidencia-dashboard.js
// Versión: 1.0 - Integración de Incidencias en Dashboard Bootstrap 5
// =========================================================================

(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  
  let fotoIncidenciaBlob = null;

  function initIncidenciaModule() {
    console.log('Inicializando módulo Incidencias...');
    
    // Resetear estado
    fotoIncidenciaBlob = null;
    
    setupEventListeners();
  }

  function setupEventListeners() {
    // --- 1. LÓGICA DINÁMICA: RED PRIMARIA VS SECUNDARIA ---
    const danoRed = $('#incidencia_dano_red');
    if (danoRed) {
      danoRed.addEventListener('change', (e) => {
        const val = e.target.value;
        const wrapSec = $('#incidencia_wrap_secundaria');
        const wrapPri = $('#incidencia_wrap_primaria');

        // Resetear valores ocultos
        const tipoDanoSec = $('#incidencia_tipo_dano_secundaria');
        const tipoSolSec = $('#incidencia_tipo_solucion_secundaria');
        const tipoDanoPri = $('#incidencia_tipo_dano_primaria');
        const tipoSolPri = $('#incidencia_tipo_solucion_primaria');
        
        if (tipoDanoSec) tipoDanoSec.value = '';
        if (tipoSolSec) tipoSolSec.value = '';
        if (tipoDanoPri) tipoDanoPri.value = '';
        if (tipoSolPri) tipoSolPri.value = '';

        if (val === 'Secundaria') {
          if (wrapSec) wrapSec.style.display = 'grid';
          if (wrapPri) wrapPri.style.display = 'none';
        } else if (val === 'Primaria') {
          if (wrapSec) wrapSec.style.display = 'none';
          if (wrapPri) wrapPri.style.display = 'grid';
        } else {
          if (wrapSec) wrapSec.style.display = 'none';
          if (wrapPri) wrapPri.style.display = 'none';
        }
      });
    }

    // --- 2. REGLA ESPECIAL DE LA MUFA ---
    const tipoDanoSecundaria = $('#incidencia_tipo_dano_secundaria');
    if (tipoDanoSecundaria) {
      tipoDanoSecundaria.addEventListener('change', (e) => {
        if (e.target.value === 'Mufa') {
          const tipoSolSec = $('#incidencia_tipo_solucion_secundaria');
          if (tipoSolSec) tipoSolSec.value = 'Sustitucion de Cable Preconectorizado';
        }
      });
    }

    // --- 3. DIVULGACIÓN PROGRESIVA: ¿SE REALIZÓ REPARACIÓN? ---
    const reparado = $('#incidencia_reparado');
    if (reparado) {
      reparado.addEventListener('change', (e) => {
        const bloqueRedes = $('#incidencia_bloque_selectores_red');
        const seccionMateriales = $('#incidencia_seccion_materiales');
        const seccionEvidencia = $('#incidencia_seccion_evidencia');

        // Contenedores secundarios a apagar por si acaso estaban abiertos
        const wrapSec = $('#incidencia_wrap_secundaria');
        const wrapPri = $('#incidencia_wrap_primaria');

        if (e.target.value === "0") {
          const wrapMotivo = $('#incidencia_wrap_motivo_no');
          if (wrapMotivo) wrapMotivo.style.display = 'block';
          if (bloqueRedes) bloqueRedes.style.display = 'none';
          if (wrapSec) wrapSec.style.display = 'none';
          if (wrapPri) wrapPri.style.display = 'none';
          const danoRedSelect = $('#incidencia_dano_red');
          if (danoRedSelect) danoRedSelect.value = '';

          if (seccionMateriales) seccionMateriales.style.display = 'none';
          if (seccionEvidencia) seccionEvidencia.style.display = 'none';
        } else {
          const wrapMotivo = $('#incidencia_wrap_motivo_no');
          if (wrapMotivo) wrapMotivo.style.display = 'none';
          const motivoNoInput = $('#incidencia_motivo_no_reparacion');
          if (motivoNoInput) motivoNoInput.value = '';
          if (bloqueRedes) bloqueRedes.style.display = 'grid';
          if (seccionMateriales) seccionMateriales.style.display = 'block';
          if (seccionEvidencia) seccionEvidencia.style.display = 'block';
        }
      });
    }

    const redAlterna = $('#incidencia_red_alterna');
    if (redAlterna) {
      redAlterna.addEventListener('change', (e) => {
        const wrapNombreRed = $('#incidencia_wrap_nombre_red');
        const nombreRedInput = $('#incidencia_nombre_red_alterna');
        
        if (e.target.value === "1") {
          if (wrapNombreRed) wrapNombreRed.style.display = 'block';
        } else {
          if (wrapNombreRed) wrapNombreRed.style.display = 'none';
          if (nombreRedInput) nombreRedInput.value = '';
        }
      });
    }

    // --- 4. AUTOCOMPLETADO DE CLIENTE ---
    const busquedaCliente = $('#incidencia_busquedaCliente');
    if (busquedaCliente) {
      busquedaCliente.addEventListener('input', debounce(async (e) => {
        const q = e.target.value.trim();
        if (q.length < 4) {
          const alerta = $('#incidencia_alertaReincidencia');
          const resultados = $('#incidencia_resultadosBusqueda');
          if (alerta) alerta.style.display = 'none';
          if (resultados) resultados.style.display = 'none';
          return;
        }
        
        try {
          const res = await fetch(`/api/incidencia/buscar-cliente?q=${q}`);
          const data = await res.json();

          const alerta = $('#incidencia_alertaReincidencia');
          if (alerta && data.reincidencia > 0) {
            alerta.style.display = 'block';
          } else if (alerta) {
            alerta.style.display = 'none';
          }

          const resultadosDiv = $('#incidencia_resultadosBusqueda');
          if (resultadosDiv && data.clientes && data.clientes.length > 0) {
            resultadosDiv.innerHTML = data.clientes.map(c => `
              <div class="search-item" onclick="window.seleccionarClienteIncidencia('${c.id_cliente_ext}', '${c.nombre_cliente.replace(/'/g, "\\'")}')">
                <b>${c.id_cliente_ext}</b> - ${c.nombre_cliente}
              </div>
            `).join("");
            resultadosDiv.style.display = 'block';
          } else if (resultadosDiv) {
            resultadosDiv.style.display = 'none';
          }
        } catch (error) {
          console.error("Error buscando cliente:", error);
        }
      }, 500));
    }

    // --- 5. GPS Y FOTO ---
    const btnGPS = $('#incidencia_btnGPSIncidencia');
    if (btnGPS) {
      btnGPS.addEventListener('click', () => {
        const gpsTxt = $('#incidencia_gpsTxtIncidencia');
        if (!gpsTxt) return;
        
        gpsTxt.textContent = "🛰️ Buscando satélites...";
        
        navigator.geolocation.getCurrentPosition((pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          
          const latInput = $('#incidencia_latIncidencia');
          const lngInput = $('#incidencia_lngIncidencia');
          if (latInput) latInput.value = lat;
          if (lngInput) lngInput.value = lng;
          
          gpsTxt.textContent = `📍 Coordenadas capturadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          gpsTxt.style.color = "#16a34a";
          gpsTxt.style.fontWeight = "bold";
        }, () => {
          gpsTxt.textContent = "❌ Error GPS: Por favor, activa tu ubicación.";
          gpsTxt.style.color = "#dc2626";
        }, { enableHighAccuracy: true });
      });
    }

    const fotoInput = $('#incidencia_fotoIncidencia');
    if (fotoInput) {
      fotoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          fotoIncidenciaBlob = file;
        }
      });
    }

    // --- 6. ENVIAR TODO AL SERVIDOR ---
    const btnGuardar = $('#incidencia_btnGuardarIncidencia');
    if (btnGuardar) {
      btnGuardar.addEventListener('click', async () => {
        const btn = btnGuardar;
        const reparadoVal = ($('#incidencia_reparado')?.value || '');
        const danoRedVal = ($('#incidencia_dano_red')?.value || '');
        const motivoNoVal = ($('#incidencia_motivo_no_reparacion')?.value || '').trim();

        // 1. VALIDACIÓN BÁSICA
        const nFalla = $('#incidencia_n_falla')?.value || '';
        const busquedaCli = $('#incidencia_busquedaCliente')?.value || '';
        
        if (!nFalla || !busquedaCli) {
          return alert("❌ Llene al menos el Número de Falla y el ID del Cliente.");
        }

        // 2. VALIDACIÓN LÓGICA CONDICIONAL
        if (reparadoVal === "0" && motivoNoVal === "") {
          return alert("❌ Si marcó que NO se reparó, es obligatorio explicar el Motivo.");
        }

        if (reparadoVal === "1" && !danoRedVal) {
          return alert("❌ Si se realizó la reparación, debe seleccionar el Daño en Red.");
        }

        btn.disabled = true;
        btn.textContent = "⌛ Procesando...";

        const fd = new FormData();
        fd.append('fecha_reparacion', ($('#incidencia_fecha_reparacion')?.value || ''));
        fd.append('area_trabajo', ($('#incidencia_area_trabajo')?.value || ''));
        fd.append('n_falla', nFalla);
        fd.append('tecnicos_atienden', ($('#incidencia_tecnicos_atienden')?.value || ''));
        fd.append('id_cliente_ext', busquedaCli);
        fd.append('nombre_cliente_manual', ($('#incidencia_nombre_cliente')?.value || ''));
        fd.append('direccion_cliente', ($('#incidencia_direccion_cliente')?.value || ''));
        fd.append('dano_red', danoRedVal);
        fd.append('nodo', ($('#incidencia_nodo')?.value || ''));
        fd.append('tecnologia', ($('#incidencia_tecnologia')?.value || ''));

        // Dependiendo de la red, enviamos el daño y solución correctos
        if (danoRedVal === 'Secundaria') {
          fd.append('tipo_dano', ($('#incidencia_tipo_dano_secundaria')?.value || ''));
          fd.append('tipo_solucion', ($('#incidencia_tipo_solucion_secundaria')?.value || ''));
        } else if (danoRedVal === 'Primaria') {
          fd.append('tipo_dano', ($('#incidencia_tipo_dano_primaria')?.value || ''));
          fd.append('tipo_solucion', ($('#incidencia_tipo_solucion_primaria')?.value || ''));
        } else {
          fd.append('tipo_dano', '');
          fd.append('tipo_solucion', '');
        }

        fd.append('reparado', reparadoVal);
        fd.append('motivo_no_reparacion', motivoNoVal);
        fd.append('material_utilizado', ($('#incidencia_material_utilizado')?.value || ''));
        fd.append('red_alterna', ($('#incidencia_red_alterna')?.value || ''));
        fd.append('nombre_red_alterna', ($('#incidencia_nombre_red_alterna')?.value || ''));
        fd.append('lat', ($('#incidencia_latIncidencia')?.value || ''));
        fd.append('lng', ($('#incidencia_lngIncidencia')?.value || ''));
        fd.append('notas_tecnico', ($('#incidencia_notas_tecnico')?.value || ''));

        // Solo enviamos foto si el usuario cargó una (y si estaba visible)
        if (fotoIncidenciaBlob && reparadoVal === "1") {
          fd.append('foto', fotoIncidenciaBlob, "averia.jpg");
        }

        try {
          const res = await fetch('/api/incidencia/guardar', { method: 'POST', body: fd });
          const result = await res.json();
          if (result.ok) {
            alert("✅ Reporte guardado correctamente.");
            window.location.reload();
          } else {
            throw new Error(result.error || "Error al guardar");
          }
        } catch (error) {
          alert("❌ Error: " + error.message);
          btn.disabled = false;
          btn.textContent = "GUARDAR REPORTE";
        }
      });
    }
  }

  window.seleccionarClienteIncidencia = (id_ext, nombre) => {
    const busquedaInput = $('#incidencia_busquedaCliente');
    const nombreInput = $('#incidencia_nombre_cliente');
    const resultados = $('#incidencia_resultadosBusqueda');
    
    if (busquedaInput) busquedaInput.value = id_ext;
    if (nombreInput) nombreInput.value = nombre || '';
    if (resultados) resultados.style.display = 'none';
  };

  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  // Exponer función de inicialización
  window.initIncidenciaModule = initIncidenciaModule;
})();
