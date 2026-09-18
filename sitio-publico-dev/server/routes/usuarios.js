// server/routes/usuarios.js
// Gestión de Usuarios Purgada (JSON Módulos + is_admin Integrado)

const express = require("express");
const router = express.Router();
const { auditar } = require("../lib/audit");

function getPool(req) { return req?.db || req?.pool || req?.app?.get("db"); }
function toInt01(v) { return (v === true || v === "true" || v === 1 || v === "1" || v === "on") ? 1 : 0; }
function safeStr(s, fb = "") { return (s == null ? fb : String(s)).trim(); }
function toNullableDateTimeLocal(s) {
  const v = safeStr(s, "");
  if (!v) return null;
  return v.replace("T", " ") + (v.length === 16 ? ":00" : "");
}
function toPositiveNumber(n) {
  const x = Number(n);
  return isFinite(x) && x > 0 ? x : 0;
}

async function getUserSnapshot(pool, id) {
  if (!id) return null;
  try {
    const [rows] = await pool.query("SELECT * FROM usuarios WHERE id = ?", [id]);
    if (!rows.length) return null;
    const user = { ...rows[0] };
    delete user.password; 
    return user;
  } catch (e) { return null; }
}

// =================================================== LISTAR
router.get(["/usuarios", "/usuario", "/usuarios/list", "/usuario/list", "/users", "/user/list"], async (req, res) => {
  try {
    const pool = getPool(req);
    const [rows] = await pool.execute(
      "SELECT id, usuario, nombre, is_admin, activo, activo_hasta, modulos_activos FROM usuarios ORDER BY id ASC"
    );
    res.json(rows || []);
  } catch (e) {
    res.status(500).json({ error: "Error listando usuarios" });
  }
});

// =================================================== OBTENER UNO
router.get(["/usuarios/:id", "/users/:id"], async (req, res) => {
  try {
    const pool = getPool(req);
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "id requerido" });

    const [rows] = await pool.execute(
      "SELECT id, usuario, nombre, is_admin, activo, activo_hasta, modulos_activos FROM usuarios WHERE id=? LIMIT 1",
      [id]
    );
    if (!rows || !rows.length) return res.status(404).json({ error: "No encontrado" });
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Error obteniendo usuario" });
  }
});

// =================================================== CREAR / ACTUALIZAR
router.post(["/usuarios/save", "/usuario/save", "/users/save", "/user/save", "/usuarios", "/usuario"], async (req, res) => {
  const pool = getPool(req);
  try {
    const id = Number(req.body.id || 0);
    const usuario = safeStr(req.body.usuario);
    const nombre = safeStr(req.body.nombre);
    const password = safeStr(req.body.password);
    let activo = toInt01(req.body.activo);
    let is_admin = toInt01(req.body.is_admin); // <--- CAPTURAR ADMIN
    let activo_hasta = toNullableDateTimeLocal(req.body.activo_hasta);
    const activar_horas = toPositiveNumber(req.body.activar_horas);

    let modulos_activos = null;
    if (req.body.modulos_activos && typeof req.body.modulos_activos === 'object') {
        modulos_activos = JSON.stringify(req.body.modulos_activos);
    }

    if (!usuario) return res.status(400).json({ error: "usuario requerido" });

    if (activar_horas > 0) {
      activo = 1;
      const [timeRes] = await pool.query("SELECT DATE_ADD(NOW(), INTERVAL ? HOUR) as ah", [activar_horas]);
      activo_hasta = timeRes[0].ah;
    }

    let fotoAntes = null;
    if (id) fotoAntes = await getUserSnapshot(pool, id);

    let finalId = id;
    let accion = "update";

    if (id) {
      // UPDATE
      const updateFields = [usuario, nombre];
      let sql = "UPDATE usuarios SET usuario=?, nombre=?";
      
      if (password) {
        sql += ", password=?";
        updateFields.push(password);
      }
      
      sql += ", is_admin=?, activo=?, activo_hasta=?, modulos_activos=? WHERE id=?";
      updateFields.push(is_admin, activo, activo_hasta, modulos_activos, id); // <--- GUARDAR ADMIN
      
      await pool.execute(sql, updateFields);
    } else {
      // CREATE
      const [r] = await pool.execute(
        "INSERT INTO usuarios (usuario, nombre, password, is_admin, activo, activo_hasta, modulos_activos) VALUES (?,?,?,?,?,?,?)",
        [usuario, nombre, password, is_admin, activo, activo_hasta, modulos_activos] // <--- GUARDAR ADMIN
      );
      finalId = r.insertId;
      accion = "create";
    }

    const fotoDespues = await getUserSnapshot(pool, finalId);
    auditar(req, "usuario", finalId, accion, fotoAntes, fotoDespues);

    return res.json({ ok: true, id: finalId, activo_hasta });
  } catch (e) {
    if (e && (e.code === "ER_DUP_ENTRY" || e.errno === 1062)) return res.status(409).json({ error: "USUARIO_DUP" });
    res.status(500).json({ error: "Error guardando usuario" });
  }
});

// =================================================== UPDATE (PUT)
router.put(["/usuarios/:id", "/users/:id"], async (req, res) => {
  const pool = getPool(req);
  try {
    const id = Number(req.params.id || 0);
    if (!id) return res.status(400).json({ error: "id requerido" });

    const fotoAntes = await getUserSnapshot(pool, id);

    const usuario = safeStr(req.body.usuario);
    const nombre = safeStr(req.body.nombre);
    const password = safeStr(req.body.password);
    let activo = toInt01(req.body.activo);
    let is_admin = toInt01(req.body.is_admin); // <--- CAPTURAR ADMIN
    let activo_hasta = toNullableDateTimeLocal(req.body.activo_hasta);
    const activar_horas = toPositiveNumber(req.body.activar_horas);

    let modulos_activos = null;
    if (req.body.modulos_activos && typeof req.body.modulos_activos === 'object') {
        modulos_activos = JSON.stringify(req.body.modulos_activos);
    }

    if (!usuario) return res.status(400).json({ error: "usuario requerido" });

    if (activar_horas > 0) {
      activo = 1;
      const [timeRes] = await pool.query("SELECT DATE_ADD(NOW(), INTERVAL ? HOUR) as ah", [activar_horas]);
      activo_hasta = timeRes[0].ah;
    }

    const updateFields = [usuario, nombre];
    let sql = "UPDATE usuarios SET usuario=?, nombre=?";
    if (password) {
      sql += ", password=?";
      updateFields.push(password);
    }
    sql += ", is_admin=?, activo=?, activo_hasta=?, modulos_activos=? WHERE id=?";
    updateFields.push(is_admin, activo, activo_hasta, modulos_activos, id); // <--- GUARDAR ADMIN

    await pool.execute(sql, updateFields);

    const fotoDespues = await getUserSnapshot(pool, id);
    auditar(req, "usuario", id, "update", fotoAntes, fotoDespues);

    res.json({ ok: true, id, activo_hasta });
  } catch (e) {
    res.status(500).json({ error: "Error actualizando usuario" });
  }
});

// =================================================== ELIMINAR
async function deleteUser(req, res, id) {
  const pool = getPool(req);
  try {
    if (!id) return res.status(400).json({ error: "id requerido" });
    const fotoAntes = await getUserSnapshot(pool, id);
    await pool.execute("DELETE FROM usuarios WHERE id=?", [id]);
    auditar(req, "usuario", id, "delete", fotoAntes, null);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: "Error eliminando usuario" });
  }
}

router.delete(["/usuarios/:id", "/users/:id"], async (req, res) => await deleteUser(req, res, Number(req.params.id || 0)));
router.post(["/usuarios/delete", "/usuario/delete", "/user/delete"], async (req, res) => await deleteUser(req, res, Number(req.body.id || 0)));

// =================================================== ACTIVACIÓN TEMPORAL
router.post(["/usuarios/:id/activar-temporal", "/users/:id/activar-temporal"], async (req, res) => {
  const pool = getPool(req);
  try {
    const id = Number(req.params.id || 0);
    const horas = toPositiveNumber(req.body.horas);
    if (!id || !horas) return res.status(400).json({ error: "id y horas requeridos" });

    const fotoAntes = await getUserSnapshot(pool, id);
    await pool.execute("UPDATE usuarios SET activo=1, activo_hasta=DATE_ADD(NOW(), INTERVAL ? HOUR) WHERE id=?", [horas, id]);
    const [[u]] = await pool.query("SELECT id, usuario, activo, activo_hasta FROM usuarios WHERE id=?", [id]);
    const fotoDespues = await getUserSnapshot(pool, id);
    auditar(req, "usuario", id, "update", fotoAntes, fotoDespues);

    res.json({ ok: true, user: u });
  } catch (e) {
    res.status(500).json({ error: "Error activando temporalmente" });
  }
});

module.exports = router;