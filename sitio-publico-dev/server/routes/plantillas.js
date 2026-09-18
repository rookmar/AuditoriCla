// server/routes/plantillas.js
const express = require("express");
const router = express.Router();

// BOM para que Excel (Windows) detecte UTF-8 correctamente
const BOM = "\uFEFF";

// DEFINICIÓN DE ENCABEZADOS (Coinciden con carga-masiva.js)
const HEADERS = {
  rutas: [
    "id_central", "ID_central", "nombre_central", "nombre_cliente", "ID_Cliente",
    "tarea", "nombre_odf", "nemonico_odf", "puerto_odf",
    "distancia_optica", "nemonico_patcheo", "puerto_patcheo",
    "nemonico_equipo", "marca", "slot", "posicion",
  ],
  puntos: [
    "nombre", "tipo", "descripcion", "lat", "lng", "imagen_url"
  ]
};

// Función auxiliar para enviar el CSV
function sendCSV(res, filename, headers) {
  const SEP = ";"; 
  const excelSep = "sep=;\r\n"; 
  const body = BOM + excelSep + headers.join(SEP) + "\r\n";

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store, must-revalidate");
  res.send(body);
}

// Endpoints
router.get("/rutas.csv", (_req, res) => sendCSV(res, "plantilla_rutas.csv", HEADERS.rutas));
router.get("/puntos.csv", (_req, res) => sendCSV(res, "plantilla_puntos.csv", HEADERS.puntos));

module.exports = router;