/**
 * ============================================================================
 * ARCHIVO: public/js/dashboard-gpon.js
 * DESCRIPCIÓN: Controlador principal de la vista del Dashboard GPON.
 * ============================================================================
 */

let globalRankings = { tecnicos: [], asesores: [], auditores: [] };
let chartInstance = null; 
let opcionesCargadas = false; 

document.addEventListener('DOMContentLoaded', () => {
    inicializarFechas();
    cargarDatosDashboard();

    document.getElementById('btnAplicarFiltros')?.addEventListener('click', cargarDatosDashboard);
    
    document.getElementById('btnLimpiarFiltros')?.addEventListener('click', () => {
        inicializarFechas();
        document.getElementById('filtroTecnico').value = '';
        document.getElementById('filtroAsesor').value = '';
        document.getElementById('filtroArea').value = ''; // NUEVO: Limpiar Área
        cargarDatosDashboard();
    });
    
    document.getElementById('btnExportarExcel')?.addEventListener('click', generarExcelNativo);
});

function inicializarFechas() {
    document.getElementById('filtroFechaInicio').value = '';
    document.getElementById('filtroFechaFin').value = '';
}

function obtenerLabelPeriodo(fInicio, fFin) {
    if (!fInicio || !fFin) return "Histórico seleccionado";
    const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    
    const dInicio = new Date(fInicio + 'T00:00:00');
    const dFin = new Date(fFin + 'T00:00:00');

    if (dInicio.getMonth() === dFin.getMonth() && dInicio.getFullYear() === dFin.getFullYear()) {
        return `de ${meses[dInicio.getMonth()]} ${dInicio.getFullYear()}`;
    } else {
        return `del ${dInicio.toLocaleDateString('es-ES')} al ${dFin.toLocaleDateString('es-ES')}`;
    }
}

async function cargarDatosDashboard() {
    try {
        const fechaInicio = document.getElementById('filtroFechaInicio').value;
        const fechaFin = document.getElementById('filtroFechaFin').value;
        const tecnico = document.getElementById('filtroTecnico').value;
        const asesor = document.getElementById('filtroAsesor').value;
        const area = document.getElementById('filtroArea').value; // NUEVO: Capturar área

        // NUEVO: Incluir área en la validación
        const hayFiltro = Boolean(
            (fechaInicio && fechaInicio.trim() !== '') ||
            (fechaFin && fechaFin.trim() !== '') ||
            (tecnico && tecnico.trim() !== '') ||
            (asesor && asesor.trim() !== '') ||
            (area && area.trim() !== '')
        );

        if (!hayFiltro) {
            document.getElementById('kpi-visitas').innerText = '0';
            document.getElementById('kpi-totales').innerText = '0';
            document.getElementById('kpi-aprobadas').innerText = '0';
            document.getElementById('kpi-pendientes').innerText = '0';

            const msgFiltro = "Sin filtro seleccionado";
            document.getElementById('label-kpi-visitas').innerText = msgFiltro;
            document.getElementById('label-kpi-totales').innerText = msgFiltro;
            document.getElementById('label-kpi-aprobadas').innerText = msgFiltro;
            document.getElementById('label-kpi-pendientes').innerText = msgFiltro;
            document.getElementById('label-titulo-semanas').innerText = "";

            document.getElementById('contenedor-semanas').innerHTML = 
                '<p style="color:var(--muted); text-align:center; grid-column: 1 / -1; padding: 20px;">Por favor, seleccione un área, fecha o técnico para consultar la información.</p>';
            
            document.getElementById('leaderboard-content').innerHTML = 
                '<p style="color:var(--muted); text-align:center; padding: 20px;">Seleccione un filtro para consultar el ranking.</p>';

            if (chartInstance) chartInstance.destroy();

            if (!opcionesCargadas) {
                const response = await fetch('/api/dashboard-gpon/stats');
                if (response.ok) {
                    const data = await response.json();
                    if (data.opcionesFiltro) {
                        poblarSelect('filtroTecnico', data.opcionesFiltro.tecnicos);
                        poblarSelect('filtroAsesor', data.opcionesFiltro.asesores);
                        opcionesCargadas = true;
                    }
                }
            }
            return;
        }

        // NUEVO: Etiqueta dinámica más elegante si solo selecciona el área
        let textoPeriodo = obtenerLabelPeriodo(fechaInicio, fechaFin);
        if (area && !fechaInicio && !fechaFin) textoPeriodo = `Área: ${area}`;
        
        document.getElementById('label-kpi-visitas').innerText = textoPeriodo;
        document.getElementById('label-kpi-totales').innerText = textoPeriodo;
        document.getElementById('label-kpi-aprobadas').innerText = textoPeriodo;
        document.getElementById('label-kpi-pendientes').innerText = textoPeriodo;
        document.getElementById('label-titulo-semanas').innerText = `(${textoPeriodo})`;

        // NUEVO: Mandar el área en los parámetros
        const queryParams = new URLSearchParams({ fechaInicio, fechaFin, tecnico, asesor, area });
        
        const response = await fetch(`/api/dashboard-gpon/stats?${queryParams.toString()}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!data.success) return alert('Error cargando estadísticas');

        document.getElementById('kpi-visitas').innerText = data.kpis.visitas;
        document.getElementById('kpi-totales').innerText = data.kpis.recepcionesTotales;
        document.getElementById('kpi-aprobadas').innerText = data.kpis.aprobadas;
        document.getElementById('kpi-pendientes').innerText = data.kpis.pendientes;

        globalRankings = data.rankings || { tecnicos: [], asesores: [], auditores: [] };
        
        const activeTab = document.querySelector('.tab-btn.active');
        const tipoActual = activeTab ? activeTab.innerText.toLowerCase().trim() : 'tecnicos';
        
        if (tipoActual === 'técnicos' || tipoActual === 'tecnicos') renderizarLeaderboard(globalRankings.tecnicos, 'visitas');
        else if (tipoActual === 'asesores') renderizarLeaderboard(globalRankings.asesores, 'visitas');
        else if (tipoActual === 'auditores') renderizarLeaderboard(globalRankings.auditores, 'auditorías');

        renderizarDesgloseSemanal(data.graficos.visitas || [], data.graficos.recepciones || []);
        renderizarGraficoTendencia(data.graficos.visitas || [], data.graficos.recepciones || []);

        if (!opcionesCargadas && data.opcionesFiltro) {
            poblarSelect('filtroTecnico', data.opcionesFiltro.tecnicos);
            poblarSelect('filtroAsesor', data.opcionesFiltro.asesores);
            opcionesCargadas = true;
        }

    } catch (error) {
        console.error('Error cargando dashboard:', error);
    }
}

function poblarSelect(id, lista) {
    const select = document.getElementById(id);
    if (!select || !Array.isArray(lista)) return;
    lista.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item;
        opt.textContent = item;
        select.appendChild(opt);
    });
}

function cambiarTab(tipo, ev) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    if (ev?.currentTarget) ev.currentTarget.classList.add('active');

    let sufijo = 'visitas';
    if (tipo === 'auditores') sufijo = 'auditorías';

    renderizarLeaderboard(globalRankings[tipo] || [], sufijo);
}

function renderizarLeaderboard(lista, sufijo = 'registros') {
    const contenedor = document.getElementById('leaderboard-content');
    if (!contenedor) return;

    if (!Array.isArray(lista) || lista.length === 0) {
        contenedor.innerHTML = '<p style="color:var(--muted); text-align:center;">Sin registros en este periodo</p>';
        return;
    }

    contenedor.innerHTML = lista.map((item, index) => `
        <div class="leader-item">
            <span class="leader-name">${index + 1}. ${item.nombre}</span>
            <span class="leader-badge">${item.total} ${sufijo}</span>
        </div>
    `).join('');
}

function renderizarDesgloseSemanal(visitasData, recepcionesData) {
    const contenedor = document.getElementById('contenedor-semanas');
    if (!contenedor) return;

    const semanasMap = { 1: {v:0, r:0}, 2: {v:0, r:0}, 3: {v:0, r:0}, 4: {v:0, r:0}, 5: {v:0, r:0}, 6: {v:0, r:0} };

    const agrupar = (arr, tipo) => {
        arr.forEach(item => {
            const dia = parseInt(item.fecha_str.split('-')[2], 10);
            const numSemana = Math.ceil(dia / 7);
            if(semanasMap[numSemana]) semanasMap[numSemana][tipo] += item.total;
        });
    };

    agrupar(visitasData, 'v');
    agrupar(recepcionesData, 'r');

    contenedor.innerHTML = '';
    let html = '';

    for(let i=1; i<=6; i++){
        if (semanasMap[i].v > 0 || semanasMap[i].r > 0 || i <= 4) {
            html += `
                <div class="semana-card">
                    <h4>Semana ${i}</h4>
                    <p class="txt-rojo">🔴 ${semanasMap[i].v} Visitas</p>
                    <p class="txt-azul">🔵 ${semanasMap[i].r} Recepciones</p>
                </div>
            `;
        }
    }
    contenedor.innerHTML = html;
}

function renderizarGraficoTendencia(visitasData, recepcionesData) {
    if (typeof ApexCharts === 'undefined') return;

    const setFechas = new Set([...visitasData.map(v => v.fecha_str), ...recepcionesData.map(r => r.fecha_str)]);
    const categorias = Array.from(setFechas).sort();
    if (categorias.length === 0) categorias.push('Sin Datos');

    const mapaVisitas = new Map(visitasData.map(v => [v.fecha_str, v.total]));
    const mapaRecepciones = new Map(recepcionesData.map(r => [r.fecha_str, r.total]));

    const seriesVisitas = categorias.map(f => mapaVisitas.get(f) || 0);
    const seriesRecepciones = categorias.map(f => mapaRecepciones.get(f) || 0);

    const options = {
        chart: { type: 'line', height: 330, toolbar: { show: false }, animations: { enabled: true }, fontFamily: 'inherit' },
        stroke: { width: [3, 3], curve: 'smooth' },
        colors: ['#c7352b', '#0ea5e9'],
        series: [
            { name: 'Visitas Técnicas', data: seriesVisitas },
            { name: 'Recepciones Master', data: seriesRecepciones }
        ],
        xaxis: { categories: categorias, labels: { rotate: -45, style: { fontSize: '11px', cssClass: 'muted' } } },
        legend: { position: 'top' },
        markers: { size: 5 }
    };

    if (chartInstance) chartInstance.destroy();
    
    chartInstance = new ApexCharts(document.querySelector("#chart-tendencia"), options);
    chartInstance.render();
}

/**
 * ============================================================================
 * NUEVO GENERADOR DE EXCEL NATIVO (SIN LIBRERÍAS EXTERNAS)
 * ============================================================================
 */
async function generarExcelNativo() {
    const btn = document.getElementById('btnExportarExcel');
    if (!btn) return;

    const btnTextOriginal = btn.innerText;
    btn.innerText = "⏳ Generando...";
    btn.disabled = true;

    try {
        const fI = document.getElementById('filtroFechaInicio').value;
        const fF = document.getElementById('filtroFechaFin').value;
        const te = document.getElementById('filtroTecnico').value;
        const as = document.getElementById('filtroAsesor').value;
        const ar = document.getElementById('filtroArea').value; // NUEVO: Extraer para el Excel

        // NUEVO: Pasar el área al Query string
        const q = new URLSearchParams({ fechaInicio: fI, fechaFin: fF, tecnico: te, asesor: as, area: ar });

        const r = await fetch(`/api/dashboard-gpon/export?${q.toString()}`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        
        const data = await r.json();

        if (!data.success) {
            alert('El servidor no pudo procesar los datos para el reporte.');
            return;
        }

        // NUEVO: Agregar el nombre del área al archivo de Excel
        let nombreArchivo = `Reporte_GPON`;
        if (ar) nombreArchivo += `_${ar}`;
        if (fI) nombreArchivo += `_${fI}_al_${fF||'Total'}`;
        nombreArchivo += `.xls`;

        let tablaHTML = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8"></head>
            <body>
        `;

        tablaHTML += `<h2 style="color: #c62828;">Visitas Técnicas GPON</h2>`;
        if (data.visitas && data.visitas.length > 0) {
            tablaHTML += `<table border="1"><thead><tr>`;
            Object.keys(data.visitas[0]).forEach(k => tablaHTML += `<th style="background-color:#f4f6f9; font-weight:bold;">${k}</th>`);
            tablaHTML += `</tr></thead><tbody>`;
            data.visitas.forEach(row => {
                tablaHTML += `<tr>`;
                Object.values(row).forEach(v => tablaHTML += `<td>${v !== null && v !== undefined ? v : ''}</td>`);
                tablaHTML += `</tr>`;
            });
            tablaHTML += `</tbody></table><br><br>`;
        } else {
            tablaHTML += `<p>Sin datos de visitas en este rango</p><br><br>`;
        }

        tablaHTML += `<h2 style="color: #1976d2;">Auditorías Master GPON</h2>`;
        if (data.recepciones && data.recepciones.length > 0) {
            tablaHTML += `<table border="1"><thead><tr>`;
            Object.keys(data.recepciones[0]).forEach(k => tablaHTML += `<th style="background-color:#f4f6f9; font-weight:bold;">${k}</th>`);
            tablaHTML += `</tr></thead><tbody>`;
            data.recepciones.forEach(row => {
                tablaHTML += `<tr>`;
                Object.values(row).forEach(v => tablaHTML += `<td>${v !== null && v !== undefined ? v : ''}</td>`);
                tablaHTML += `</tr>`;
            });
            tablaHTML += `</tbody></table>`;
        } else {
            tablaHTML += `<p>Sin datos de auditorías en este rango</p>`;
        }

        tablaHTML += `</body></html>`;

        const blob = new Blob([tablaHTML], { type: 'application/vnd.ms-excel' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = nombreArchivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

    } catch (e) {
        console.error("Error al exportar:", e);
        alert('Ocurrió un error al generar el archivo. Revisa tu conexión.');
    } finally {
        btn.innerText = btnTextOriginal;
        btn.disabled = false;
    }
}