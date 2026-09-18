// server/routes/legacy/csv-tools.js
// Exportaciones TSV/XLSX en modo legacy. Montar bajo /api/legacy

const express = require("express");
const router = express.Router();
const { pool } = require("../../db");

// Si luego centralizas la definición, cambia esta importación.
// const { MASS_IMPORTS } = require("../../utils/csv"); 
const MASS_IMPORTS = null; // ← placeholder seguro

// ====== EXPORTACIÓN TSV (TAB) ======
// GET /api/legacy/export-tsv/:tipo
router.get("/export-tsv/:tipo", async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!MASS_IMPORTS || !MASS_IMPORTS[tipo]) {
      return res.status(501).json({ ok: false, error: "LEGACY_EXPORT_NOT_CONFIGURED" });
    }
    const def = MASS_IMPORTS[tipo];
    const [rows] = await pool.query(`SELECT ${def.columns.join(", ")} FROM ${def.table}`);

    const BOM = "\uFEFF"; // UTF-8 BOM
    const header = def.columns.join("\t");
    const lines = rows.map((r) =>
      def.columns
        .map((c) => {
          let v = r[c];
          if (v === null || v === undefined) v = "";
          return String(v).replace(/\r?\n/g, " ");
        })
        .join("\t")
    );
    const tsv = BOM + [header, ...lines].join("\r\n");
    res.setHeader("Content-Type", "text/tab-separated-values; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${tipo}-${new Date().toISOString().slice(0, 10)}.tsv`
    );
    return res.status(200).send(tsv);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

// ====== EXPORTACIÓN XLSX (Excel nativo) ======
// GET /api/legacy/export-xlsx/:tipo
router.get("/export-xlsx/:tipo", async (req, res) => {
  try {
    const { tipo } = req.params;
    if (!MASS_IMPORTS || !MASS_IMPORTS[tipo]) {
      return res.status(501).json({ ok: false, error: "LEGACY_EXPORT_NOT_CONFIGURED" });
    }
    const def = MASS_IMPORTS[tipo];

    const [rows] = await pool.query(`SELECT ${def.columns.join(", ")} FROM ${def.table}`);

    const ExcelJS = require("exceljs");
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(tipo);

    ws.columns = def.columns.map((c) => ({ header: c, key: c, width: Math.max(12, c.length + 2) }));

    for (const r of rows) {
      const rowObj = {};
      for (const c of def.columns) rowObj[c] = r[c];
      ws.addRow(rowObj);
    }

    ws.views = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: def.columns.length },
    };

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${tipo}-${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
