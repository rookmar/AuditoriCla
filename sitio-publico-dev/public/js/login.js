document.addEventListener('DOMContentLoaded', () => {
  const $ = (s) => document.querySelector(s);
  const usuario = $('#usuario');
  const password = $('#password');
  const btn = $('#btnLogin');
  const msg = $('#msg');

  const show = (t, ok = false) => {
    if (!msg) return;
    msg.textContent = t || '';
    msg.style.color = ok ? '#0a7f35' : '#b00020';
  };

  async function login() {
    const u = (usuario?.value || '').trim();
    const p = password?.value || '';
    if (!u || !p) return show('Usuario y contraseña requeridos');

    show('Validando...', true);

    try {
      // IMPORTANTE: enviar como x-www-form-urlencoded (compat total)
      const body = new URLSearchParams({ usuario: u, password: p });

      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body
      });

      // Algunos servers devuelven JSON, otros texto. Probamos ambos:
      let data = {};
      const text = await r.text();
      try { data = JSON.parse(text); } catch { data = { ok: r.ok, raw: text }; }

      if (!r.ok || !data.ok) {
        show(data.error || `Error ${r.status}`);
        return;
      }

      show('Listo. Redirigiendo...', true);
      location.href = '/menu.html';
    } catch (e) {
      show(e.message);
    }
  }

  btn?.addEventListener('click', login);
  password?.addEventListener('keydown', (ev) => ev.key === 'Enter' && login());
  usuario?.focus();
});
