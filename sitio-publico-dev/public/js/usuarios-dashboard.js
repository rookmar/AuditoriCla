// public/js/usuarios-dashboard.js — Integración con Dashboard Bootstrap 5
// Mantiene toda la lógica original de usuarios.js pero adaptada al nuevo diseño

(function() {
  const READY = (cb) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", cb) : cb();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  
  let id, usuario, nombre, password, activo, isAdminCheck, modulosBox;
  let activoHasta, horasTemp, btnActivarTemp;
  let btnGuardar, btnNuevo, tbody, totalBadge;
  
  function initModule() {
    // Inicializar referencias solo si estamos en la sección de usuarios
    id = $('#id');
    usuario = $('#usuario');
    nombre = $('#nombre');
    password = $('#password');
    activo = $('#activo');
    isAdminCheck = $('#isAdmin');
    modulosBox = $('#modulosBox');
    activoHasta = $('#activoHasta');
    horasTemp = $('#horasTemp');
    btnActivarTemp = $('#btnActivarTemp');
    btnGuardar = $('#btnGuardar');
    btnNuevo = $('#btnNuevo');
    tbody = $('#usuariosBody');
    totalBadge = $('#totalUsuariosBadge');
    
    if (!tbody) return; // No estamos en la página de usuarios
    
    setupEventListeners();
    clearForm();
    loadUsuarios();
  }
  
  function getModulosFromUI() {
    const checks = modulosBox.querySelectorAll('input[type="checkbox"]');
    const out = {};
    let hasAny = false;
    checks.forEach(ch => { 
      if (ch.checked) {
        out[ch.value] = true;
        hasAny = true;
      }
    });
    return hasAny ? out : null; 
  }
  
  function setModulosToUI(modObj) {
    const obj = (typeof modObj === 'object' && modObj !== null) ? modObj : {};
    modulosBox.querySelectorAll('input[type="checkbox"]').forEach(ch => {
      ch.checked = !!obj[ch.value];
    });
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function clearForm() {
    id.value = '';
    usuario.value = '';
    nombre.value = '';
    password.value = '';
    activo.checked = true;
    isAdminCheck.checked = false;
    setModulosToUI({}); 
    activoHasta.value = '';
    horasTemp.value = '';
  }

  async function fetchWithFallback(urls, init = {}) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...init });
        if (r.ok) return r;
        lastErr = new Error(`HTTP ${r.status} ${url}`);
        if (r.status !== 404) break;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('No endpoint matched');
  }

  async function fetchJSONFallback(urls, init = {}) {
    const r = await fetchWithFallback(urls, init);
    const ctype = r.headers.get('content-type') || '';
    if (ctype.includes('application/json')) return await r.json().catch(()=> ({}));
    return await r.text();
  }

  function normUser(u) {
    if (!u || typeof u !== 'object') return null;
    const _id = Number(u.id ?? u.user_id ?? 0) || 0;
    const _usuario = String(u.usuario ?? '').trim();
    const _nombre  = String(u.nombre ?? '').trim();
    const _activo  = !!(u.activo ?? (u.estado === 1));
    const _is_admin = !!(u.is_admin || u.admin);
    const _hasta   = u.activo_hasta || null;
    
    let _modulos = null;
    if (typeof u.modulos_activos === 'string' && u.modulos_activos.trim() !== '') {
        try { _modulos = JSON.parse(u.modulos_activos); } catch(e){}
    } else if (typeof u.modulos_activos === 'object') {
        _modulos = u.modulos_activos;
    }
    return { id: _id, usuario: _usuario, nombre: _nombre, activo: _activo, is_admin: _is_admin, activo_hasta: _hasta, modulos_activos: _modulos };
  }

  const EP = {
    list: ['/api/usuarios', '/api/users'],
    get: (uid) => [`/api/usuarios/${uid}`, `/api/users/${uid}`],
    del: (uid) => [`/api/usuarios/${uid}`, '/api/usuarios/delete'],
    activarTemp: (uid) => [`/api/usuarios/${uid}/activar-temporal`]
  };

  function fmtToInputDT(dt) {
    if (!dt) return '';
    try {
      const d = new Date(dt.replace(' ', 'T'));
      const pad = (n)=> String(n).padStart(2,'0');
      return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch { return ''; }
  }

  async function loadUsuarios() {
    if (!tbody) return;
    try {
      const rows = await fetchJSONFallback(EP.list.map(u => `${u}?_=${Date.now()}`));
      const list = (Array.isArray(rows) ? rows : []).map(normUser).filter(Boolean);

      tbody.innerHTML = '';
      
      if (totalBadge) {
        totalBadge.textContent = `${list.length} usuario${list.length !== 1 ? 's' : ''}`;
      }
      
      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4">Sin datos</td></tr>`;
        return;
      }

      for (const u of list) {
        const vence = u.activo_hasta ? escapeHtml(u.activo_hasta) : '—';
        
        let estadoSistema = u.modulos_activos 
            ? `<span class="badge bg-success">ACTUALIZADO (JSON)</span>` 
            : `<span class="badge bg-danger">LEGACY</span>`;
        
        if (u.is_admin) {
            estadoSistema += `<span class="badge bg-warning text-dark ms-1">👑 ADMIN</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="px-3"><strong>${u.id}</strong></td>
          <td class="px-3">${escapeHtml(u.usuario)}</td>
          <td class="px-3">${escapeHtml(u.nombre || '')}</td>
          <td class="px-3">${estadoSistema}</td>
          <td class="px-3 text-center">
            <div class="form-check d-flex justify-content-center">
              <input type="checkbox" class="form-check-input" ${u.activo ? 'checked' : ''} disabled />
            </div>
          </td>
          <td class="px-3">${vence}</td>
          <td class="px-3 text-end">
            <div class="btn-group btn-group-sm" role="group">
              <button class="btn btn-outline-primary btn-edit" data-id="${u.id}" title="Editar">
                <i class="bi bi-pencil-square"></i> Editar
              </button>
              <button class="btn btn-outline-danger btn-del" data-id="${u.id}" title="Eliminar">
                <i class="bi bi-trash"></i> Eliminar
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      }
      bindRowActions();
    } catch (e) {
      console.error('Error cargando usuarios:', e);
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger">Error cargando usuarios</td></tr>`;
    }
  }

  function bindRowActions() {
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const uid = Number(btn.getAttribute('data-id'));
        if (!uid) return;
        try {
          const data = await fetchJSONFallback(EP.get(uid));
          const u = normUser(data);
          if (!u) throw new Error('Usuario no encontrado');

          id.value             = u.id || uid;
          usuario.value        = u.usuario || '';
          nombre.value         = u.nombre || '';
          password.value       = '';
          activo.checked       = !!u.activo;
          isAdminCheck.checked = !!u.is_admin;
          activoHasta.value    = fmtToInputDT(u.activo_hasta);
          setModulosToUI(u.modulos_activos);

          // Scroll suave hacia el formulario
          const card = $('.card-custom.shadow-sm');
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
          
          // Highlight visual
          card.classList.add('border-danger');
          setTimeout(() => card.classList.remove('border-danger'), 2000);
        } catch (e) { 
          alert('No se pudo obtener el usuario.'); 
        }
      });
    });

    tbody.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const uid = Number(btn.getAttribute('data-id'));
        if (!uid || !confirm('¿Eliminar este usuario? Esta acción no se puede deshacer.')) return;
        try {
          let ok = true;
          try { await fetchWithFallback(EP.del(uid), { method: 'DELETE' }); } catch { ok = false; }
          if (!ok) {
            await fetchWithFallback(['/api/usuarios/delete'], {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: uid })
            });
          }
          await loadUsuarios();
        } catch (e) { alert('No se pudo eliminar'); }
      });
    });
  }

  async function guardar(activarHoras = 0) {
    const modulos = getModulosFromUI(); 
    
    const payload = {
      id: Number(id.value) || undefined,
      usuario: (usuario.value || '').trim(),
      nombre: (nombre.value || '').trim(),
      password: (password.value || '').trim(),
      activo: activo.checked ? 1 : 0,
      is_admin: isAdminCheck.checked ? 1 : 0,
      rol: 'editor', 
      roles_m2m: [],
      activo_hasta: (activoHasta.value || '').trim() || null,
      modulos_activos: modulos 
    };
    if (activarHoras > 0) payload.activar_horas = activarHoras;

    if (!payload.usuario) return alert('⚠️ El campo Usuario es obligatorio');
    if (!payload.nombre) return alert('⚠️ El campo Nombre es obligatorio');

    try {
      if (payload.id) {
        await fetchWithFallback([`/api/usuarios/${payload.id}`],
          { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
      } else {
        await fetchWithFallback(['/api/usuarios'],
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
        );
      }

      // Mostrar alerta de éxito con Bootstrap
      alert('✅ Guardado correctamente');
      clearForm();
      await loadUsuarios();
    } catch (e) { alert('❌ Error al guardar: ' + (e?.message || 'desconocido')); }
  }

  function setupEventListeners() {
    btnGuardar?.addEventListener('click', (e) => { e.preventDefault(); guardar(); });
    btnNuevo?.addEventListener('click',   (e) => { e.preventDefault(); clearForm(); });

    btnActivarTemp?.addEventListener('click', async (e) => {
      e.preventDefault();
      const uid = Number(id.value || 0);
      const hrs = Number(horasTemp.value || 0);
      if (!uid) return alert('Primero carga o crea un usuario (ID).');
      if (!hrs || hrs <= 0) return alert('Horas inválidas.');

      try {
        await fetchWithFallback(EP.activarTemp(uid), {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ horas: hrs })
        });
        alert('✅ Usuario activado temporalmente');
        await loadUsuarios();
        return;
      } catch {}

      try { await guardar(hrs); } 
      catch (err) { alert('No se pudo activar temporalmente'); }
    });
    
    // Toggle ver contraseña
    const togglePwd = $('#togglePwd');
    if (togglePwd && password) {
      togglePwd.addEventListener('click', () => {
        const isPwd = password.type === 'password';
        password.type = isPwd ? 'text' : 'password';
        togglePwd.innerHTML = isPwd ? '<i class="bi bi-eye-slash"></i>' : '<i class="bi bi-eye"></i>';
        password.focus({ preventScroll:true });
      });
    }
  }

  // Exportar función de inicialización para ser llamada desde menu-nuevo.js
  window.initUsuariosModule = initModule;
  
  // Inicializar automáticamente si ya está cargado el DOM
  READY(initModule);
})();
