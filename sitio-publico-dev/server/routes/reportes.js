// server/routes/reportes.js
const express = require("express");
const router = express.Router();

/* ---------- Bypass Auth & Debug Headers ---------- */
router.use((req, res, next) => {
  try {
    const roles = Array.isArray(req.session?.user?.roles) ? req.session.user.roles : [];
    res.setHeader("X-Auth-Roles", roles.join(","));
  } catch {}
  next();
});

function getPool(req) {
  return req.db || req.app.get("db") || req.pool;
}

/* ======================= Lógica de Negocio Simplificada ======================= */

/**
 * Lógica centralizada para detectar puertos libres.
 * Se basa en la estandarización de la carga masiva:
 * Si el cliente se llama "LIBRE", el puerto se considera disponible.
 */
function buildLibreExprAndJoin() {
  return {
    // Detecta "LIBRE", "libre", "Libre ", etc.
    libreExpr: "UPPER(TRIM(c.nombre_cliente)) = 'LIBRE'",
    // Une la tabla ruta con cliente usando el ID numérico
    joinSql: "JOIN cliente c ON c.id_cliente = r.id_cliente", 
    debugFrom: "cliente.nombre_cliente via r.id_cliente"
  };
}

/* =================== Endpoints =================== */

// Centrales (Solo las que tienen rutas activas)
router.get("/centrales", async (req, res) => {
  try {
    const pool = getPool(req);
    const [rows] = await pool.query(
      `SELECT DISTINCT cen.id, cen.nombre_central, cen.ID_central
       FROM ruta r
       JOIN central cen ON cen.id = r.id_central
       WHERE COALESCE(cen.nombre_central,'') <> ''
       ORDER BY cen.nombre_central`
    );
    res.json({ items: rows || [] });
  } catch (e) {
    console.error("GET /api/reportes/centrales", e);
    res.json({ items: [] });
  }
});

// ODFs (Filtrados por central)
router.get("/odfs", async (req, res) => {
  try {
    const pool = getPool(req);
    const centralId = Number(req.query.central_id || 0);
    const params = [];
    let where = "";
    
    if (centralId > 0) { 
      where = "WHERE r.id_central = ?"; 
      params.push(centralId); 
    }

    const [rows] = await pool.query(
      `SELECT DISTINCT o.nemonico_odf
       FROM ruta r
       JOIN odf o ON o.id_odf = r.id_odf
       ${where}
       ORDER BY o.nemonico_odf ASC`,
      params
    );
    res.json({ items: rows || [] });
  } catch (e) {
    console.error("GET /api/reportes/odfs", e);
    res.json({ items: [] });
  }
});

/* =================== Reporte de Capacidad =================== */
router.get("/capacidad", async (req, res) => {
  try {
    const pool = getPool(req);
    const scope = String(req.query.scope || "").toLowerCase();
    
    // Obtenemos la lógica de detección de "LIBRE"
    const { libreExpr, joinSql } = buildLibreExprAndJoin();

    // --- REPORTE POR CENTRAL ---
    if (scope === "central") {
      const centralId = Number(req.query.central_id || 0);
      if (!centralId) return res.status(400).json({ error: "central_id requerido" });

      const [rows] = await pool.query(
        `SELECT
            o.nemonico_odf,
            COUNT(*) AS total_puertos,
            SUM(CASE WHEN ${libreExpr} THEN 0 ELSE 1 END) AS usados,
            SUM(CASE WHEN ${libreExpr} THEN 1 ELSE 0 END) AS libres
         FROM ruta r
         JOIN odf o ON o.id_odf = r.id_odf
         ${joinSql} -- JOIN con cliente para verificar nombre
         WHERE r.id_central = ?
         GROUP BY o.nemonico_odf
         ORDER BY o.nemonico_odf`,
        [centralId]
      );

      // Calcular porcentajes
      const items = (rows || []).map(r => {
        const total = Number(r.total_puertos || 0);
        const usados = Number(r.usados || 0);
        const libres = Number(r.libres || 0);
        const porcentaje = total > 0 ? Math.round((usados * 10000) / total) / 100 : 0;
        return { nemonico_odf: r.nemonico_odf, total_puertos: total, usados, libres, porcentaje };
      });

      // Calcular totales de la central
      const totals = items.reduce((acc, it) => {
        acc.total_puertos += it.total_puertos;
        acc.usados += it.usados;
        acc.libres += it.libres;
        return acc;
      }, { total_puertos: 0, usados: 0, libres: 0 });
      totals.porcentaje = totals.total_puertos > 0 ? Math.round((totals.usados * 10000) / totals.total_puertos) / 100 : 0;

      // Obtener nombre de la central para el encabezado
      const [[cRow]] = await pool.query(`SELECT nombre_central, ID_central FROM central WHERE id=? LIMIT 1`, [centralId]);

      return res.json({
        scope: "central",
        central_id: centralId,
        central: cRow?.nombre_central || cRow?.ID_central || String(centralId),
        items, 
        totals
      });
    }

    // --- REPORTE POR ODF (Para ver un mismo ODF en varias centrales) ---
    if (scope === "odf") {
      const nem = String(req.query.nemonico || "").trim();
      if (!nem) return res.status(400).json({ error: "nemonico requerido" });

      const [rows] = await pool.query(
        `SELECT
            cen.nombre_central AS central,
            COUNT(*) AS total_puertos,
            SUM(CASE WHEN ${libreExpr} THEN 0 ELSE 1 END) AS usados,
            SUM(CASE WHEN ${libreExpr} THEN 1 ELSE 0 END) AS libres
         FROM ruta r
         JOIN odf o ON o.id_odf = r.id_odf
         JOIN central cen ON cen.id = r.id_central
         ${joinSql} -- JOIN con cliente para verificar nombre
         WHERE o.nemonico_odf = ?
         GROUP BY cen.nombre_central
         ORDER BY cen.nombre_central`,
        [nem]
      );

      const items = (rows || []).map(r => ({
        central: r.central,
        usados: Number(r.usados || 0),
        libres: Number(r.libres || 0),
        total_puertos: Number(r.total_puertos || 0),
      }));

      const totals = items.reduce((acc, it) => {
        acc.total_puertos += it.total_puertos;
        acc.usados += it.usados;
        acc.libres += it.libres;
        return acc;
      }, { total_puertos: 0, usados: 0, libres: 0 });
      totals.porcentaje = totals.total_puertos > 0 ? Math.round((totals.usados * 10000) / totals.total_puertos) / 100 : 0;

      return res.json({ scope: "odf", nemonico_odf: nem, items, totals });
    }

    return res.status(400).json({ error: "scope inválido (use central|odf)" });
  } catch (e) {
    console.error("GET /api/reportes/capacidad", e);
    res.status(500).json({ error: "DB_ERROR" });
  }
});

// Endpoint de debug (Opcional, para verificar qué lógica está usando)
router.get("/_debug", async (req, res) => {
  res.json(buildLibreExprAndJoin());
});

module.exports = router;