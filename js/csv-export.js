/* ============================================
   SVK Works — CSV export helper
   Used by admin.html, admin-used-parts.html, admin-parts-catalog.html
   ============================================ */

function svkCsvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  // Quote any cell containing a comma, quote, or newline; escape embedded quotes.
  if (/[",\n]/.test(str)) return '"' + str.replace(/"/g, '""') + '"';
  return str;
}

// columns: [{ key: 'orderNumber', label: 'Order Number', get: (row) => row.order_number }]
// `get` is optional — defaults to row[key].
function svkExportCsv(rows, columns, filename) {
  const header = columns.map(c => svkCsvCell(c.label)).join(',');
  const lines = rows.map(row =>
    columns.map(c => svkCsvCell(c.get ? c.get(row) : row[c.key])).join(',')
  );
  const csv = [header, ...lines].join('\r\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
