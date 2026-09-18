// =========================================================================
// Archivo: server/routes/infra_movil.js
// Descripción: Backend para el Módulo de Construcción Móvil (Terreno)
// Función: Radar GPS, Guardado de Puntos con Fotos y Tramos de Fibra Transaccionales
// =========================================================================

const express = require("express");
const router = express.Router();
const { pool } = require("../db"); 
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// --- CONFIGURACIÓN DE MULTER (Subida de fotos comprimidas) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, "../../public/uploads");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, "movil_" + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// --- FUNCIONES DE APOYO ---
const vstr = (s) => (s === undefined || s === null ? null : String(s).trim() || null);
const vint = (s) => (Number.isFinite(Number(s)) ? Number(s) : null);
function getPool(req) { return req.db || req.app.get("db") || req.pool || pool; }

// =========================================================================
// 1. RADAR GPS: Buscar infraestructura existente en 50 metros
// =========================================================================
router.get("/cercanos", async (req, res) => {
    const db = getPool(req);
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    
    if (!lat || !lng) return res.status(400).json({ ok: false, error: "Faltan coordenadas" });

    try {
        const query = `
            SELECT id_punto, nombre, lat, lng, tipo,
            ( 6371 * acos( cos( radians(?) ) * cos( radians( lat ) ) 
            * cos( radians( lng ) - radians(?) ) + sin( radians(?) ) 
            * sin( radians( lat ) ) ) ) AS distance 
            FROM mapa_punto 
            HAVING distance < 0.05 
            ORDER BY distance 
            LIMIT 1
        `;
        const [puntos] = await db.execute(query, [lat, lng, lat]);
        res.json({ ok: true, puntos });
    } catch (e) { 
        res.status(500).json({ ok: false, error: e.message }); 
    }
});

// =========================================================================
// 2. GUARDAR PUNTO NUEVO (Poste, Pozo, NAP) + FOTO
// =========================================================================
router.post("/puntos", upload.single("foto"), async (req, res) => {
  const db = getPool(req);
  const b = req.body;
  const fotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

  try {
    const [ins] = await db.execute(
      `INSERT INTO mapa_punto (nombre, tipo, descripcion, lat, lng, foto) VALUES (?,?,?,?,?,?)`,
      [vstr(b.nombre), vstr(b.tipo), vstr(b.descripcion), b.lat, b.lng, fotoUrl]
    );
    res.status(201).json({ ok: true, id_punto: ins.insertId });
  } catch (e) { 
      res.status(500).json({ ok: false, error: e.message }); 
  }
});

// =========================================================================
// 3. GUARDAR TRAMO + AUDITORÍA UNIFICADA (ESCUDO ANTIFANTASMAS)
// =========================================================================
router.post("/tramos", async (req, res) => {
  const db = await getPool(req).getConnection();
  const b = req.body;

  try {
    // Abrir bloque transaccional estricto
    await db.beginTransaction();

    // A. Registrar el enlace físico del cable (Tramo)
    const [insTramo] = await db.execute(
      `INSERT INTO mapa_tramo (id_cliente, desde_id, hasta_id, capacidad, datos_cable, geojson) 
       VALUES (?, ?, ?, ?, ?, ?)`,
      [vint(b.id_cliente), vint(b.desde_id), vint(b.hasta_id), vstr(b.capacidad), vstr(b.datos_cable), vstr(b.geojson)]
    );
    const newTramoId = insTramo.insertId;

    // B. Si el paquete viene con auditoría de campo adjunta, se inserta usando el ID recién creado
    if (b.auditoria) {
      await db.execute(
        `INSERT INTO mapa_auditoria (id_cliente, id_punto, id_tramo, metraje, distancia, nota) 
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          vint(b.id_cliente), 
          vint(b.hasta_id), // El punto de llegada de la caminata
          newTramoId, 
          vstr(b.auditoria.metraje), 
          vstr(b.auditoria.distancia), 
          vstr(b.auditoria.nota)
        ]
      );
    }

    // Confirmar todo el bloque a la base de datos
    await db.commit();
    db.release();
    
    res.status(201).json({ ok: true, id_tramo: newTramoId });

  } catch (e) {
    // Si la conexión de red se corrompió a la mitad, revertimos el tramo para evitar datos huérfanos
    await db.rollback();
    db.release();
    console.error("Error transaccional en tramos:", e);
    res.status(500).json({ ok: false, error: "Error en el servidor al procesar el tramo e informe de auditoría: " + e.message });
  }
});

module.exports = router;