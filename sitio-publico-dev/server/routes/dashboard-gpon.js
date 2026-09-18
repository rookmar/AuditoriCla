/**
 * ============================================================================
 * ARCHIVO: server/routes/dashboard-gpon.js
 * DESCRIPCIÓN: API REST para el Dashboard GPON.
 * INCLUYE: Filtro de Área de Trabajo integrado en todas las métricas.
 * ============================================================================
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db'); 

const REGEX_SEPARADORES = /\/|,|-|\s+y\s+|\s+e\s+/i;

function procesarRankingInteligente(filas, columna) {
    const conteo = {};
    filas.forEach(fila => {
        if (!fila[columna]) return;
        const partes = String(fila[columna]).split(REGEX_SEPARADORES);
        partes.forEach(parte => {
            const nombreLimpio = parte.trim().toUpperCase();
            if (nombreLimpio !== '') {
                conteo[nombreLimpio] = (conteo[nombreLimpio] || 0) + 1;
            }
        });
    });

    return Object.keys(conteo)
        .map(nombre => ({ nombre, total: conteo[nombre] }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 5);
}

/**
 * 1. ENDPOINT: GET /api/dashboard-gpon/stats
 */
router.get('/stats', async (req, res) => {
    try {
        // NUEVO: Recibimos el parámetro 'area'
        const { fechaInicio, fechaFin, tecnico, asesor, area } = req.query;

        // NUEVO: Validamos si existe algún filtro activo incluyendo 'area'
        const hayFiltro = Boolean(
            (fechaInicio && fechaInicio.trim() !== '') ||
            (fechaFin && fechaFin.trim() !== '') ||
            (tecnico && tecnico.trim() !== '') ||
            (asesor && asesor.trim() !== '') ||
            (area && area.trim() !== '')
        );

        const [listaTecnicosRaw] = await pool.query(`SELECT tecnico FROM mod_visitas WHERE tecnico IS NOT NULL AND TRIM(tecnico) != ''`);
        const [listaAsesoresRaw] = await pool.query(`SELECT asesor FROM mod_visitas WHERE asesor IS NOT NULL AND TRIM(asesor) != ''`);
        
        const setTecnicos = new Set();
        listaTecnicosRaw.forEach(r => String(r.tecnico).split(REGEX_SEPARADORES).forEach(n => { if (n.trim()) setTecnicos.add(n.trim().toUpperCase()); }));
        
        const setAsesores = new Set();
        listaAsesoresRaw.forEach(r => String(r.asesor).split(REGEX_SEPARADORES).forEach(n => { if (n.trim()) setAsesores.add(n.trim().toUpperCase()); }));

        const opcionesFiltro = {
            tecnicos: Array.from(setTecnicos).sort(),
            asesores: Array.from(setAsesores).sort()
        };

        if (!hayFiltro) {
            return res.json({
                success: true,
                kpis: { visitas: 0, recepcionesTotales: 0, aprobadas: 0, pendientes: 0 },
                rankings: { tecnicos: [], asesores: [], auditores: [] },
                graficos: { visitas: [], recepciones: [] },
                opcionesFiltro
            });
        }

        const fInicio = fechaInicio ? `${fechaInicio} 00:00:00` : `2000-01-01 00:00:00`;
        const fFin = fechaFin ? `${fechaFin} 23:59:59` : `2099-12-31 23:59:59`;

        const filtroTecnico = tecnico && tecnico.trim() !== '' ? tecnico.trim() : null;
        const filtroAsesor = asesor && asesor.trim() !== '' ? asesor.trim() : null;
        // NUEVO: Variable para Área
        const filtroArea = area && area.trim() !== '' ? area.trim() : null;

        // CONSTRUCCIÓN DE CONSULTA PARA VISITAS
        let whereVisitas = `WHERE fecha >= ? AND fecha <= ?`;
        let paramsVisitas = [fInicio, fFin];
        if (filtroTecnico) {
            whereVisitas += ` AND UPPER(tecnico) LIKE UPPER(?)`;
            paramsVisitas.push(`%${filtroTecnico}%`); 
        }
        if (filtroAsesor) {
            whereVisitas += ` AND UPPER(asesor) LIKE UPPER(?)`;
            paramsVisitas.push(`%${filtroAsesor}%`);
        }
        // NUEVA REGLA: Filtro de Área
        if (filtroArea) {
            whereVisitas += ` AND UPPER(area_trabajo) = UPPER(?)`;
            paramsVisitas.push(filtroArea);
        }

        // CONSTRUCCIÓN DE CONSULTA PARA RECEPCIONES
        let whereRecepciones = `WHERE fecha >= ? AND fecha <= ?`;
        let paramsRecepciones = [fInicio, fFin];
        if (filtroTecnico) {
            whereRecepciones += ` AND UPPER(entrega) LIKE UPPER(?)`;
            paramsRecepciones.push(`%${filtroTecnico}%`);
        }
        if (filtroAsesor) {
            whereRecepciones += ` AND UPPER(recepciona) LIKE UPPER(?)`;
            paramsRecepciones.push(`%${filtroAsesor}%`);
        }
        // NUEVA REGLA: Filtro de Área
        if (filtroArea) {
            whereRecepciones += ` AND UPPER(area_trabajo) = UPPER(?)`;
            paramsRecepciones.push(filtroArea);
        }

        const [visitasMes] = await pool.query(`SELECT COUNT(*) AS total FROM mod_visitas ${whereVisitas}`, paramsVisitas);
        const [recepcionesTotales] = await pool.query(`SELECT COUNT(*) AS total FROM mod_recepcion_master ${whereRecepciones}`, paramsRecepciones);
        const [recepcionesAprobadas] = await pool.query(`SELECT COUNT(*) AS total FROM mod_recepcion_master ${whereRecepciones} AND (estado = 'Aprobado' OR estado = 'Finalizado' OR estado = 'Alta')`, paramsRecepciones);
        const [recepcionesPendientes] = await pool.query(`SELECT COUNT(*) AS total FROM mod_recepcion_master ${whereRecepciones} AND (estado LIKE '%Revisin%' OR estado LIKE '%Pendiente%')`, paramsRecepciones);

        const [visitasRaw] = await pool.query(`SELECT tecnico, asesor FROM mod_visitas ${whereVisitas}`, paramsVisitas);
        const [recepcionesRaw] = await pool.query(`SELECT recepciona FROM mod_recepcion_master ${whereRecepciones}`, paramsRecepciones);

        const topTecnicos = procesarRankingInteligente(visitasRaw, 'tecnico');
        const topAsesores = procesarRankingInteligente(visitasRaw, 'asesor');
        const topAuditores = procesarRankingInteligente(recepcionesRaw, 'recepciona');

        const [visitasTendencia] = await pool.query(
            `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha_str, COUNT(*) AS total FROM mod_visitas ${whereVisitas} GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d') ORDER BY fecha_str ASC`, paramsVisitas
        );
        const [recepcionesTendencia] = await pool.query(
            `SELECT DATE_FORMAT(fecha, '%Y-%m-%d') AS fecha_str, COUNT(*) AS total FROM mod_recepcion_master ${whereRecepciones} GROUP BY DATE_FORMAT(fecha, '%Y-%m-%d') ORDER BY fecha_str ASC`, paramsRecepciones
        );

        res.json({
            success: true,
            kpis: { visitas: visitasMes[0]?.total || 0, recepcionesTotales: recepcionesTotales[0]?.total || 0, aprobadas: recepcionesAprobadas[0]?.total || 0, pendientes: recepcionesPendientes[0]?.total || 0 },
            rankings: { tecnicos: topTecnicos, asesores: topAsesores, auditores: topAuditores },
            graficos: { visitas: visitasTendencia, recepciones: recepcionesTendencia },
            opcionesFiltro
        });
    } catch (error) {
        console.error("[Dashboard GPON] Error Stats:", error);
        res.status(500).json({ success: false, message: "Error interno del servidor" });
    }
});

/**
 * 2. ENDPOINT: GET /api/dashboard-gpon/export
 */
router.get('/export', async (req, res) => {
    try {
        // NUEVO: Agregamos area a la extracción
        const { fechaInicio, fechaFin, tecnico, asesor, area } = req.query;
        
        const fInicio = fechaInicio ? `${fechaInicio} 00:00:00` : `2000-01-01 00:00:00`;
        const fFin = fechaFin ? `${fechaFin} 23:59:59` : `2099-12-31 23:59:59`;

        let wV = `WHERE fecha >= ? AND fecha <= ?`;
        let wR = `WHERE fecha >= ? AND fecha <= ?`;
        let pV = [fInicio, fFin], pR = [fInicio, fFin];

        if (tecnico) { 
            wV += ` AND UPPER(tecnico) LIKE UPPER(?)`; pV.push(`%${tecnico}%`); 
            wR += ` AND UPPER(entrega) LIKE UPPER(?)`; pR.push(`%${tecnico}%`); 
        }
        if (asesor) { 
            wV += ` AND UPPER(asesor) LIKE UPPER(?)`; pV.push(`%${asesor}%`); 
            wR += ` AND UPPER(recepciona) LIKE UPPER(?)`; pR.push(`%${asesor}%`); 
        }
        // NUEVO: Filtro en el Excel
        if (area) {
            wV += ` AND UPPER(area_trabajo) = UPPER(?)`; pV.push(area.trim());
            wR += ` AND UPPER(area_trabajo) = UPPER(?)`; pR.push(area.trim());
        }

        const [visitas] = await pool.query(`SELECT * FROM mod_visitas ${wV} ORDER BY fecha DESC`, pV);
        const [recepciones] = await pool.query(`SELECT * FROM mod_recepcion_master ${wR} ORDER BY fecha DESC`, pR);

        res.json({ success: true, visitas, recepciones });
    } catch (error) {
        console.error("[Dashboard GPON] Error Export:", error);
        res.status(500).json({ success: false });
    }
});

module.exports = router;