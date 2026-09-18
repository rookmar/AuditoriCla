// =========================================================================
// Archivo: public/js/menu.js
// Versión: 21 - Motor 100% JSON (Agregado Dashboard GPON)
// =========================================================================
(function () {
  const READY = (cb) => document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", cb) : cb();
  const $ = (s, r = document) => r.querySelector(s);
  const getModuleEl = (name) => $(`[data-mod="${name}"]`);
  const show = (el, visible) => { if (el) el.style.display = visible ? "block" : "none"; };

  async function fetchMe() {
    try {
      const r = await fetch("/api/me?_=" + Date.now(), { credentials: "include", cache: "no-store" });
      if (!r.ok) return null;
      const data = await r.json().catch(() => null);
      return data?.user || null;
    } catch { return null; }
  }

  function paint(user) {
    if (!user) {
      const welcome = $("#welcomeText");
      if (welcome) welcome.textContent = "Sesión expirada";
      return;
    }

    const nombre = (user.nombre && String(user.nombre).trim()) || user.usuario || "Usuario";
    if ($("#welcomeText")) $("#welcomeText").textContent = `Bienvenido, ${nombre}`;

    // Array maestro de módulos disponibles
    const allMods = [
      "buscar", "ruta", "usuarios", "infraestructura", "carga", 
      "bitacora", "reportes", "infra_movil", "incidencia", 
      "reportes_incidencias", "recepciones", "dashboard_gpon" // <-- Agregado nuevo módulo
    ];

    let modulos = user.modulos_activos || {};
    if (typeof modulos === 'string') {
        try { modulos = JSON.parse(modulos); } catch(e) { modulos = {}; }
    }

    // A) El Administrador supremo SOLO ve Usuarios y Bitácora (y Recepción GPON si lo tienes activado)
    if (user.admin) {
        allMods.forEach(modName => show(getModuleEl(modName), false)); 
        show(getModuleEl("usuarios"), true); 
        show(getModuleEl("bitacora"), true); 
        return; 
    }

    // B) Técnicos / Supervisores normales
    allMods.forEach(modName => show(getModuleEl(modName), false)); // Apagar todo
    for (const [modName, isActive] of Object.entries(modulos)) {
        if (isActive === true) show(getModuleEl(modName), true); // Encender solo autorizados
    }
  }

  function wireLogout() {
    const btn = $("#btnLogout");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      try { await fetch("/api/logout", { method: "POST" }); } catch {}
      location.href = "/login.html";
    });
  }

  READY(async () => {
    wireLogout();
    const user = await fetchMe();
    paint(user);
  });
})();