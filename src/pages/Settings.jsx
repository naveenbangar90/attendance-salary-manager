import React, { useState } from 'react';
import CheckinLogins from '../components/Auth/CheckinLogins.jsx';
import { isOnline } from '../utils/remoteSync.js';
import { Save, AlertTriangle, Database, Trash2, Settings as SettingsIcon, FileSpreadsheet, Mail, Cloud, ExternalLink, Loader2, Archive } from 'lucide-react';
import { getBackupV0 } from '../utils/storage.js';
import { buildLedger } from '../utils/ledger.js';
import { useApp } from '../context/AppContext.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import { downloadExcel, openGmailCompose, buildXlsxBlob, uploadToGoogleDrive } from '../utils/exportUtils.js';
import { formatCurrency, LACE_RATES, todayStr } from '../utils/calculations.js';

// Build the four sheets used for full export
const buildExportSheets = ({ employees, attendance, advances, lacePackingRecords, payouts = [] }) => {
  const empById = Object.fromEntries(employees.map((e) => [e.id, e]));
  const nameOf = (id) => empById[id]?.name || 'Unknown';
  const codeOf = (id) => empById[id]?.employeeCode || '';

  const employeesSheet = employees.map((e) => ({
    'Code': e.employeeCode,
    'Name': e.name,
    'Mobile': e.mobile || '',
    'Role': e.role || '',
    'Monthly Salary': e.monthlySalary,
    'Joining Date': e.joiningDate || '',
    'Left Date': e.leftDate || '',
    'Status': e.status,
  }));

  const attendanceSheet = [...attendance]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => ({
      'Date': a.date,
      'Employee Code': codeOf(a.employeeId),
      'Employee': nameOf(a.employeeId),
      'Status': a.status,
      'OT Hours': a.overtimeHours || 0,
      'Late Fine': a.lateFine || 0,
      'Remarks': a.remarks || '',
    }));

  const advancesSheet = [...advances]
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
    .map((a) => ({
      'Date': a.date || '',
      'Employee Code': codeOf(a.employeeId),
      'Employee': nameOf(a.employeeId),
      'Amount': a.amount,
      'Deducted': a.deductedAmount,
      'Remaining': a.remainingAmount,
      'Status': a.status,
      'Reason': a.reason || '',
    }));

  const laceEntriesSheet = [...lacePackingRecords]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({
      'Date': r.date,
      'Employee Code': codeOf(r.employeeId),
      'Employee': nameOf(r.employeeId),
      'T1 Taken (Flat)': r.type1Taken,
      'T1 Packed': r.type1Packed,
      'T1 Pending': r.type1Pending ?? (r.type1Taken - r.type1Packed),
      'T1 Amount': r.type1Amount,
      'T2 Taken (Round)': r.type2Taken,
      'T2 Packed': r.type2Packed,
      'T2 Pending': r.type2Pending ?? (r.type2Taken - r.type2Packed),
      'T2 Amount': r.type2Amount,
      'Total Earning': r.laceTotal,
      'Remarks': r.remarks || '',
    }));

  // Per-employee all-time lace balance
  const laceBalanceSheet = employees
    .map((emp) => {
      const recs = lacePackingRecords.filter((r) => r.employeeId === emp.id);
      if (recs.length === 0) return null;
      const t1Taken  = recs.reduce((s, r) => s + (parseFloat(r.type1Taken)  || 0), 0);
      const t1Packed = recs.reduce((s, r) => s + (parseFloat(r.type1Packed) || 0), 0);
      const t2Taken  = recs.reduce((s, r) => s + (parseFloat(r.type2Taken)  || 0), 0);
      const t2Packed = recs.reduce((s, r) => s + (parseFloat(r.type2Packed) || 0), 0);
      return {
        'Employee Code': emp.employeeCode,
        'Employee': emp.name,
        'Status': emp.status,
        'Entries': recs.length,
        'T1 Taken': t1Taken,
        'T1 Packed': t1Packed,
        'T1 Pending': Math.max(0, t1Taken - t1Packed),
        'T1 Earning': +(t1Packed * LACE_RATES.type1).toFixed(2),
        'T2 Taken': t2Taken,
        'T2 Packed': t2Packed,
        'T2 Pending': Math.max(0, t2Taken - t2Packed),
        'T2 Earning': +(t2Packed * LACE_RATES.type2).toFixed(2),
        'Total Earning': +(t1Packed * LACE_RATES.type1 + t2Packed * LACE_RATES.type2).toFixed(2),
      };
    })
    .filter(Boolean);

  // Per-employee running statement, derived the same way the Ledger page derives it.
  const ledgerSheet = employees.flatMap((emp) =>
    buildLedger({ employeeId: emp.id, advances, payouts, newestFirst: false }).map((r) => ({
      'Employee Code': emp.employeeCode,
      'Employee': emp.name,
      'Date': r.date,
      'Type': r.type,
      'Detail': r.detail,
      'Amount': +(r.amount ?? r.cashOut ?? 0).toFixed(2),
      'Owes Change': +(r.owesDelta || 0).toFixed(2),
      'Running Balance': +r.balance.toFixed(2),
    }))
  );

  return [
    { name: 'Employees', rows: employeesSheet },
    { name: 'Ledger', rows: ledgerSheet },
    { name: 'Attendance', rows: attendanceSheet },
    { name: 'Advances', rows: advancesSheet },
    { name: 'Lace Entries', rows: laceEntriesSheet },
    { name: 'Lace Balance', rows: laceBalanceSheet },
  ];
};

export default function Settings() {
  const { settings, updateSettings, loadSampleData, clearAllData,
          employees, attendance, advances, lacePackingRecords, payouts, showToast } = useApp();
  const [form, setForm] = useState(settings);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [saved, setSaved] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [driveBusy, setDriveBusy] = useState(false);
  const [driveResult, setDriveResult] = useState(null); // { id, name, webViewLink }

  const F = (f) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm((p) => ({ ...p, [f]: val }));
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleDownloadAll = () => {
    const sheets = buildExportSheets({ employees, attendance, advances, lacePackingRecords, payouts });
    const empty = sheets.every((s) => s.rows.length === 0);
    if (empty) {
      showToast('No data to export', 'error');
      return;
    }
    downloadExcel(sheets, `${(form.companyName || 'data').replace(/\s+/g, '_')}_full_${todayStr()}.xlsx`);
    showToast('Excel file downloaded');
  };

  // Raw untouched snapshot written by runMigrations() before it altered anything.
  const handleDownloadBackup = () => {
    const backup = getBackupV0();
    if (!backup) {
      showToast('No pre-migration backup exists (nothing needed migrating)', 'error');
      return;
    }
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asm_backup_v0_${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast('Backup downloaded');
  };

  const handleSendGmail = () => {
    // First trigger download so user has the file to attach
    handleDownloadAll();

    // Build summary stats for email body
    const totalAdv = advances.reduce((s, a) => s + (parseFloat(a.remainingAmount) || 0), 0);
    const t1Pend = lacePackingRecords.reduce((s, r) => s + (parseFloat(r.type1Taken)||0) - (parseFloat(r.type1Packed)||0), 0);
    const t2Pend = lacePackingRecords.reduce((s, r) => s + (parseFloat(r.type2Taken)||0) - (parseFloat(r.type2Packed)||0), 0);
    const attendanceMonth = new Set(attendance.map((a) => a.date.slice(0, 7))).size;

    const subject = `${form.companyName || 'Company'} — Data Export (${todayStr()})`;
    const body = [
      `Hi,`,
      ``,
      `Attached is the latest data export from ${form.companyName || 'the Attendance & Salary Manager'} as of ${todayStr()}.`,
      ``,
      `Summary:`,
      `• Employees: ${employees.length} (${employees.filter((e) => e.status === 'Active').length} active)`,
      `• Attendance records: ${attendance.length} across ${attendanceMonth} month(s)`,
      `• Advances: ${advances.length} (₹${totalAdv.toFixed(2)} outstanding)`,
      `• Lace packing entries: ${lacePackingRecords.length}`,
      `• Pending lace balance: Flat ${Math.max(0, t1Pend)} pkts, Round ${Math.max(0, t2Pend)} pkts`,
      ``,
      `The workbook contains 5 sheets: Employees, Attendance, Advances, Lace Entries, Lace Balance.`,
      ``,
      `(Please attach the downloaded .xlsx file before sending — browsers can't attach automatically.)`,
    ].join('\n');

    openGmailCompose({ to: emailTo, subject, body });
    showToast('Gmail compose opened — attach the downloaded file before sending');
  };

  const handleUploadToDrive = async () => {
    const clientId = (form.googleClientId || '').trim();
    if (!clientId) {
      showToast('Enter your Google OAuth Client ID first', 'error');
      return;
    }
    const sheets = buildExportSheets({ employees, attendance, advances, lacePackingRecords, payouts });
    if (sheets.every((s) => s.rows.length === 0)) {
      showToast('No data to upload', 'error');
      return;
    }
    setDriveBusy(true);
    setDriveResult(null);
    try {
      const blob = buildXlsxBlob(sheets);
      const filename = `${(form.companyName || 'data').replace(/\s+/g, '_')}_full_${todayStr()}.xlsx`;
      const result = await uploadToGoogleDrive({
        clientId,
        filename,
        blob,
        folderId: (form.googleDriveFolderId || '').trim() || undefined,
      });
      setDriveResult(result);
      showToast('Uploaded to Google Drive');
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Drive upload failed', 'error');
    } finally {
      setDriveBusy(false);
    }
  };

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const Section = ({ title, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-2xl">
      <Section title="Company Information">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
          <input className={inp} value={form.companyName} onChange={F('companyName')} placeholder="My Company" />
        </div>
      </Section>

      {isOnline() && <CheckinLogins />}

      <Section title="Salary Calculation">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Salary Days per Month</label>
            <input className={inp} type="number" min="1" max="31" value={form.totalWorkingDays} onChange={F('totalWorkingDays')} />
            <p className="text-xs text-gray-400 mt-1">
              A month is worth this many days whether the calendar has 28, 30 or 31. Normally 30.
            </p>
          </div>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-900 space-y-1">
          <p className="font-semibold">How pay is worked out</p>
          <p className="font-mono text-[11px] bg-white/70 rounded px-2 py-1 inline-block">
            paid days = {form.totalWorkingDays || 30} − absent − ½ × half day − unpaid leave
          </p>
          <ul className="list-disc pl-4 space-y-0.5 text-blue-800">
            <li>Weekly offs and paid leave sit inside the {form.totalWorkingDays || 30} — they never reduce pay.</li>
            <li>A day left unmarked is not an absence, so it is paid. Only marked absences cut salary.</li>
            <li>Absent every day of the month pays nothing, February included.</li>
            <li>Joining or leaving mid-month pro-rates the {form.totalWorkingDays || 30} to the days employed.</li>
          </ul>
        </div>
      </Section>

      <Section title="Overtime Settings">
        <div className="flex items-start gap-3 mb-3">
          <input type="checkbox" id="overtimeEnabled" checked={form.overtimeEnabled} onChange={F('overtimeEnabled')} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
          <div>
            <label htmlFor="overtimeEnabled" className="text-sm font-medium text-gray-700 cursor-pointer">Enable Overtime Calculation</label>
            <p className="text-xs text-gray-400">Show overtime hours in attendance and add to salary.</p>
          </div>
        </div>
        {form.overtimeEnabled && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Overtime Rate per Hour (₹)</label>
            <input className={`${inp} max-w-xs`} type="number" min="0" value={form.overtimeRatePerHour} onChange={F('overtimeRatePerHour')} placeholder="50" />
          </div>
        )}
      </Section>

      <Section title="Late Fine Settings">
        <div className="flex items-start gap-3 mb-3">
          <input type="checkbox" id="lateFineEnabled" checked={form.lateFineEnabled} onChange={F('lateFineEnabled')} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
          <div>
            <label htmlFor="lateFineEnabled" className="text-sm font-medium text-gray-700 cursor-pointer">Enable Late Fine</label>
            <p className="text-xs text-gray-400">Allow entering late fines per attendance record.</p>
          </div>
        </div>
        {form.lateFineEnabled && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Late Fine Amount (₹)</label>
            <input className={`${inp} max-w-xs`} type="number" min="0" value={form.defaultLateFineAmount} onChange={F('defaultLateFineAmount')} placeholder="0" />
          </div>
        )}
      </Section>

      <div className="flex gap-3">
        <button type="submit" className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${saved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Data Export & Backup */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 flex items-center gap-2">
          <FileSpreadsheet size={16} className="text-green-600" /> Data Export &amp; Backup
        </h2>

        <div className="text-xs text-gray-500">
          Export Employees, Attendance, Advances, and Lace Packing data — daily entries and per-employee balance — into a single Excel workbook (5 sheets). The same data can be emailed via Gmail; the file downloads first so you can attach it in the compose window.
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs">
          <div>
            <p className="text-gray-400">Employees</p>
            <p className="font-semibold text-gray-800">{employees.length}</p>
          </div>
          <div>
            <p className="text-gray-400">Attendance records</p>
            <p className="font-semibold text-gray-800">{attendance.length}</p>
          </div>
          <div>
            <p className="text-gray-400">Advances</p>
            <p className="font-semibold text-gray-800">{advances.length} ({formatCurrency(advances.reduce((s, a) => s + (parseFloat(a.remainingAmount)||0), 0))} pending)</p>
          </div>
          <div>
            <p className="text-gray-400">Lace entries</p>
            <p className="font-semibold text-gray-800">{lacePackingRecords.length}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={handleDownloadAll}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
            <FileSpreadsheet size={15} /> Download All Data (Excel)
          </button>
          <button type="button" onClick={handleDownloadBackup}
            title="Raw JSON snapshot taken before the first schema migration ran"
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-lg hover:bg-gray-50">
            <Archive size={15} /> Download pre-migration backup
          </button>
        </div>

        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600">Send to Gmail</label>
          <div className="flex flex-col sm:flex-row gap-2">
            <input className={`${inp} flex-1`} type="email" value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="recipient@example.com (optional)" />
            <button type="button" onClick={handleSendGmail}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 whitespace-nowrap">
              <Mail size={15} /> Send via Gmail
            </button>
          </div>
          <p className="text-xs text-gray-400">
            Opens Gmail in a new tab with a prefilled subject &amp; summary. The Excel file is downloaded automatically — attach it in the Gmail compose window before sending.
          </p>
        </div>

        {/* Google Drive */}
        <div className="border-t border-gray-100 pt-3 space-y-2">
          <label className="block text-xs font-medium text-gray-600 flex items-center gap-1.5">
            <Cloud size={13} className="text-blue-600" /> Save to Google Drive
          </label>

          <div className="space-y-2">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Google OAuth Client ID <span className="text-red-500">*</span></label>
              <input
                className={inp}
                value={form.googleClientId || ''}
                onChange={F('googleClientId')}
                placeholder="123456789-abc...apps.googleusercontent.com"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Drive Folder ID <span className="text-gray-400">(optional)</span></label>
              <input
                className={inp}
                value={form.googleDriveFolderId || ''}
                onChange={F('googleDriveFolderId')}
                placeholder="Leave blank to save in My Drive root"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                The part after <code>/folders/</code> in the folder URL.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={handleUploadToDrive}
              disabled={driveBusy}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {driveBusy ? <Loader2 size={15} className="animate-spin" /> : <Cloud size={15} />}
              {driveBusy ? 'Uploading…' : 'Save to Google Drive'}
            </button>
            {driveResult && (
              <a
                href={driveResult.webViewLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
              >
                <ExternalLink size={12} /> Open “{driveResult.name}” in Drive
              </a>
            )}
          </div>

          <details className="text-xs text-gray-500 mt-1">
            <summary className="cursor-pointer hover:text-gray-700">How to get a Google OAuth Client ID</summary>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-gray-500">
              <li>Go to <a className="text-blue-600 hover:underline" href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer">Google Cloud Console → APIs &amp; Credentials</a>.</li>
              <li>Create a project (or pick one) and enable the <strong>Google Drive API</strong>.</li>
              <li>Create credentials → <strong>OAuth client ID</strong> → <em>Web application</em>.</li>
              <li>Under <em>Authorized JavaScript origins</em>, add this app’s URL (e.g. <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code>).</li>
              <li>Copy the Client ID and paste above. Save settings, then click <strong>Save to Google Drive</strong> — a Google sign-in popup will ask for permission. Only files this app creates will be accessible (<code>drive.file</code> scope).</li>
            </ol>
          </details>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> Data Management</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={loadSampleData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Database size={15} /> Load Sample Data
          </button>
          <button type="button" onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
            <Trash2 size={15} /> Clear All Data
          </button>
        </div>
        <p className="text-xs text-red-600">"Clear All Data" permanently deletes all employees, attendance, and advance records from this device.</p>
      </div>

      <ConfirmDialog isOpen={showClearConfirm} title="Clear All Data"
        message="This will delete ALL employees, attendance records, and advances. This cannot be undone. Are you sure?"
        confirmLabel="Yes, Clear Everything"
        onConfirm={() => { clearAllData(); setShowClearConfirm(false); }}
        onCancel={() => setShowClearConfirm(false)} />
    </form>
  );
}
