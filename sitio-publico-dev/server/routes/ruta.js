/**
 * ============================================================================
 * ARCHIVO: ruta.js
 * MÓDULO: Gestión de Rutas y Planta Interna (Backend)
 * DESCRIPCIÓN: Endpoints para la administración lógica de rutas, asignación de 
 * puertos (ODF, Patcheos, Equipos) y clientes. 
 * * CARACTERÍSTICAS DESTACADAS:
 * - Sanitización de datos al vuelo (Title Case, Trim, UpperCase).
 * - Escudo anti-colisión para prevenir asignación doble de puertos lógicos.
 * - Integración nativa con módulo de auditoría.
 * - Soporte para liberación de puertos (Cliente "Libre").
 * ============================================================================
 */

const express = require("express");
const router = express.Router();
const { pool } = require("../db");
const { auditar } = require("../lib/audit"); 

/* =========================================================
 * SANITIZADORES (Limpieza automática de datos)
 * ========================================================= */

// Convierte " GINSA ", "ginsa", "GINSA" -> "Ginsa"
function cleanText(str) {
    if (!str) return str;
    return String(str)
        .trim()
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase()) // Primera letra en mayúscula
        .replace(/\s+/g, ' '); // Elimina espacios dobles accidentales
}

// Convierte " id-01 ", "id-01" -> "ID-01"
function cleanUpper(str) {
    if (!str) return str;
    return String(str).trim().toUpperCase().replace(/\s+/g, ' ');
}

/* =========================================================
 * HELPERS ATÓMICOS (Un solo viaje a la BD por entidad)
 * ========================================================= */

async function getOrCreateCliente(conn, nombre, idExt, tarea) {
    const n = (nombre || "Sin Nombre").trim();
    const e = idExt ? String(idExt).trim() : null;
    const t = tarea ? String(tarea).trim() : null;

    if (e) {
        const [ins] = await conn.execute(
            `INSERT INTO cliente (nombre_cliente, id_cliente_ext, tarea) VALUES (?,?,?) 
             ON DUPLICATE KEY UPDATE nombre_cliente=VALUES(nombre_cliente), tarea=VALUES(tarea), id_cliente=LAST_INSERT_ID(id_cliente)`,
            [n, e, t]
        );
        return ins.insertId;
    }
    
    const [exist] = await conn.execute(`SELECT id_cliente FROM cliente WHERE nombre_cliente = ? LIMIT 1`, [n]);
    if (exist.length) return exist[0].id_cliente;
    
    const [ins] = await conn.execute(`INSERT INTO cliente (nombre_cliente, tarea) VALUES (?,?)`, [n, t]);
    return ins.insertId;
}

async function getOrCreateOdf(conn, nemonico, puerto, nombre, distancia) {
    if (!nemonico || !puerto) return null;
    const [ins] = await conn.execute(
        `INSERT INTO odf (nemonico_odf, puerto_odf, nombre_odf, distancia_optica) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE distancia_optica=VALUES(distancia_optica), nombre_odf=VALUES(nombre_odf), id_odf=LAST_INSERT_ID(id_odf)`,
        [nemonico, puerto, nombre || null, distancia || null]
    );
    return ins.insertId;
}

async function getOrCreatePatcheo(conn, nemonico, puerto) {
    if (!nemonico) return null;
    const [ins] = await conn.execute(
        `INSERT INTO patcheo (nemonico_patcheo, puerto) VALUES (?,?)
         ON DUPLICATE KEY UPDATE id_patcheo=LAST_INSERT_ID(id_patcheo)`,
        [nemonico, puerto || 0]
    );
    return ins.insertId;
}

async function getOrCreateEquipo(conn, nemonico, marca, slot, posicion) {
    if (!nemonico) return null;
    const [ins] = await conn.execute(
        `INSERT INTO equipo (nemonico_equipo, marca, slot, posicion) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE id_equipo=LAST_INSERT_ID(id_equipo)`,
        [nemonico, marca || null, slot || 0, posicion || '']
    );
    return ins.insertId;
}

async function getRutaSnapshot(conn, idRuta) {
    if (!idRuta) return null;
    const [rows] = await conn.query(`
        SELECT r.id_ruta, c.nombre_central, cl.nombre_cliente, cl.tarea,
               o.nemonico_odf, o.puerto_odf, p.nemonico_patcheo, p.puerto as puerto_patcheo,
               e.nemonico_equipo
        FROM ruta r
        LEFT JOIN central c ON c.id = r.id_central
        LEFT JOIN cliente cl ON cl.id_cliente = r.id_cliente
        LEFT JOIN odf o ON o.id_odf = r.id_odf
        LEFT JOIN patcheo p ON p.id_patcheo = r.id_patcheo
        LEFT JOIN equipo e ON e.id_equipo = r.id_equipo
        WHERE r.id_ruta = ?
    `, [idRuta]);
    return rows[0] || null;
}

/* -------------------------- ENDPOINTS -------------------------- */

router.get("/recientes", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id_ruta, cl.nombre_cliente, r.nemonico_patcheo, p.puerto AS puerto_patcheo, e.nemonico_equipo, e.marca
       FROM ruta r
       LEFT JOIN cliente cl ON cl.id_cliente = r.id_cliente
       LEFT JOIN equipo e ON e.id_equipo = r.id_equipo
       LEFT JOIN patcheo p ON p.id_patcheo = r.id_patcheo
       ORDER BY r.id_ruta DESC LIMIT 15` 
    );
    const data = rows.map(r => ({
      id_ruta: r.id_ruta,
      cliente: r.nombre_cliente || "S/N",
      patcheo: (r.nemonico_patcheo || "") + (r.puerto_patcheo ? `:${r.puerto_patcheo}` : ""),
      equipo: (r.nemonico_equipo || "") + (r.marca ? ` (${r.marca})` : "")
    }));
    res.json(data);
  } catch (err) { res.status(500).json({ error: "Error de conexión BD" }); }
});

router.get("/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.id_ruta, c.ID_central, c.nombre_central, cl.nombre_cliente, cl.id_cliente_ext, cl.tarea,
        o.nombre_odf, o.nemonico_odf, o.puerto_odf, o.distancia_optica,
        p.nemonico_patcheo, p.puerto as puerto_patcheo, e.nemonico_equipo, e.marca, e.slot, e.posicion
       FROM ruta r
       LEFT JOIN central c ON c.id = r.id_central
       LEFT JOIN cliente cl ON cl.id_cliente = r.id_cliente
       LEFT JOIN odf o ON o.id_odf = r.id_odf
       LEFT JOIN patcheo p ON p.id_patcheo = r.id_patcheo
       LEFT JOIN equipo e ON e.id_equipo = r.id_equipo
       WHERE r.id_ruta = ?`, [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "No encontrado" });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/save", async (req, res) => {
  const b = req.body || {};
  const id_ruta = Number(b.id_ruta || 0);

  if (!b.nombre_central || !b.nombre_cliente) {
      return res.status(400).json({ error: "Falta central o cliente", field: !b.nombre_central ? "nombre_central" : "nombre_cliente" });
  }

  // =====================================================================
  // APLICAR SANITIZADORES AL VUELO (Se limpian antes de tocar la BD)
  // =====================================================================
  const centralLimpia = cleanText(b.nombre_central);
  const idCentralLimpio = cleanUpper(b.ID_central);
  
  const clienteLimpio = cleanText(b.nombre_cliente);
  const idClienteExtLimpio = cleanUpper(b.id_cliente_ext);
  
  const odfNombreLimpio = cleanText(b.nombre_odf);
  const odfNemonicoLimpio = cleanUpper(b.nemonico_odf);
  const patcheoNemonicoLimpio = cleanUpper(b.nemonico_patcheo);
  const equipoNemonicoLimpio = cleanUpper(b.nemonico_equipo);
  const equipoMarcaLimpia = cleanText(b.marca);
  // =====================================================================

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    let fotoAntes = id_ruta ? await getRutaSnapshot(conn, id_ruta) : null;

    // 1. Asegurar la existencia del cliente comodín "Libre"
    const id_cliente_libre = await getOrCreateCliente(conn, "Libre", null, null);

    // 2. Central (Guardamos los datos ya limpios)
    const [cIns] = await conn.execute(
        `INSERT INTO central (nombre_central, ID_central) VALUES (?,?)
         ON DUPLICATE KEY UPDATE ID_central=VALUES(ID_central), id=LAST_INSERT_ID(id)`,
        [centralLimpia, idCentralLimpio || null]
    );
    const id_central = cIns.insertId;

    // 3. IDs Relacionales (Atómicos, usando los datos limpios)
    const id_cliente = await getOrCreateCliente(conn, clienteLimpio, idClienteExtLimpio, b.tarea);
    const id_odf     = await getOrCreateOdf(conn, odfNemonicoLimpio, b.odf_puerto, odfNombreLimpio, b.distancia_optica);
    const id_patcheo = await getOrCreatePatcheo(conn, patcheoNemonicoLimpio, b.puerto_patcheo);
    const id_equipo  = await getOrCreateEquipo(conn, equipoNemonicoLimpio, equipoMarcaLimpia, b.slot, b.posicion);

    // =====================================================================
    // 4. ESCUDO ANTI-COLISIÓN DE PUERTOS (Protección Proactiva)
    // =====================================================================
    if (id_cliente !== id_cliente_libre) {
        
        // Revisar si el ODF ya está ocupado por alguien más que no sea "Libre"
        if (id_odf) {
            const [ocupadoODF] = await conn.query(`SELECT c.nombre_cliente FROM ruta r JOIN cliente c ON r.id_cliente = c.id_cliente WHERE r.id_odf = ? AND r.id_ruta != ? AND r.id_cliente != ? LIMIT 1`, [id_odf, id_ruta, id_cliente_libre]);
            if (ocupadoODF.length) throw new Error(`El Puerto del ODF ya está ocupado por el cliente: ${ocupadoODF[0].nombre_cliente}`);
        }

        // Revisar si el Patcheo ya está ocupado
        if (id_patcheo) {
            const [ocupadoPat] = await conn.query(`SELECT c.nombre_cliente FROM ruta r JOIN cliente c ON r.id_cliente = c.id_cliente WHERE r.id_patcheo = ? AND r.id_ruta != ? AND r.id_cliente != ? LIMIT 1`, [id_patcheo, id_ruta, id_cliente_libre]);
            if (ocupadoPat.length) throw new Error(`El Puerto de Patcheo ya está ocupado por el cliente: ${ocupadoPat[0].nombre_cliente}`);
        }

        // Revisar si el Slot del Equipo ya está ocupado
        if (id_equipo) {
            const [ocupadoEq] = await conn.query(`SELECT c.nombre_cliente FROM ruta r JOIN cliente c ON r.id_cliente = c.id_cliente WHERE r.id_equipo = ? AND r.id_ruta != ? AND r.id_cliente != ? LIMIT 1`, [id_equipo, id_ruta, id_cliente_libre]);
            if (ocupadoEq.length) throw new Error(`La posición del Equipo ya está ocupada por el cliente: ${ocupadoEq[0].nombre_cliente}`);
        }
    }

    // 5. Guardar Ruta
    let finalId = id_ruta;
    let accion = "update";

    try {
        if (id_ruta) {
            await conn.execute(
                `UPDATE ruta SET id_central=?, id_cliente=?, id_odf=?, id_patcheo=?, id_equipo=?, nemonico_patcheo=? WHERE id_ruta=?`,
                [id_central, id_cliente, id_odf, id_patcheo, id_equipo, patcheoNemonicoLimpio || null, id_ruta]
            );
        } else {
            const [ins] = await conn.execute(
                `INSERT INTO ruta (id_central, id_cliente, id_odf, id_patcheo, id_equipo, nemonico_patcheo) VALUES (?,?,?,?,?,?)`,
                [id_central, id_cliente, id_odf, id_patcheo, id_equipo, patcheoNemonicoLimpio || null]
            );
            finalId = ins.insertId;
            accion = "create";
        }
    } catch (dbErr) {
        if (dbErr.code === 'ER_DUP_ENTRY') throw new Error("DUP_ENTRY");
        throw dbErr;
    }

    await conn.commit();
    const fotoDespues = await getRutaSnapshot(conn, finalId);
    auditar(req, "ruta", finalId, "update", fotoAntes, fotoDespues);
    res.json({ ok: true });

  } catch (e) {
    await conn.rollback();
    if (e.message === "DUP_ENTRY") {
        return res.status(409).json({ error: "Esta ruta es un duplicado exacto en la base de datos.", isDuplicate: true });
    }
    // Devolver el error específico del escudo anti-colisión
    res.status(400).json({ error: e.message });
  } finally { conn.release(); }
});

// NUEVO ENDPOINT: LIBERAR (Sustituye al DELETE)
router.put("/liberar/:id", async (req, res) => {
    const conn = await pool.getConnection();
    try {
        const id_ruta = req.params.id;
        
        await conn.beginTransaction();
        const fotoAntes = await getRutaSnapshot(conn, id_ruta);
        
        // Crear u obtener el cliente comodín "Libre"
        const id_cliente_libre = await getOrCreateCliente(conn, "Libre", null, null);
        
        // Reasignar la ruta al cliente Libre (liberando los puertos lógicamente)
        await conn.execute(`UPDATE ruta SET id_cliente = ? WHERE id_ruta = ?`, [id_cliente_libre, id_ruta]);
        
        await conn.commit();
        const fotoDespues = await getRutaSnapshot(conn, id_ruta);
        auditar(req, "ruta", id_ruta, "liberar", fotoAntes, fotoDespues);
        
        res.json({ ok: true, message: "Puerto liberado con éxito." });
    } catch (e) { 
        if (conn) await conn.rollback();
        res.status(500).json({ error: e.message }); 
    } 
    finally { if(conn) conn.release(); }
});

module.exports = router;