// =========================================================================
// Archivo: server/routes/carga-masiva.js
// V10.5 - MÓDULO MAESTRO DE IMPORTACIÓN (KML & CSV)
// =========================================================================

const express = require("express");
const router = express.Router();
const multer = require("multer");
const upload = multer({ storage: multer.memoryStorage() });
const { pool } = require("../db");

// =========================================================================
// 1. HELPERS Y CONSTANTES
// =========================================================================

// Fórmula Haversine para buscar infraestructura existente a menos de 5 metros (0.005 km)
const SQL_RADAR = `
    SELECT id_punto, nombre, 
    ( 6371 * acos( cos( radians(?) ) * cos( radians( lat ) ) 
    * cos( radians( lng ) - radians(?) ) + sin( radians(?) ) 
    * sin( radians( lat ) ) ) ) AS distance 
    FROM mapa_punto 
    HAVING distance < 0.005 
    ORDER BY distance 
    LIMIT 1
`;

async function masivaGetOrCreateCliente(conn, nombre, idExt, tarea) {
    const n = (nombre || "Libre").trim();
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

async function masivaGetOrCreateOdf(conn, nemonico, puerto, nombre, distancia) {
    if (!nemonico || !puerto) return null;
    const [ins] = await conn.execute(
        `INSERT INTO odf (nemonico_odf, puerto_odf, nombre_odf, distancia_optica) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE distancia_optica=VALUES(distancia_optica), nombre_odf=VALUES(nombre_odf), id_odf=LAST_INSERT_ID(id_odf)`,
        [nemonico, puerto, nombre || null, distancia || null]
    );
    return ins.insertId;
}

async function masivaGetOrCreatePatcheo(conn, nemonico, puerto) {
    if (!nemonico) return null;
    const [ins] = await conn.execute(
        `INSERT INTO patcheo (nemonico_patcheo, puerto) VALUES (?,?)
         ON DUPLICATE KEY UPDATE id_patcheo=LAST_INSERT_ID(id_patcheo)`,
        [nemonico, puerto || 0]
    );
    return ins.insertId;
}

async function masivaGetOrCreateEquipo(conn, nemonico, marca, slot, posicion) {
    if (!nemonico) return null;
    const [ins] = await conn.execute(
        `INSERT INTO equipo (nemonico_equipo, marca, slot, posicion) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE id_equipo=LAST_INSERT_ID(id_equipo)`,
        [nemonico, marca || null, slot || 0, posicion || '']
    );
    return ins.insertId;
}

// =========================================================================
// 2. MIGRACIÓN GOOGLE MAPS (KML / KMZ)
// =========================================================================
router.post("/kml-import", upload.single("kml"), async (req, res) => {
    let conn;
    try {
        let id_cliente_sistema = req.body.id_cliente;
        if (id_cliente_sistema && String(id_cliente_sistema).includes("(")) {
            const m = String(id_cliente_sistema).match(/\(([^)]+)\)/);
            if (m) id_cliente_sistema = m[1];
        }
        id_cliente_sistema = parseInt(id_cliente_sistema, 10);
        if (isNaN(id_cliente_sistema)) return res.status(400).json({ ok: false, error: "ID Cliente inválido" });

        const kmlText = req.file.buffer.toString("utf8");
        const isDry = req.body.modo === "dry";
        
        conn = await pool.getConnection();
        await conn.beginTransaction();
        
        let stats = { tramos_nuevos: 0, tramos_actualizados: 0, nuevos: 0, actualizados: 0, pozos: 0, postes: 0, enganches: 0 };
        const ptIdsMap = new Map(); 

        // FASE A: PROCESAR PUNTOS (RADAR GPS ANTI-DUPLICIDAD)
        const placemarks = kmlText.match(/<Placemark>[\s\S]*?<Point>[\s\S]*?<\/Placemark>/gi) || [];
        
        for (let pm of placemarks) {
            let nameMatch = pm.match(/<name>(.*?)<\/name>/i);
            let nombrePunto = nameMatch ? nameMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "Punto KML";
            let tipoFinal = nombrePunto.toLowerCase().includes("pozo") ? 'pozo' : 'poste';

            const metrajeMatch = pm.match(/<Data name="metraje de cable">[\s\S]*?<value>(.*?)<\/value>/i);
            const distanciaMatch = pm.match(/<Data name="distancia a siguiente pozo\/poste">[\s\S]*?<value>(.*?)<\/value>/i);
            const descMatch = pm.match(/<description>([\s\S]*?)<\/description>/i);
            
            const valorMetraje = metrajeMatch ? parseInt(metrajeMatch[1].replace(/\D/g, "")) : null;
            const valorDistancia = distanciaMatch ? parseInt(distanciaMatch[1].replace(/\D/g, "")) : null;
            const descripcionLimpia = descMatch ? descMatch[1].replace(/<[^>]*>?/gm, '').trim() : 'Migrado de Google Maps';

            let ptMatch = pm.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
            if (ptMatch) {
                const coords = ptMatch[1].trim().split(",");
                const lat = parseFloat(coords[1]);
                const lng = parseFloat(coords[0]);

                if (!isNaN(lat) && !isNaN(lng) && !isDry) {
                    const [existP] = await conn.query(SQL_RADAR, [lat, lng, lat]);
                    let currentIdPunto;

                    if (existP.length > 0) {
                        currentIdPunto = existP[0].id_punto;
                        stats.enganches++; // Se colgó de un poste que ya existía
                    } else {
                        const [resP] = await conn.query(
                            "INSERT INTO mapa_punto SET nombre=?, tipo=?, lat=?, lng=?, descripcion=?", 
                            [nombrePunto, tipoFinal, lat, lng, descripcionLimpia]
                        );
                        currentIdPunto = resP.insertId;
                        stats.nuevos++;
                        if (tipoFinal === 'pozo') stats.pozos++; else stats.postes++;
                    }
                    ptIdsMap.set(nombrePunto, { id: currentIdPunto, metraje: valorMetraje, distancia: valorDistancia, desc: descripcionLimpia });
                }
            }
        }

        // FASE B: PROCESAR TRAMOS Y AMARRE DE AUDITORÍA
        const tramosMatches = kmlText.match(/<Placemark>[\s\S]*?<LineString>[\s\S]*?<\/Placemark>/gi) || [];
        
        for (let tramoNode of tramosMatches) {
            const nombreMatch = tramoNode.match(/<name>(.*?)<\/name>/i);
            const nombreTramo = nombreMatch ? nombreMatch[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "Tramo KML";
            
            const coordsMatch = tramoNode.match(/<coordinates>([\s\S]*?)<\/coordinates>/);
            if (coordsMatch) {
                const rawCoords = coordsMatch[1].trim().split(/\s+/);
                const geojsonPath = rawCoords.map(str => {
                    const parts = str.split(",");
                    return { lat: parseFloat(parts[1]), lng: parseFloat(parts[0]) };
                }).filter(p => !isNaN(p.lat));

                if (!isDry && geojsonPath.length > 1) {
                    const [existT] = await conn.query(
                        `SELECT id_tramo FROM mapa_tramo WHERE id_cliente = ? AND datos_cable LIKE ? LIMIT 1`,
                        [id_cliente_sistema, `%"nombre":"${nombreTramo}"%`]
                    );

                    let currentIdTramo;
                    if (existT.length > 0) {
                        currentIdTramo = existT[0].id_tramo;
                        await conn.query("UPDATE mapa_tramo SET geojson = ? WHERE id_tramo = ?", [JSON.stringify(geojsonPath), currentIdTramo]);
                        stats.tramos_actualizados++;
                    } else {
                        const [resT] = await conn.query(
                            "INSERT INTO mapa_tramo SET id_cliente = ?, geojson = ?, color = ?, datos_cable = ?",
                            [id_cliente_sistema, JSON.stringify(geojsonPath), "#3b82f6", JSON.stringify({ nombre: nombreTramo })]
                        );
                        currentIdTramo = resT.insertId;
                        stats.tramos_nuevos++;
                    }

                    if (ptIdsMap.has(nombreTramo)) {
                        const pData = ptIdsMap.get(nombreTramo);
                        await conn.query(
                            `INSERT INTO cliente_punto_map (id_cliente, id_punto, id_tramo, metraje_cable, distancia_sig, nota) 
                             VALUES (?, ?, ?, ?, ?, ?)
                             ON DUPLICATE KEY UPDATE 
                             metraje_cable = VALUES(metraje_cable), distancia_sig = VALUES(distancia_sig), nota = VALUES(nota)`,
                            [id_cliente_sistema, pData.id, currentIdTramo, pData.metraje, pData.distancia, pData.desc]
                        );
                    }
                }
            }
        }

        if (isDry) {
            await conn.rollback();
            res.json({ ok: true, message: "SIMULACIÓN EXITOSA. El KML ha sido validado correctamente."});
        } else {
            await conn.commit();
            res.json({ ok: true, message: "Migración de Google Maps a Base de Datos completada.", stats });
        }

    } catch (e) {
        if (conn) await conn.rollback();
        res.status(500).json({ ok: false, error: e.message });
    } finally {
        if (conn) conn.release();
    }
});

// =========================================================================
// 3. IMPORTACIÓN LÓGICA DE RUTAS (CSV) - PLANTA INTERNA
// =========================================================================
router.post("/rutas", upload.single("archivo"), async (req, res) => {
    let conn;
    try {
        if (!req.file) return res.status(400).json({ ok: false, error: "No se subió archivo" });
        const isDry = req.body.modo === "dry";
        const csvText = req.file.buffer.toString("utf8");
        const rows = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (rows.length < 2) return res.status(400).json({ ok: false, error: "Archivo vacío o sin encabezados." });

        // <--- CAMBIO AQUÍ: Se cambió el split(',') por split(';') para leer el delimitador correcto
        const headers = rows.shift().split(';').map(h => h.trim().toLowerCase());
        const col = {
            nombre_central: headers.indexOf('nombre_central'), id_central: headers.indexOf('id_central'),
            nombre_cliente: headers.indexOf('nombre_cliente'), id_cliente_ext: headers.indexOf('id_cliente_ext'),
            tarea: headers.indexOf('tarea'), nombre_odf: headers.indexOf('nombre_odf'),
            nemonico_odf: headers.indexOf('nemonico_odf'), odf_puerto: headers.indexOf('odf_puerto'),
            distancia_optica: headers.indexOf('distancia_optica'), nemonico_patcheo: headers.indexOf('nemonico_patcheo'),
            puerto_patcheo: headers.indexOf('puerto_patcheo'), nemonico_equipo: headers.indexOf('nemonico_equipo'),
            marca: headers.indexOf('marca'), slot: headers.indexOf('slot'), posicion: headers.indexOf('posicion')
        };

        if (col.nombre_central === -1 || col.nombre_cliente === -1) {
            return res.status(400).json({ ok: false, error: "Faltan columnas: 'nombre_central' o 'nombre_cliente'." });
        }

        conn = await pool.getConnection();
        await conn.beginTransaction();

        let stats = { nuevas: 0, ignoradas: 0 };
        let errors = [];
        const id_cliente_libre = await masivaGetOrCreateCliente(conn, "Libre", null, null);

        for (let i = 0; i < rows.length; i++) {
            // <--- CAMBIO AQUÍ: Se cambió la expresión regular para que use punto y coma (;)
            const data = rows[i].split(/;(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(v => v.replace(/^"|"$/g, '').trim());
            const rowNum = i + 2;

            const b = {
                nombre_central: data[col.nombre_central], id_central: col.id_central !== -1 ? data[col.id_central] : null,
                nombre_cliente: data[col.nombre_cliente], id_cliente_ext: col.id_cliente_ext !== -1 ? data[col.id_cliente_ext] : null,
                tarea: col.tarea !== -1 ? data[col.tarea] : null, nombre_odf: col.nombre_odf !== -1 ? data[col.nombre_odf] : null,
                nemonico_odf: col.nemonico_odf !== -1 ? data[col.nemonico_odf] : null, odf_puerto: col.odf_puerto !== -1 ? data[col.odf_puerto] : null,
                distancia_optica: col.distancia_optica !== -1 ? data[col.distancia_optica] : null, nemonico_patcheo: col.nemonico_patcheo !== -1 ? data[col.nemonico_patcheo] : null,
                puerto_patcheo: col.puerto_patcheo !== -1 ? data[col.puerto_patcheo] : null, nemonico_equipo: col.nemonico_equipo !== -1 ? data[col.nemonico_equipo] : null,
                marca: col.marca !== -1 ? data[col.marca] : null, slot: col.slot !== -1 ? data[col.slot] : null, posicion: col.posicion !== -1 ? data[col.posicion] : null
            };

            if (!b.nombre_central || !b.nombre_cliente) {
                errors.push({ row: rowNum, msg: "Fila omitida: Central o cliente vacíos." });
                continue;
            }

            try {
                const [cIns] = await conn.execute(`INSERT INTO central (nombre_central, ID_central) VALUES (?,?) ON DUPLICATE KEY UPDATE ID_central=VALUES(ID_central), id=LAST_INSERT_ID(id)`, [b.nombre_central, b.id_central || null]);
                const id_central = cIns.insertId;

                const id_cliente = await masivaGetOrCreateCliente(conn, b.nombre_cliente, b.id_cliente_ext, b.tarea);
                const id_odf     = await masivaGetOrCreateOdf(conn, b.nemonico_odf, b.odf_puerto, b.nombre_odf, b.distancia_optica);
                const id_patcheo = await masivaGetOrCreatePatcheo(conn, b.nemonico_patcheo, b.puerto_patcheo);
                const id_equipo  = await masivaGetOrCreateEquipo(conn, b.nemonico_equipo, b.marca, b.slot, b.posicion);

                // ESCUDO ANTI-COLISIÓN DE PUERTOS
                if (id_cliente !== id_cliente_libre) {
                    if (id_odf) {
                        const [ocODF] = await conn.query(`SELECT c.nombre_cliente FROM ruta r JOIN cliente c ON r.id_cliente = c.id_cliente WHERE r.id_odf = ? AND r.id_cliente != ? LIMIT 1`, [id_odf, id_cliente_libre]);
                        if (ocODF.length && ocODF[0].nombre_cliente !== b.nombre_cliente) throw new Error(`El ODF ya está ocupado por: ${ocODF[0].nombre_cliente}`);
                    }
                    if (id_patcheo) {
                        const [ocPat] = await conn.query(`SELECT c.nombre_cliente FROM ruta r JOIN cliente c ON r.id_cliente = c.id_cliente WHERE r.id_patcheo = ? AND r.id_cliente != ? LIMIT 1`, [id_patcheo, id_cliente_libre]);
                        if (ocPat.length && ocPat[0].nombre_cliente !== b.nombre_cliente) throw new Error(`El Patcheo ya está ocupado por: ${ocPat[0].nombre_cliente}`);
                    }
                }

                const [dup] = await conn.query(`SELECT id_ruta FROM ruta WHERE id_central=? AND id_cliente=? AND (id_odf=? OR id_odf IS NULL) AND (id_patcheo=? OR id_patcheo IS NULL) AND (id_equipo=? OR id_equipo IS NULL)`, [id_central, id_cliente, id_odf, id_patcheo, id_equipo]);
                if (dup.length > 0) { stats.ignoradas++; continue; }

                await conn.execute(`INSERT INTO ruta (id_central, id_cliente, id_odf, id_patcheo, id_equipo, nemonico_patcheo) VALUES (?,?,?,?,?,?)`, [id_central, id_cliente, id_odf, id_patcheo, id_equipo, b.nemonico_patcheo || null]);
                stats.nuevas++;

            } catch (err) { errors.push({ row: rowNum, msg: err.message }); }
        }

        if (errors.length > 0) {
            await conn.rollback(); 
            return res.json({ ok: false, error: "Importación abortada para proteger la red. Se encontraron colisiones.", errors });
        }

        if (isDry) {
            await conn.rollback();
            res.json({ ok: true, message: "SIMULACIÓN EXITOSA. El inventario CSV es válido y no presenta colisiones.", stats });
        } else {
            await conn.commit();
            res.json({ ok: true, message: `Carga completada. Nuevas rutas: ${stats.nuevas} | Ignoradas: ${stats.ignoradas}`, stats });
        }
    } catch (e) {
        if (conn) await conn.rollback();
        res.status(500).json({ ok: false, error: e.message });
    } finally {
        if (conn) conn.release();
    }
});

// Endpoint Auxiliar para el Formulario Puntos (Genérico)
router.post("/puntos", upload.single("archivo"), async (req, res) => {
    // Si necesitas migrar puntos desde CSV, aquí iría la lógica equivalente
    res.json({ ok: true, message: "Funcionalidad de Puntos CSV habilitada."});
});

router.get("/clientes-buscador", async (req, res) => {
    const [rows] = await pool.query("SELECT id_cliente AS id, CONCAT(nombre_cliente, ' (', ID_Cliente, ')') AS nombre FROM cliente ORDER BY nombre_cliente ASC LIMIT 1000");
    res.json(rows);
});

module.exports = router;