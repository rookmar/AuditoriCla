
            const [lng, lat] = coordsRaw.split(',').map(Number);

            // DETECTAR TIPO AUTOMÁTICAMENTE
            const tipoDetectado = detectarTipo(nombre);

            // Verificar duplicados
            const [puntosCercanos] = await connection.execute(
                `SELECT id_punto, lat, lng, tipo, etiqueta FROM mapa_punto 
                 WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`,
                [lat - 0.0001, lat + 0.0001, lng - 0.0001, lng + 0.0001] 
            );

            let esDuplicado = false;
            for (const puntoDB of puntosCercanos) {
                const distancia = calcularDistancia(lat, lng, puntoDB.lat, puntoDB.lng);
                
                // TU REGLA MAESTRA: Si están cerca Y son del mismo tipo = DUPLICADO
                if (distancia <= RADIO_IMAN_METROS && puntoDB.tipo === tipoDetectado) {
                    console.log(`❌ Duplicado: "${nombre}" cerca de "${puntoDB.etiqueta}" (${distancia.toFixed(2)}m)`);
                    esDuplicado = true;
                    break;
                }
            }

            if (!esDuplicado) {
                await connection.execute(
                    `INSERT INTO mapa_punto (lat, lng, etiqueta, tipo, descripcion) VALUES (?, ?, ?, ?, ?)`,
                    [lat, lng, nombre, tipoDetectado, descripcion]
                );
                insertados++;
            } else {
                duplicados++;
            }
        }

        console.log(`\n🏁 RESUMEN FINAL:`);
        console.log(`✅ Insertados: ${insertados}`);
        console.log(`🧹 Ignorados (Duplicados): ${duplicados}`);
        
        await connection.end();

    } catch (error) {
        console.error("🔥 Error:", error);
    }
}

migrar();
