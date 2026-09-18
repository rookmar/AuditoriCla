// server/routes/legacy/mapa.js
// Router legacy para mapa (puntos/tramos y utilidades antiguas)
// Montar bajo /api/legacy/mapa

const express = require("express");
const router = express.Router();
const { pool } = require("../../db");

// --- util: parse BBox "swLat,swLng,neLat,neLng"
function parseBBox(q) {
  if (!q) return null;
  const v = q.split(",").map(Number);
  if (v.length !== 4 || v.some(isNaN)) return null;
  return { swLat: v[0], swLng: v[1], neLat: v[2], neLng: v[3] };
}

/* ============================
 * LECTURA PUNTOS / TRAMOS (LEGACY)
 * ============================ */

// GET /api/legacy/mapa/puntos
router.get("/puntos", async (req, res) => {
  try {
    const { tipo, bbox, q } = req.query;
    const bb = parseBBox(bbox);
    const params = [];
    let sql = `
      SELECT id_punto AS id,
             COALESCE(nombre, etiqueta) AS nombre,
             COALESCE(tipo,'') AS tipo,
             COALESCE(descripcion,'') AS descripcion,
             lat, lng,
             COALESCE(imagen_url,'') AS imagen_url
      FROM mapa_punto
      WHERE 1=1
    `;

    if (tipo) {
      const tipos = String(tipo).split(",").filter(Boolean);
      if (tipos.length) {
        sql += ` AND COALESCE(tipo,'') IN (${tipos.map(() => "?").join(",")})`;
        params.push(...tipos);
      }
    }
    if (q) { sql += ` AND COALESCE(nombre, etiqueta) LIKE ?`; params.push(`%${q}%`); }
    if (bb) {
      sql += ` AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;
      params.push(bb.swLat, bb.neLat, bb.swLng, bb.neLng);
    }
    sql += ` ORDER BY id_punto ASC LIMIT 5000`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error("[LEGACY LIST_PUNTOS]", err);
    res.status(500).json({ error: "ERROR_LIST_PUNTOS" });
  }
});

// GET /api/legacy/mapa/tramos
// Reconstruye cada tramo en un path a partir de mapa_tramo_punto (orden)
router.get("/tramos", async (req, res) => {
  try {
    const { bbox } = req.query;
    const bb = parseBBox(bbox);

    // 1) tramos + puntos ordenados
    const [rows] = await pool.query(`
      SELECT t.id_tramo AS id,
             t.nombre,
             t.id_cliente,
             t.datos_cable,
             mtp.orden,
             p.id_punto, p.lat, p.lng
      FROM mapa_tramo t
      JOIN mapa_tramo_punto mtp ON mtp.id_tramo = t.id_tramo
      JOIN mapa_punto p         ON p.id_punto = mtp.id_punto
      ORDER BY t.id_tramo ASC, mtp.orden ASC
    `);

    // 2) reconstrucción por tramo
    const byTramo = new Map();
    for (const r of rows) {
      if (!byTramo.has(r.id)) {
        byTramo.set(r.id, {
          id: r.id,
          nombre: r.nombre,
          id_cliente: r.id_cliente,
          datos_cable: r.datos_cable,
          path: [],
        });
      }
      byTramo.get(r.id).path.push({ lat: Number(r.lat), lng: Number(r.lng) });
    }

    // 3) bbox filtro (si aplica) usando primer/último vértice
    let list = Array.from(byTramo.values());
    if (bb) {
      const inBB = (pt) =>
        pt.lat >= bb.swLat && pt.lat <= bb.neLat && pt.lng >= bb.swLng && pt.lng <= bb.neLng;
      list = list.filter((t) => {
        if (!t.path.length) return false;
        const a = t.path[0];
        const b = t.path[t.path.length - 1];
        return inBB(a) || inBB(b);
      });
    }

    res.json(list);
  } catch (err) {
    console.error("[LEGACY LIST_TRAMOS]", err);
    res.status(500).json({ error: "ERROR_LIST_TRAMOS" });
  }
});

/* ============================
 * ALTAS LEGACY (opcionales)
 * ============================ */

// POST /api/legacy/mapa/puntos
router.post("/puntos", async (req, res) => {
  try {
    const { nombre, tipo, descripcion, lat, lng, imagen_url } = req.body || {};
    const latN = Number(lat), lngN = Number(lng);
    if (!Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({ error: "LATLNG_INVALIDOS" });
    }
    const [r] = await pool.execute(
      `INSERT INTO mapa_punto (nombre, tipo, descripcion, lat, lng, imagen_url)
       VALUES (?,?,?,?,?,?)`,
      [nombre || null, tipo || null, descripcion || null, latN, lngN, imagen_url || null]
    );
    res.status(201).json({ id: r.insertId });
  } catch (err) {
    console.error("[LEGACY CREATE_PUNTO]", err);
    res.status(500).json({ error: "ERROR_CREATE_PUNTO" });
  }
});

// POST /api/legacy/mapa/tramos
// (Versión legacy que guarda un tramo y sus vértices en mapa_tramo_punto)
router.post("/tramos", async (req, res) => {
  try {
    const { id_cliente, nombre, datos_cable, path } = req.body || {};
    if (!Number(id_cliente) || !Array.isArray(path) || path.length < 2) {
      return res.status(400).json({ error: "VALIDATION_ERROR" });
    }

    // path = [{lat,lng}, ...]
    // Se insertan SOLO los enlaces a puntos existentes: debes pasar ids si ya existen.
    // Si necesitas crear puntos nuevos, hazlo primero con /puntos.

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Crear tramo
      const [insT] = await conn.execute(
        `INSERT INTO mapa_tramo (id_cliente, nombre, datos_cable) VALUES (?,?,?)`,
        [Number(id_cliente), nombre || null, datos_cable || null]
      );
      const id_tramo = insT.insertId;

      // Vincular puntos existentes en orden
      for (let i = 0; i < path.length; i++) {
        const pt = path[i];
        const pid = Number(pt.id || pt.id_punto); // requiere id existente
        if (!pid) continue;
        await conn.execute(
          `INSERT IGNORE INTO mapa_tramo_punto (id_tramo, id_punto, orden) VALUES (?,?,?)`,
          [id_tramo, pid, i + 1]
        );
      }

      await conn.commit();
      res.status(201).json({ ok: true, id: id_tramo });
    } catch (e) {
      try { await conn.rollback(); } catch {}
      throw e;
    } finally { conn.release(); }
  } catch (err) {
    console.error("[LEGACY CREATE_TRAMO]", err);
    res.status(500).json({ error: "ERROR_CREATE_TRAMO" });
  }
});

module.exports = router;
