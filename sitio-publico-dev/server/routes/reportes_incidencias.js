// ============================================================================
// ARCHIVO: server/routes/reportes_incidencias.js
// Descripción: Controlador Analítico (Exclusivo para Dashboards y Estadísticas)
// ============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); 

router.get('/estadisticas', async (req, res) => {
    const { desde, hasta, q } = req.query;

    let whereClauses = ["1=1"];
    let params = [];

    // Filtros de fecha
    if (desde) { whereClauses.push("fecha_reparacion >= ?"); params.push(desde); }
    if (hasta) { whereClauses.push("fecha_reparacion <= ?"); params.push(hasta); }

    // Buscador Inteligente
    if (q && q.trim() !== "") {
        const term = `%${q.trim()}%`;
        whereClauses.push(`(
            id_cliente_ext LIKE ? OR nombre_cliente_manual LIKE ? OR 
            tecnicos_atienden LIKE ? OR nodo LIKE ? OR tipo_dano LIKE ? OR 
            tipo_solucion LIKE ? OR n_falla LIKE ?
        )`);
        params.push(term, term, term, term, term, term, term);
    }

    const whereSql = whereClauses.join(" AND ");

    try {
        const [redes] = await pool.query(`SELECT dano_red, COUNT(*) as total FROM registro_incidencias WHERE ${whereSql} AND dano_red IS NOT NULL AND dano_red != '' GROUP BY dano_red`, params);
        const [nodos] = await pool.query(`SELECT nodo, COUNT(*) as total FROM registro_incidencias WHERE ${whereSql} AND nodo IS NOT NULL AND nodo != '' GROUP BY nodo ORDER BY total DESC LIMIT 5`, params);
        const [efectividad] = await pool.query(`SELECT reparado, COUNT(*) as total FROM registro_incidencias WHERE ${whereSql} GROUP BY reparado`, params);
        const [danos] = await pool.query(`SELECT tipo_dano, COUNT(*) as total FROM registro_incidencias WHERE ${whereSql} AND tipo_dano IS NOT NULL AND tipo_dano != '' GROUP BY tipo_dano ORDER BY total DESC LIMIT 6`, params);
        const [reincidentes] = await pool.query(`SELECT id_cliente_ext, nombre_cliente_manual, COUNT(*) as total_fallas FROM registro_incidencias WHERE ${whereSql} AND id_cliente_ext IS NOT NULL AND id_cliente_ext != '' GROUP BY id_cliente_ext, nombre_cliente_manual HAVING total_fallas > 1 ORDER BY total_fallas DESC LIMIT 15`, params);
        
        const [tickets] = await pool.query(`SELECT id_incidencia, fecha_reparacion, area_trabajo, n_falla, tecnicos_atienden, id_cliente_ext, nombre_cliente_manual, direccion_cliente, dano_red, nodo, tecnologia, tipo_dano, tipo_solucion, reparado, motivo_no_reparacion, red_alterna, nombre_red_alterna, lat, lng, material_utilizado, tecnico FROM registro_incidencias WHERE ${whereSql} ORDER BY id_incidencia DESC`, params);

        res.json({ ok: true, data: { redes, nodos, efectividad, danos, reincidentes, tickets } });
    } catch (error) {
        console.error("Error obteniendo estadísticas:", error);
        res.status(500).json({ ok: false, error: "Error interno en DB: " + error.message });
    }
});

module.exports = router;