// server/routes/bitacora.js
// Listado + export CSV de la bitácora

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const svc = require("../services/bitacora");

// helper para obtener el pool igual que en el resto de rutas
function getPool(req) {
  return req.db || req.app.get("db") || req.pool || pool;
}

/* ---------- Cabecera de debug con roles (igual que otros módulos) ---------- */
router.use((req, res, next) => {
  try {
    const roles = Array.isArray(req.session?.user?.roles)
      ? req.session.user.roles
      : [];
    res.setHeader("X-Auth-Roles", roles.join(","));
  } catch {}
  next();
});

/**
 * GET /api/bitacora
 * Query params esperados por el front:
 *   q        -> texto libre
 *   actor    -> id o texto de actor
 *   entidad  -> entidad (ruta, cliente, usuario, etc.)
 *   accion   -> create/update/delete/login...
 *   desde    -> YYYY-MM-DD
 *   hasta    -> YYYY-MM-DD
 *   page     -> número de página
 *   pageSize -> tamaño de página
 */
router.get("/", async (req, res) => {
  try {
    const db = getPool(req);
    const q = req.query || {};

    const result = await svc.query(
      { pool: db },
      {
        page: q.page,
        pageSize: q.pageSize,
        actor: q.actor,
        entidad: q.entidad,
        accion: q.accion,
        desde: q.desde,
        hasta: q.hasta,
        text: q.q,
      }
    );

    return res.json(
      result || {
        items: [],
        page: 1,
        pageSize: Number(q.pageSize || 25),
        total: 0,
        totalPages: 0,
      }
    );
  } catch (err) {
    console.error("GET /api/bitacora error:", err);
    res.status(500).json({ error: "Error consultando bitácora" });
  }
});

/**
 * GET /api/bitacora/csv
 *  - mismos filtros que arriba.
 *  - genera un CSV simple a partir de svc.query.
 */
router.get("/csv", async (req, res) => {
  try {
    const db = getPool(req);
    const q = req.query || {};

    // para CSV pedimos una sola página grande (por defecto 50k filas máx)
    const limit = Math.min(
      Number(q.limit || q.pageSize || 50000) || 50000,
      100000
    );

    const result = await svc.query(
      { pool: db },
      {
        page: 1,
        pageSize: limit,
        actor: q.actor,
        entidad: q.entidad,
        accion: q.accion,
        desde: q.desde,
        hasta: q.hasta,
        text: q.q,
      }
    );

    const rows = Array.isArray(result?.items) ? result.items : [];

    const header = [
      "id",
      "fecha",
      "actor_id",
      "actor_nombre",
      "entidad",
      "accion",
      "antes_json",
      "despues_json",
      "ip",
      "user_agent",
    ];

    const esc = (v) => {
      if (v === null || v === undefined) return "";
      const s = String(v).replace(/"/g, '""');
      return `"${s}"`;
    };

    const lines = [];
    lines.push(header.join(","));
    for (const r of rows) {
      lines.push(
        header
          .map((k) => {
            if (k === "fecha") return esc(r.fecha);
            if (k === "actor_nombre") return esc(r.actor_nombre || r.actor);
            return esc(r[k]);
          })
          .join(",")
      );
    }

    const csv = lines.join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bitacora_${Date.now()}.csv"`
    );
    res.send(csv);
  } catch (err) {
    console.error("GET /api/bitacora/csv error:", err);
    res.status(500).send("ERROR_CSV");
  }
});

module.exports = router;
