// public/js/usuarios.js — v7.0 (Fase Final: IsAdmin Integrado)
document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);

  const id           = $('#id');
  const usuario      = $('#usuario');
  const nombre       = $('#nombre');
  const password     = $('#password');
  const activo       = $('#activo');
  const isAdminCheck = $('#isAdmin'); // <--- NUEVO ADMIN CHECK
  const modulosBox   = $('#modulosBox'); 

  const activoHasta    = $('#activoHasta');  
  const horasTemp      = $('#horasTemp');
  const btnActivarTemp = $('#btnActivarTemp');

  const btnGuardar = $('#btnGuardar');
  const btnNuevo   = $('#btnNuevo');
  const tbody      = $('#usuariosBody');

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
    isAdminCheck.checked = false; // <--- LIMPIAR CHECK
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
    const _is_admin = !!(u.is_admin || u.admin); // <--- CAPTURAR IS_ADMIN
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
      if (!list.length) {
        tbody.innerHTML = `<tr><td colspan="7">Sin datos</td></tr>`;
        return;
      }

      for (const u of list) {
        const vence = u.activo_hasta ? escapeHtml(u.activo_hasta) : '—';
        
        let estadoSistema = u.modulos_activos 
            ? `<span class="badge-migrado">ACTUALIZADO (JSON)</span>` 
            : `<span style="color:#ef4444; font-size:11px; font-weight:bold;">LEGACY</span>`;
        
        if (u.is_admin) {
            estadoSistema += `<span class="badge-admin">👑 ADMIN</span>`;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${u.id}</td>
          <td>${escapeHtml(u.usuario)}</td>
          <td>${escapeHtml(u.nombre || '')}</td>
          <td>${estadoSistema}</td>
          <td class="state-box"><input type="checkbox" ${u.activo ? 'checked' : ''} disabled /></td>
          <td>${vence}</td>
          <td class="text-right">
            <div class="row-actions">
              <button class="btn small gray btn-edit" data-id="${u.id}">Editar</button>
              <button class="btn small red btn-del" data-id="${u.id}">Eliminar</button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      }
      bindRowActions();
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="7">Error cargando usuarios</td></tr>`;
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
          isAdminCheck.checked = !!u.is_admin; // <--- ENVIAR AL CHECK
          activoHasta.value    = fmtToInputDT(u.activo_hasta);
          setModulosToUI(u.modulos_activos);

          window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) { alert('No se pudo obtener el usuario.'); }
      });
    });

    tbody.querySelectorAll('.btn-del').forEach(btn => {
      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const uid = Number(btn.getAttribute('data-id'));
        if (!uid || !confirm('¿Eliminar este usuario?')) return;
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
      is_admin: isAdminCheck.checked ? 1 : 0, // <--- ENVIAR AL BACKEND
      rol: 'editor', 
      roles_m2m: [],
      activo_hasta: (activoHasta.value || '').trim() || null,
      modulos_activos: modulos 
    };
    if (activarHoras > 0) payload.activar_horas = activarHoras;

    if (!payload.usuario) return alert('Usuario es obligatorio');

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

      alert('Guardado correctamente');
      clearForm();
      await loadUsuarios();
    } catch (e) { alert('Error al guardar: ' + (e?.message || 'desconocido')); }
  }

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
      alert('Usuario activado temporalmente');
      await loadUsuarios();
      return;
    } catch {}

    try { await guardar(hrs); } 
    catch (err) { alert('No se pudo activar temporalmente'); }
  });

  clearForm();
  loadUsuarios();
}); 