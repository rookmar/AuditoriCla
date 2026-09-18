// ============================================================================
// ARCHIVO: server/routes/incidencia.js
// Descripción: Controlador Operativo (Guardar tickets en campo y buscar clientes)
// ============================================================================

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); 
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 1. Crear carpeta de fotos si no existe
const uploadDir = path.join(__dirname, '../../public/uploads/incidencias');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 2. Configurar almacenamiento de fotos
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, `INC-${Date.now()}${path.extname(file.originalname)}`);
    }
});
const upload = multer({ storage });

// 3. Buscar cliente e historial de reincidencias
router.get('/buscar-cliente', async (req, res) => {
    const { q } = req.query;
    try {
        const [clientes] = await pool.query(
            "SELECT id_cliente_ext, nombre_cliente FROM cliente WHERE id_cliente_ext LIKE ? OR nombre_cliente LIKE ? LIMIT 5",
            [`%${q}%`, `%${q}%`]
        );

        const [reincidencias] = await pool.query(
            "SELECT COUNT(*) as total FROM registro_incidencias WHERE id_cliente_ext = ? AND fecha_registro > DATE_SUB(NOW(), INTERVAL 30 DAY)",
            [q]
        );

        res.json({ ok: true, clientes, reincidencia: reincidencias[0].total });
    } catch (e) { 
        console.error("Error buscando cliente:", e);
        res.status(500).json({ ok: false, error: e.message }); 
    }
});

// 4. Guardar el ticket (Operación de Campo)
router.post('/guardar', upload.single('foto'), async (req, res) => {
    const { 
        fecha_reparacion, area_trabajo, n_falla, tecnicos_atienden, 
        id_cliente_ext, nombre_cliente_manual, direccion_cliente, 
        dano_red, nodo, tecnologia, tipo_dano, tipo_solucion, 
        reparado, motivo_no_reparacion, material_utilizado, 
        red_alterna, nombre_red_alterna, lat, lng, notas_tecnico 
    } = req.body;
    
    const foto = req.file ? req.file.filename : null;
    const tecnico_auditoria = req.session?.user?.nombre || req.session?.user?.usuario || 'Sistema';

    try {
        await pool.query(
            `INSERT INTO registro_incidencias 
            (
                fecha_reparacion, tecnicos_atienden, n_falla, id_cliente_ext, 
                nombre_cliente_manual, direccion_cliente, dano_red, nodo, 
                area_trabajo, tecnologia, tipo_dano, tipo_solucion, 
                reparado, motivo_no_reparacion, red_alterna, nombre_red_alterna, 
                lat, lng, material_utilizado, foto_evidencia, tecnico, notas_tecnico
            ) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                fecha_reparacion || null, tecnicos_atienden || null, n_falla, 
                id_cliente_ext || null, nombre_cliente_manual || null, direccion_cliente || null, 
                dano_red || null, nodo || null, area_trabajo || null, tecnologia || null, 
                tipo_dano || null, tipo_solucion || null, reparado || 0, 
                motivo_no_reparacion || null, red_alterna || 0, nombre_red_alterna || null, 
                lat || null, lng || null, material_utilizado || null, foto, tecnico_auditoria, notas_tecnico || null
            ]
        );
        res.json({ ok: true, mensaje: "Incidencia registrada correctamente" });
    } catch (e) { 
        console.error("Error guardando incidencia en BD:", e);
        res.status(500).json({ ok: false, error: "Error en base de datos: " + e.message }); 
    }
});

module.exports = router;