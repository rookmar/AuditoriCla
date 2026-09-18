// server/bitacora-logger.js
// Helper "a prueba de balas" para registrar en bitácora sin romper rutas.

const { logEvent } = require("./services/bitacora");

// Obtener pool igual que en otros módulos
function getPool(req) {
  return req.db || req.app?.get("db") || req.pool || null;
}

// Detecta el usuario logueado desde la sesión (formatos viejos y nuevos)
function getActorFromReq(req) {
  const u = req.user || req.session?.user || req.session?.usuario;
  if (!u) return null;

  const id =
    Number(u.id) ||
    Number(u.id_usuario) ||
    Number(u.idUser) ||
    Number(u.user_id) ||
    0;

  if (!id) return null;

  return {
    id,
    usuario: u.usuario || u.username || u.user || null,
    nombre: u.nombre || null,
  };
}

/**
 * safeBitacora(req, {
 *   entidad: 'ruta' | 'cliente' | 'usuario' | ...,
 *   entidad_id: number | null,
 *   accion: 'create' | 'update' | 'delete' | 'login' | ...,
 *   antes: object|null,
 *   despues: object|null
 * })
 *
 * - NO lanza errores (envuelva todo en try/catch interno).
 * - Respeta BITACORA_ENABLED=0 para desactivar rápido.
 */
async function safeBitacora(req, meta) {
  try {
    if (String(process.env.BITACORA_ENABLED || "1") === "0") return;

    const pool = getPool(req);
    if (!pool) return;

    const actor = getActorFromReq(req);
    if (!actor?.id) return;

    const {
      entidad,
      entidad_id = null,
      accion,
      antes = null,
      despues = null,
    } = meta || {};

    if (!entidad || !accion) return;

    const ipHeader = (req.headers["x-forwarded-for"] || "")
      .split(",")[0]
      .trim();
    const ip = ipHeader || req.ip || null;
    const user_agent = req.headers["user-agent"] || null;

    await logEvent(
      { pool },
      {
        actor_user_id: actor.id,
        entidad,
        entidad_id,
        accion,
        antes,
        despues,
        ip,
        user_agent,
      }
    );
  } catch (err) {
    // IMPORTANTÍSIMO: nunca re-lanzar, solo loguear
    console.error("safeBitacora error:", err?.message || err);
  }
}

module.exports = { safeBitacora };
