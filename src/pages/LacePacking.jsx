import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Package, Download, AlertCircle } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import Modal from '../components/Common/Modal.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import {
  formatCurrency, currentMonthKey, formatMonthLabel,
  LACE_RATES, getLacePackingEarnings, todayStr,
} from '../utils/calculations.js';
import { downloadCSV } from '../utils/exportUtils.js';

// ─── Rate Banner ──────────────────────────────────────────────────────────────
function RateBanner() {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
        <Package size={18} className="text-blue-600" />
        <div>
          <p className="text-xs text-blue-500 font-medium">Type 1 — Flat Lace</p>
          <p className="text-lg font-bold text-blue-700">₹{LACE_RATES.type1} / packet packed</p>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-5 py-3">
        <Package size={18} className="text-purple-600" />
        <div>
          <p className="text-xs text-purple-500 font-medium">Type 2 — Round Lace</p>
          <p className="text-lg font-bold text-purple-700">₹{LACE_RATES.type2} / packet packed</p>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-5 py-3">
        <AlertCircle size={18} className="text-amber-600" />
        <div>
          <p className="text-xs text-amber-600 font-medium">Payment Rule</p>
          <p className="text-sm font-semibold text-amber-700">Only Packed packets are paid</p>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
const EMPTY = {
  employeeId: '', date: todayStr(),
  type1Taken: '', type1Packed: '',
  type2Taken: '', type2Packed: '',
  remarks: '',
};

function LaceForm({ initial, employees, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState('');
  const F = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const t1Taken  = parseFloat(form.type1Taken)  || 0;
  const t1Packed = parseFloat(form.type1Packed) || 0;
  const t2Taken  = parseFloat(form.type2Taken)  || 0;
  const t2Packed = parseFloat(form.type2Packed) || 0;

  const t1Pending = Math.max(0, t1Taken - t1Packed);
  const t2Pending = Math.max(0, t2Taken - t2Packed);
  const earning   = t1Packed * LACE_RATES.type1 + t2Packed * LACE_RATES.type2;

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const numInp = `${inp} bg-white text-center font-semibold`;

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!form.employeeId) { setError('Please select an employee.'); return; }
      if (t1Packed > t1Taken) { setError('Flat lace packed cannot exceed taken.'); return; }
      if (t2Packed > t2Taken) { setError('Round lace packed cannot exceed taken.'); return; }
      setError('');
      onSave(form);
    }} className="space-y-4">
      {/* Employee + Date */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-gray-600 mb-1">Employee *</label>
          <select className={inp} value={form.employeeId} onChange={F('employeeId')} required>
            <option value="">— Select Employee —</option>
            {employees.filter((e) => e.status === 'Active').map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Date *</label>
          <input className={inp} type="date" value={form.date} onChange={F('date')} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
          <input className={inp} value={form.remarks} onChange={F('remarks')} placeholder="Optional" />
        </div>
      </div>

      {/* Type 1 — Flat */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-sm font-bold text-blue-700 mb-3">
          Type 1 — Flat Lace
          <span className="ml-2 text-xs font-normal text-blue-500">(₹{LACE_RATES.type1}/packed packet)</span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 text-center">Lace Taken</label>
            <input className={numInp} type="number" min="0" value={form.type1Taken}
              onChange={F('type1Taken')} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 text-center">Lace Packed</label>
            <input className={`${numInp} ${t1Packed > t1Taken ? 'border-red-400 ring-1 ring-red-400' : ''}`}
              type="number" min="0" max={t1Taken || undefined} value={form.type1Packed}
              onChange={F('type1Packed')} placeholder="0" />
            {t1Packed > t1Taken && <p className="text-xs text-red-500 mt-1 text-center">Can't exceed taken</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 text-center">Pending</label>
            <div className={`rounded-lg px-3 py-2 text-center font-bold text-sm border ${t1Pending > 0 ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-green-100 border-green-300 text-green-700'}`}>
              {t1Pending}
            </div>
          </div>
        </div>
        {t1Packed > 0 && (
          <p className="text-xs text-blue-600 font-medium mt-2 text-right">
            Earning: {t1Packed} × ₹{LACE_RATES.type1} = {formatCurrency(t1Packed * LACE_RATES.type1)}
          </p>
        )}
      </div>

      {/* Type 2 — Round */}
      <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
        <p className="text-sm font-bold text-purple-700 mb-3">
          Type 2 — Round Lace
          <span className="ml-2 text-xs font-normal text-purple-500">(₹{LACE_RATES.type2}/packed packet)</span>
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 text-center">Lace Taken</label>
            <input className={numInp} type="number" min="0" value={form.type2Taken}
              onChange={F('type2Taken')} placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 text-center">Lace Packed</label>
            <input className={`${numInp} ${t2Packed > t2Taken ? 'border-red-400 ring-1 ring-red-400' : ''}`}
              type="number" min="0" max={t2Taken || undefined} value={form.type2Packed}
              onChange={F('type2Packed')} placeholder="0" />
            {t2Packed > t2Taken && <p className="text-xs text-red-500 mt-1 text-center">Can't exceed taken</p>}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1 text-center">Pending</label>
            <div className={`rounded-lg px-3 py-2 text-center font-bold text-sm border ${t2Pending > 0 ? 'bg-orange-100 border-orange-300 text-orange-700' : 'bg-green-100 border-green-300 text-green-700'}`}>
              {t2Pending}
            </div>
          </div>
        </div>
        {t2Packed > 0 && (
          <p className="text-xs text-purple-600 font-medium mt-2 text-right">
            Earning: {t2Packed} × ₹{LACE_RATES.type2} = {formatCurrency(t2Packed * LACE_RATES.type2)}
          </p>
        )}
      </div>

      {/* Total earning preview */}
      {earning > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total Earning (packed only)</span>
          <span className="text-lg font-bold text-green-600">{formatCurrency(earning)}</span>
        </div>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
          Save Entry
        </button>
      </div>
    </form>
  );
}

// ─── Pending Lace Alert Banner ────────────────────────────────────────────────
function PendingAlert({ employees, lacePackingRecords }) {
  const empsPending = useMemo(() => {
    return employees
      .filter((e) => e.status === 'Active')
      .map((emp) => {
        const earn = getLacePackingEarnings(lacePackingRecords, emp.id, ''); // all-time pending
        const t1 = lacePackingRecords.filter(r => r.employeeId === emp.id)
          .reduce((s, r) => s + (parseFloat(r.type1Taken) || 0) - (parseFloat(r.type1Packed) || 0), 0);
        const t2 = lacePackingRecords.filter(r => r.employeeId === emp.id)
          .reduce((s, r) => s + (parseFloat(r.type2Taken) || 0) - (parseFloat(r.type2Packed) || 0), 0);
        return { ...emp, pendingType1: Math.max(0, t1), pendingType2: Math.max(0, t2) };
      })
      .filter((e) => e.pendingType1 > 0 || e.pendingType2 > 0);
  }, [employees, lacePackingRecords]);

  if (empsPending.length === 0) return null;

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle size={16} className="text-orange-600" />
        <p className="text-sm font-semibold text-orange-700">Pending Lace Balance</p>
      </div>
      <div className="flex flex-wrap gap-3">
        {empsPending.map((emp) => (
          <div key={emp.id} className="bg-white border border-orange-200 rounded-lg px-3 py-2 text-xs">
            <p className="font-semibold text-gray-800">{emp.name}</p>
            {emp.pendingType1 > 0 && <p className="text-blue-600">Flat: <span className="font-bold">{emp.pendingType1}</span> pkts pending</p>}
            {emp.pendingType2 > 0 && <p className="text-purple-600">Round: <span className="font-bold">{emp.pendingType2}</span> pkts pending</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Monthly Summary Tab ──────────────────────────────────────────────────────
function MonthlySummary({ employees, lacePackingRecords, month }) {
  const activeEmps = employees.filter((e) => e.status === 'Active');

  const rows = activeEmps.map((emp) => {
    const monthRecs = lacePackingRecords.filter(r => r.employeeId === emp.id && r.date.startsWith(month));
    if (monthRecs.length === 0) return null;

    const type1Taken  = monthRecs.reduce((s, r) => s + (parseFloat(r.type1Taken)  || 0), 0);
    const type1Packed = monthRecs.reduce((s, r) => s + (parseFloat(r.type1Packed) || 0), 0);
    const type2Taken  = monthRecs.reduce((s, r) => s + (parseFloat(r.type2Taken)  || 0), 0);
    const type2Packed = monthRecs.reduce((s, r) => s + (parseFloat(r.type2Packed) || 0), 0);

    // All-time pending
    const allRecs = lacePackingRecords.filter(r => r.employeeId === emp.id);
    const pendingType1 = Math.max(0, allRecs.reduce((s, r) => s + (parseFloat(r.type1Taken)||0) - (parseFloat(r.type1Packed)||0), 0));
    const pendingType2 = Math.max(0, allRecs.reduce((s, r) => s + (parseFloat(r.type2Taken)||0) - (parseFloat(r.type2Packed)||0), 0));

    const earning = type1Packed * LACE_RATES.type1 + type2Packed * LACE_RATES.type2;
    return { ...emp, type1Taken, type1Packed, type2Taken, type2Packed, pendingType1, pendingType2, earning };
  }).filter(Boolean);

  if (rows.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
      No lace packing entries for {formatMonthLabel(month)}.
    </div>
  );

  const grandEarning = rows.reduce((s, r) => s + r.earning, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-sm font-semibold text-gray-700">Monthly Summary — {formatMonthLabel(month)}</p>
        <p className="text-sm font-bold text-green-600">Earning: {formatCurrency(grandEarning)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase">Employee</th>
              <th className="text-center px-3 py-2.5 text-xs font-semibold text-blue-600 uppercase" colSpan={3}>Flat Lace (T1)</th>
              <th className="text-center px-3 py-2.5 text-xs font-semibold text-purple-600 uppercase" colSpan={3}>Round Lace (T2)</th>
              <th className="text-right px-4 py-2.5 text-xs font-semibold text-green-600 uppercase">Earning</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-1"></th>
              <th className="px-3 py-1 text-xs text-gray-400 font-normal text-center">Taken</th>
              <th className="px-3 py-1 text-xs text-gray-400 font-normal text-center">Packed</th>
              <th className="px-3 py-1 text-xs text-orange-400 font-normal text-center">Pending</th>
              <th className="px-3 py-1 text-xs text-gray-400 font-normal text-center">Taken</th>
              <th className="px-3 py-1 text-xs text-gray-400 font-normal text-center">Packed</th>
              <th className="px-3 py-1 text-xs text-orange-400 font-normal text-center">Pending</th>
              <th className="px-4 py-1"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                <td className="px-3 py-2.5 text-center text-blue-600">{r.type1Taken}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-blue-700">{r.type1Packed}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.pendingType1 > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-600'}`}>
                    {r.pendingType1}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-center text-purple-600">{r.type2Taken}</td>
                <td className="px-3 py-2.5 text-center font-semibold text-purple-700">{r.type2Packed}</td>
                <td className="px-3 py-2.5 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${r.pendingType2 > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-600'}`}>
                    {r.pendingType2}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-bold text-green-600">{formatCurrency(r.earning)}</td>
              </tr>
            ))}
            <tr className="bg-green-50 font-bold border-t-2 border-green-200">
              <td className="px-4 py-2.5 text-gray-700" colSpan={7}>Grand Total Earning</td>
              <td className="px-4 py-2.5 text-right text-green-700">{formatCurrency(grandEarning)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function LacePacking() {
  const { employees, lacePackingRecords, addLacePacking, updateLacePacking, deleteLacePacking } = useApp();
  const [month, setMonth]   = useState(currentMonthKey());
  const [search, setSearch] = useState('');
  const [modal, setModal]   = useState(null);
  const [deleteId, setDeleteId] = useState(null);
  const [tab, setTab]       = useState('entries');

  const getEmpName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';
  const getEmpCode = (id) => employees.find((e) => e.id === id)?.employeeCode || '';

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return lacePackingRecords
      .filter((r) => r.date.startsWith(month))
      .filter((r) => !q || getEmpName(r.employeeId).toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [lacePackingRecords, month, search, employees]);

  const handleSave = (data) => {
    const t1Taken  = parseFloat(data.type1Taken)  || 0;
    const t1Packed = Math.min(parseFloat(data.type1Packed) || 0, t1Taken);
    const t2Taken  = parseFloat(data.type2Taken)  || 0;
    const t2Packed = Math.min(parseFloat(data.type2Packed) || 0, t2Taken);

    const payload = {
      employeeId: data.employeeId,
      date:       data.date,
      type1Taken: t1Taken, type1Packed: t1Packed, type1Pending: t1Taken - t1Packed,
      type2Taken: t2Taken, type2Packed: t2Packed, type2Pending: t2Taken - t2Packed,
      type1Amount: t1Packed * LACE_RATES.type1,
      type2Amount: t2Packed * LACE_RATES.type2,
      laceTotal:   t1Packed * LACE_RATES.type1 + t2Packed * LACE_RATES.type2,
      remarks:     data.remarks || '',
    };

    if (modal === 'add') addLacePacking(payload);
    else updateLacePacking(modal.id, payload);
    setModal(null);
  };

  const handleExport = () => {
    const rows = filtered.map((r) => ({
      Date: r.date,
      Employee: getEmpName(r.employeeId),
      Code: getEmpCode(r.employeeId),
      'T1 Taken (Flat)':  r.type1Taken,
      'T1 Packed':        r.type1Packed,
      'T1 Pending':       r.type1Pending ?? (r.type1Taken - r.type1Packed),
      'T1 Amount':        r.type1Amount,
      'T2 Taken (Round)': r.type2Taken,
      'T2 Packed':        r.type2Packed,
      'T2 Pending':       r.type2Pending ?? (r.type2Taken - r.type2Packed),
      'T2 Amount':        r.type2Amount,
      'Total Earning':    r.laceTotal,
      Remarks:            r.remarks || '',
    }));
    downloadCSV(rows, `lace_packing_${month}.csv`);
  };

  const monthEarning = filtered.reduce((s, r) => s + (r.laceTotal || 0), 0);

  return (
    <div className="space-y-4">
      <RateBanner />

      {/* Pending lace alert */}
      <PendingAlert employees={employees} lacePackingRecords={lacePackingRecords} />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[['entries', 'Daily Entries'], ['summary', 'Monthly Summary']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        {tab === 'entries' && (
          <div className="relative flex-1 min-w-48">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search by employee name…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}
        <button onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 bg-white">
          <Download size={14} /> Export CSV
        </button>
        <button onClick={() => setModal('add')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap">
          <Plus size={16} /> Add Entry
        </button>
      </div>

      {tab === 'entries' && (
        <>
          {filtered.length > 0 && (
            <div className="bg-green-600 text-white rounded-xl px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-green-200 text-xs">Total Lace Packing Earned (packed)</p>
                <p className="text-2xl font-bold">{formatCurrency(monthEarning)}</p>
                <p className="text-green-200 text-xs">{formatMonthLabel(month)} · {filtered.length} entries</p>
              </div>
              <Package size={32} className="text-green-300" />
            </div>
          )}

          {filtered.length === 0 ? (
            <EmptyState icon={Package} title="No entries for this month"
              description="Add daily lace packing entries for employees."
              action={<button onClick={() => setModal('add')} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Add Entry</button>}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase" rowSpan={2}>Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase" rowSpan={2}>Employee</th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-blue-600 uppercase border-l border-gray-200" colSpan={3}>Flat Lace (T1)</th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-purple-600 uppercase border-l border-gray-200" colSpan={3}>Round Lace (T2)</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-green-600 uppercase" rowSpan={2}>Earning</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase" rowSpan={2}>Actions</th>
                    </tr>
                    <tr className="border-b border-gray-200">
                      <th className="px-3 py-1 text-xs text-gray-400 font-normal border-l border-gray-200">Taken</th>
                      <th className="px-3 py-1 text-xs text-gray-400 font-normal">Packed</th>
                      <th className="px-3 py-1 text-xs text-orange-400 font-normal">Pending</th>
                      <th className="px-3 py-1 text-xs text-gray-400 font-normal border-l border-gray-200">Taken</th>
                      <th className="px-3 py-1 text-xs text-gray-400 font-normal">Packed</th>
                      <th className="px-3 py-1 text-xs text-orange-400 font-normal">Pending</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => {
                      const t1Pend = r.type1Pending ?? (r.type1Taken - r.type1Packed);
                      const t2Pend = r.type2Pending ?? (r.type2Taken - r.type2Packed);
                      return (
                        <tr key={r.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{r.date}</td>
                          <td className="px-4 py-2.5 font-medium text-gray-900">{getEmpName(r.employeeId)}</td>
                          {/* T1 */}
                          <td className="px-3 py-2.5 text-center text-blue-600 border-l border-gray-100">{r.type1Taken}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-blue-700">{r.type1Packed}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${t1Pend > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-600'}`}>{t1Pend}</span>
                          </td>
                          {/* T2 */}
                          <td className="px-3 py-2.5 text-center text-purple-600 border-l border-gray-100">{r.type2Taken}</td>
                          <td className="px-3 py-2.5 text-center font-semibold text-purple-700">{r.type2Packed}</td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${t2Pend > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-600'}`}>{t2Pend}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-bold text-green-600">{formatCurrency(r.laceTotal)}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex gap-1.5 justify-center">
                              <button onClick={() => setModal(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500"><Edit2 size={13} /></button>
                              <button onClick={() => setDeleteId(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filtered.map((r) => {
                  const t1Pend = r.type1Pending ?? (r.type1Taken - r.type1Packed);
                  const t2Pend = r.type2Pending ?? (r.type2Taken - r.type2Packed);
                  return (
                    <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-gray-900">{getEmpName(r.employeeId)}</p>
                          <p className="text-xs text-gray-400">{r.date}</p>
                        </div>
                        <p className="font-bold text-green-600">{formatCurrency(r.laceTotal)}</p>
                      </div>
                      {/* Type 1 */}
                      <div className="bg-blue-50 rounded-lg p-2 mb-2">
                        <p className="text-xs text-blue-600 font-semibold mb-1">Flat Lace (T1)</p>
                        <div className="grid grid-cols-3 gap-1 text-center text-xs">
                          <div><p className="text-gray-400">Taken</p><p className="font-bold text-blue-700">{r.type1Taken}</p></div>
                          <div><p className="text-gray-400">Packed</p><p className="font-bold text-blue-700">{r.type1Packed}</p></div>
                          <div><p className="text-gray-400">Pending</p>
                            <p className={`font-bold ${t1Pend > 0 ? 'text-orange-600' : 'text-green-600'}`}>{t1Pend}</p>
                          </div>
                        </div>
                      </div>
                      {/* Type 2 */}
                      <div className="bg-purple-50 rounded-lg p-2 mb-3">
                        <p className="text-xs text-purple-600 font-semibold mb-1">Round Lace (T2)</p>
                        <div className="grid grid-cols-3 gap-1 text-center text-xs">
                          <div><p className="text-gray-400">Taken</p><p className="font-bold text-purple-700">{r.type2Taken}</p></div>
                          <div><p className="text-gray-400">Packed</p><p className="font-bold text-purple-700">{r.type2Packed}</p></div>
                          <div><p className="text-gray-400">Pending</p>
                            <p className={`font-bold ${t2Pend > 0 ? 'text-orange-600' : 'text-green-600'}`}>{t2Pend}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setModal(r)} className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-lg"><Edit2 size={12} /></button>
                        <button onClick={() => setDeleteId(r.id)} className="px-3 py-1.5 bg-red-50 text-red-500 text-xs rounded-lg"><Trash2 size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {tab === 'summary' && (
        <MonthlySummary employees={employees} lacePackingRecords={lacePackingRecords} month={month} />
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)}
        title={modal === 'add' ? 'Add Lace Packing Entry' : 'Edit Lace Packing Entry'}
        size="md">
        <LaceForm
          initial={modal !== 'add' && modal
            ? { employeeId: modal.employeeId, date: modal.date,
                type1Taken: modal.type1Taken, type1Packed: modal.type1Packed,
                type2Taken: modal.type2Taken, type2Packed: modal.type2Packed,
                remarks: modal.remarks }
            : EMPTY}
          employees={employees}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="Delete Entry" message="Delete this lace packing entry?"
        onConfirm={() => { deleteLacePacking(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} />
    </div>
  );
}
