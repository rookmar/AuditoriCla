// routes/mapa.js
const express = require('express');
const router = express.Router();
const pool = require('../db'); // ajusta la ruta si tu pool está en otro lugar

// Ajusta aquí si tu tabla/columnas de cliente cambian de nombre
const CLIENTE_TABLE = 'cliente';
const CLIENTE_ID = 'id_cliente';
const CLIENTE_NOMBRE = 'nombre_cliente';
const CLIENTE_PUNTO = 'punto_conexion_id';

function parseBBox(q) {
  if (!q) return null;
  const v = q.split(',').map(Number);
  if (v.length !== 4 || v.some(isNaN)) return null;
  return { swLat: v[0], swLng: v[1], neLat: v[2], neLng: v[3] };
}

/* ============================
 * LECTURA PUNTOS / TRAMOS
 * ============================ */
router.get('/puntos', async (req, res) => {
  try {
    const { tipo, bbox, q } = req.query;
    const bb = parseBBox(bbox);
    const params = [];
    let sql = `SELECT id,nombre,tipo,descripcion,lat,lng,imagen_url
               FROM mapa_puntos WHERE 1=1`;

    if (tipo) {
      const tipos = String(tipo).split(',').filter(Boolean);
      if (tipos.length) {
        sql += ` AND tipo IN (${tipos.map(() => '?').join(',')})`;
        params.push(...tipos);
      }
    }
    if (q) { sql += ` AND nombre LIKE ?`; params.push(`%${q}%`); }
    if (bb) {
      sql += ` AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`;
      params.push(bb.swLat, bb.neLat, bb.swLng, bb.neLng);
    }
    sql += ` ORDER BY id ASC LIMIT 5000`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('LIST_PUNTOS', err);
    res.status(500).json({ error: 'ERROR_LIST_PUNTOS' });
  }
});

router.get('/tramos', async (req, res) => {
  try {
    const { bbox } = req.query;
    const bb = parseBBox(bbox);
    const params = [];
    let sql = `SELECT id,nombre,punto_origen_id,punto_destino_id,path_json,color,weight,imagen_url
               FROM mapa_tramos WHERE 1=1`;

    if (bb) {
      sql += ` AND (
        EXISTS(SELECT 1 FROM mapa_puntos p WHERE p.id = mapa_tramos.punto_origen_id
               AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?)
        OR
        EXISTS(SELECT 1 FROM mapa_puntos p WHERE p.id = mapa_tramos.punto_destino_id
               AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?)
      )`;
      params.push(bb.swLat, bb.neLat, bb.swLng, bb.neLng,
                  bb.swLat, bb.neLat, bb.swLng, bb.neLng);
    }
    sql += ` ORDER BY id ASC LIMIT 5000`;

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('LIST_TRAMOS', err);
    res.status(500).json({ error: 'ERROR_LIST_TRAMOS' });
  }
});

/* ============================
 * ALTAS (no afectan tu UI actual)
 * ============================ */
router.post('/puntos', async (req, res) => {
  try {
    const { nombre, tipo, descripcion, lat, lng, imagen_url } = req.body || {};
    const tipoOk = ['central','pozo','poste','mufa','cliente'].includes(tipo);
    const latN = Number(lat), lngN = Number(lng);
    if (!nombre || !tipoOk || !Number.isFinite(latN) || !Number.isFinite(lngN)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR' });
    }
    const [result] = await pool.query(
      `INSERT INTO mapa_puntos (nombre,tipo,descripcion,lat,lng,imagen_url)
       VALUES (?,?,?,?,?,?)`,
      [nombre, tipo, descripcion || null, latN, lngN, imagen_url || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('CREATE_PUNTO', err);
    res.status(500).json({ error: 'ERROR_CREATE_PUNTO' });
  }
});

router.post('/tramos', async (req, res) => {
  try {
    const { nombre, punto_origen_id, punto_destino_id, path, capacidad, color, weight, imagen_url } = req.body || {};
    if (!nombre || !punto_origen_id || !punto_destino_id || !Array.isArray(path) || path.length < 2) {
      return res.status(400).json({ error: 'VALIDATION_ERROR' });
    }
    const path_json = JSON.stringify(path.map(p => ({ lat: Number(p.lat), lng: Number(p.lng) })));
    const w = Number(weight) || 4;

    const [result] = await pool.query(
      `INSERT INTO mapa_tramos (nombre,punto_origen_id,punto_destino_id,path_json,capacidad,color,weight,imagen_url)
       VALUES (?,?,?,?,?,?,?,?)`,
      [nombre, Number(punto_origen_id), Number(punto_destino_id), path_json, capacidad || null, color || '#e53935', w, imagen_url || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (err) {
    console.error('CREATE_TRAMO', err);
    res.status(500).json({ error: 'ERROR_CREATE_TRAMO' });
  }
});

/* ============================
 * ENLACE CLIENTE -> PUNTO (punto_conexion_id)
 * ============================ */
router.post('/cliente/:clienteId/enlazar', async (req, res) => {
  try {
    const clienteId = Number(req.params.clienteId);
    const { punto_conexion_id } = req.body || {};
    if (!clienteId || !punto_conexion_id) return res.status(400).json({ error: 'VALIDATION_ERROR' });

    const sql = `UPDATE ${CLIENTE_TABLE} SET ${CLIENTE_PUNTO}=? WHERE ${CLIENTE_ID}=?`;
    await pool.query(sql, [Number(punto_conexion_id), clienteId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('ENLAZAR_CLIENTE', err);
    res.status(500).json({ error: 'ERROR_ENLAZAR_CLIENTE' });
  }
});

/* ============================
 * DETALLE POR PUNTO Y CLIENTE
 * ============================ */
// GET /api/mapa/punto-cliente?cliente_id=123[&punto_id=3]
router.get('/punto-cliente', async (req, res) => {
  try {
    const cid = Number(req.query.cliente_id || 0);
    const pid = req.query.punto_id ? Number(req.query.punto_id) : null;
    if (!cid) return res.status(400).json({ error: 'FALTA_cliente_id' });

    const params = [cid];
    let sql = `SELECT pc.*, mp.nombre AS punto_nombre, mp.tipo AS punto_tipo
               FROM punto_cliente_detalle pc
               JOIN mapa_puntos mp ON mp.id = pc.punto_id
               WHERE pc.cliente_id = ?`;
    if (pid) { sql += ` AND pc.punto_id=?`; params.push(pid); }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'ERR_LIST_PC' }); }
});

// POST /api/mapa/punto-cliente (upsert cliente+punto)
router.post('/punto-cliente', async (req, res) => {
  try {
    const { cliente_id, punto_id, hilo, cable, longitud_m, comentario } = req.body || {};
    if (!cliente_id || !punto_id) return res.status(400).json({ error: 'VALIDATION_ERROR' });

    const sql = `
      INSERT INTO punto_cliente_detalle
        (cliente_id, punto_id, hilo, cable, longitud_m, comentario)
      VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        hilo=VALUES(hilo),
        cable=VALUES(cable),
        longitud_m=VALUES(longitud_m),
        comentario=VALUES(comentario)
    `;
    await pool.query(sql, [cliente_id, punto_id, hilo || null, cable || null, longitud_m || null, comentario || null]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'ERR_SAVE_PC' }); }
});

/* ============================
 * DETALLE POR TRAMO Y CLIENTE
 * ============================ */
// GET /api/mapa/tramo-cliente?cliente_id=123[&tramo_id=10]
router.get('/tramo-cliente', async (req, res) => {
  try {
    const cid = Number(req.query.cliente_id || 0);
    const tid = req.query.tramo_id ? Number(req.query.tramo_id) : null;
    if (!cid) return res.status(400).json({ error: 'FALTA_cliente_id' });

    const params = [cid];
    let sql = `SELECT tc.*, mt.nombre AS tramo_nombre
               FROM tramo_cliente_detalle tc
               JOIN mapa_tramos mt ON mt.id = tc.tramo_id
               WHERE tc.cliente_id = ?`;
    if (tid) { sql += ` AND tc.tramo_id=?`; params.push(tid); }

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'ERR_LIST_TC' }); }
});

// POST /api/mapa/tramo-cliente (upsert cliente+tramo)
router.post('/tramo-cliente', async (req, res) => {
  try {
    const { cliente_id, tramo_id, cable, hilo, longitud_m, comentario } = req.body || {};
    if (!cliente_id || !tramo_id) return res.status(400).json({ error: 'VALIDATION_ERROR' });

    const sql = `
      INSERT INTO tramo_cliente_detalle
        (cliente_id, tramo_id, cable, hilo, longitud_m, comentario)
      VALUES (?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE
        cable=VALUES(cable),
        hilo=VALUES(hilo),
        longitud_m=VALUES(longitud_m),
        comentario=VALUES(comentario)
    `;
    await pool.query(sql, [cliente_id, tramo_id, cable || null, hilo || null, longitud_m || null, comentario || null]);
    res.json({ ok: true });
  } catch (e) { console.error(e); res.status(500).json({ error: 'ERR_SAVE_TC' }); }
});

/* ============================
 * RUTA POR CLIENTE (nombre o id)
 * ============================ */
/* /api/mapa/ruta?cliente=Nombre  ó  /api/mapa/ruta?cliente_id=123  (&central_id=ID opcional) */
router.get('/ruta', async (req, res) => {
  try {
    const q = (req.query.cliente || '').trim();
    const clienteIdParam = Number(req.query.cliente_id || 0);
    const centralIdParam = Number(req.query.central_id || 0);

    if (!q && !clienteIdParam) return res.status(400).json({ error: 'FALTA_PARAM_CLIENTE' });

    // 1) Buscar cliente real
    let cliente;
    if (clienteIdParam) {
      const [rows] = await pool.query(
        `SELECT ${CLIENTE_ID} AS id, ${CLIENTE_NOMBRE} AS nombre, ${CLIENTE_PUNTO} AS punto_conexion_id
         FROM ${CLIENTE_TABLE} WHERE ${CLIENTE_ID} = ? LIMIT 1`,
        [clienteIdParam]
      );
      cliente = rows[0];
    } else {
      const [rows] = await pool.query(
        `SELECT ${CLIENTE_ID} AS id, ${CLIENTE_NOMBRE} AS nombre, ${CLIENTE_PUNTO} AS punto_conexion_id
         FROM ${CLIENTE_TABLE} WHERE ${CLIENTE_NOMBRE} LIKE ? ORDER BY ${CLIENTE_ID} LIMIT 1`,
        [`%${q}%`]
      );
      cliente = rows[0];
    }
    if (!cliente) return res.status(404).json({ error: 'CLIENTE_NO_ENCONTRADO' });
    if (!cliente.punto_conexion_id) return res.status(400).json({ error: 'CLIENTE_SIN_PUNTO' });

    // 2) Central: primera o la indicada
    let centralId = centralIdParam;
    if (!centralId) {
      const [centrales] = await pool.query(
        `SELECT id FROM mapa_puntos WHERE tipo='central' ORDER BY id LIMIT 1`
      );
      if (!centrales.length) return res.status(400).json({ error: 'NO_HAY_CENTRAL' });
      centralId = centrales[0].id;
    }

    // 3) Construir grafo con tramos
    const [tramos] = await pool.query(
      `SELECT id, nombre, punto_origen_id AS a, punto_destino_id AS b, path_json, color, weight
       FROM mapa_tramos`
    );
    const byId = new Map(tramos.map(t => [t.id, t]));
    const vecinos = new Map(); // punto -> [{to, tramoId}]
    function pushEdge(u, v, tramoId) {
      if (!vecinos.has(u)) vecinos.set(u, []);
      vecinos.get(u).push({ to: v, tramoId });
    }
    tramos.forEach(t => { pushEdge(t.a, t.b, t.id); pushEdge(t.b, t.a, t.id); });

    // 4) BFS central -> punto del cliente
    const start = Number(centralId), goal = Number(cliente.punto_conexion_id);
    const qn = [start], seen = new Set([start]);
    const prev = new Map(); // punto -> {prev, tramoId}
    let found = false;

    while (qn.length) {
      const u = qn.shift();
      if (u === goal) { found = true; break; }
      const adj = vecinos.get(u) || [];
      for (const {to, tramoId} of adj) {
        if (!seen.has(to)) {
          seen.add(to);
          prev.set(to, { prev: u, tramoId });
          qn.push(to);
        }
      }
    }
    if (!found) return res.status(404).json({ error: 'SIN_RUTA' });

    // 5) Reconstruir ruta (tramos y nodos ordenados)
    const tramoIds = [];
    const nodosRuta = [];
    let cur = goal;
    nodosRuta.push(cur);
    while (cur !== start) {
      const p = prev.get(cur);
      tramoIds.push(p.tramoId);
      cur = p.prev;
      nodosRuta.push(cur);
    }
    tramoIds.reverse();
    nodosRuta.reverse();

    // 6) Path continuo de coordenadas
    const coords = [];
    for (let i=0;i<tramoIds.length;i++) {
      const t = byId.get(tramoIds[i]);
      let seg = [];
      try { seg = JSON.parse(t.path_json) || []; } catch {}
      const dirOk = (t.a === nodosRuta[i] && t.b === nodosRuta[i+1]);
      if (!dirOk) seg = seg.slice().reverse();
      if (i>0 && seg.length) seg = seg.slice(1); // evitar duplicar vértice
      coords.push(...seg);
    }

    // 7) Derivaciones (tramos adyacentes a nodos de la ruta)
    const setRuta = new Set(tramoIds);
    const setNodos = new Set(nodosRuta);
    const deriv = tramos.filter(t =>
      !setRuta.has(t.id) && (setNodos.has(t.a) || setNodos.has(t.b))
    ).map(t => ({ id:t.id, nombre:t.nombre, path_json:t.path_json, color:t.color, weight:t.weight }));

    // 8) Detalles por TRAMO y por PUNTO para ese cliente (opcional)
    let detallePorTramo = {};
    if (tramoIds.length) {
      const [dt] = await pool.query(
        `SELECT tramo_id, cable, hilo, longitud_m, comentario
         FROM tramo_cliente_detalle
         WHERE cliente_id=? AND tramo_id IN (${tramoIds.map(()=>'?').join(',')})`,
        [cliente.id, ...tramoIds]
      );
      for (const d of dt) detallePorTramo[d.tramo_id] = d;
    }

    let detallePorPunto = {};
    if (nodosRuta.length) {
      const [dp] = await pool.query(
        `SELECT punto_id, hilo, cable, longitud_m, comentario
         FROM punto_cliente_detalle
         WHERE cliente_id=? AND punto_id IN (${nodosRuta.map(()=>'?').join(',')})`,
        [cliente.id, ...nodosRuta]
      );
      for (const d of dp) detallePorPunto[d.punto_id] = d;
    }

    res.json({
      cliente: { id: cliente.id, nombre: cliente.nombre, punto_conexion_id: cliente.punto_conexion_id },
      central_id: start,
      principal: { tramo_ids: tramoIds, nodos: nodosRuta, path: coords },
      derivaciones: deriv,
      detalle_por_tramo: detallePorTramo,
      detalle_por_punto: detallePorPunto
    });
  } catch (err) {
    console.error('RUTA_CLIENTE', err);
    res.status(500).json({ error: 'ERROR_RUTA_CLIENTE' });
  }
});

module.exports = router;
