// =========================================================================
// Archivo: public/js/mapa.js
// Versión: 5.0
// Descripción: Control del mapa operativo del técnico. Incluye auto-trazado 
// dinámico vía URL, popups interactivos para detalles de cables (tramos) 
// y previsualización de evidencia fotográfica en postes/pozos.
// =========================================================================
const express = require("express");
const router = express.Router();
const { pool } = require("../db");

const vint = (s) => (Number.isFinite(Number(s)) ? Number(s) : null);

/* =========================================================================
   ======================  MAPA OPERATIVO (TÉCNICOS)  ======================
   ========================================================================= */

// --- LEER PUNTOS (Con datos de auditoría si existen) ---
router.get("/puntos", async (req, res) => {
  const db = req.db || pool;
  const clienteId = vint(req.query.cliente_id);

  try {
    // Traemos todos los puntos, y cruzamos 'p.foto' y los datos de auditoría
    let query = `
      SELECT 
          p.id_punto AS id, p.lat, p.lng, p.nombre, p.tipo, p.descripcion, p.foto,
          cp.nota, cp.metraje_cable, cp.distancia_sig
      FROM mapa_punto p
      LEFT JOIN cliente_punto_map cp ON p.id_punto = cp.id_punto AND cp.id_cliente = ?
    `;
    
    const [rows] = await db.execute(query, [clienteId || 0]);
    res.json(rows);
  } catch (e) {
    console.error("Error en mapa.js GET /puntos:", e);
    res.status(500).json({ error: "DB_ERROR" });
  }
});

// --- LEER TRAMOS DEL CLIENTE ---
router.get("/tramos", async (req, res) => {
  const db = req.db || pool;
  const clienteId = vint(req.query.cliente_id);
  try {
    // Agregamos 'capacidad' para que el frontend pueda mostrar los hilos del cable
    const [rows] = await db.execute(
      `SELECT id_tramo AS id, punto_origen_id, punto_destino_id, geojson, datos_cable, color, capacidad 
       FROM mapa_tramo WHERE id_cliente = ?`,
      [clienteId]
    );
    res.json(rows);
  } catch (e) { 
    res.status(500).json({ error: "DB_ERROR" }); 
  }
});

module.exports = router; 