// Excel interprets a leading =, +, - or @ as a formula. Remarks are free text, so a value
// like "=cmd|..." would execute on open. Prefix with an apostrophe to force it to text.
export const csvEscape = (value) => {
  let str = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  str = str.replace(/"/g, '""');
  return /[,"\n\r]/.test(str) ? `"${str}"` : str;
};

// Convert array of objects to CSV and trigger download
export const downloadCSV = (rows, filename = 'export.csv') => {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((r) => headers.map((h) => csvEscape(r[h])).join(',')),
  ];
  // Leading BOM so Excel reads the file as UTF-8 — without it ₹ and Indian names mangle.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking synchronously after click() races the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 0);
};

// ─── Excel (multi-sheet) export via real XLSX (Office Open XML) ──────────────
// Uses SheetJS (xlsx) so files open natively in Excel, Numbers, LibreOffice, Google Sheets
// without security warnings or format-mismatch popups.
import * as XLSX from 'xlsx';

const sanitizeSheetName = (name) =>
  String(name).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';

// Build a workbook (internal helper)
const buildWorkbook = (sheets) => {
  const wb = XLSX.utils.book_new();
  const used = new Set();

  sheets.forEach((s, idx) => {
    let name = sanitizeSheetName(s.name || `Sheet${idx + 1}`);
    let suffix = 1;
    let unique = name;
    while (used.has(unique.toLowerCase())) {
      const trail = ` (${++suffix})`;
      unique = name.slice(0, 31 - trail.length) + trail;
    }
    used.add(unique.toLowerCase());

    const rows = s.rows && s.rows.length ? s.rows : [{ Info: '(no data)' }];
    const ws = XLSX.utils.json_to_sheet(rows);

    const headers = Object.keys(rows[0]);
    ws['!cols'] = headers.map((h) => {
      const sampleLen = rows.slice(0, 50).reduce((m, r) => Math.max(m, String(r[h] ?? '').length), h.length);
      return { wch: Math.min(40, Math.max(10, sampleLen + 2)) };
    });
    ws['!freeze'] = { xSplit: 0, ySplit: 1 };

    XLSX.utils.book_append_sheet(wb, ws, unique);
  });

  return wb;
};

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Build an XLSX Blob (no download) — used for Drive upload / email attachments
export const buildXlsxBlob = (sheets) => {
  const wb = buildWorkbook(sheets);
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  return new Blob([arrayBuffer], { type: XLSX_MIME });
};

// sheets: [{ name, rows }]
export const downloadExcel = (sheets, filename = 'export.xlsx') => {
  const wb = buildWorkbook(sheets);
  const fname = filename.replace(/\.xls$/i, '.xlsx').replace(/^(?!.*\.xlsx$).*/i, (m) => /\.xlsx$/i.test(m) ? m : `${m}.xlsx`);
  XLSX.writeFile(wb, fname.endsWith('.xlsx') ? fname : `${fname}.xlsx`);
};

// ─── Google Drive upload ─────────────────────────────────────────────────────
// Uses Google Identity Services (token model) — no backend required.
// Requires the user to create an OAuth Client ID (Web) in Google Cloud Console
// with this app's origin added to "Authorized JavaScript origins".

const GIS_SRC = 'https://accounts.google.com/gsi/client';

const loadGisScript = () =>
  new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });

const requestAccessToken = (clientId) =>
  new Promise((resolve, reject) => {
    if (!clientId) {
      reject(new Error('Missing Google OAuth Client ID — set it in Settings.'));
      return;
    }
    try {
      const tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (resp) => {
          if (resp && resp.access_token) resolve(resp.access_token);
          else reject(new Error(resp?.error_description || resp?.error || 'No access token returned'));
        },
        error_callback: (err) => reject(new Error(err?.message || 'OAuth flow was cancelled or failed')),
      });
      tokenClient.requestAccessToken({ prompt: '' });
    } catch (e) {
      reject(e);
    }
  });

// Upload a Blob (XLSX) to Google Drive. Returns { id, name, webViewLink }
export const uploadToGoogleDrive = async ({ clientId, filename, blob, folderId, mimeType = XLSX_MIME }) => {
  await loadGisScript();
  const token = await requestAccessToken(clientId);

  const metadata = { name: filename, mimeType };
  if (folderId) metadata.parents = [folderId];

  const boundary = `-------asm_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(metadata) + '\r\n',
    `--${boundary}\r\n`,
    `Content-Type: ${mimeType}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);

  const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink';
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    let errText = await res.text().catch(() => '');
    try {
      const j = JSON.parse(errText);
      errText = j.error?.message || errText;
    } catch {}
    throw new Error(`Drive upload failed (${res.status}): ${errText || res.statusText}`);
  }

  return res.json();
};

// ─── Gmail compose handoff ────────────────────────────────────────────────────
// Opens Gmail web compose (or default mailto: client) with prefilled subject + body.
// Browsers cannot attach a local file programmatically — user attaches the downloaded file manually.
export const openGmailCompose = ({ to = '', subject = '', body = '' } = {}) => {
  const params = new URLSearchParams({ view: 'cm', fs: '1', to, su: subject, body });
  const url = `https://mail.google.com/mail/?${params.toString()}`;
  window.open(url, '_blank', 'noopener');
};

// ─── WhatsApp share ───────────────────────────────────────────────────────────
// Opens WhatsApp web/app with prefilled text. If `phone` is provided (digits, with country code
// or 10-digit Indian number that we'll default to +91), it pre-targets that contact.
// `text` may include line breaks and emojis — they render fine in WhatsApp.
export const openWhatsAppShare = ({ phone = '', text = '' } = {}) => {
  const digits = String(phone).replace(/\D+/g, '');
  // Add default +91 country code for 10-digit Indian mobile numbers
  const intlPhone = digits.length === 10 ? `91${digits}` : digits;
  const base = intlPhone ? `https://wa.me/${intlPhone}` : 'https://wa.me/';
  const url = `${base}?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank', 'noopener');
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
