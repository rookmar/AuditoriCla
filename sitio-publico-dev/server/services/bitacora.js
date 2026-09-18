// server/services/bitacora.js
// Servicio para LEER la bitácora con NOMBRES REALES
// CORREGIDO: Tabla 'usuarios' (plural)

const { pool } = require("../db");

async function query({ pool: dbConn }, params) {
  const db = dbConn || pool;
  const { page = 1, pageSize = 25, actor, entidad, accion, desde, hasta, text } = params;

  // --- QUERY INTELIGENTE CON JOIN ---
  // Buscamos en la tabla 'usuarios' el nombre real usando el 'actor_user_id'
  let sql = `
    SELECT 
      b.id,
      b.actor_user_id,
      b.entidad,
      b.entidad_id,
      b.accion,
      b.antes_json,
      b.despues_json,
      b.ip,
      b.created_at as fecha,
      -- Prioridad de nombres: 
      -- 1. Nombre Real (Joshua Romero)
      -- 2. Usuario (JR710166)
      -- 3. Lo que se guardó en bitácora
      COALESCE(u.nombre, u.usuario, b.actor_usuario, 'Desconocido') as nombre_real,
      u.usuario as usuario_alias
    FROM bitacora b
    LEFT JOIN usuarios u ON u.id = b.actor_user_id -- <--- AQUÍ ESTABA EL ERROR (ahora es plural)
    WHERE 1=1
  `;
  
  const args = [];

  // Filtros
  if (actor) {
    // Si escriben un número, buscamos por ID. Si es texto, buscamos por nombre real o usuario.
    if (!isNaN(actor)) {
      sql += ` AND b.actor_user_id = ?`;
      args.push(actor);
    } else {
      sql += ` AND (u.nombre LIKE ? OR u.usuario LIKE ? OR b.actor_usuario LIKE ?)`;
      args.push(`%${actor}%`, `%${actor}%`, `%${actor}%`);
    }
  }

  if (entidad) { sql += ` AND b.entidad = ?`; args.push(entidad); }
  if (accion) { sql += ` AND b.accion = ?`; args.push(accion); }
  if (desde) { sql += ` AND b.created_at >= ?`; args.push(`${desde} 00:00:00`); }
  if (hasta) { sql += ` AND b.created_at <= ?`; args.push(`${hasta} 23:59:59`); }
  
  // Búsqueda libre en JSONs
  if (text) {
    const like = `%${text}%`;
    sql += ` AND (b.antes_json LIKE ? OR b.despues_json LIKE ? OR CAST(b.entidad_id AS CHAR) LIKE ?)`;
    args.push(like, like, like);
  }

  // Paginación
  const limit = Number(pageSize);
  const offset = (Number(page) - 1) * limit;

  // Total
  const countSql = `SELECT COUNT(*) as total FROM (${sql}) as t`;
  const [countRows] = await db.query(countSql, args);
  const total = countRows[0]?.total || 0;

  // Datos ordenados por ID descendente (lo más nuevo primero)
  sql += ` ORDER BY b.id DESC LIMIT ? OFFSET ?`;
  args.push(limit, offset);
  
  const [rows] = await db.query(sql, args);

  return { items: rows, total, page: Number(page), pageSize: limit, totalPages: Math.ceil(total / limit) };
}

module.exports = { query };