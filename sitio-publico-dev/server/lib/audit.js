// server/lib/audit.js
const { pool } = require('../db'); // <--- AJUSTA ESTO si tu archivo de conexión se llama distinto

async function auditar(req, entidad, entidad_id, accion, antes = null, despues = null) {
  try {
    // 1. Datos del Actor (Quién lo hizo)
    const user = req.session?.user || {};
    const actorId = user.id || user.id_usuario || null;
    const actorNombre = user.usuario || user.nombre || 'Desconocido';

    // 2. Datos de Red (Desde dónde)
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] || 'System';

    // 3. Serializar JSONs de forma segura (evita errores si el objeto es complejo)
    const safeJson = (obj) => {
      try { return obj ? JSON.stringify(obj) : null; } 
      catch { return null; }
    };

    const strAntes = safeJson(antes);
    const strDespues = safeJson(despues);

    // 4. Inserción "Fire & Forget" (Dispara y olvida)
    // Usamos las columnas exactas que vimos en tu base de datos
    const sql = `
      INSERT INTO bitacora 
      (actor_user_id, actor_usuario, entidad, entidad_id, accion, antes_json, despues_json, ip, user_agent)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    // No usamos 'await' bloqueante para que el usuario no sienta lentitud
    pool.query(sql, [
      actorId, 
      actorNombre, 
      entidad, 
      entidad_id, 
      accion, 
      strAntes, 
      strDespues, 
      ip, 
      ua
    ]).catch(err => console.error("⚠️ Error SQL Bitácora:", err.message));

  } catch (err) {
    // Si algo falla aquí, solo lo imprime en consola. NO rompe el servidor.
    console.error("⚠️ Error General Auditoría:", err.message);
  }
}

module.exports = { auditar };