/**
 * ============================================================================
 * Archivo: routes/falla.js
 * Módulo: API de Localización de Averías y Corte Óptico (OTDR)
 * Descripción: Implementa búsqueda de ruta por BFS, interpolación proporcional
 *              en tramos sin lectura (pozos ciegos/sellados) y genera un 
 *              corredor táctico operativo de 3 puntos [-1, 0, +1].
 * Parámetros de Entrada (POST): { cliente_id, D, offset, sentido }
 * ============================================================================
 */

const express = require("express");
const router = express.Router();
const { pool } = require("../db");

// Distancia Haversine (en metros)
function getGeoDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180, φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180, Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const lerp = (start, end, t) => start * (1 - t) + end * t;

router.post("/localizar", async (req, res) => {
  try {
    const db = req.db || pool;
    const { cliente_id, D, offset = 0, sentido = 'CENTRAL_A_CLIENTE' } = req.body;
    const targetDist = Number(D) - Number(offset);

    if (!cliente_id || isNaN(targetDist) || targetDist < 0) {
      return res.status(400).json({ ok: false, error: "Datos de distancia o cliente inválidos." });
    }

    // 1. Obtener Central y Punto Final (Cliente)
    const [[cp]] = await db.query(`SELECT id_punto FROM cliente_punto_map WHERE id_cliente=? ORDER BY id_punto DESC LIMIT 1`, [cliente_id]);
    const [[rd]] = await db.query(`SELECT id_central FROM ruta WHERE id_cliente=? LIMIT 1`, [cliente_id]);
    
    if (!cp || !rd) {
      return res.status(404).json({ ok: false, error: "No se encontró el inicio o fin de la ruta para este cliente." });
    }

    // 2. Construir Grafo y calcular ruta con BFS
    const [tramos] = await db.query(`SELECT punto_origen_id, punto_destino_id, id_tramo FROM mapa_tramo WHERE id_cliente=? OR id_cliente IS NULL`, [cliente_id]);
    const adj = new Map();
    tramos.forEach(t => {
       if (t.punto_origen_id && t.punto_destino_id) {
         if(!adj.has(t.punto_origen_id)) adj.set(t.punto_origen_id, []);
         if(!adj.has(t.punto_destino_id)) adj.set(t.punto_destino_id, []);
         adj.get(t.punto_origen_id).push({ next: t.punto_destino_id, tramo: t.id_tramo });
         adj.get(t.punto_destino_id).push({ next: t.punto_origen_id, tramo: t.id_tramo });
       }
    });

    const queue = [rd.id_central], visited = new Set([rd.id_central]), parent = new Map();
    let found = false;
    while(queue.length > 0){
        const u = queue.shift();
        if(u === cp.id_punto){ found = true; break; }
        (adj.get(u) || []).forEach(e => {
            if(!visited.has(e.next)){
                visited.add(e.next); parent.set(e.next, { prev: u, tramo: e.tramo });
                queue.push(e.next);
            }
        });
    }

    if(!found) {
      return res.status(404).json({ ok: false, error: "No existe conexión física entre la central y el cliente." });
    }

    // 3. Reconstruir camino de IDs
    let pathIds = [];
    let curr = cp.id_punto;
    pathIds.push(curr);
    while(curr !== rd.id_central){
        const p = parent.get(curr);
        if(!p) break;
        pathIds.push(p.prev);
        curr = p.prev;
    }
    pathIds.reverse(); // Orden original: [Central, Pozo1, Pozo2, ..., Cliente]

    // Inversión de ruta si el disparo del OTDR es desde el Cliente hacia la Central
    if (sentido === 'CLIENTE_A_CENTRAL') {
      pathIds.reverse();
    }

    // 4. Traer metadatos de los puntos
    const [pts] = await db.query(`
      SELECT p.id_punto, p.lat, p.lng, p.nombre, p.tipo, p.foto, cp.metraje_cable, cp.nota 
      FROM mapa_punto p 
      LEFT JOIN cliente_punto_map cp ON cp.id_punto = p.id_punto AND cp.id_cliente = ? 
      WHERE p.id_punto IN (${pathIds.join(',')})`, [cliente_id]);
    
    const pMap = new Map();
    pts.forEach(p => pMap.set(p.id_punto, { 
      lat: Number(p.lat), 
      lng: Number(p.lng), 
      nombre: p.nombre || `Punto #${p.id_punto}`,
      tipo: p.tipo || 'pozo',
      foto: p.foto || null,
      nota: p.nota || '',
      metraje: p.metraje_cable ? Number(p.metraje_cable) : null 
    }));

    const fullPath = pathIds.map(id => ({ id, ...pMap.get(id) }));

    // 5. Cálculo de distancias con soporte para pozos en rodadura/sellados (Anclas)
    let segmentos = [];
    for (let i = 0; i < fullPath.length - 1; i++) {
      const A = fullPath[i], B = fullPath[i+1];
      const geoDist = getGeoDistance(A.lat, A.lng, B.lat, B.lng);
      
      let segLen = geoDist * 1.05; // Fallback predeterminado por catenaria (5%)

      if (A.metraje !== null && B.metraje !== null && Math.abs(B.metraje - A.metraje) > 0) {
        segLen = Math.abs(B.metraje - A.metraje);
      } else {
        // Buscar ancla posterior válida para distribuir distancia proporcionalmente
        let nextAnchorIdx = -1;
        for (let j = i + 1; j < fullPath.length; j++) {
          if (fullPath[j].metraje !== null) { nextAnchorIdx = j; break; }
        }
        if (A.metraje !== null && nextAnchorIdx !== -1) {
          const anchorB = fullPath[nextAnchorIdx];
          const distMetrajeTotal = Math.abs(anchorB.metraje - A.metraje);
          
          let geoSubtotal = 0;
          for (let k = i; k < nextAnchorIdx; k++) {
            geoSubtotal += getGeoDistance(fullPath[k].lat, fullPath[k].lng, fullPath[k+1].lat, fullPath[k+1].lng);
          }
          if (geoSubtotal > 0) {
            segLen = distMetrajeTotal * (geoDist / geoSubtotal);
          }
        }
      }
      segmentos.push({ origen: A, destino: B, longitud: segLen });
    }

    // 6. Ubicar el Corte y generar el Corredor Operativo de 3 Puntos
    let accumDist = 0;
    let corteUbicado = false;
    let corredor = { punto_anterior: null, punto_corte: null, punto_posterior: null };

    for (let i = 0; i < segmentos.length; i++) {
      const seg = segmentos[i];
      
      if (targetDist >= accumDist && targetDist <= (accumDist + seg.longitud)) {
        const t = seg.longitud === 0 ? 0 : (targetDist - accumDist) / seg.longitud;
        const latCorte = lerp(seg.origen.lat, seg.destino.lat, t);
        const lngCorte = lerp(seg.origen.lng, seg.destino.lng, t);
        
        const distDesdeAnterior = (targetDist - accumDist).toFixed(1);
        const distHaciaPosterior = (accumDist + seg.longitud - targetDist).toFixed(1);

        corredor.punto_anterior = {
          ...seg.origen,
          distancia_relativa: `${distDesdeAnterior}m hacia el corte`,
          orden: -1
        };

        corredor.punto_corte = {
          lat: latCorte,
          lng: lngCorte,
          nombre: "🚨 ZONA DE CORTE ESTIMADA",
          tipo: "falla",
          metraje_otdr: `${targetDist}m desde ${sentido === 'CENTRAL_A_CLIENTE' ? 'Central' : 'Cliente'}`,
          detalle: `Aprox. ${distDesdeAnterior}m después de ${seg.origen.nombre} y ${distHaciaPosterior}m antes de ${seg.destino.nombre}`,
          orden: 0
        };

        corredor.punto_posterior = {
          ...seg.destino,
          distancia_relativa: `${distHaciaPosterior}m hacia atrás del corte`,
          orden: 1
        };

        corteUbicado = true;
        break;
      }
      accumDist += seg.longitud;
    }

    if (!corteUbicado) {
      return res.status(404).json({ 
        ok: false, 
        error: `La distancia ingresada (${targetDist}m) supera la longitud total calculada de la ruta (${accumDist.toFixed(1)}m).`,
        total_ruta: accumDist.toFixed(1)
      });
    }

    res.json({
      ok: true,
      sentido_evaluado: sentido,
      total_ruta_metros: accumDist.toFixed(1),
      corredor_tactico: [
        corredor.punto_anterior,
        corredor.punto_corte,
        corredor.punto_posterior
      ]
    });

  } catch (e) {
    console.error("Error en localización OTDR:", e);
    res.status(500).json({ ok: false, error: "Error interno en el servidor al calcular el corte." });
  }
});

module.exports = router;