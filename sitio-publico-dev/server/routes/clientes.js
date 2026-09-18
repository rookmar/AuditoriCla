// server/routes/clientes.js
// Endpoints de clientes para consumo general y compatibilidad con distintos paths.
// Devuelven arreglos simples para poblar selects.

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// Normaliza filas a un formato común (incluye ID_Cliente externo)
function mapClienteRow(r) {
  return {
    id_cliente: Number(r.id_cliente),                   // id interno (FK)
    ID_Cliente: r.ID_Cliente == null ? null : String(r.ID_Cliente), // id externo visible
    nombre_cliente: String(r.nombre_cliente || ""),
    tarea: r.tarea == null ? null : Number(r.tarea),
  };
}

// GET /api/clientes  (opcional ?simple=1)
// GET /api/cliente   (alias)
async function listClientes(_req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id_cliente, nombre_cliente, tarea, ID_Cliente
         FROM cliente
        ORDER BY nombre_cliente ASC`
    );
    const data = rows.map(mapClienteRow);
    return res.json(data);
  } catch (e) {
    console.error("[GET clientes] error:", e);
    return res.json([]); // el front tolera array vacío
  }
}

router.get("/clientes", listClientes);
router.get("/cliente", listClientes);

// Aliases que el front intenta: /api/ruta/clientes y /api/rutas/clientes
router.get("/ruta/clientes", listClientes);
router.get("/rutas/clientes", listClientes);

module.exports = router;
 