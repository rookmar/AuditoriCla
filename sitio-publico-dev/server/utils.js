 // server/utils.js
const path = require("path");

function ok(res, data) { return res.json(data); }
function fail(res, code, message) { return res.status(code).json({ error: message || "ERROR" }); }
function sendArray(res, arr) {
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  return res.status(200).send(JSON.stringify(arr || []));
}
function checkApiKey(req) {
  const k = req.get("x-api-key");
  if (!k) return true;
  const need = process.env.INFRA_API_KEY || "";
  return need ? k === need : true;
}

// CSV helpers (compatibles con Excel ES)
const CSV_SEP = process.env.CSV_SEP || ";";
function csvEscapeCell(v) {
  const s = String(v ?? "");
  const needsQuotes = /["\r\n;,]/.test(s) || CSV_SEP !== ",";
  const doubled = s.replace(/"/g, '""');
  return needsQuotes ? `"${doubled}"` : doubled;
}
function csvRow(cells) {
  return cells.map(csvEscapeCell).join(CSV_SEP);
}
function sendCsv(res, filename, rows) {
  const bom = "\uFEFF";
  const body = rows.map(csvRow).join("\r\n") + "\r\n";
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(bom + body);
}

function detectSep(line) {
  if (line.includes("\t")) return "\t";
  if (line.includes(",")) return ",";
  return ";";
}
function parseCSVText(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter(Boolean);
  if (!lines.length) return { headers: [], rows: [] };
  const sep = detectSep(lines[0]);
  const headers = lines[0].split(sep).map(h => h.trim());
  const rows = lines.slice(1).map(l => {
    const cells = l.split(sep);
    const o = {};
    headers.forEach((h, i) => (o[h] = (cells[i] ?? "").trim()));
    return o;
  });
  return { headers, rows };
}

const publicDir = path.join(__dirname, "..", "public");

module.exports = {
  ok, fail, sendArray, checkApiKey,
  sendCsv, detectSep, parseCSVText,
  publicDir,
};
