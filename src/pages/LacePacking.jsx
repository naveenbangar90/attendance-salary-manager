import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, Search, Package, Download } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import Modal from '../components/Common/Modal.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { formatCurrency, currentMonthKey, formatMonthLabel, LACE_RATES, getLacePackingEarnings } from '../utils/calculations.js';
import { downloadCSV } from '../utils/exportUtils.js';
import { todayStr } from '../utils/calculations.js';

// ─── Rate reference banner ────────────────────────────────────────────────────
function RateBanner() {
  return (
    <div className="flex flex-wrap gap-3">
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
        <Package size={18} className="text-blue-600" />
        <div>
          <p className="text-xs text-blue-500 font-medium">Type 1 — Flat Lace</p>
          <p className="text-lg font-bold text-blue-700">₹{LACE_RATES.type1} / packet</p>
        </div>
      </div>
      <div className="flex items-center gap-3 bg-purple-50 border border-purple-200 rounded-xl px-5 py-3">
        <Package size={18} className="text-purple-600" />
        <div>
          <p className="text-xs text-purple-500 font-medium">Type 2 — Round Lace</p>
          <p className="text-lg font-bold text-purple-700">₹{LACE_RATES.type2} / packet</p>
        </div>
      </div>
    </div>
  );
}

// ─── Add / Edit Form ──────────────────────────────────────────────────────────
const EMPTY = { employeeId: '', date: todayStr(), type1Packets: '', type2Packets: '', remarks: '' };

function LaceForm({ initial, employees, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const F = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));

  const type1Amt = (parseFloat(form.type1Packets) || 0) * LACE_RATES.type1;
  const type2Amt = (parseFloat(form.type2Packets) || 0) * LACE_RATES.type2;
  const total    = type1Amt + type2Amt;

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!form.employeeId) return; onSave(form); }} className="space-y-4">
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

        {/* Type 1 */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 space-y-1">
          <label className="block text-xs font-semibold text-blue-700 mb-1">
            Type 1 — Flat Lace &nbsp;
            <span className="font-normal text-blue-500">(₹{LACE_RATES.type1}/packet)</span>
          </label>
          <input className={`${inp} bg-white`} type="number" min="0" value={form.type1Packets}
            onChange={F('type1Packets')} placeholder="No. of packets" />
          {form.type1Packets > 0 && (
            <p className="text-xs text-blue-600 font-medium">= {formatCurrency(type1Amt)}</p>
          )}
        </div>

        {/* Type 2 */}
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 space-y-1">
          <label className="block text-xs font-semibold text-purple-700 mb-1">
            Type 2 — Round Lace &nbsp;
            <span className="font-normal text-purple-500">(₹{LACE_RATES.type2}/packet)</span>
          </label>
          <input className={`${inp} bg-white`} type="number" min="0" value={form.type2Packets}
            onChange={F('type2Packets')} placeholder="No. of packets" />
          {form.type2Packets > 0 && (
            <p className="text-xs text-purple-600 font-medium">= {formatCurrency(type2Amt)}</p>
          )}
        </div>
      </div>

      {/* Total preview */}
      {total > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700">Total Lace Packing Earning</span>
          <span className="text-lg font-bold text-green-600">{formatCurrency(total)}</span>
        </div>
      )}

      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Entry</button>
      </div>
    </form>
  );
}

// ─── Monthly Summary per Employee ─────────────────────────────────────────────
function MonthlySummary({ employees, lacePackingRecords, month }) {
  const activeEmps = employees.filter((e) => e.status === 'Active');
  const rows = activeEmps.map((emp) => {
    const earn = getLacePackingEarnings(lacePackingRecords, emp.id, month);
    return { ...emp, ...earn };
  }).filter((r) => r.type1Packets > 0 || r.type2Packets > 0);

  if (rows.length === 0) return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 text-center text-sm text-gray-400">
      No lace packing entries for {formatMonthLabel(month)}.
    </div>
  );

  const grandTotal = rows.reduce((s, r) => s + r.laceTotal, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <p className="text-sm font-semibold text-gray-700">Monthly Summary — {formatMonthLabel(month)}</p>
        <p className="text-sm font-bold text-green-600">Total: {formatCurrency(grandTotal)}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              {['Employee', 'Flat Pkts (T1)', 'T1 Amount', 'Round Pkts (T2)', 'T2 Amount', 'Total Earning'].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 font-medium text-gray-900">{r.name}</td>
                <td className="px-4 py-2.5 text-blue-700 font-semibold">{r.type1Packets}</td>
                <td className="px-4 py-2.5 text-blue-600">{formatCurrency(r.type1Amount)}</td>
                <td className="px-4 py-2.5 text-purple-700 font-semibold">{r.type2Packets}</td>
                <td className="px-4 py-2.5 text-purple-600">{formatCurrency(r.type2Amount)}</td>
                <td className="px-4 py-2.5 font-bold text-green-600">{formatCurrency(r.laceTotal)}</td>
              </tr>
            ))}
            <tr className="bg-green-50 font-bold border-t-2 border-green-200">
              <td className="px-4 py-2.5 text-gray-700" colSpan={5}>Grand Total</td>
              <td className="px-4 py-2.5 text-green-700">{formatCurrency(grandTotal)}</td>
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
  const [month, setMonth] = useState(currentMonthKey());
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null);   // null | 'add' | record-object
  const [deleteId, setDeleteId] = useState(null);
  const [tab, setTab] = useState('entries');  // 'entries' | 'summary'

  const getEmpName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';
  const getEmpCode = (id) => employees.find((e) => e.id === id)?.employeeCode || '';

  // Records filtered by month + search
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return lacePackingRecords
      .filter((r) => r.date.startsWith(month))
      .filter((r) => !q || getEmpName(r.employeeId).toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [lacePackingRecords, month, search, employees]);

  const handleSave = (data) => {
    const t1 = parseFloat(data.type1Packets) || 0;
    const t2 = parseFloat(data.type2Packets) || 0;
    const payload = {
      employeeId: data.employeeId,
      date: data.date,
      type1Packets: t1,
      type2Packets: t2,
      type1Amount: t1 * LACE_RATES.type1,
      type2Amount: t2 * LACE_RATES.type2,
      laceTotal: t1 * LACE_RATES.type1 + t2 * LACE_RATES.type2,
      remarks: data.remarks || '',
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
      'Type1 Packets (Flat)': r.type1Packets,
      'Type1 Amount': r.type1Amount,
      'Type2 Packets (Round)': r.type2Packets,
      'Type2 Amount': r.type2Amount,
      'Total Earning': r.laceTotal,
      Remarks: r.remarks || '',
    }));
    downloadCSV(rows, `lace_packing_${month}.csv`);
  };

  const monthTotal = filtered.reduce((s, r) => s + (r.laceTotal || 0), 0);

  return (
    <div className="space-y-4">
      <RateBanner />

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
        <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 bg-white">
          <Download size={14} /> Export CSV
        </button>
        <button onClick={() => setModal('add')}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap">
          <Plus size={16} /> Add Entry
        </button>
      </div>

      {tab === 'entries' && (
        <>
          {/* Month total bar */}
          {filtered.length > 0 && (
            <div className="bg-green-600 text-white rounded-xl px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-green-200 text-xs">Total Lace Packing Earned</p>
                <p className="text-2xl font-bold">{formatCurrency(monthTotal)}</p>
                <p className="text-green-200 text-xs">{formatMonthLabel(month)} · {filtered.length} entries</p>
              </div>
              <Package size={32} className="text-green-300" />
            </div>
          )}

          {/* Entries table */}
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
                      {['Date', 'Employee', 'Flat Pkts (T1)', 'T1 Amount', 'Round Pkts (T2)', 'T2 Amount', 'Total', 'Remarks', 'Actions'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filtered.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-600">{r.date}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-900">{getEmpName(r.employeeId)}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                            {r.type1Packets} pkts
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-blue-600 font-medium">{formatCurrency(r.type1Amount)}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center gap-1 bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                            {r.type2Packets} pkts
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-purple-600 font-medium">{formatCurrency(r.type2Amount)}</td>
                        <td className="px-4 py-2.5 font-bold text-green-600">{formatCurrency(r.laceTotal)}</td>
                        <td className="px-4 py-2.5 text-gray-400 max-w-28 truncate">{r.remarks || '—'}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex gap-1.5">
                            <button onClick={() => setModal(r)} className="p-1.5 rounded hover:bg-blue-50 text-blue-500"><Edit2 size={13} /></button>
                            <button onClick={() => setDeleteId(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-3">
                {filtered.map((r) => (
                  <div key={r.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">{getEmpName(r.employeeId)}</p>
                        <p className="text-xs text-gray-400">{r.date}</p>
                      </div>
                      <p className="font-bold text-green-600">{formatCurrency(r.laceTotal)}</p>
                    </div>
                    <div className="flex gap-3 mb-3">
                      <div className="flex-1 bg-blue-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-blue-500">Flat (T1)</p>
                        <p className="font-bold text-blue-700">{r.type1Packets} pkts</p>
                        <p className="text-xs text-blue-600">{formatCurrency(r.type1Amount)}</p>
                      </div>
                      <div className="flex-1 bg-purple-50 rounded-lg p-2 text-center">
                        <p className="text-xs text-purple-500">Round (T2)</p>
                        <p className="font-bold text-purple-700">{r.type2Packets} pkts</p>
                        <p className="text-xs text-purple-600">{formatCurrency(r.type2Amount)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <button onClick={() => setModal(r)} className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-lg"><Edit2 size={12} /></button>
                      <button onClick={() => setDeleteId(r.id)} className="px-3 py-1.5 bg-red-50 text-red-500 text-xs rounded-lg"><Trash2 size={12} /></button>
                    </div>
                  </div>
                ))}
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
            ? { employeeId: modal.employeeId, date: modal.date, type1Packets: modal.type1Packets, type2Packets: modal.type2Packets, remarks: modal.remarks }
            : EMPTY}
          employees={employees}
          onSave={handleSave}
          onCancel={() => setModal(null)}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog isOpen={!!deleteId} title="Delete Entry" message="Delete this lace packing entry?"
        onConfirm={() => { deleteLacePacking(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} />
    </div>
  );
}
