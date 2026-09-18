/* importar_kml_v2.js
   - Detecta si es Pozo o Poste.
   - Limpia el HTML de las descripciones.
   - NO DUPLICA: Reutiliza puntos si ya existen en las coordenadas.
*/

const fs = require('fs');
const xml2js = require('xml2js');
const mysql = require('mysql2/promise');
require('dotenv').config();

// CONFIGURA AQUÍ EL ID DEL CLIENTE
const ID_CLIENTE_DESTINO = 1; 

// Tolerancia para encontrar puntos existentes (aprox 1 metro)
const TOLERANCIA = 0.00001; 

async function importar() {
  const db = await mysql.createConnection({
    host: '127.0.0.1',
    user: process.env.DB_USER || 'auditor',
    password: process.env.DB_PASS || 'Shadow24k',
    database: process.env.DB_NAME || 'auditoriafibra'
  });

  console.log("🧠 Iniciando Importación Inteligente (V2)...");

  try {
    const xml = fs.readFileSync('./mapa_google.kml', 'utf8');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xml);
    
    // Aplanar la estructura del KML para encontrar todos los Placemarks
    const placemarks = [];
    const buscarPlacemarks = (obj) => {
        if (obj.Placemark) placemarks.push(...obj.Placemark);
        if (obj.Folder) obj.Folder.forEach(f => buscarPlacemarks(f));
        if (obj.Document) obj.Document.forEach(d => buscarPlacemarks(d));
    };
    // A veces la raíz es kml -> Document, a veces kml -> Folder
    if(result.kml) buscarPlacemarks(result.kml);

    console.log(`🔍 Analizando ${placemarks.length} elementos...`);

    let nuevosPuntos = 0;
    let puntosReusados = 0;
    let tramosCreados = 0;

    // --- FUNCIONES AYUDANTES ---
    
    // 1. Detectar si es Pozo o Poste según el nombre
    const detectarTipo = (nombre) => {
        const n = (nombre || "").toLowerCase();
        if (n.includes("pozo") || n.includes("manhole")) return "pozo";
        if (n.includes("mufa")) return "mufa";
        if (n.includes("reserva")) return "reserva";
        return "poste"; // Default
    };

    // 2. Limpiar HTML feo de Google
    const limpiarDescripcion = (desc) => {
        if (!desc) return "";
        // Eliminar etiquetas <img> completas
        let limpio = desc.replace(/<img[^>]*>/g, "");
        // Eliminar saltos de línea excesivos y espacios
        return limpio.replace(/<br>/g, "\n").trim();
    };

    // 3. Buscar si el punto ya existe (Evitar duplicados)
    const buscarPuntoID = async (lat, lng) => {
        const [rows] = await db.execute(
            `SELECT id_punto FROM mapa_punto 
             WHERE ABS(lat - ?) < ? AND ABS(lng - ?) < ? LIMIT 1`,
            [lat, TOLERANCIA, lng, TOLERANCIA]
        );
        return rows.length > 0 ? rows[0].id_punto : null;
    };

    // --- PROCESAMIENTO ---

    for (const pm of placemarks) {
        const nombre = pm.name ? pm.name[0] : 'Sin nombre';
        const descRaw = pm.description ? pm.description[0] : '';
        const descLimpia = limpiarDescripcion(descRaw);
        const tipoDetectado = detectarTipo(nombre);

        // --- CASO 1: PUNTOS ---
        if (pm.Point && pm.Point[0].coordinates) {
            const coordsRaw = pm.Point[0].coordinates[0].trim();
            const [lng, lat] = coordsRaw.split(',');

            // ¿Ya existe?
            let idPunto = await buscarPuntoID(lat, lng);

            if (idPunto) {
                // Si existe, Opcional: Actualizar datos si quieres, aquí solo avisamos
                puntosReusados++;
            } else {
                // Crear nuevo
                await db.execute(
                    `INSERT INTO mapa_punto (nombre, descripcion, tipo, lat, lng) VALUES (?, ?, ?, ?, ?)`,
                    [nombre, descLimpia, tipoDetectado, lat, lng]
                );
                nuevosPuntos++;
            }
            process.stdout.write('.');
        }

        // --- CASO 2: LÍNEAS (TRAMOS) ---
        else if (pm.LineString && pm.LineString[0].coordinates) {
            const coordsRaw = pm.LineString[0].coordinates[0].trim();
            const listaCoords = coordsRaw.split(/\s+/).map(pair => {
                const [lng, lat] = pair.split(',');
                return { lat, lng };
            }).filter(c => c.lat && c.lng);

            if (listaCoords.length < 2) continue;

            // Crear el TRAMO
            const [resTramo] = await db.execute(
                `INSERT INTO mapa_tramo (nombre, datos_cable, id_cliente) VALUES (?, ?, ?)`,
                [nombre, descLimpia, ID_CLIENTE_DESTINO]
            );
            const idTramo = resTramo.insertId;

            // Conectar los puntos del tramo (Vértices)
            let orden = 1;
            for (const coord of listaCoords) {
                // Verificar si este vértice es un punto existente (ej. un poste conocido)
                let idPunto = await buscarPuntoID(coord.lat, coord.lng);

                if (!idPunto) {
                    // Si es un vértice en medio de la nada, creamos un "nodo" oculto
                    // O si prefieres que sean postes nuevos, cambia 'nodo' por 'poste'
                    const [resP] = await db.execute(
                        `INSERT INTO mapa_punto (nombre, tipo, lat, lng) VALUES (?, ?, ?, ?)`,
                        [`Vértice ${nombre}`, 'nodo', coord.lat, coord.lng]
                    );
                    idPunto = resP.insertId;
                }

                // Vincular al tramo
                await db.execute(
                    `INSERT INTO mapa_tramo_punto (id_tramo, id_punto, orden) VALUES (?, ?, ?)`,
                    [idTramo, idPunto, orden]
                );
                orden++;
            }
            tramosCreados++;
            process.stdout.write('-');
        }
    }

    console.log(`\n\n✅ IMPORTACIÓN V2 COMPLETADA:`);
    console.log(`   ✨ Puntos Nuevos: ${nuevosPuntos}`);
    console.log(`   ♻️ Puntos Reutilizados: ${puntosReusados}`);
    console.log(`   〰️ Tramos Creados: ${tramosCreados}`);

  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await db.end();
  }
}

importar();
