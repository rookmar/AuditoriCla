// =========================================================================
// Archivo: server/routes/mufas.js
// Descripción: Endpoints del Servidor para la Matriz de Empalmes y Fibras
// =========================================================================

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// Helpers de limpieza de datos
const vstr = (s) => (s === undefined || s === null ? null : String(s).trim() || null);
const vint = (s) => (Number.isFinite(Number(s)) ? Number(s) : null);
function getPool(req) { return req.db || req.app.get("db") || req.pool || pool; }

// --- 1. OBTENER MUFAS DE UN PUNTO (POSTE O POZO) ---
router.get("/punto/:id_punto", async (req, res) => {
  const db = getPool(req);
  const idPunto = vint(req.params.id_punto);
  try {
    const [rows] = await db.execute(
      "SELECT id_mufa, id_punto, nombre_mufa FROM mufas WHERE id_punto = ?", 
      [idPunto]
    );
    res.json({ ok: true, mufas: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- 2. INICIALIZAR NUEVA MUFA EN UN NODO ---
router.post("/", async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  try {
    const [ins] = await db.execute(
      "INSERT INTO mufas (id_punto, nombre_mufa) VALUES (?, ?)",
      [vint(b.id_punto), vstr(b.nombre_mufa) || "Mufa Principal"]
    );
    res.json({ ok: true, id_mufa: ins.insertId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- 3. LEER CHAQUETAS DE CABLES EN UNA MUFA ---
router.get("/:id_mufa/cables", async (req, res) => {
  const db = getPool(req);
  const idMufa = vint(req.params.id_mufa);
  try {
    const [rows] = await db.execute(
      "SELECT id_cable_mufa, id_mufa, etiqueta_identificador, datos_chaqueta, capacidad_hilos, tipo_cable FROM mufa_cables WHERE id_mufa = ?",
      [idMufa]
    );
    res.json({ ok: true, cables: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- 4. REGISTRAR ENTRADA DE CABLE FÍSICO A LA MUFA ---
router.post("/cables", async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  try {
    const [ins] = await db.execute(
      "INSERT INTO mufa_cables (id_mufa, etiqueta_identificador, datos_chaqueta, capacidad_hilos, tipo_cable) VALUES (?, ?, ?, ?, ?)",
      [vint(b.id_mufa), vstr(b.etiqueta_identificador), vstr(b.datos_chaqueta), vint(b.capacidad_hilos), vstr(b.tipo_cable)]
    );
    res.json({ ok: true, id_cable_mufa: ins.insertId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- 5. LEER RADIOGRAFÍA / MATRIZ DE FUSIONES DE HILOS ---
router.get("/:id_mufa/matriz", async (req, res) => {
  const db = getPool(req);
  const idMufa = vint(req.params.id_mufa);
  try {
    const query = `
      SELECT f.id_fusion, f.id_mufa, f.tubo_origen, f.hilo_origen, f.tubo_destino, f.hilo_destino, f.atenuacion_db, f.observacion_fusion,
             c1.etiqueta_identificador AS origen_cable,
             c2.etiqueta_identificador AS destino_cable,
             cl.nombre_cliente
      FROM mufa_fusiones f
      LEFT JOIN mufa_cables c1 ON f.id_cable_origen = c1.id_cable_mufa
      LEFT JOIN mufa_cables c2 ON f.id_cable_destino = c2.id_cable_mufa
      LEFT JOIN cliente cl ON f.id_cliente_assigned = cl.id_cliente
      WHERE f.id_mufa = ?
      ORDER BY f.id_fusion ASC
    `;
    const [rows] = await db.execute(query, [idMufa]);
    res.json({ ok: true, fusiones: rows });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- 6. REGISTRAR NUEVA FUSIÓN (SOLDADURA DE HILOS) ---
router.post("/fusiones", async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  try {
    const [ins] = await db.execute(
      `INSERT INTO mufa_fusiones (id_mufa, id_cable_origen, tubo_origen, hilo_origen, id_cable_destino, tubo_destino, hilo_destino, atenuacion_db, id_cliente_assigned, observacion_fusion) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vint(b.id_mufa), vint(b.id_cable_origen), vstr(b.tubo_origen), vstr(b.hilo_origen),
        vint(b.id_cable_destino), vstr(b.tubo_destino), vstr(b.hilo_destino),
        b.atenuacion_db || null, vint(b.id_cliente_asignado), vstr(b.observacion_fusion)
      ]
    );
    res.json({ ok: true, id_fusion: ins.insertId });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

// --- 7. ELIMINAR / DESHACER UN EMPALME DE HILOS ---
router.delete("/fusiones/:id(\\d+)", async (req, res) => {
  const db = getPool(req);
  const id = Number(req.params.id);
  try {
    await db.execute("DELETE FROM mufa_fusiones WHERE id_fusion = ?", [id]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

module.exports = router; 