// public/js/usuarios-list.js (versión tolerante)

(function () {
  const $ = (s) => document.querySelector(s);

  // Localiza <tbody>
  const tbody =
    $('#usuariosBody') ||
    $('#resultBody') ||
    document.querySelector('table.table tbody') ||
    document.querySelector('table tbody');

  const loading =
    $('#usuariosLoading') || $('#resultLoading') || document.getElementById('loading');

  if (!tbody) {
    console.warn('[usuarios-list] No encontré <tbody>. Revisa el HTML.');
    return;
  }

  const asArray = (json) => {
    if (Array.isArray(json)) return json;
    if (json && Array.isArray(json.rows)) return json.rows;
    if (json && Array.isArray(json.items)) return json.items;
    if (json && Array.isArray(json.data)) return json.data;
    if (json && Array.isArray(json.usuarios)) return json.usuarios;
    if (json && json.ok) {
      if (Array.isArray(json.usuarios)) return json.usuarios;
      if (Array.isArray(json.rows)) return json.rows;
      if (Array.isArray(json.items)) return json.items;
      if (Array.isArray(json.data)) return json.data;
    }
    return [];
  };

  const roleLabel = (u) => {
    const rol = (u.rol ?? '').toString().trim();
    if (rol) return rol[0].toUpperCase() + rol.slice(1).toLowerCase();
    if (u.admin) return 'Admin';
    if (u.editor) return 'Auditor';
    if (u.consultar) return 'Tecnico';
    return 'Usuario';
  };
  const activoLabel = (u) =>
    (String(u.activo ?? u.active) === '1' || u.activo === true ? 'Activo' : 'Inactivo');

  function render(users, me) {
    tbody.innerHTML = '';

    if (!users || users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">Sin resultados</td></tr>`;
      return;
    }

    const frag = document.createDocumentFragment();
    for (const u of users) {
      const tr = document.createElement('tr');

      const id = u.id ?? u.usuario_id ?? '';
      const usuario = u.usuario ?? u.user ?? '';
      const nombre = u.nombre ?? u.name ?? '';
      const rolTxt = roleLabel(u);
      const activoTxt = activoLabel(u);

      tr.innerHTML = `
        <td>${id}</td>
        <td>${usuario}</td>
        <td>${nombre}</td>
        <td>${rolTxt}</td>
        <td>${activoTxt}</td>
        <td class="text-right">
          <button class="btn small btn-edit" data-id="${id}">Editar</button>
          <button class="btn small danger btn-delete" data-id="${id}">Eliminar</button>
        </td>
      `;
      frag.appendChild(tr);
    }

    tbody.appendChild(frag);

    // Dispara clases para que otro JS se enganche si hace falta
    tbody.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.btn-edit, .btn-delete');
      if (!btn) return;
      const id = btn.getAttribute('data-id');
      if (!id) return;
      // Aquí no imponemos navegación; tu JS principal decide qué hacer con estas clases.
    }, { once: true });
  }

  async function getUsers() {
    const tryFetch = async (url) => {
      const r = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      return asArray(j);
    };

    try {
      return await tryFetch('/api/usuarios');
    } catch {
      try {
        return await tryFetch('/api/usuarios/list');
      } catch (e2) {
        console.error('[usuarios-list] error:', e2);
        return { __error: e2.message || String(e2) };
      }
    }
  }

  async function init() {
    try {
      const data = await getUsers();
      if (loading) loading.remove();

      if (data && data.__error) {
        tbody.innerHTML = `<tr><td colspan="6">Error: ${data.__error}</td></tr>`;
        return;
      }
      render(data);
    } catch (err) {
      if (loading) loading.remove();
      tbody.innerHTML = `<tr><td colspan="6">Error cargando usuarios</td></tr>`;
      console.error('[usuarios-list] fatal:', err);
    }
  }

  init();
})();
