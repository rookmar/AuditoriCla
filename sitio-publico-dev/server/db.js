// server/db.js
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "auditor",
  password: process.env.DB_PASS || "Shadow24k",
  database: process.env.DB_NAME || "auditoriafibra",
  port: Number(process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_POOL || 10),
  charset: "utf8mb4",
});

const columnCache = { odfPuerto: null, patcheoPuerto: null };

async function getOdfPuertoColumn() {
  if (columnCache.odfPuerto) return columnCache.odfPuerto;
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'odf'
        AND COLUMN_NAME IN ('puerto_odf','puerto')
      LIMIT 1`
  );
  columnCache.odfPuerto = rows.length ? rows[0].COLUMN_NAME : "puerto_odf";
  return columnCache.odfPuerto;
}

async function getPatcheoPuertoColumn() {
  if (columnCache.patcheoPuerto) return columnCache.patcheoPuerto;
  const [rows] = await pool.execute(
    `SELECT COLUMN_NAME
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'patcheo'
        AND COLUMN_NAME IN ('puerto_patcheo','puerto')
      LIMIT 1`
  );
  columnCache.patcheoPuerto = rows.length ? rows[0].COLUMN_NAME : "puerto_patcheo";
  return columnCache.patcheoPuerto;
}

async function upsertCentralByExternal(conn, ID_central_in, nombre_central_in) {
  const ext = (ID_central_in ?? "").toString().trim();
  const nombre = (nombre_central_in ?? "").toString().trim();
  if (!ext && !nombre) throw new Error("CENTRAL_REQUIRED");

  if (ext) {
    try {
      const [find] = await conn.execute(
        `SELECT id FROM central WHERE ID_central=? LIMIT 1`,
        [ext]
      );
      if (find.length) return find[0].id;

      if (!nombre) throw new Error("CENTRAL_NAME_REQUIRED");
      const [ins] = await conn.execute(
        `INSERT INTO central (nombre_central, ID_central) VALUES (?, ?)`,
        [nombre, ext]
      );
      return ins.insertId;
    } catch (e) {
      if (!(e && (e.code === "ER_BAD_FIELD_ERROR" || e.errno === 1054))) throw e;
    }
  }

  if (!nombre) throw new Error("CENTRAL_NAME_REQUIRED");
  const [rs] = await conn.execute(
    `SELECT id FROM central WHERE nombre_central=? LIMIT 1`,
    [nombre]
  );
  if (rs.length) return rs[0].id;
  const [ins] = await conn.execute(
    `INSERT INTO central (nombre_central, ID_central) VALUES (?, NULL)`,
    [nombre]
  );
  return ins.insertId;
}

async function ensureTables() {
  // ----- central -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS central (
      id INT NOT NULL AUTO_INCREMENT,
      nombre_central VARCHAR(255) NOT NULL,
      ID_central VARCHAR(60) NULL,
      PRIMARY KEY (id),
      UNIQUE KEY ID_central (ID_central),
      UNIQUE KEY uq_central_nombre (nombre_central)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
  try { await pool.execute(`ALTER TABLE central MODIFY COLUMN ID_central VARCHAR(60) NULL`); } catch {}

  // ----- cliente -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cliente (
      id_cliente INT NOT NULL AUTO_INCREMENT,
      nombre_cliente VARCHAR(255) NOT NULL,
      tarea INT NULL,
      ID_Cliente VARCHAR(60) NULL,
      PRIMARY KEY (id_cliente),
      UNIQUE KEY uq_cliente_nombre (nombre_cliente),
      UNIQUE KEY uq_cliente_idexterno (ID_Cliente)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
  try { await pool.execute(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS ID_Cliente VARCHAR(60) NULL`); } catch {}
  try { await pool.execute(`CREATE UNIQUE INDEX uq_cliente_idexterno ON cliente (ID_Cliente)`); } catch {}

  // ----- odf -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS odf (
      id_odf INT NOT NULL AUTO_INCREMENT,
      nombre_odf VARCHAR(120) DEFAULT NULL,
      nemonico_odf VARCHAR(120) DEFAULT NULL,
      puerto_odf VARCHAR(50) NOT NULL,
      puerto INT DEFAULT NULL,
      PRIMARY KEY (id_odf)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // ----- patcheo -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS patcheo (
      id_patcheo INT NOT NULL AUTO_INCREMENT,
      nemonico_patcheo VARCHAR(255) NOT NULL,
      puerto_patcheo VARCHAR(50) NOT NULL,
      PRIMARY KEY (id_patcheo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // ----- equipo -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS equipo (
      id_equipo INT NOT NULL AUTO_INCREMENT,
      nemonico_equipo VARCHAR(255) NOT NULL,
      marca VARCHAR(120) DEFAULT NULL,
      slot INT DEFAULT NULL,
      posicion VARCHAR(120) DEFAULT NULL,
      PRIMARY KEY (id_equipo),
      UNIQUE KEY uq_equipo_nemonico (nemonico_equipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // ----- ruta -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ruta (
      id_ruta INT NOT NULL AUTO_INCREMENT,
      id_cliente INT DEFAULT NULL,
      id_odf INT DEFAULT NULL,
      id_patcheo INT DEFAULT NULL,
      id_equipo INT DEFAULT NULL,
      nemonico_patcheo VARCHAR(255) DEFAULT NULL,
      puerto_patcheo VARCHAR(50) DEFAULT NULL,
      id_central INT DEFAULT NULL,
      coordenadas TEXT DEFAULT NULL,
      PRIMARY KEY (id_ruta),
      KEY idx_cliente (id_cliente),
      KEY idx_odf (id_odf),
      KEY idx_patcheo (id_patcheo),
      KEY idx_equipo (id_equipo),
      KEY idx_central (id_central),
      CONSTRAINT fk_ruta_central  FOREIGN KEY (id_central)  REFERENCES central (id),
      CONSTRAINT fk_ruta_cliente  FOREIGN KEY (id_cliente)  REFERENCES cliente(id_cliente),
      CONSTRAINT fk_ruta_equipo   FOREIGN KEY (id_equipo)   REFERENCES equipo(id_equipo),
      CONSTRAINT fk_ruta_odf      FOREIGN KEY (id_odf)      REFERENCES odf(id_odf),
      CONSTRAINT fk_ruta_patcheo  FOREIGN KEY (id_patcheo)  REFERENCES patcheo(id_patcheo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // ----- mapa_punto -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS mapa_punto (
      id_punto   INT NOT NULL AUTO_INCREMENT,
      lat        DECIMAL(10,7) NOT NULL,
      lng        DECIMAL(10,7) NOT NULL,
      etiqueta   VARCHAR(120) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_punto),
      KEY idx_latlng (lat,lng)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
  try { await pool.execute(`ALTER TABLE mapa_punto ADD COLUMN IF NOT EXISTS nombre VARCHAR(255) NULL`); } catch {}
  try { await pool.execute(`ALTER TABLE mapa_punto ADD COLUMN IF NOT EXISTS tipo VARCHAR(60) NULL`); } catch {}
  try { await pool.execute(`ALTER TABLE mapa_punto ADD COLUMN IF NOT EXISTS descripcion TEXT NULL`); } catch {}
  try { await pool.execute(`ALTER TABLE mapa_punto ADD COLUMN IF NOT EXISTS imagen_url VARCHAR(512) NULL`); } catch {}

  // ----- cliente_punto_map -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS cliente_punto_map (
      id_cliente INT NOT NULL,
      id_punto   INT NOT NULL,
      PRIMARY KEY (id_cliente, id_punto),
      KEY idx_punto (id_punto),
      CONSTRAINT fk_cpm_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE,
      CONSTRAINT fk_cpm_punto   FOREIGN KEY (id_punto)   REFERENCES mapa_punto(id_punto) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
  try { await pool.execute(`ALTER TABLE cliente_punto_map ADD COLUMN IF NOT EXISTS nota TEXT NULL`); } catch {}

  // ----- mapa_tramo -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS mapa_tramo (
      id_tramo   INT NOT NULL AUTO_INCREMENT,
      id_cliente INT NOT NULL,
      nombre     VARCHAR(120) DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id_tramo),
      KEY idx_cliente (id_cliente),
      CONSTRAINT fk_mt_cliente FOREIGN KEY (id_cliente) REFERENCES cliente(id_cliente) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
  try { await pool.execute(`ALTER TABLE mapa_tramo ADD COLUMN IF NOT EXISTS datos_cable TEXT NULL`); } catch {}

  // ----- mapa_tramo_punto -----
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS mapa_tramo_punto (
      id_tramo INT NOT NULL,
      id_punto INT NOT NULL,
      orden    INT NOT NULL,
      PRIMARY KEY (id_tramo, id_punto),
      KEY idx_tramo (id_tramo, orden),
      KEY idx_punto (id_punto),
      CONSTRAINT fk_mtp_tramo FOREIGN KEY (id_tramo) REFERENCES mapa_tramo(id_tramo) ON DELETE CASCADE,
      CONSTRAINT fk_mtp_punto FOREIGN KEY (id_punto) REFERENCES mapa_punto(id_punto) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
}

module.exports = {
  pool,
  ensureTables,
  getOdfPuertoColumn,
  getPatcheoPuertoColumn,
  upsertCentralByExternal,
};
