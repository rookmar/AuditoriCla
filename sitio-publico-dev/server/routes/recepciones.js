// =========================================================================
// Archivo: server/routes/recepciones.js
// Descripción: Backend para Guardar y Editar Visitas y Recepciones GPON
// =========================================================================
const express = require("express");
const router = express.Router();

function getPool(req) { return req.db || req.app.get("db") || req.pool; }

// =========================================================
// MÓDULO VISITAS TÉCNICAS
// =========================================================

// 1. Crear Visita
router.post("/visitas", async (req, res) => {
    try {
        const pool = getPool(req);
        // NUEVO: Agregamos area_trabajo al destructuring del body
        const { tecnico, asesor, contrata, lat, lng, direccion, observaciones, foto_bitacora, area_trabajo } = req.body;
        
        // NUEVO: Agregamos el campo a la consulta y su respectivo símbolo de interrogación
        const query = `INSERT INTO mod_visitas (tecnico, asesor, contrata, latitud, longitud, direccion, observaciones, foto_bitacora, area_trabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        // NUEVO: Pasamos la variable al execute (usamos || null por si envían sin seleccionar)
        await pool.execute(query, [tecnico, asesor, contrata, lat, lng, direccion, observaciones, foto_bitacora || null, area_trabajo || null]);
        
        res.json({ ok: true });
    } catch (error) { 
        console.error("Error en POST /visitas:", error);
        res.status(500).json({ error: "Error al guardar la visita." }); 
    }
});

// 2. Obtener Visita para Editar
router.get("/visitas/:id", async (req, res) => {
    try {
        const [rows] = await getPool(req).execute("SELECT * FROM mod_visitas WHERE id = ?", [req.params.id]);
        res.json(rows[0] || {});
    } catch (error) { res.status(500).json({ error: "Error al obtener visita." }); }
});

// 3. Actualizar Visita
router.put("/visitas/:id", async (req, res) => {
    try {
        // NUEVO: Agregamos area_trabajo al destructuring
        const { tecnico, asesor, contrata, lat, lng, direccion, observaciones, foto_bitacora, area_trabajo } = req.body;
        
        // NUEVO: Agregamos area_trabajo al SET de la consulta
        const query = `UPDATE mod_visitas SET tecnico=?, asesor=?, contrata=?, latitud=?, longitud=?, direccion=?, observaciones=?, foto_bitacora=?, area_trabajo=? WHERE id=?`;
        
        // NUEVO: Pasamos la variable al execute antes del ID
        await getPool(req).execute(query, [tecnico, asesor, contrata, lat, lng, direccion, observaciones, foto_bitacora || null, area_trabajo || null, req.params.id]);
        
        res.json({ ok: true });
    } catch (error) { 
        console.error("Error en PUT /visitas:", error);
        res.status(500).json({ error: "Error al actualizar la visita." }); 
    }
});


// =========================================================
// MÓDULO RECEPCIONES GPON
// =========================================================

// 1. Crear Recepción (INCLUYE MANEJO DE ESTADO - BORRADOR / EN REVISIÓN)
router.post("/recepciones", async (req, res) => {
    try {
        const pool = getPool(req);
        // NUEVO: Agregamos area_trabajo al destructuring
        const { tipo_red, distrito, ubicacion_fdh, lugar_general, recepciona, entrega, estado, elementos, area_trabajo } = req.body;
        
        const estadoFinal = estado || 'En Revisión';

        // NUEVO: Agregamos area_trabajo al INSERT de la tabla master
        const masterQuery = `INSERT INTO mod_recepcion_master (tipo_red, distrito, ubicacion_fdh, lugar_general, recepciona, entrega, estado, area_trabajo) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        const [masterResult] = await pool.execute(masterQuery, [tipo_red, distrito, ubicacion_fdh, lugar_general, recepciona, entrega, estadoFinal, area_trabajo || null]);
        const masterId = masterResult.insertId;

        if (elementos && elementos.length > 0) {
            for (const el of elementos) {
                const elQuery = `INSERT INTO mod_recepcion_elemento (master_id, identificacion, slot_puerto, vel_5g_dl, vel_5g_ul, observacion) VALUES (?, ?, ?, ?, ?, ?)`;
                const valDL = el.vel_dl ? parseFloat(el.vel_dl) : null;
                const valUL = el.vel_ul ? parseFloat(el.vel_ul) : null;

                const [elResult] = await pool.execute(elQuery, [masterId, el.identificacion, el.slot_puerto, valDL, valUL, el.observacion]);
                const elId = elResult.insertId;

                if (el.mediciones && el.mediciones.length > 0) {
                    for (const med of el.mediciones) {
                        const medQuery = `INSERT INTO mod_recepcion_medicion (elemento_id, puerto_hilo, potencia_1310, potencia_1550) VALUES (?, ?, ?, ?)`;
                        const p13 = med.p1310 ? parseFloat(med.p1310) : null;
                        const p15 = med.p1550 ? parseFloat(med.p1550) : null;
                        await pool.execute(medQuery, [elId, med.puerto, p13, p15]);
                    }
                }
            }
        }
        res.json({ ok: true, id: masterId });
    } catch (error) { console.error(error); res.status(500).json({ error: "Error al guardar la recepción." }); }
});

// 2. Obtener Recepción Completa para Editar o Ver
router.get("/recepciones/:id", async (req, res) => {
    try {
        const pool = getPool(req);
        const [master] = await pool.execute("SELECT * FROM mod_recepcion_master WHERE id = ?", [req.params.id]);
        if (!master.length) return res.status(404).json({ error: "No existe" });
        
        const data = master[0];
        const [elementos] = await pool.execute("SELECT * FROM mod_recepcion_elemento WHERE master_id = ?", [req.params.id]);
        
        for(let el of elementos) {
            const [mediciones] = await pool.execute("SELECT * FROM mod_recepcion_medicion WHERE elemento_id = ?", [el.id]);
            el.mediciones = mediciones;
        }
        data.elementos = elementos;
        res.json(data);
    } catch (error) { res.status(500).json({ error: "Error al obtener recepción." }); }
});

// 3. Actualizar Recepción (Destruir y Reconstruir + Actualizar Estado)
router.put("/recepciones/:id", async (req, res) => {
    try {
        const pool = getPool(req);
        const id = req.params.id;
        // NUEVO: Agregamos area_trabajo al destructuring
        const { tipo_red, distrito, ubicacion_fdh, lugar_general, recepciona, entrega, estado, elementos, area_trabajo } = req.body;
        
        const estadoFinal = estado || 'En Revisión';

        // NUEVO: Agregamos area_trabajo al UPDATE de la tabla master
        await pool.execute(`UPDATE mod_recepcion_master SET tipo_red=?, distrito=?, ubicacion_fdh=?, lugar_general=?, recepciona=?, entrega=?, estado=?, area_trabajo=? WHERE id=?`, 
            [tipo_red, distrito, ubicacion_fdh, lugar_general, recepciona, entrega, estadoFinal, area_trabajo || null, id]);

        await pool.execute("DELETE FROM mod_recepcion_medicion WHERE elemento_id IN (SELECT id FROM mod_recepcion_elemento WHERE master_id = ?)", [id]);
        await pool.execute("DELETE FROM mod_recepcion_elemento WHERE master_id = ?", [id]);

        if (elementos && elementos.length > 0) {
            for (const el of elementos) {
                const elQuery = `INSERT INTO mod_recepcion_elemento (master_id, identificacion, slot_puerto, vel_5g_dl, vel_5g_ul, observacion) VALUES (?, ?, ?, ?, ?, ?)`;
                const valDL = el.vel_dl ? parseFloat(el.vel_dl) : null;
                const valUL = el.vel_ul ? parseFloat(el.vel_ul) : null;
                const [elResult] = await pool.execute(elQuery, [id, el.identificacion, el.slot_puerto, valDL, valUL, el.observacion]);
                const elId = elResult.insertId;

                if (el.mediciones && el.mediciones.length > 0) {
                    for (const med of el.mediciones) {
                        const medQuery = `INSERT INTO mod_recepcion_medicion (elemento_id, puerto_hilo, potencia_1310, potencia_1550) VALUES (?, ?, ?, ?)`;
                        const p13 = med.p1310 ? parseFloat(med.p1310) : null;
                        const p15 = med.p1550 ? parseFloat(med.p1550) : null;
                        await pool.execute(medQuery, [elId, med.puerto, p13, p15]);
                    }
                }
            }
        }
        res.json({ ok: true, id: id });
    } catch (error) { console.error(error); res.status(500).json({ error: "Error al actualizar la recepción." }); }
});

// 4. NUEVA RUTA RÁPIDA: APROBAR (ALTA)
router.post("/recepciones/aprobar/:id", async (req, res) => {
    try {
        const pool = getPool(req);
        await pool.execute("UPDATE mod_recepcion_master SET estado = 'Alta', motivo_pendiente = NULL WHERE id = ?", [req.params.id]);
        res.json({ ok: true });
    } catch (error) { 
        console.error(error); 
        res.status(500).json({ error: "Error al aprobar la recepción." }); 
    }
});

module.exports = router;