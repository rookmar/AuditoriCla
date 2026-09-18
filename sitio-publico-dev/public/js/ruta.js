document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);

  const getVal = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const val = el.value.trim();
      return val === '' ? null : val;
  };
  
  const setVal = (id, v) => { 
      const el = document.getElementById(id); 
      if(el) { el.value = v || ''; el.classList.remove('error'); } 
  };

  const tbody = $('#recientesBody');

  function clearErrors() {
      document.querySelectorAll('.err').forEach(el => el.textContent = '');
      document.querySelectorAll('.input.error').forEach(el => el.classList.remove('error'));
  }

  function showError(fieldId, msg) {
      const input = document.getElementById(fieldId);
      const errDiv = document.getElementById(`err_${fieldId}`);
      if (input) input.classList.add('error');
      if (errDiv) errDiv.textContent = msg;
  }

  async function loadRecientes() {
    try {
      const res = await fetch('/api/ruta/recientes');
      if (!res.ok) throw new Error("Fallo de red");
      const data = await res.json();
      tbody.innerHTML = '';
      
      if (data.length === 0) {
          tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#666;">No hay rutas recientes</td></tr>';
          return;
      }

      data.forEach(r => {
        const tr = document.createElement('tr');
        // Si el cliente es "Libre", lo pintamos verde para que resalte visualmente
        const isLibre = r.cliente.toLowerCase() === 'libre';
        const clienteTag = isLibre ? `<span style="background:#dcfce7; color:#16a34a; padding:2px 6px; border-radius:4px; font-weight:bold;">${r.cliente}</span>` : r.cliente;

        tr.innerHTML = `
          <td>${r.id_ruta}</td>
          <td>${clienteTag}</td>
          <td>${r.patcheo}</td>
          <td>${r.equipo}</td>
          <td class="text-right">
             <button class="btn small gray btn-edit" data-id="${r.id_ruta}">Editar</button>
             <button class="btn small ${isLibre ? 'gray' : 'yellow'} btn-del" data-id="${r.id_ruta}" style="${isLibre ? 'opacity:0.5; cursor:not-allowed;' : 'background:#f59e0b; color:white;'}">🔌 Liberar</button>
          </td>
        `;
        tbody.appendChild(tr);
      });

      document.querySelectorAll('.btn-edit').forEach(b => b.onclick = () => editar(b.dataset.id));
      document.querySelectorAll('.btn-del').forEach(b => {
          if (!b.style.opacity) b.onclick = () => liberarPuerto(b.dataset.id);
      });

    } catch(e) { 
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444;">❌ Error cargando recientes. Reintentando...</td></tr>';
        setTimeout(loadRecientes, 5000);
    }
  }

  window.editar = async (id) => {
    clearErrors();
    const res = await fetch(`/api/ruta/${id}`);
    const d = await res.json();
    if(d.error) return alert("Error al cargar la ruta");

    document.getElementById('id_ruta').value = d.id_ruta;
    setVal('ID_central', d.ID_central);
    setVal('nombre_central', d.nombre_central);
    setVal('nombre_cliente', d.nombre_cliente);
    setVal('ID_Cliente', d.id_cliente_ext);
    setVal('tarea', d.tarea);
    setVal('nombre_odf', d.nombre_odf);
    setVal('nemonico_odf', d.nemonico_odf);
    setVal('odf_puerto', d.puerto_odf);
    setVal('distancia_optica', d.distancia_optica);
    setVal('nemonico_patcheo', d.nemonico_patcheo);
    setVal('puerto_patcheo', d.puerto_patcheo);
    setVal('nemonico_equipo', d.nemonico_equipo);
    setVal('marca', d.marca);
    setVal('slot', d.slot);
    setVal('posicion', d.posicion);
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  window.liberarPuerto = async (id) => {
    if(!confirm("¿Estás seguro de liberar todos los puertos de esta ruta? El hilo físico quedará disponible para un nuevo cliente.")) return;
    
    const res = await fetch(`/api/ruta/liberar/${id}`, { method: 'PUT' });
    const data = await res.json();
    
    if (data.ok) {
        alert(data.message);
        loadRecientes();
        if (document.getElementById('id_ruta').value === String(id)) {
            $('#btnNuevo').click(); // Limpia el formulario si estaba editando esa ruta
        }
    } else {
        alert("Error: " + data.error);
    }
  };

  $('#btnGuardar').addEventListener('click', async () => {
    clearErrors();
    const btn = $('#btnGuardar');
    
    if (!getVal('nombre_central')) return showError('nombre_central', 'La central es obligatoria');
    if (!getVal('nombre_cliente')) return showError('nombre_cliente', 'El cliente es obligatorio');

    btn.disabled = true;
    const textoOriginal = btn.textContent;
    btn.textContent = "Guardando...";

    const payload = {
      id_ruta: document.getElementById('id_ruta').value,
      ID_central: getVal('ID_central'),
      nombre_central: getVal('nombre_central'),
      nombre_cliente: getVal('nombre_cliente'),
      id_cliente_ext: getVal('ID_Cliente'),
      tarea: getVal('tarea'),
      nombre_odf: getVal('nombre_odf'),
      nemonico_odf: getVal('nemonico_odf'),
      odf_puerto: getVal('odf_puerto'),
      distancia_optica: getVal('distancia_optica'),
      nemonico_patcheo: getVal('nemonico_patcheo'),
      puerto_patcheo: getVal('puerto_patcheo'),
      nemonico_equipo: getVal('nemonico_equipo'),
      marca: getVal('marca'),
      slot: getVal('slot'),
      posicion: getVal('posicion')
    };

    try {
        const res = await fetch('/api/ruta/save', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify(payload)
        });
        
        const json = await res.json();
        
        if(json.ok) {
            $('#btnNuevo').click(); 
            loadRecientes();
            btn.textContent = "¡Guardado!";
            setTimeout(() => { btn.textContent = textoOriginal; btn.disabled = false; }, 2000);
        } else {
            btn.disabled = false;
            btn.textContent = textoOriginal;
            
            if (json.isDuplicate) {
                alert("⚠️ " + json.error);
            } else if (json.field) {
                showError(json.field, json.error);
            } else {
                alert("❌ " + json.error);
            }
        }
    } catch (error) {
        btn.disabled = false;
        btn.textContent = textoOriginal;
        alert("❌ Error de red al intentar guardar.");
    }
  });

  $('#btnNuevo').addEventListener('click', () => {
      clearErrors();
      document.querySelectorAll('input').forEach(i => i.value = '');
      document.getElementById('id_ruta').value = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  loadRecientes();
});