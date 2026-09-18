// =========================================================================
// Archivo: server/routes/login.js
// Descripción: Controlador de autenticación. Optimizado para JSON y is_admin.
// =========================================================================
const express = require("express");
const router = express.Router();
const { auditar } = require("../lib/audit");
const { isExpired } = require("../auth");

module.exports = (() => {
  // --- LOGIN ---
  router.post("/login", async (req, res) => {
    const pool = req.app.get("db") || req.db || req.pool;
    try {
      const { usuario, password } = req.body || {};
      if (!usuario || !password) return res.status(400).json({ error: "PARAMS" });

      let u = null;
      try {
        const [rows] = await pool.execute(
          `SELECT id, usuario, nombre, is_admin, activo, password, activo_hasta, modulos_activos FROM usuarios WHERE LOWER(TRIM(usuario)) = LOWER(TRIM(?)) LIMIT 1`,
          [usuario]
        );
        u = rows && rows[0] ? rows[0] : null;
      } catch {
        return res.status(500).json({ error: "DB_ERROR" });
      }

      if (!u) return res.status(401).json({ error: "INVALID_CREDENTIALS" });
      if (String(u.password || "") !== String(password)) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

      // Check de Bomba de Tiempo
      if (isExpired(u)) {
        console.log(`🚫 Login rechazado para ${u.usuario}: Expirado o Inactivo.`);
        return res.status(403).json({ error: "EXPIRED" });
      }

      // Crear Sesión
      req.session.user = {
        id_usuario: u.id,
        usuario: u.usuario,
        nombre: u.nombre || u.usuario,
        admin: !!u.is_admin, // Validamos la nueva bandera de MariaDB
        activo: true,
        activo_hasta: u.activo_hasta || null,
        modulos_activos: u.modulos_activos || null, 
      };

      // Auditar Login
      const snapshot = { acceso_via: "web", timestamp: new Date().toISOString() };
      auditar(req, "login", u.id, "login", null, snapshot);

      return res.json({ ok: true, user: req.session.user });
    } catch (err) {
      console.error("POST /api/login", err);
      return res.status(500).json({ error: "LOGIN_ERROR" });
    }
  });

  router.get("/me", (req, res) => {
    const user = req.session.user;
    if (!user) return res.status(401).json({ error: "UNAUTHORIZED" });
    const expired = isExpired({ activo: user.activo ? 1 : 0, activo_hasta: user.activo_hasta });
    return res.json({ user: { ...user, expired } });
  });

  router.post("/logout", (req, res) => {
    try { req.session.destroy(() => res.json({ ok: true })); } catch { res.json({ ok: true }); }
  });

  router.get("/health", (_req, res) => res.json({ ok: true }));
  return router;
})();