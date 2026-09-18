// routes/ruta.js
// Router para "ruta" (lista + utilidades opcionales)

const express = require('express');
const router = express.Router();

// helper pequeño para enteros
const toInt = (v) => (v === undefined || v === null || v === '' ? null : Number(v));

/**
 * GET /api/ruta/list
 * Devuelve las filas para el buscador con los alias de la vista v_ruta_buscar
 * Campos: id_ruta, nombre_cliente, tarea, nombre_odf, nemonico_odf,
 *         puerto, nemonico_patcheo, puerto_patcheo,
 *         nemonico_equipo, marca, posicion, coordenadas
 */
router.get('/list', async (req, res) => {
  try {
    const pool = req.db || req.app.get('db') || req.pool;
    const [rows] = await pool.query(`
      SELECT id_ruta, nombre_cliente, tarea, nombre_odf, nemonico_odf,
             puerto, nemonico_patcheo, puerto_patcheo,
             nemonico_equipo, marca, posicion, coordenadas
      FROM v_ruta_buscar
      ORDER BY id_ruta DESC
    `);
    return res.json({ ok: true, rows });
  } catch (err) {
    console.error('[GET /api/ruta/list] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * (Opcional) PUT /api/ruta/:id/cliente-nombre
 * Permite actualizar el nombre del cliente desde la ruta concreta
 */
router.put('/:id/cliente-nombre', async (req, res) => {
  try {
    const idRuta = toInt(req.params.id);
    const nombre = String(req.body?.nombre || '').trim();
    if (!idRuta || !nombre) return res.status(400).json({ ok: false, error: 'DATOS_INVALIDOS' });

    const pool = req.db || req.app.get('db') || req.pool;
    const [r] = await pool.query(
      `UPDATE cliente
          SET nombre_cliente = ?
        WHERE id_cliente = (SELECT id_cliente FROM ruta WHERE id_ruta = ?)`,
      [nombre, idRuta]
    );
    if (r.affectedRows === 0) return res.status(404).json({ ok: false, error: 'NOT_FOUND' });
    return res.json({ ok: true, updated: r.affectedRows });
  } catch (err) {
    console.error('[PUT /api/ruta/:id/cliente-nombre] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

/**
 * (Opcional) DELETE /api/ruta/:id
 * Elimina la fila en ruta (con tus FKs en CASCADE esto no debe dar conflicto)
 */
router.delete('/:id', async (req, res) => {
  try {
    const idRuta = toInt(req.params.id);
    if (!idRuta) return res.status(400).json({ ok: false, error: 'ID_INVALIDO' });

    const pool = req.db || req.app.get('db') || req.pool;
    const [r] = await pool.query(`DELETE FROM ruta WHERE id_ruta=?`, [idRuta]);
    return res.json({ ok: true, deleted: r.affectedRows });
  } catch (err) {
    console.error('[DELETE /api/ruta/:id] error:', err);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
});

module.exports = router;

