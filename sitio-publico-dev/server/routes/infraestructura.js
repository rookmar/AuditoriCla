// =========================================================================
// Archivo: server/routes/infraestructura.js
// Descripción: Endpoints del Servidor para el Mapa de Escritorio e Infraestructura
// =========================================================================

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const bitacoraSvc = require("../services/bitacora");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Configuración de Multer para guardar las fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../../public/uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, "punto_" + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Helpers de limpieza de datos
const vstr = (s) => (s === undefined || s === null ? null : String(s).trim() || null);
const vint = (s) => (Number.isFinite(Number(s)) ? Number(s) : null);
function getPool(req) { return req.db || req.app.get("db") || req.pool || pool; }

// Log de eventos para auditoría de acciones
async function logInfra(req, { entidad, accion, entidad_id, antes = null, despues = null }) {
  try {
    const actor_id = req.session?.user?.id || null;
    if (!actor_id) return;
    await bitacoraSvc.logEvent({ pool: getPool(req) }, {
      actor_user_id: actor_id,
      entidad, entidad_id, accion, antes, despues,
      ip: req.ip, user_agent: req.headers["user-agent"]
    });
  } catch (e) { console.warn("Fallo log:", e.message); }
}

/* =========================================================================
   BUSCADOR DE CLIENTES
   ========================================================================= */
router.get("/clientes-search", async (req, res) => {
  const db = getPool(req);
  try {
    const q = (req.query.q ?? "").toString().trim();
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = 15;
    const offset = (page - 1) * pageSize;

    const where = q ? [`(nombre_cliente LIKE ? OR ID_Cliente LIKE ?)`] : [];
    const params = q ? [`%${q}%`, `%${q}%`] : [];

    const WHERE_SQL = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM cliente ${WHERE_SQL}`, params);
    
    const [items] = await db.query(
      `SELECT id_cliente, nombre_cliente, ID_Cliente, tarea 
       FROM cliente ${WHERE_SQL} 
       ORDER BY nombre_cliente ASC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );

    res.json({ items, total: count.total, page, totalPages: Math.ceil(count.total / pageSize) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

/* =========================================================================
   GESTIÓN DE MAPA Y AUDITORÍA
   ========================================================================= */

// --- LEER PUNTOS (CON INYECCIÓN DE CONTEO DE MUFAS) ---
router.get("/puntos", async (req, res) => {
  const db = getPool(req);
  try {
    const query = `
      SELECT id_punto, nombre, tipo, lat, lng, descripcion, foto,
             (SELECT COUNT(*) FROM mufas WHERE mufas.id_punto = mapa_punto.id_punto) AS total_mufas
      FROM mapa_punto 
      ORDER BY id_punto DESC`;
    const [rows] = await db.execute(query);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GUARDAR O ACTUALIZAR PUNTO ---
router.post("/puntos", upload.single("foto"), async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  const id = vint(b.id_punto);
  const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    if (id) {
      let sql = `UPDATE mapa_punto SET nombre=?, tipo=?, descripcion=?, lat=?, lng=?`;
      let params = [vstr(b.nombre), vstr(b.tipo), vstr(b.descripcion), b.lat, b.lng];
      
      if (fotoUrl) {
          sql += `, foto=?`;
          params.push(fotoUrl);
      }
      sql += ` WHERE id_punto=?`;
      params.push(id);

      await db.execute(sql, params);
      res.json({ ok: true, id_punto: id });
    } else {
      const [ins] = await db.execute(
        `INSERT INTO mapa_punto (nombre, tipo, descripcion, lat, lng, foto) VALUES (?,?,?,?,?,?)`,
        [vstr(b.nombre), vstr(b.tipo), vstr(b.descripcion), b.lat, b.lng, fotoUrl]
      );
      res.status(201).json({ ok: true, id_punto: ins.insertId });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ELIMINAR PUNTO ---
router.delete("/puntos/:id(\\d+)", async (req, res) => {
  const db = getPool(req);
  const id = Number(req.params.id);
  try {
    const [r] = await db.execute(`DELETE FROM mapa_punto WHERE id_punto=?`, [id]);
    if (!r.affectedRows) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- LEER TRAMOS ---
router.get("/tramos", async (req, res) => {
  const db = getPool(req);
  const clienteId = vint(req.query.cliente_id);
  try {
      const query = clienteId 
          ? `SELECT * FROM mapa_tramo WHERE id_cliente = ?` 
          : `SELECT * FROM mapa_tramo`;
      const [rows] = await db.execute(query, clienteId ? [clienteId] : []);
      res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GUARDAR O ACTUALIZAR TRAMO ---
router.post("/tramos", async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  const id = vint(b.id_tramo);
  try {
    if (id) {
      await db.execute(
        `UPDATE mapa_tramo SET id_cliente=?, punto_origen_id=?, punto_destino_id=?, capacidad=?, color=?, geojson=?, datos_cable=? WHERE id_tramo=?`,
        [vint(b.id_cliente), vint(b.id_origen), vint(b.id_destino), vstr(b.capacidad), vstr(b.color), vstr(b.geojson), vstr(b.datos_cable), id]
      );
      res.json({ ok: true, id_tramo: id });
    } else {
      const [ins] = await db.execute(
        `INSERT INTO mapa_tramo (id_cliente, punto_origen_id, punto_destino_id, capacidad, color, geojson, datos_cable) 
         VALUES (?,?,?,?,?,?,?)`,
        [vint(b.id_cliente), vint(b.id_origen), vint(b.id_destino), vstr(b.capacidad), vstr(b.color), vstr(b.geojson), vstr(b.datos_cable)]
      );
      res.status(201).json({ ok: true, id_tramo: ins.insertId });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- ELIMINAR TRAMO ---
router.delete("/tramos/:id(\\d+)", async (req, res) => {
  const db = getPool(req);
  const id = Number(req.params.id);
  try {
    const [r] = await db.execute(`DELETE FROM mapa_tramo WHERE id_tramo=?`, [id]);
    if (!r.affectedRows) return res.status(404).json({ error: "NOT_FOUND" });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- LEER AUDITORÍA ---
router.get("/auditoria", async (req, res) => {
  const db = getPool(req);
  const { id_cliente, id_punto, id_tramo } = req.query;
  try {
    const [[row]] = await db.execute(
      `SELECT metraje_cable, distancia_sig, nota FROM cliente_punto_map 
       WHERE id_cliente=? AND id_punto=? AND id_tramo=?`,
      [vint(id_cliente), vint(id_punto), vint(id_tramo)]
    );
    res.json(row || {});
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- GUARDAR AUDITORÍA ---
router.post("/auditoria", async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  try {
    await db.execute(
      `INSERT INTO cliente_punto_map (id_cliente, id_punto, id_tramo, metraje_cable, distancia_sig, nota)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         metraje_cable = VALUES(metraje_cable), 
         distancia_sig = VALUES(distancia_sig), 
         nota = VALUES(nota)`,
      [vint(b.id_cliente), vint(b.id_punto), vint(b.id_tramo), vint(b.metraje), vint(b.distancia), vstr(b.nota)]
    );
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;