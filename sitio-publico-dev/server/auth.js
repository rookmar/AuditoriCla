// =========================================================================
// Archivo: server/auth.js
// Descripción: El "Portero" Moderno. (100% Módulos JSON y bandera is_admin)
// =========================================================================

const { pool } = require("./db");

function isExpired(user) {
  if (!user) return true;
  if (!user.activo) return true;
  const ah = user.activo_hasta || null;
  if (!ah) return false; 
  const expirationTime = new Date(ah).getTime();
  return !isNaN(expirationTime) && Date.now() >= expirationTime;
}

function hardLogout(req) {
  try {
    if (req.session && req.session.user) {
      req.session.user.activo = 0;
      req.session.destroy(); 
    }
  } catch {}
}

function isLogged(req) {
  const u = req.session && req.session.user;
  if (!u || !u.activo) return false;
  if (isExpired(u)) {
    console.log(`🚫 Acceso denegado a ${u.usuario || 'user'}: Tiempo expirado.`);
    hardLogout(req); 
    return false;
  }
  return true;
}

function isAdmin(req) {
  return !!(req.session?.user?.admin);
}

// Extrae el JSON de forma segura. Si no hay nada, devuelve objeto vacío {}
function getActiveModules(req) {
  const u = req.session?.user;
  if (!u || !u.modulos_activos) return {};
  
  if (typeof u.modulos_activos === 'string') {
    try { return JSON.parse(u.modulos_activos) || {}; } catch (e) { return {}; }
  }
  return u.modulos_activos || {};
}

/* ======================== MIDDLEWARES RESUCITADOS ======================== */
function requireLogin(req, res, next) {
  if (!isLogged(req)) {
    if (req.accepts("html")) return res.status(302).redirect("/login.html");
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!isLogged(req)) {
    if (req.accepts("html")) return res.status(302).redirect("/login.html");
    return res.status(401).json({ error: "UNAUTHORIZED" });
  }
  if (!isAdmin(req)) {
    if (req.accepts("html")) return res.status(403).send("No estás autorizado");
    return res.status(403).json({ error: "NO_AUTORIZADO" });
  }
  next();
}

// Función "fantasma" para no romper archivos viejos como static.js que aún la pidan
function requireAnyRole(roles) {
  return (req, res, next) => next(); // Deja pasar porque applyAuth ya hace el bloqueo real
}
/* ========================================================================= */

// Configuración de Rutas y Módulos
const OPEN_HTML = new Set(["/login.html"]);
const OPEN_API  = new Set(["/api/login", "/api/health", "/api/me", "/api/_whoami", "/api/_can"]);

const MODULE_MAP_HTML = [
  { prefix: "/usuarios.html", module: "usuarios" },
  { prefix: "/bitacora.html", module: "bitacora" },
  { prefix: "/reportes.html", module: "reportes" },
  { prefix: "/reportes_incidencias.html", module: "reportes_incidencias" },
  { prefix: "/buscar.html", module: "buscar" },
  { prefix: "/mapa.html", module: "buscar" },
  { prefix: "/ruta.html", module: "ruta" },
  { prefix: "/infraestructura.html", module: "infraestructura" },
  { prefix: "/carga-masiva.html", module: "carga" },
  { prefix: "/recepciones.html", module: "recepciones" },
  { prefix: "/infra_movil.html", module: "infra_movil" },
  { prefix: "/incidencia.html", module: "incidencia" },
  { prefix: "/dashboard-gpon.html", module: "dashboard_gpon" }, // 🔥 NUEVO: HTML Dashboard GPON
];

const MODULE_MAP_API = [
  { prefix: "/api/usuarios", module: "usuarios" },
  { prefix: "/api/bitacora", module: "bitacora" },
  { prefix: "/api/reportes_incidencias", module: "reportes_incidencias" }, 
  { prefix: "/api/reportes", module: "reportes" }, 
  { prefix: "/api/buscar", module: "buscar" },
  { prefix: "/api/mapa", module: "buscar" },
  { prefix: "/api/ruta", module: "ruta" },
  { prefix: "/api/carga-masiva", module: "carga" },
  { prefix: "/api/infra", module: "infraestructura" },
  { prefix: "/api/mufas", module: "mufas" },
  { prefix: "/api/modulos", module: "recepciones" }, 
  { prefix: "/api/incidencia", module: "incidencia" },
  { prefix: "/api/movil", module: "infra_movil" },
  { prefix: "/api/dashboard-gpon", module: "dashboard_gpon" }, // 🔥 NUEVO: API Dashboard GPON
];

function getRequiredModule(path, mapArray) {
  for (const item of mapArray) {
    if (path.startsWith(item.prefix)) return item.module;
  }
  return null;
}

function applyAuth(app) {
  // INTERCEPTOR HTML
  app.use((req, res, next) => {
    if (req.method === "GET" && req.path.endsWith(".html")) {
      if (OPEN_HTML.has(req.path)) return next();
      if (!isLogged(req)) return res.status(302).redirect("/login.html");

      if (isAdmin(req)) return next(); // Admin entra a todo el HTML
      if (req.path === "/menu.html") return next(); // TODOS tienen derecho a ver el menú (aunque esté vacío)

      const modulos = getActiveModules(req);
      const reqMod = getRequiredModule(req.path, MODULE_MAP_HTML);
      
      if (reqMod && modulos[reqMod] === true) return next();

      return res.status(403).send(`Acceso denegado: No tienes el módulo [${reqMod || 'desconocido'}] activo.`);
    }
    next();
  });

  // INTERCEPTOR API
  app.use((req, res, next) => {
    if (!req.path.startsWith("/api")) return next();
    if (OPEN_API.has(req.path)) return next();
    if (!isLogged(req)) return res.status(401).json({ error: "NO_AUTORIZADO" });

    if (isAdmin(req)) return next(); // Admin dispara cualquier API

    const modulos = getActiveModules(req);

    // 🔥 EXCEPCIÓN ARQUITECTÓNICA: Mufas
    if (req.path.startsWith("/api/mufas")) {
        if (modulos["infraestructura"] === true || modulos["infra_movil"] === true) return next();
        return res.status(403).json({ error: "Requiere módulo de Infraestructura para leer Mufas" });
    }

    const reqMod = getRequiredModule(req.path, MODULE_MAP_API);
    if (reqMod && modulos[reqMod] === true) return next();
    if (!reqMod) return next(); // Si la ruta no está mapeada, se asume pública para logueados

    return res.status(403).json({ error: "MODULO_INACTIVO", modulo: reqMod });
  });

  app.get("/api/_whoami", (req, res) => {
    const u = req.session?.user || null;
    res.json({
      logged: isLogged(req),
      raw: u,
      admin: isAdmin(req),
      modulos_activos: getActiveModules(req),
      expired: u ? isExpired(u) : true,
    });
  });
}

// Exportamos lo necesario
module.exports = { isLogged, isAdmin, isExpired, applyAuth, getActiveModules, requireLogin, requireAdmin, requireAnyRole };