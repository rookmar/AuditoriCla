// server/routes/carga-masiva.js
const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const xml2js = require('xml2js'); 

// === Bitácora ===
const bitacoraSvc = require("../services/bitacora"); 

function getPool(req) { return req.db || req.app.get("db") || req.pool; }
function getActor(req) { const u = req.session?.user || req.user; return u?.id ? Number(u.id) : null; }

async function logBulkImport(req, info = {}) {
  try {
    const pool = getPool(req);
    if (!pool) return;
    await bitacoraSvc.logEvent({ pool }, {
      actor_user_id: getActor(req),
      entidad: "carga_masiva",
      accion: "import",
      despues: info
    });
  } catch (e) { console.warn("[bitacora] fallo log:", e); }
}

const TOLERANCIA_GEO = 0.00001; 
const cleanStr = (s) => String(s || "").trim();

// Helper CSV
function parseCSVText(text) {
  const clean = String(text || "").replace(/\r/g, "");
  const lines = clean.split("\n").filter((l) => l.trim() !== "");
  if (!lines.length) return { headers: [], rows: [] };
  const sep = lines[0].includes("\t") ? "\t" : lines[0].includes(",") ? "," : ";";
  const headers = lines[0].split(sep).map(h => h.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, "_"));
  const rows = lines.slice(1).map((l) => {
    const cells = l.split(sep);
    const o = {};
    headers.forEach((h, i) => o[h] = (cells[i] || "").trim());
    return o;
  });
  return { headers, rows };
}

/* =========================================================
 * 1. PUNTOS (CSV) - Sin Cambios, ya funciona
 * ========================================================= */
router.post("/puntos", upload.single("archivo"), async (req, res) => {
  let isDry = (req.body?.modo === "dry");
  let raw = "";

  try {
    const pool = getPool(req);
    if (req.file) raw = req.file.buffer.toString("utf8");
    else return res.status(400).json({ error: "Falta archivo" });

    const { rows } = parseCSVText(raw);
    const out = { ok: true, stats: { nuevos: 0, reusados: 0, errores: 0 }, errors: [] };
    
    const conn = await pool.getConnection();
    if (!isDry) await conn.beginTransaction();

    try {
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const lat = Number(r.lat);
        const lng = Number(r.lng);
        const nombre = cleanStr(r.nombre || r.etiqueta);
        const tipo = cleanStr(r.tipo);
        const desc = cleanStr(r.descripcion);
        const img = cleanStr(r.imagen_url);

        if (!lat || !lng) {
          out.errors.push({ row: i+2, msg: "Coordenadas inválidas" });
          out.stats.errores++;
          continue;
        }

        const [existen] = await conn.execute(
          `SELECT id_punto FROM mapa_punto WHERE ABS(lat - ?) < ? AND ABS(lng - ?) < ? LIMIT 1`,
          [lat, TOLERANCIA_GEO, lng, TOLERANCIA_GEO]
        );

        if (existen.length > 0) {
          if (!isDry) {
            await conn.execute(
              `UPDATE mapa_punto SET nombre=?, tipo=?, descripcion=?, imagen_url=? WHERE id_punto=?`,
              [nombre, tipo, desc, img, existen[0].id_punto]
            );
          }
          out.stats.reusados++;
        } else {
          if (!isDry) {
            await conn.execute(
              `INSERT INTO mapa_punto (nombre, tipo, descripcion, lat, lng, imagen_url) VALUES (?,?,?,?,?,?)`,
              [nombre, tipo, desc, lat, lng, img]
            );
          }
          out.stats.nuevos++;
        }
      }

      if (!isDry) await conn.commit();
      await logBulkImport(req, { tipo: "puntos", stats: out.stats });
      return res.json(out);

    } catch (e) {
      if (!isDry) await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Error: " + e.message });
  }
});

/* =========================================================
 * 2. KML (MIGRACIÓN) - Lógica de Metraje y Conexión
 * ========================================================= */
router.post("/kml", upload.single("archivo"), async (req, res) => {
  const isDry = (req.body.simulacion === "true" || req.body.simulacion === true);
  const idCliente = Number(req.body.id_cliente);

  if (!idCliente) return res.status(400).json({ error: "Cliente requerido." });
  if (!req.file) return res.status(400).json({ error: "Falta KML." });

  const pool = getPool(req);
  const conn = await pool.getConnection();
  const out = { ok: true, stats: { puntos: { nuevos:0, reusados:0 }, tramos: 0, datos_tecnicos: 0 }, errors: [] };

  try {
    const xml = req.file.buffer.toString("utf8");
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);

    const limpiarDesc = (d) => (d || "").replace(/<[^>]*>/g, "").trim();
    const detectarTipo = (n) => {
        const x = (n||"").toLowerCase();
        if(x.includes("pozo")||x.includes("manhole")) return "pozo";
        if(x.includes("mufa")) return "mufa";
        return "poste"; 
    };
    const extraerDatos = (txt) => {
        const m = txt.match(/metraje.*?(\d+(\.\d+)?)/i);
        const d = txt.match(/distancia.*?(\d+(\.\d+)?)/i);
        return { metraje: m?m[1]:null, distancia: d?d[1]:null };
    };

    const placemarks = [];
    const traverse = (obj) => {
        if(obj.Placemark) placemarks.push(...obj.Placemark);
        if(obj.Folder) obj.Folder.forEach(traverse);
        if(obj.Document) obj.Document.forEach(traverse);
    };
    if(result.kml) traverse(result.kml);

    if (!isDry) await conn.beginTransaction();

    for (const pm of placemarks) {
        const nombre = pm.name ? pm.name[0] : 'Sin nombre';
        const desc = limpiarDesc(pm.description ? pm.description[0] : '');
        const tipo = detectarTipo(nombre);
        const { metraje, distancia } = extraerDatos(desc);

        // Puntos
        if (pm.Point && pm.Point[0].coordinates) {
            const [lng, lat] = pm.Point[0].coordinates[0].trim().split(',');
            
            const [existen] = await conn.execute(
                `SELECT id_punto FROM mapa_punto WHERE ABS(lat - ?) < ? AND ABS(lng - ?) < ? LIMIT 1`,
                [lat, TOLERANCIA_GEO, lng, TOLERANCIA_GEO]
            );

            let idPunto;
            if (existen.length > 0) {
                idPunto = existen[0].id_punto;
                if(!isDry) await conn.execute(`UPDATE mapa_punto SET nombre=?, descripcion=?, tipo=? WHERE id_punto=?`, [nombre, desc, tipo, idPunto]);
                out.stats.puntos.reusados++;
            } else {
                if(!isDry) {
                    const [ins] = await conn.execute(`INSERT INTO mapa_punto (nombre, descripcion, tipo, lat, lng) VALUES (?,?,?,?,?)`, [nombre, desc, tipo, lat, lng]);
                    idPunto = ins.insertId;
                }
                out.stats.puntos.nuevos++;
            }

            if (!isDry && idPunto) {
                await conn.execute(
                    `INSERT INTO cliente_punto_map (id_cliente, id_punto, nota, metraje_cable, distancia_sig) 
                     VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE nota=VALUES(nota), metraje_cable=VALUES(metraje_cable), distancia_sig=VALUES(distancia_sig)`,
                    [idCliente, idPunto, desc, metraje, distancia]
                );
                if(metraje || distancia) out.stats.datos_tecnicos++;
            }
        }
    }

    if (!isDry) await conn.commit();
    else await conn.rollback();

    return res.json(out);
  } catch (e) {
    if (!isDry) await conn.rollback();
    console.error(e);
    return res.status(500).json({ error: e.message });
  } finally {
    conn.release();
  }
});

/* =========================================================
 * 3. RUTAS - Protección de Puertos y Creación de Equipos
 * ========================================================= */
router.post("/rutas", upload.single("archivo"), async (req, res) => {
  let isDry = (req.body?.modo === "dry");
  let raw = "";

  try {
    const pool = getPool(req);
    if (req.file) raw = req.file.buffer.toString("utf8");
    else return res.status(400).json({ error: "Falta archivo" });

    const { rows } = parseCSVText(raw);
    const out = { ok: true, stats: { nuevos:0, reusados:0, errores:0 }, errors: [] };
    
    const conn = await pool.getConnection();
    if (!isDry) await conn.beginTransaction();

    try {
      // Helper para buscar/crear registros en tablas satélite (equipo, patcheo)
      const getOrCreateId = async (table, searchCol, val, pkCol, extraData={}) => {
          if(!val) return null;
          // Buscamos
          const [found] = await conn.execute(`SELECT ${pkCol} FROM ${table} WHERE ${searchCol} = ? LIMIT 1`, [val]);
          if(found.length) return found[0][pkCol];
          // Si no existe y no es Dry, creamos
          if(!isDry) {
              const cols = [searchCol, ...Object.keys(extraData)];
              const vals = [val, ...Object.values(extraData)];
              const placeholders = cols.map(()=>'?').join(',');
              const [ins] = await conn.execute(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders})`, vals);
              return ins.insertId;
          }
          return 999999; // ID falso para simulación
      };

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const nomCentral = cleanStr(r.nombre_central);
        const nomCliente = cleanStr(r.nombre_cliente);
        const nomOdf = cleanStr(r.nemonico_odf);
        const puerto = cleanStr(r.puerto_odf);
        
        // 1. Validar Central
        const [cRes] = await conn.execute(`SELECT id FROM central WHERE nombre_central = ? LIMIT 1`, [nomCentral]);
        if(!cRes.length) { out.errors.push({row: i+2, msg: `Central no existe: ${nomCentral}`}); out.stats.errores++; continue; }
        const idCentral = cRes[0].id;

        // 2. Validar Cliente
        const [cliRes] = await conn.execute(`SELECT id_cliente FROM cliente WHERE nombre_cliente = ? LIMIT 1`, [nomCliente]);
        if(!cliRes.length) { out.errors.push({row: i+2, msg: `Cliente no existe: ${nomCliente}`}); out.stats.errores++; continue; }
        const idCliente = cliRes[0].id_cliente;

        // 3. Validar ODF y Puerto (Tabla 'odf')
        const [odfRes] = await conn.execute(
            `SELECT id_odf FROM odf WHERE nemonico_odf = ? AND puerto_odf = ? LIMIT 1`, 
            [nomOdf, puerto]
        );
        if(!odfRes.length) { 
            out.errors.push({row: i+2, msg: `Puerto ODF no existe en inventario: ${nomOdf} / ${puerto}`}); 
            out.stats.errores++; continue; 
        }
        const idOdf = odfRes[0].id_odf;

        // 4. Gestión de Equipos y Patcheo (Opcional pero recomendado)
        const idEquipo  = await getOrCreateId('equipo', 'nemonico_equipo', r.nemonico_equipo, 'id_equipo', { marca: r.marca, slot: r.slot || 0, posicion: r.posicion || '' });
        const idPatcheo = await getOrCreateId('patcheo', 'nemonico_patcheo', r.nemonico_patcheo, 'id_patcheo', { puerto: r.puerto_patcheo || 0 });

        // 5. Protección de Puerto (Tabla 'ruta')
        const [ocupado] = await conn.execute(`SELECT id_ruta, id_cliente FROM ruta WHERE id_odf=? LIMIT 1`, [idOdf]);

        if (ocupado.length > 0) {
            if (ocupado[0].id_cliente === idCliente) {
                // Actualizar info si es el mismo cliente
                if(!isDry) {
                    await conn.execute(
                        `UPDATE ruta SET id_equipo=?, id_patcheo=?, coordenadas=? WHERE id_ruta=?`,
                        [idEquipo, idPatcheo, "CSV_UPDATED", ocupado[0].id_ruta]
                    );
                }
                out.stats.reusados++;
            } else {
                out.errors.push({ row: i+2, msg: `CONFLICTO: Puerto ${puerto} ocupado por otro cliente.` });
                out.stats.errores++;
            }
        } else {
            // Crear Ruta Nueva
            if(!isDry) {
                await conn.execute(
                    `INSERT INTO ruta (id_central, id_cliente, id_odf, id_equipo, id_patcheo, coordenadas) VALUES (?,?,?,?,?,?)`,
                    [idCentral, idCliente, idOdf, idEquipo, idPatcheo, "CSV_IMPORT"]
                );
            }
            out.stats.nuevos++;
        }
      }

      if (!isDry) await conn.commit();
      else await conn.rollback();

      return res.json(out);

    } catch (e) {
      if (!isDry) await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message });
  }
});

/* =========================================================
 * 4. BUSCADOR INTELIGENTE (Corregido con id_cliente_ext)
 * ========================================================= */
router.get("/clientes-buscador", async (req, res) => {
  try {
    const pool = getPool(req);
    // JOIN corregido según tus DESCRIBE
    const query = `
      SELECT 
        c.id_cliente, 
        c.nombre_cliente, 
        c.id_cliente_ext,   -- Usamos el campo real
        cent.nombre_central,
        o.nemonico_odf,
        o.puerto_odf        -- Usamos campo de tabla ODF
      FROM cliente c
      LEFT JOIN ruta r ON c.id_cliente = r.id_cliente
      LEFT JOIN central cent ON r.id_central = cent.id
      LEFT JOIN odf o ON r.id_odf = o.id_odf
      ORDER BY c.nombre_cliente ASC
      LIMIT 5000
    `;

    const [rows] = await pool.query(query);
    res.json({ items: rows });

  } catch (e) {
    console.error("Error en buscador:", e);
    res.status(500).json({ error: "Error DB" });
  }
});

module.exports = router;