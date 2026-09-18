// ============================================================================
// ARCHIVO: public/js/incidencia.js
// Lógica de Red Primaria / Secundaria y 16 pasos del manual + Lógica Condicional
// ============================================================================

(function () {
    const $ = (s) => document.querySelector(s);
    let fotoIncidenciaBlob = null;

    // --- 1. LÓGICA DINÁMICA: RED PRIMARIA VS SECUNDARIA ---
    $('#dano_red').addEventListener('change', (e) => {
        const val = e.target.value;
        const wrapSec = $('#wrap_secundaria');
        const wrapPri = $('#wrap_primaria');
        
        // Resetear valores ocultos
        $('#tipo_dano_secundaria').value = '';
        $('#tipo_solucion_secundaria').value = '';
        $('#tipo_dano_primaria').value = '';
        $('#tipo_solucion_primaria').value = '';

        if (val === 'Secundaria') {
            wrapSec.style.display = 'grid';
            wrapPri.style.display = 'none';
        } else if (val === 'Primaria') {
            wrapSec.style.display = 'none';
            wrapPri.style.display = 'grid';
        } else {
            wrapSec.style.display = 'none';
            wrapPri.style.display = 'none';
        }
    });

    // --- 2. REGLA ESPECIAL DE LA MUFA ---
    $('#tipo_dano_secundaria').addEventListener('change', (e) => {
        if (e.target.value === 'Mufa') {
            $('#tipo_solucion_secundaria').value = 'Sustitucion de Cable Preconectorizado';
        }
    });

    // --- 3. DIVULGACIÓN PROGRESIVA: ¿SE REALIZÓ REPARACIÓN? ---
    $('#reparado').addEventListener('change', (e) => {
        const bloqueRedes = $('#bloque_selectores_red');
        const seccionMateriales = $('#seccion_materiales');
        const seccionEvidencia = $('#seccion_evidencia');
        
        // Contenedores secundarios a apagar por si acaso estaban abiertos
        const wrapSec = $('#wrap_secundaria');
        const wrapPri = $('#wrap_primaria');

        if (e.target.value === "0") {
            $('#wrap_motivo_no').style.display = 'block';
            bloqueRedes.style.display = 'none';
            wrapSec.style.display = 'none';
            wrapPri.style.display = 'none';
            $('#dano_red').value = ''; 

            seccionMateriales.style.display = 'none';
            seccionEvidencia.style.display = 'none';
        } else {
            $('#wrap_motivo_no').style.display = 'none';
            $('#motivo_no_reparacion').value = '';
            bloqueRedes.style.display = 'grid';
            seccionMateriales.style.display = 'block';
            seccionEvidencia.style.display = 'block';
        }
    });

    $('#red_alterna').addEventListener('change', (e) => {
        if (e.target.value === "1") {
            $('#wrap_nombre_red').style.display = 'block';
        } else {
            $('#wrap_nombre_red').style.display = 'none';
            $('#nombre_red_alterna').value = '';
        }
    });

    // --- 4. AUTOCOMPLETADO DE CLIENTE (Simulado/Fetch) ---
    $('#busquedaCliente').addEventListener('input', debounce(async (e) => {
        const q = e.target.value.trim();
        if (q.length < 4) {
            $('#alertaReincidencia').style.display = 'none';
            $('#resultadosBusqueda').style.display = 'none';
            return;
        }
        try {
            const res = await fetch(`/api/incidencia/buscar-cliente?q=${q}`);
            const data = await res.json();

            $('#alertaReincidencia').style.display = data.reincidencia > 0 ? 'block' : 'none';

            if (data.clientes && data.clientes.length > 0) {
                $('#resultadosBusqueda').innerHTML = data.clientes.map(c => `
                    <div class="search-item" onclick="seleccionarCliente('${c.id_cliente_ext}', '${c.nombre_cliente}')">
                        <b>${c.id_cliente_ext}</b> - ${c.nombre_cliente}
                    </div>
                `).join("");
                $('#resultadosBusqueda').style.display = 'block';
            } else {
                $('#resultadosBusqueda').style.display = 'none';
            }
        } catch (error) { console.error("Error buscando:", error); }
    }, 500));

    window.seleccionarCliente = (id_ext, nombre) => {
        $('#busquedaCliente').value = id_ext;
        $('#nombre_cliente').value = nombre || '';
        $('#resultadosBusqueda').style.display = 'none';
    };

    // --- 5. GPS Y FOTO ---
    $('#btnGPSIncidencia').addEventListener('click', () => {
        const gpsTxt = $('#gpsTxtIncidencia');
        gpsTxt.textContent = "🛰️ Buscando satélites...";
        navigator.geolocation.getCurrentPosition((pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            $('#latIncidencia').value = lat; 
            $('#lngIncidencia').value = lng;
            gpsTxt.textContent = `📍 Coordenadas capturadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;
            gpsTxt.style.color = "#16a34a";
            gpsTxt.style.fontWeight = "bold";
        }, () => {
            gpsTxt.textContent = "❌ Error GPS: Por favor, activa tu ubicación.";
            gpsTxt.style.color = "#dc2626";
        }, { enableHighAccuracy: true });
    });

    $('#fotoIncidencia').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) { fotoIncidenciaBlob = file; }
    });

    // --- 6. ENVIAR TODO AL SERVIDOR ---
    $('#btnGuardarIncidencia').addEventListener('click', async () => {
        const btn = $('#btnGuardarIncidencia');
        const reparado = $('#reparado').value;
        const dano_red = $('#dano_red').value;
        const motivo_no = $('#motivo_no_reparacion').value;
        
        // 1. VALIDACIÓN BÁSICA (Aplica para ambos casos)
        if (!$('#n_falla').value || !$('#busquedaCliente').value) {
            return alert("❌ Llene al menos el Número de Falla y el ID del Cliente.");
        }

        // 2. VALIDACIÓN LÓGICA CONDICIONAL ("SI" vs "NO")
        if (reparado === "0" && motivo_no.trim() === "") {
            return alert("❌ Si marcó que NO se reparó, es obligatorio explicar el Motivo.");
        }
        
        if (reparado === "1" && !dano_red) {
            return alert("❌ Si se realizó la reparación, debe seleccionar el Daño en Red.");
        }

        btn.disabled = true;
        btn.textContent = "⌛ Procesando...";

        const fd = new FormData();
        fd.append('fecha_reparacion', $('#fecha_reparacion').value);
        fd.append('area_trabajo', $('#area_trabajo').value);
        fd.append('n_falla', $('#n_falla').value);
        fd.append('tecnicos_atienden', $('#tecnicos_atienden').value);
        fd.append('id_cliente_ext', $('#busquedaCliente').value);
        fd.append('nombre_cliente_manual', $('#nombre_cliente').value);
        fd.append('direccion_cliente', $('#direccion_cliente').value);
        fd.append('dano_red', dano_red);
        fd.append('nodo', $('#nodo').value);
        fd.append('tecnologia', $('#tecnologia').value);
        
        // Dependiendo de la red, enviamos el daño y solución correctos
        if(dano_red === 'Secundaria'){
            fd.append('tipo_dano', $('#tipo_dano_secundaria').value);
            fd.append('tipo_solucion', $('#tipo_solucion_secundaria').value);
        } else if (dano_red === 'Primaria') {
            fd.append('tipo_dano', $('#tipo_dano_primaria').value);
            fd.append('tipo_solucion', $('#tipo_solucion_primaria').value);
        } else {
            fd.append('tipo_dano', '');
            fd.append('tipo_solucion', '');
        }

        fd.append('reparado', reparado);
        fd.append('motivo_no_reparacion', motivo_no);
        fd.append('material_utilizado', $('#material_utilizado').value);
        fd.append('red_alterna', $('#red_alterna').value);
        fd.append('nombre_red_alterna', $('#nombre_red_alterna').value);
        fd.append('lat', $('#latIncidencia').value || '');
        fd.append('lng', $('#lngIncidencia').value || '');
        
        // --- AQUÍ ATRAPAMOS LAS NOTAS DEL TÉCNICO ---
        fd.append('notas_tecnico', $('#notas_tecnico').value);
        
        // Solo enviamos foto si el usuario cargó una (y si estaba visible)
        if (fotoIncidenciaBlob && reparado === "1") {
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

    function debounce(fn, ms) { 
        let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; 
    }
})();