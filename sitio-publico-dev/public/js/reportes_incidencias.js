// ============================================================================
// ARCHIVO: public/js/reportes_incidencias.js
// Versión 2.1 - Apuntando al nuevo cerebro analítico
// ============================================================================

(async function() {
    const $ = (s) => document.querySelector(s);
    
    let instCharts = { redes: null, efectividad: null, nodos: null, danos: null };
    let cacheTickets = []; 

    function text(v) { 
        if (v === undefined || v === null) return ""; 
        return String(v).replace(/[&<>'"]/g, t => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[t]));
    }

    try {
        const rMe = await fetch('/api/me?_=' + Date.now());
        if(rMe.ok) {
            const d = await rMe.json();
            if(d.user) $('#welcomeText').textContent = `Bienvenido, ${d.user.nombre || d.user.usuario}`;
        }
    } catch(e) {}

    window.switchTab = function(tabName, btnElement) {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        $(`#tab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`).classList.add('active');
        btnElement.classList.add('active');
    };

    async function cargarDashboard() {
        const desde = $('#desde').value;
        const hasta = $('#hasta').value;
        const q = $('#q').value.trim();

        const params = new URLSearchParams({ desde, hasta, q });
        const btn = $('#btnFiltrar');
        btn.disabled = true; btn.textContent = "⌛...";

        try {
            // TUBERÍA ACTUALIZADA -> Apunta a reportes_incidencias
            const res = await fetch(`/api/reportes_incidencias/estadisticas?${params}`);
            const json = await res.json();
            if (!json.ok) throw new Error(json.error);

            const data = json.data;
            cacheTickets = data.tickets || [];

            if (instCharts.redes) instCharts.redes.destroy();
            if (instCharts.efectividad) instCharts.efectividad.destroy();
            if (instCharts.nodos) instCharts.nodos.destroy();
            if (instCharts.danos) instCharts.danos.destroy();

            const coloresDona = ['#c7352b', '#1f2a37', '#6b7280', '#e5e7eb'];

            instCharts.redes = new Chart(document.getElementById('chartRedes'), {
                type: 'doughnut',
                data: {
                    labels: data.redes.map(r => r.dano_red || "No especificado"),
                    datasets: [{ data: data.redes.map(r => r.total), backgroundColor: coloresDona, borderWidth: 2 }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            instCharts.efectividad = new Chart(document.getElementById('chartEfectividad'), {
                type: 'pie',
                data: {
                    labels: data.efectividad.map(e => String(e.reparado) === "1" ? 'Sí (Reparado)' : 'No (Pendiente)'),
                    datasets: [{ data: data.efectividad.map(e => e.total), backgroundColor: ['#10b981', '#ef4444'], borderWidth: 2 }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });

            instCharts.nodos = new Chart(document.getElementById('chartNodos'), {
                type: 'bar',
                data: {
                    labels: data.nodos.map(n => n.nodo),
                    datasets: [{
                        label: 'Fallas', data: data.nodos.map(n => n.total),
                        backgroundColor: 'rgba(199, 53, 43, 0.8)', borderColor: '#c7352b', borderWidth: 1
                    }]
                },
                options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });

            instCharts.danos = new Chart(document.getElementById('chartDanos'), {
                type: 'bar',
                data: {
                    labels: data.danos.map(d => d.tipo_dano),
                    datasets: [{ data: data.danos.map(d => d.total), backgroundColor: '#1f2a37', borderRadius: 4 }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });

            const tbodyDet = $('#tbodyDetalles');
            if (cacheTickets.length > 0) {
                tbodyDet.innerHTML = cacheTickets.map(t => {
                    const fRep = t.fecha_reparacion ? new Date(t.fecha_reparacion).toLocaleDateString() : '-';
                    const isRep = String(t.reparado) === "1";
                    return `
                        <tr>
                            <td><strong>${t.id_incidencia}</strong></td>
                            <td>${fRep}</td>
                            <td>${text(t.n_falla)}</td>
                            <td><span style="color:#b91c1c; font-weight:700;">${text(t.id_cliente_ext)}</span></td>
                            <td>${text(t.nombre_cliente_manual)}</td>
                            <td>${text(t.nodo)}</td>
                            <td>${text(t.dano_red)}</td>
                            <td>${text(t.tipo_dano)}</td>
                            <td>${text(t.tipo_solucion)}</td>
                            <td><span class="badge-status ${isRep ? 'reparado' : 'pendiente'}">${isRep ? 'REPARADO' : 'PENDIENTE'}</span></td>
                            <td>${text(t.tecnicos_atienden)}</td>
                            <td>${text(t.material_utilizado)}</td>
                            <td>${text(t.tecnico)}</td>
                        </tr>
                    `;
                }).join('');
            } else {
                tbodyDet.innerHTML = `<tr><td colspan="13" style="text-align:center; color:#dc2626; font-weight:bold; padding:20px;">❌ No hay registros individuales para este filtro.</td></tr>`;
            }

            const tbodyReinc = $('#tbodyReincidentes');
            if (data.reincidentes && data.reincidentes.length > 0) {
                tbodyReinc.innerHTML = data.reincidentes.map(c => `
                    <tr>
                        <td><strong>${text(c.id_cliente_ext)}</strong></td>
                        <td>${text(c.nombre_cliente_manual || 'Sin nombre registrado')}</td>
                        <td><span class="badge-falla">${c.total_fallas} Reportes</span></td>
                    </tr>
                `).join('');
            } else {
                tbodyReinc.innerHTML = `<tr><td colspan="3" style="text-align:center; color:#10b981; font-weight:bold; padding:20px;">🎉 Todo limpio. No hay clientes con fallas repetitivas en este periodo.</td></tr>`;
            }

        } catch (error) {
            console.error(error);
            alert("Error procesando filtros del dashboard: " + error.message);
        } finally {
            btn.disabled = false; btn.textContent = "Filtrar";
        }
    }

    $('#btnExcel').addEventListener('click', () => {
        if (!cacheTickets || cacheTickets.length === 0) return alert("⚠️ No hay datos filtrados.");
        
        const registrosMapeados = cacheTickets.map(t => ({
            "ID Ticket": t.id_incidencia, "Fecha de Reparación": t.fecha_reparacion ? new Date(t.fecha_reparacion).toLocaleDateString() : 'Pendiente',
            "Área de Trabajo": t.area_trabajo || '', "Número de Falla": t.n_falla || '',
            "Cuadrilla / Técnicos": t.tecnicos_atienden || '', "ID Cliente Claro": t.id_cliente_ext || '',
            "Nombre del Abonado": t.nombre_cliente_manual || '', "Dirección": t.direccion_cliente || '',
            "Segmento Red": t.dano_red || '', "Nodo / Sector": t.nodo || '',
            "Tecnología": t.tecnologia || '', "Tipo de Daño": t.tipo_dano || '',
            "Solución Aplicada": t.tipo_solucion || '', "¿Fue Reparado?": String(t.reparado) === "1" ? 'SÍ' : 'NO',
            "Motivo No Reparación": t.motivo_no_reparacion || '', "¿Red Alterna?": String(t.red_alterna) === "1" ? 'SÍ' : 'NO',
            "Nombre Red Alterna": t.nombre_red_alterna || '', "Coordenada Lat": t.lat || '',
            "Coordenada Lng": t.lng || '', "Materiales Utilizados": t.material_utilizado || '',
            "Nombre de Auditor": t.tecnico || ''
        }));

        const hojaTrabajo = XLSX.utils.json_to_sheet(registrosMapeados);
        const libroTrabajo = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libroTrabajo, hojaTrabajo, "Historial Averías");
        XLSX.writeFile(libroTrabajo, `Reporte_Averias_${new Date().toISOString().slice(0,10)}.xlsx`);
    });

    $('#btnFiltrar').addEventListener('click', cargarDashboard);
    $('#btnLimpiar').addEventListener('click', () => {
        $('#desde').value = ''; $('#hasta').value = ''; $('#q').value = '';
        cargarDashboard();
    });

    document.addEventListener('DOMContentLoaded', cargarDashboard);
})();