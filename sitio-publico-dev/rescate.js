require('dotenv').config();
const mysql = require('mysql2/promise');

async function migrar() {
  const db = await mysql.createConnection({
    host: '127.0.0.1', // Forzamos local
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  console.log("🚑 Iniciando rescate hacia tablas 'puntos' y 'tramos'...");

  // 1. Leer tramos de la estructura vieja (Docker)
  const [tramosViejos] = await db.execute(`
    SELECT mt.id_tramo, mt.nombre, mt.id_cliente, mt.datos_cable
    FROM mapa_tramo mt
  `);

  console.log(`🔍 Procesando ${tramosViejos.length} tramos...`);

  for (const tramo of tramosViejos) {
    // 2. Obtener coordenadas de los puntos viejos
    const [puntosViejos] = await db.execute(`
      SELECT mp.lat, mp.lng
      FROM mapa_tramo_punto mtp
      JOIN mapa_punto mp ON mtp.id_punto = mp.id_punto
      WHERE mtp.id_tramo = ?
      ORDER BY mtp.orden ASC
    `, [tramo.id_tramo]);

    if (puntosViejos.length < 2) continue;

    // 3. Buscar los IDs en la tabla 'puntos' (la que usa tu sistema actual)
    // Usamos coordenadas para encontrar el ID nuevo
    const [origen] = await db.execute('SELECT id FROM puntos WHERE lat=? AND lng=? LIMIT 1', [puntosViejos[0].lat, puntosViejos[0].lng]);
    const [destino] = await db.execute('SELECT id FROM puntos WHERE lat=? AND lng=? LIMIT 1', [puntosViejos[puntosViejos.length-1].lat, puntosViejos[puntosViejos.length-1].lng]);

    if (!origen[0] || !destino[0]) {
      // Si no encuentra el punto, lo intentamos crear al vuelo (backup)
      console.log(`⚠️ Puntos no encontrados para tramo ${tramo.id_tramo}, saltando...`);
      continue;
    }

    // 4. Armar el JSON del camino
    const pathJson = JSON.stringify(puntosViejos);
    
    // Extraer color y peso si existen
    let color = '#E11D48';
    let weight = 4;
    try {
      const meta = JSON.parse(tramo.datos_cable);
      if (meta.color) color = meta.color;
      if (meta.weight) weight = meta.weight;
    } catch (e) {}

    // 5. INSERTAR en la tabla final 'tramos'
    try {
      await db.execute(`
        INSERT INTO tramos (nombre, punto_origen_id, punto_destino_id, path_json, capacidad, color, weight, cliente_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        tramo.nombre || 'Tramo Recuperado',
        origen[0].id,
        destino[0].id,
        pathJson,
        '12F', 
        color,
        weight,
        tramo.id_cliente
      ]);
      process.stdout.write('.');
    } catch (err) {
      console.error(`❌ Error insertando tramo: ${err.message}`);
    }
  }

  console.log("\n✅ ¡Listo! Tablas 'puntos' y 'tramos' actualizadas.");
  await db.end();
}

migrar().catch(console.error);
