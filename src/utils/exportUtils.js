// Convert array of objects to CSV and trigger download
export const downloadCSV = (rows, filename = 'export.csv') => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.join(','),
    ...rows.map((r) =>
      headers
        .map((h) => {
          const val = r[h] ?? '';
          const str = String(val).replace(/"/g, '""');
          return /[,"\n]/.test(str) ? `"${str}"` : str;
        })
        .join(',')
    ),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export const printElement = (elementId) => {
  const el = document.getElementById(elementId);
  if (!el) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head>
    <title>Print</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 20px; color: #111; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th, td { border: 1px solid #ccc; padding: 8px 10px; text-align: left; font-size: 13px; }
      th { background: #f3f4f6; font-weight: 600; }
      .title { font-size: 20px; font-weight: bold; margin-bottom: 4px; }
      .sub { font-size: 13px; color: #555; margin-bottom: 16px; }
      .row-label { font-weight: 600; }
      .total-row td { font-weight: bold; background: #f9fafb; }
      .signature-section { margin-top: 40px; display: flex; justify-content: space-between; }
      .sig-line { border-top: 1px solid #333; width: 160px; text-align: center; padding-top: 6px; font-size: 12px; }
      @media print { body { padding: 10px; } }
    </style>
    </head><body>${el.innerHTML}</body></html>
  `);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 300);
};
