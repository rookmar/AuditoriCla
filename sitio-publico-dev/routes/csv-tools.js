// ====== EXPORTACIÓN TSV (TAB) ======
// GET /api/export-tsv/:tipo
router.get('/export-tsv/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const def = MASS_IMPORTS[tipo];
    if (!def) {
      return res.status(400).json({ ok: false, error: `Tipo no permitido. Usa uno de: ${Object.keys(MASS_IMPORTS).join(', ')}` });
    }
    const pool = await getPool();
    const [rows] = await pool.query(`SELECT ${def.columns.join(', ')} FROM ${def.table}`);

    const BOM = '\uFEFF';               // ← BOM UTF-8 para tildes/ñ
    const header = def.columns.join('\t');
    const lines = rows.map(r => def.columns.map(c => {
      let v = r[c];
      if (v === null || v === undefined) v = '';
      // limpiar saltos de línea que rompen filas
      return String(v).replace(/\r?\n/g, ' ');
    }).join('\t'));

    const tsv = BOM + [header, ...lines].join('\r\n');   // ← CRLF

    res.setHeader('Content-Type', 'text/tab-separated-values; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=${tipo}-${new Date().toISOString().slice(0,10)}.tsv`);
    return res.status(200).send(tsv);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ====== EXPORTACIÓN XLSX (Excel nativo) ======
// GET /api/export-xlsx/:tipo
router.get('/export-xlsx/:tipo', async (req, res) => {
  try {
    const { tipo } = req.params;
    const def = MASS_IMPORTS[tipo];
    if (!def) {
      return res.status(400).json({ ok: false, error: `Tipo no permitido. Usa uno de: ${Object.keys(MASS_IMPORTS).join(', ')}` });
    }

    const pool = await getPool();
    const [rows] = await pool.query(`SELECT ${def.columns.join(', ')} FROM ${def.table}`);

    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(tipo);

    // Definir columnas con encabezado
    ws.columns = def.columns.map(c => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));

    // Volcar filas
    for (const r of rows) {
      const rowObj = {};
      for (const c of def.columns) {
        rowObj[c] = r[c];
      }
      ws.addRow(rowObj);
    }

    // Congelar encabezado y auto-filtro
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to:   { row: 1, column: def.columns.length }
    };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=${tipo}-${new Date().toISOString().slice(0,10)}.xlsx`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});
