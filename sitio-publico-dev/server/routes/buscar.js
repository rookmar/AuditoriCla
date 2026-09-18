// =========================================================================
// Archivo: server/routes/buscar.js
// Descripción: Búsqueda Dual y Separada (Visitas vs Recepciones GPON)
// =========================================================================
const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadDir = path.join(__dirname, "../../public/uploads/planos");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname) || '.pdf';
        cb(null, `plano_gpon_${req.body.id || 'new'}_${Date.now()}${ext}`);
    }
});
const upload = multer({ storage });

function getPool(req) { return req.db || req.app.get("db") || req.pool; }

/* ==============================
 * GET /filtros (Módulo Original)
 * ============================== */
router.get("/filtros", async (req, res) => {
  try {
    const pool = getPool(req);
    const [centrales] = await pool.query(`SELECT DISTINCT c.id, c.nombre_central, c.ID_central FROM central c JOIN ruta r ON r.id_central = c.id ORDER BY c.nombre_central`);
    const [odfs] = await pool.query(`SELECT DISTINCT o.nemonico_odf, o.puerto_odf AS puerto FROM odf o JOIN ruta r ON r.id_odf = o.id_odf ORDER BY o.nemonico_odf, o.puerto_odf`);
    res.json({ centrales, odfs });
  } catch (e) { res.json({ centrales: [], odfs: [] }); }
});

/* ==============================
 * GET /odfs (Dependientes de Central)
 * ============================== */
router.get("/odfs", async (req, res) => {
  try {
    const pool = getPool(req);
    const centralId = req.query.central_id;
    let query = `SELECT DISTINCT o.nemonico_odf, o.puerto_odf AS puerto FROM odf o JOIN ruta r ON r.id_odf = o.id_odf`;
    let params = [];
    if (centralId) {
        query += ` JOIN central c ON r.id_central = c.id WHERE c.id = ? OR c.nombre_central = ?`;
        params = [centralId, centralId];
    }
    query += ` ORDER BY o.nemonico_odf, o.puerto_odf`;
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (e) { res.json([]); }
});

/* ==============================
 * GET / (Búsqueda Principal + Expediente 360)
 * ============================== */
router.get("/", async (req, res) => {
  try {
    const pool = getPool(req);
    const q = (req.query.q || "").trim();
    const central = (req.query.central || "").trim();
    const odf = (req.query.odf || "").trim();
    
    let page = Math.max(parseInt(req.query.page) || 1, 1);
    let pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100); 
    const offset = (page - 1) * pageSize;

    let whereClauses = ["1=1"];
    let params = [];

    if (q) {
        const term = `%${q}%`;
        let subConditions = [
            `cl.nombre_cliente LIKE ?`, `cl.id_cliente_ext LIKE ?`, `c.nombre_central LIKE ?`, 
            `o.nemonico_odf LIKE ?`, `e.nemonico_equipo LIKE ?`, `p.nemonico_patcheo LIKE ?`
        ];
        params.push(term, term, term, term, term, term);
        if (!isNaN(q)) {
            subConditions.push(`cl.tarea = ?`, `o.puerto_odf = ?`, `p.puerto = ?`, `r.id_ruta = ?`);
            params.push(q, q, q, q);
        }
        whereClauses.push(`(${subConditions.join(" OR ")})`);
    }
    
    if (central) { 
        whereClauses.push(`(c.nombre_central = ? OR c.ID_central = ? OR c.id = ?)`); 
        params.push(central, central, central); 
    }
    if (odf) { 
        whereClauses.push(`o.nemonico_odf = ?`); 
        params.push(odf); 
    }

    const whereSql = whereClauses.join(" AND ");

    let total = 0;
    if (q === "" && central === "" && odf === "") {
        const [c] = await pool.query(`SELECT COUNT(id_ruta) as total FROM ruta`);
        total = c[0].total;
    } else {
        const [c] = await pool.query(`
             SELECT COUNT(r.id_ruta) as total 
             FROM ruta r 
             LEFT JOIN cliente cl ON r.id_cliente = cl.id_cliente 
             LEFT JOIN central c ON r.id_central = c.id 
             LEFT JOIN odf o ON r.id_odf = o.id_odf 
             LEFT JOIN patcheo p ON r.id_patcheo = p.id_patcheo 
             LEFT JOIN equipo e ON r.id_equipo = e.id_equipo 
             WHERE ${whereSql}`, params);
        total = c[0].total;
    }

    const dataParams = [...params, pageSize, offset];
    const [rows] = await pool.query(`
         SELECT 
            r.id_ruta, c.ID_central, c.nombre_central AS Nombre_Central, 
            cl.id_cliente, cl.nombre_cliente AS Cliente, cl.id_cliente_ext AS ID_Cliente, cl.tarea AS Tarea, 
            o.nombre_odf AS Nombre_ODF, o.nemonico_odf AS Nemonico_ODF, o.puerto_odf AS Puerto_ODF, o.distancia_optica AS Distancia_Optica, 
            p.nemonico_patcheo AS Nemonico_Patcheo, p.puerto AS Puerto_Patcheo, 
            e.nemonico_equipo AS Equipo, e.marca AS Marca, e.slot AS Slot, e.posicion AS Posicion,
            EXISTS(SELECT 1 FROM mapa_tramo mt WHERE mt.id_cliente = r.id_cliente) AS Tiene_Tramo
         FROM ruta r 
         LEFT JOIN cliente cl ON r.id_cliente = cl.id_cliente 
         LEFT JOIN central c ON r.id_central = c.id 
         LEFT JOIN odf o ON r.id_odf = o.id_odf 
         LEFT JOIN patcheo p ON r.id_patcheo = p.id_patcheo 
         LEFT JOIN equipo e ON r.id_equipo = e.id_equipo
         WHERE ${whereSql} 
         ORDER BY r.id_ruta DESC 
         LIMIT ? OFFSET ?`, dataParams);

    const idsClientes = rows.map(r => r.ID_Cliente).filter(id => id && String(id).trim() !== "");
    if (idsClientes.length > 0) {
        const [incidencias] = await pool.query(`SELECT id_incidencia, id_cliente_ext, fecha_registro, fecha_reparacion, dano_red, tipo_dano, tipo_solucion, reparado, tecnicos_atienden, motivo_no_reparacion FROM registro_incidencias WHERE id_cliente_ext IN (?) ORDER BY fecha_registro DESC`, [idsClientes]);
        rows.forEach(row => { row.incidencias = incidencias.filter(inc => String(inc.id_cliente_ext) === String(row.ID_Cliente)); });
    } else { rows.forEach(row => row.incidencias = []); }

    res.json({ items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (e) { res.status(500).json({ error: "Error en búsqueda general" }); }
});

/* ==============================
 * GET /recepciones (Búsqueda GPON Unificada Inteligente)
 * ============================== */
router.get("/recepciones", async (req, res) => {
    try {
      const pool = getPool(req);
      const q = (req.query.q || "").trim();
      let page = Math.max(parseInt(req.query.page) || 1, 1);
      let pageSize = Math.min(Math.max(parseInt(req.query.pageSize) || 10, 1), 100); 
      const offset = (page - 1) * pageSize;
  
      let whereClauses = ["1=1"];
      let params = [];
  
      if (q) {
          const term = `%${q}%`;
          whereClauses.push(`(visual_ubicacion LIKE ? OR visual_referencia LIKE ? OR visual_tecnico LIKE ? OR visual_auditor LIKE ? OR raw_distrito LIKE ?)`);
          params.push(term, term, term, term, term);
      }
      const whereSql = whereClauses.join(" AND ");
  
      const unionQuery = `
          SELECT 
              id, 'RECEPCIÓN' AS tipo_recepcion, 
              lugar_general AS visual_ubicacion, ubicacion_fdh AS visual_referencia, 
              entrega AS visual_tecnico, recepciona AS visual_auditor, plano_pdf AS archivo_pdf, fecha AS fecha_registro,
              
              tipo_red, distrito AS raw_distrito, lugar_general AS raw_lugar, ubicacion_fdh AS raw_fdh, entrega AS raw_entrega, recepciona AS raw_recibe,
              NULL AS raw_tecnico, NULL AS raw_asesor, NULL AS raw_contrata, NULL AS raw_direccion, NULL AS raw_observaciones, NULL AS raw_latitud, NULL AS raw_longitud,
              estado, motivo_pendiente
          FROM mod_recepcion_master
          
          UNION ALL
          
          SELECT 
              id, 'VISITA TÉCNICA' AS tipo_recepcion, 
              direccion AS visual_ubicacion, contrata AS visual_referencia, 
              tecnico AS visual_tecnico, asesor AS visual_auditor, NULL AS archivo_pdf, fecha AS fecha_registro,

              NULL AS tipo_red, NULL AS raw_distrito, NULL AS raw_lugar, NULL AS raw_fdh, NULL AS raw_entrega, NULL AS raw_recibe,
              tecnico AS raw_tecnico, asesor AS raw_asesor, contrata AS raw_contrata, direccion AS raw_direccion, observaciones AS raw_observaciones, latitud AS raw_latitud, longitud AS raw_longitud,
              NULL AS estado, NULL AS motivo_pendiente
          FROM mod_visitas
      `;
  
      const countQuery = `SELECT COUNT(*) as total FROM (${unionQuery}) AS gpon_data WHERE ${whereSql}`;
      const [c] = await pool.query(countQuery, params);
      const total = c[0].total;
  
      const dataParams = [...params, pageSize, offset];
      const dataQuery = `SELECT * FROM (${unionQuery}) AS gpon_data WHERE ${whereSql} ORDER BY fecha_registro DESC LIMIT ? OFFSET ?`;
      const [rows] = await pool.query(dataQuery, dataParams);
  
      res.json({ items: rows, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
    } catch (e) { 
        console.error("Error GPON:", e);
        res.json({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 0 }); 
    }
});

/* ==============================
 * DELETE /recepciones/:id (Eliminación Segura en Cascada)
 * ============================== */
router.delete("/recepciones/:id", async (req, res) => {
    try {
        const pool = getPool(req);
        const { id } = req.params;
        const { tipo } = req.query;

        if (!id || !tipo) return res.status(400).json({ error: "Faltan parámetros." });

        if (tipo === 'VISITA TÉCNICA') {
            await pool.execute("DELETE FROM mod_visitas WHERE id = ?", [id]);
        } else {
            await pool.execute("DELETE FROM mod_recepcion_medicion WHERE elemento_id IN (SELECT id FROM mod_recepcion_elemento WHERE master_id = ?)", [id]);
            await pool.execute("DELETE FROM mod_recepcion_elemento WHERE master_id = ?", [id]);
            await pool.execute("DELETE FROM mod_recepcion_master WHERE id = ?", [id]);
        }
        res.json({ ok: true });
    } catch (e) {
        console.error("Error al eliminar:", e);
        res.status(500).json({ error: "Error interno al borrar el registro." });
    }
});

/* ==============================
 * POST /recepciones/upload (Subir Plano As-Built y dar Alta)
 * ============================== */
router.post("/recepciones/upload", upload.single("plano"), async (req, res) => {
    try {
        const pool = getPool(req);
        const id = req.body.id;
        
        if (!id || !req.file) return res.status(400).json({ error: "Faltan datos o el archivo." });

        const filePath = `/uploads/planos/${req.file.filename}`;
        await pool.execute("UPDATE mod_recepcion_master SET plano_pdf = ?, estado = 'Alta', motivo_pendiente = NULL WHERE id = ?", [filePath, id]);
        
        res.json({ ok: true, path: filePath });
    } catch (e) {
        console.error("Error al subir plano:", e);
        res.status(500).json({ error: "Error interno al procesar el PDF." });
    }
});

/* ==============================
 * POST /recepciones/pendiente (Marcar distrito con pendiente)
 * ============================== */
router.post("/recepciones/pendiente", async (req, res) => {
    try {
        const pool = getPool(req);
        const { id, motivo } = req.body;
        
        if (!id || !motivo) return res.status(400).json({ error: "Faltan datos." });

        await pool.execute("UPDATE mod_recepcion_master SET estado = 'Pendiente', motivo_pendiente = ? WHERE id = ?", [motivo, id]);
        
        res.json({ ok: true });
    } catch (e) {
        console.error("Error al marcar pendiente:", e);
        res.status(500).json({ error: "Error interno al actualizar estado." });
    }
});

module.exports = router;