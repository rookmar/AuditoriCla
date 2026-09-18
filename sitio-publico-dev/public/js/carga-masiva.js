// =========================================================================
// Archivo: public/js/carga-masiva.js
// Versión: 3.0 - Soporte Multi-Módulo (KML + Rutas)
// =========================================================================

document.addEventListener("DOMContentLoaded", () => {
    cargarClientesDatalist();
});

let mapaClientes = {};

async function cargarClientesDatalist() {
    const r = await fetch('/api/carga-masiva/clientes-buscador');
    const data = await r.json();
    const list = document.getElementById('listaClientes');
    data.forEach(c => {
        mapaClientes[c.nombre] = c.id;
        let opt = document.createElement('option');
        opt.value = c.nombre;
        list.appendChild(opt);
    });
}

document.getElementById('txtClienteBusqueda').addEventListener('input', function() {
    const val = this.value;
    const hidden = document.getElementById('selClienteKml');
    if (mapaClientes[val]) {
        hidden.value = mapaClientes[val];
        this.style.background = "#ecfdf5"; 
    } else {
        hidden.value = "";
        this.style.background = "white";
    }
});

async function subir(endpoint, fileId, chkId, resId, extra = {}, fileParam = 'archivo') {
    const file = document.getElementById(fileId).files[0];
    if (!file) return alert("Selecciona un archivo primero");

    const fd = new FormData();
    fd.append(fileParam, file);
    if (document.getElementById(chkId).checked) fd.append('modo', 'dry');
    for (let k in extra) fd.append(k, extra[k]);

    const resDiv = document.getElementById(resId);
    resDiv.style.display = "block";
    resDiv.className = "console-log info";
    resDiv.innerHTML = "⏳ Procesando y verificando en base de datos...";

    try {
        const r = await fetch(`/api/carga-masiva/${endpoint}`, { method: 'POST', body: fd });
        const json = await r.json();
        renderReport(resId, json);
    } catch (e) { 
        console.error("Error capturado en frontend:", e);
        resDiv.className = "console-log error";
        resDiv.innerHTML = `❌ Error crítico de conexión. Revisa los logs.`; 
    }
}

function renderReport(id, data) {
    const el = document.getElementById(id);
    
    if (!data.ok) { 
        el.className = "console-log error";
        let h = `<b>❌ ERROR CRÍTICO DETECTADO:</b>\n${data.error}\n`;
        if (data.errors && data.errors.length) {
            h += `\n⚠️ <b>CONFLICTOS EN FILAS (Abortando transacción):</b>\n` + data.errors.map(e => `Fila ${e.row}: ${e.msg}`).join("\n");
        }
        el.innerHTML = h;
        return; 
    }
    
    el.className = "console-log success";
    let h = `<b>✅ OPERACIÓN VALIDADA</b>\n`;
    if (data.message) h += `\n💬 <i>${data.message}</i>\n`;
    
    if (data.stats) {
        if (data.stats.nuevos !== undefined || data.stats.enganches !== undefined) {
            h += `\n📍 <b>Puntos en el mapa:</b>\n`;
            if (data.stats.nuevos > 0) h += `   ↳ 🆕 Nuevos físicos creados: ${data.stats.nuevos}\n`;
            if (data.stats.enganches > 0) h += `   ↳ 🔗 Reutilizados (Enganche a poste existente): ${data.stats.enganches}\n`;
        }

        if (data.stats.tramos_nuevos !== undefined) {
            h += `\n〰️ <b>Tramos de fibra:</b>\n`;
            if (data.stats.tramos_nuevos > 0) h += `   ↳ 🆕 Nuevos trazados: ${data.stats.tramos_nuevos}\n`;
            if (data.stats.tramos_actualizados > 0) h += `   ↳ 🔄 Trazados actualizados: ${data.stats.tramos_actualizados}\n`;
        }

        if (data.stats.nuevas !== undefined && data.stats.ignoradas !== undefined) {
            h += `\n🔌 <b>Inventario Lógico (Rutas):</b>\n`;
            h += `   ↳ 🆕 Rutas/Puertos registrados: ${data.stats.nuevas}\n`;
            if (data.stats.ignoradas > 0) h += `   ↳ ⏭️ Ignoradas (Ya existían): ${data.stats.ignoradas}\n`;
        }
    }
    
    el.innerHTML = h;
}

window.subirPuntos = () => subir('puntos', 'file_Puntos', 'chkSim_Puntos', 'res_Puntos');
window.subirRutas = () => subir('rutas', 'file_Rutas', 'chkSim_Rutas', 'res_Rutas');
window.subirKml = () => {
    const cid = document.getElementById('selClienteKml').value;
    if (!cid) return alert("Selecciona un cliente válido de la lista");
    subir('kml-import', 'file_Kml', 'chkSim_Kml', 'res_Kml', { id_cliente: cid }, 'kml');
};