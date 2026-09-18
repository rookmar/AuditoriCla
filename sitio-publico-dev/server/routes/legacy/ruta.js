// server/routes/ruta.js — CRUD + recientes + save por nombres (no rompe tu módulo ODF/Buscar)
const express = require("express");
const router = express.Router();

// Obtén pool desde req o app (igual que en tus otros routers)
function getPool(req) {
  return req.db || req.app.get("db") || req.pool;
}

// --- Detección de columna dinámica en ODF (puerto_odf | puerto) ---
const columnCache = { odfPuerto: null };
async function getOdfPuertoColumn(pool) {
  if (columnCache.odfPuerto) return columnCache.odfPuerto;
  try {
    const [rows] = await pool.execute(
      `SELECT COLUMN_NAME
         FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'odf'
          AND COLUMN_NAME IN ('puerto_odf','puerto')
        LIMIT 1`
    );
    columnCache.odfPuerto = rows.length ? rows[0].COLUMN_NAME : "puerto_odf";
  } catch (_) {
    columnCache.odfPuerto = "puerto_odf";
  }
  return columnCache.odfPuerto;
}

function sendArray(res, arr) {
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  return res.status(200).send(JSON.stringify(arr || []));
}

function vstr(s) {
  if (s === undefined || s === null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}
function vint(s) {
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/* =========================
 * GET /api/ruta/recientes
 * ========================= */
router.get("/recientes", async (req, res) => {
  try {
    const pool = getPool(req);
    const ODF_PUERTO_COL = await getOdfPuertoColumn(pool);

    const [rows] = await pool.query(
      `
      SELECT
        r.id_ruta                           AS id_ruta,
        cl.nombre_cliente                   AS nombre_cliente,
        r.nemonico_patcheo                  AS nemonico_patcheo,
        r.puerto_patcheo                    AS puerto_patcheo,
        e.nemonico_equipo                   AS nemonico_equipo,
        e.marca                             AS marca
      FROM ruta r
      LEFT JOIN cliente cl ON cl.id_cliente = r.id_cliente
      LEFT JOIN odf o      ON o.id_odf = r.id_odf
      LEFT JOIN equipo e   ON e.id_equipo = r.id_equipo
      ORDER BY r.id_ruta DESC
      LIMIT 200
      `
    );

    // El front compone patcheo/equipo si no existen; enviamos base limpia
    return sendArray(res, rows);
  } catch (e) {
    console.error("GET /api/ruta/recientes", e);
    return sendArray(res, []);
  }
});

/* =========================
 * GET /api/ruta/:id
 * Devuelve nombres en minúscula (lo que espera tu front)
 * ========================= */
router.get("/:id", async (req, res) => {
  try {
    const pool = getPool(req);
    const ODF_PUERTO_COL = await getOdfPuertoColumn(pool);
    const id = Number(req.params.id || 0);
    if (!id) return res.status(404).json({ error: "No encontrada" });

    const [[row]] = await pool.query(
      `
      SELECT
        r.id_ruta                           AS id_ruta,
        c.ID_central                        AS ID_central,
        c.nombre_central                    AS nombre_central,
        cl.nombre_cliente                   AS nombre_cliente,
        cl.tarea                            AS tarea,
        o.nombre_odf                        AS nombre_odf,
        o.nemonico_odf                      AS nemonico_odf,
        o.\`${ODF_PUERTO_COL}\`             AS puerto_odf,
        r.nemonico_patcheo                  AS nemonico_patcheo,
        r.puerto_patcheo                    AS puerto_patcheo,
        e.nemonico_equipo                   AS nemonico_equipo,
        e.marca                             AS marca,
        e.slot                              AS slot,
        e.posicion                          AS posicion
      FROM ruta r
      LEFT JOIN central c  ON c.id = r.id_central
      LEFT JOIN cliente cl ON cl.id_cliente = r.id_cliente
      LEFT JOIN odf o      ON o.id_odf = r.id_odf
      LEFT JOIN equipo e   ON e.id_equipo = r.id_equipo
      WHERE r.id_ruta = ?
      `,
      [id]
    );
    if (!row) return res.status(404).json({ error: "No encontrada" });
    return res.json(row);
  } catch (e) {
    console.error("GET /api/ruta/:id", e);
    return res.status(500).json({ error: "Error interno" });
  }
});

/* =========================
 * POST /api/ruta/save
 * Body: { ID_central?, nombre_central, nombre_cliente, tarea, nombre_odf, nemonico_odf, (puerto_odf|odf_puerto), nemonico_patcheo, puerto_patcheo, nemonico_equipo, marca, slot, posicion, id_ruta? }
 * - Resuelve/crea central/cliente/odf/equipo por nombres.
 * - Si viene id_ruta -> UPDATE, si no -> INSERT.
 * ========================= */
router.post("/save", async (req, res) => {
  const pool = getPool(req);
  const conn = await pool.getConnection();
  try {
    const ODF_PUERTO_COL = await getOdfPuertoColumn(pool);

    const body = req.body || {};
    const errors = [];

    const ID_central       = vstr(body.ID_central);      // opcional textual
    const nombre_central   = vstr(body.nombre_central);
    const nombre_cliente   = vstr(body.nombre_cliente);
    const tarea            = body.tarea === '' ? null : vint(body.tarea);

    const nombre_odf       = vstr(body.nombre_odf);
    const nemonico_odf     = vstr(body.nemonico_odf);
    const puerto_odf       = vstr(body.puerto_odf || body.odf_puerto);

    const nemonico_patcheo = vstr(body.nemonico_patcheo);
    const puerto_patcheo   = vstr(body.puerto_patcheo);

    const nemonico_equipo  = vstr(body.nemonico_equipo);
    const marca            = vstr(body.marca);
    const slot             = vstr(body.slot);
    const posicion         = vstr(body.posicion);

    const id_ruta          = vint(body.id_ruta);

    // Validaciones mínimas
    if (!nombre_central && !ID_central) errors.push({ field: 'nombre_central', message: 'Central requerida (nombre o ID_central).' });
    if (!nombre_cliente) errors.push({ field: 'nombre_cliente', message: 'Cliente requerido.' });
    if (!nemonico_odf && !nombre_odf) errors.push({ field: 'nemonico_odf', message: 'ODF requerido (nemonico o nombre).' });
    if (puerto_odf && !/^\d+$/.test(String(puerto_odf))) errors.push({ field: 'odf_puerto', message: 'Puerto ODF debe ser numérico.' });
    if (puerto_patcheo && !/^\d+$/.test(String(puerto_patcheo))) errors.push({ field: 'puerto_patcheo', message: 'Puerto Patcheo debe ser numérico.' });

    if (errors.length) return res.status(400).json({ error: 'VALIDATION', details: errors });

    await conn.beginTransaction();

    // --- CENTRAL: busca por nombre_central o ID_central; crea si no existe ---
    let id_central = null;
    if (nombre_central || ID_central) {
      let where = '';
      const params = [];
      if (nombre_central) { where += (where ? ' OR ' : '') + 'nombre_central = ?'; params.push(nombre_central); }
      if (ID_central)     { where += (where ? ' OR ' : '') + 'ID_central = ?';     params.push(ID_central); }
      const [crows] = await conn.query(`SELECT id FROM central WHERE ${where} LIMIT 1`, params);
      if (crows.length) {
        id_central = crows[0].id;
      } else {
        const [ins] = await conn.query(`INSERT INTO central (nombre_central, ID_central) VALUES (?,?)`, [nombre_central, ID_central]);
        id_central = ins.insertId;
      }
    }

    // --- CLIENTE: por nombre_cliente; crea si no existe ---
    let id_cliente = null;
    if (nombre_cliente) {
      const [clrows] = await conn.query(`SELECT id_cliente FROM cliente WHERE nombre_cliente = ? LIMIT 1`, [nombre_cliente]);
      if (clrows.length) id_cliente = clrows[0].id_cliente;
      else {
        const [ins] = await conn.query(`INSERT INTO cliente (nombre_cliente, tarea) VALUES (?,?)`, [nombre_cliente, tarea]);
        id_cliente = ins.insertId;
      }
    }

    // --- EQUIPO: por (nemonico_equipo, marca, slot, posicion); crea si no existe ---
    let id_equipo = null;
    if (nemonico_equipo || marca || slot || posicion) {
      const [eqrows] = await conn.query(
        `SELECT id_equipo FROM equipo WHERE COALESCE(nemonico_equipo,'') = COALESCE(?, '') AND COALESCE(marca,'') = COALESCE(?, '') AND COALESCE(slot,'') = COALESCE(?, '') AND COALESCE(posicion,'') = COALESCE(?, '') LIMIT 1`,
        [nemonico_equipo, marca, slot, posicion]
      );
      if (eqrows.length) id_equipo = eqrows[0].id_equipo;
      else {
        const [ins] = await conn.query(
          `INSERT INTO equipo (nemonico_equipo, marca, slot, posicion) VALUES (?,?,?,?)`,
          [nemonico_equipo, marca, slot, posicion]
        );
        id_equipo = ins.insertId;
      }
    }

    // --- ODF: por (nemonico_odf || nombre_odf) + puerto ---
    let id_odf = null;
    if (nemonico_odf || nombre_odf || puerto_odf) {
      const [odfrows] = await conn.query(
        `SELECT id_odf FROM odf WHERE (COALESCE(nemonico_odf,'') = COALESCE(?, '') OR COALESCE(nombre_odf,'') = COALESCE(?, '')) AND COALESCE(\`${ODF_PUERTO_COL}\`,'') = COALESCE(?, '') LIMIT 1`,
        [nemonico_odf, nombre_odf, puerto_odf]
      );
      if (odfrows.length) id_odf = odfrows[0].id_odf;
      else {
        const [ins] = await conn.query(
          `INSERT INTO odf (nombre_odf, nemonico_odf, \`${ODF_PUERTO_COL}\`) VALUES (?,?,?)`,
          [nombre_odf, nemonico_odf, puerto_odf]
        );
        id_odf = ins.insertId;
      }
    }

    // --- RUTA: insert/update ---
    if (id_ruta) {
      const [upd] = await conn.query(
        `UPDATE ruta
            SET id_central = ?,
                id_cliente = ?,
                id_odf = ?,
                id_equipo = ?,
                nemonico_patcheo = ?,
                puerto_patcheo = ?
          WHERE id_ruta = ?`,
        [id_central, id_cliente, id_odf, id_equipo, nemonico_patcheo, puerto_patcheo, id_ruta]
      );
      if (!upd.affectedRows) throw new Error('Ruta no encontrada para actualizar');
      await conn.commit();
      return res.json({ ok: true, id_ruta });
    } else {
      const [ins] = await conn.query(
        `INSERT INTO ruta (id_central, id_cliente, id_odf, id_equipo, nemonico_patcheo, puerto_patcheo, fecha_creacion)
         VALUES (?,?,?,?,?,?, NOW())`,
        [id_central, id_cliente, id_odf, id_equipo, nemonico_patcheo, puerto_patcheo]
      );
      await conn.commit();
      return res.status(201).json({ ok: true, id_ruta: ins.insertId });
    }
  } catch (e) {
    try { await conn.rollback(); } catch {}
    console.error("POST /api/ruta/save", e);
    // Devolver en formato amigable si es posible
    return res.status(500).json({ error: "No se pudo guardar la ruta" });
  } finally {
    try { conn.release(); } catch {}
  }
});

/* =========================
 * DELETE /api/ruta/:id
 * ========================= */
router.delete("/:id", async (req, res) => {
  try {
    const pool = getPool(req);
    const id = Number(req.params.id || 0);
    if (!id) return res.status(404).json({ error: "No encontrada" });

    const [del] = await pool.query(`DELETE FROM ruta WHERE id_ruta = ?`, [id]);
    if (!del.affectedRows) return res.status(404).json({ error: "No encontrada" });
    return res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/ruta/:id", e);
    return res.status(500).json({ error: "No se pudo eliminar" });
  }
});

module.exports = router;
