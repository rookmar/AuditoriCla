// server/routes/upload.js
// Subida de archivos de auditoría (fotos de notas, etc.)

const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");

const router = express.Router();

// Carpeta física donde se guardan los archivos
// Queda en: server/uploads
const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads");

// Crear carpeta si no existe
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configuración de multer: guarda en disco con nombre único
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const base = path
      .basename(file.originalname || "archivo", ext)
      .replace(/[^\w\d_-]+/g, "_")
      .slice(0, 40); // por si el nombre es eterno
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `${base}-${unique}${ext}`);
  },
});

const upload = multer({ storage });

// Opcional: asegurarnos que haya sesión
function ensureLogged(req, res, next) {
  if (req.session && req.session.user) return next();
  return res.status(401).json({ error: "NO_AUTH" });
}

// POST /api/upload  (campo "file" en el FormData)
router.post("/", ensureLogged, upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "NO_FILE" });
  }

  // Esto es lo que vas a guardar en nota_img_url
  // OJO: en server.js vamos a exponer "/uploads" como estático
  const publicUrl = `/uploads/${req.file.filename}`;

  return res.json({
    ok: true,
    url: publicUrl,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
  });
});

module.exports = router;
