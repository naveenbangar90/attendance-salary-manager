import React, { useState, useMemo } from 'react';
import { Wallet, Check, Undo2, Download, Search, Trash2, AlertTriangle, Scale, CalendarClock, UserMinus } from 'lucide-react';
import { getUnsettledProjected, computeSettlement } from '../utils/settlement.js';
import { useApp } from '../context/AppContext.jsx';
import Modal from '../components/Common/Modal.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { formatCurrency, formatMonthLabel, currentMonthKey, todayStr } from '../utils/calculations.js';
import { downloadCSV } from '../utils/exportUtils.js';

const PAY_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Other'];

function MarkPaidForm({ payout, onSave, onCancel }) {
  const [paidDate, setPaidDate] = useState(payout.paidDate || todayStr());
  const [paidMode, setPaidMode] = useState(payout.paidMode || 'Cash');
  const [remarks, setRemarks] = useState(payout.remarks || '');
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500';

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); onSave({ paidDate, paidMode, remarks }); }}
      className="space-y-4"
    >
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <p><span className="text-gray-500">Employee:</span> <span className="font-semibold">{payout.employeeName}</span> ({payout.employeeCode})</p>
        <p><span className="text-gray-500">Month:</span> <span className="font-semibold">{formatMonthLabel(payout.month)}</span></p>
        <p><span className="text-gray-500">Net Payable:</span> <span className="font-bold text-green-700">{formatCurrency(payout.finalSalary)}</span></p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Paid Date *</label>
          <input className={inp} type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Mode</label>
          <select className={inp} value={paidMode} onChange={(e) => setPaidMode(e.target.value)}>
            {PAY_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
        <input className={inp} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Reference no., notes…" />
      </div>
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-1.5">
          <Check size={15} /> Confirm Paid
        </button>
      </div>
    </form>
  );
}

// Persistent, because an unsettled early payout is the single easiest thing to forget:
// the money is out the door and the correction only happens if somebody comes back to it.
function SettlementBanner({ items, onSettle, onSettleAll, onCloseOut }) {
  if (!items.length) return null;
  const ready = items.filter((x) => x.settlement.ready);
  const blocked = items.filter((x) => !x.settlement.ready);

  return (
    <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle size={15} /> {items.length} early payout{items.length > 1 ? 's' : ''} awaiting settlement
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            These were paid before the month was fully marked. Settling compares the true salary
            against what was handed over and carries the difference into the next month.
          </p>
        </div>
        {ready.length > 1 && (
          <button onClick={onSettleAll}
            className="flex items-center gap-1.5 px-3 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 whitespace-nowrap">
            <Scale size={14} /> Settle all {ready.length} ready
          </button>
        )}
      </div>

      <div className="space-y-2">
        {ready.map(({ payout, employee, settlement }) => (
          <div key={payout.id} className="bg-white border border-amber-200 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">
                {employee?.name || payout.employeeName} · {formatMonthLabel(payout.month)}
              </p>
              <p className="text-xs text-gray-500">
                Paid {formatCurrency(settlement.paidAmount)} · true {formatCurrency(settlement.trueFinalSalary)} ·{' '}
                {settlement.negligible
                  ? <span className="text-gray-600 font-medium">no adjustment needed</span>
                  : <span className={settlement.delta < 0 ? 'text-red-600 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {settlement.delta < 0 ? 'overpaid ' : 'underpaid '}
                      {formatCurrency(Math.abs(settlement.delta))} → {formatMonthLabel(settlement.intoMonth)}
                    </span>}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">{settlement.reason}</p>
            </div>
            <button onClick={() => onSettle(payout.id, settlement)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-lg hover:bg-emerald-700 whitespace-nowrap">
              <Scale size={13} /> Settle
            </button>
          </div>
        ))}

        {blocked.map(({ payout, employee, settlement }) => {
          const left = employee && employee.status !== 'Active';
          return (
            <div key={payout.id} className={`bg-white border rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap ${left ? 'border-red-200' : 'border-gray-200'}`}>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800">
                  {employee?.name || payout.employeeName} · {formatMonthLabel(payout.month)}
                  <span className="ml-2 px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[10px] font-medium rounded">BLOCKED</span>
                  {left && (
                    <span className="ml-1.5 px-1.5 py-0.5 bg-red-100 text-red-700 text-[10px] font-medium rounded">
                      LEFT {employee.leftDate || ''}
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Waiting on attendance for{' '}
                  <span className="font-mono font-medium text-gray-700">
                    {settlement.blocking.map((d) => parseInt(d.slice(-2), 10)).join(', ')}
                  </span>{' '}
                  ({settlement.blocking.length} day{settlement.blocking.length > 1 ? 's' : ''})
                </p>
                {left && (
                  <p className="text-[11px] text-red-700 mt-0.5 font-medium">
                    This employee has left — these days will never be marked. Close it out.
                  </p>
                )}
              </div>
              <button onClick={() => onCloseOut(payout)}
                title="Settle against the attendance that exists and book the residue now"
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg whitespace-nowrap ${
                  left ? 'bg-red-600 text-white hover:bg-red-700'
                       : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                }`}>
                <UserMinus size={13} /> Close out
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Payouts() {
  const {
    payouts, employees, attendance, advances, lacePackingRecords, settings,
    markPayoutPaid, markPayoutPending, deletePayout, settlePayout, closeOutPayout,
  } = useApp();

  const unsettled = useMemo(
    () => getUnsettledProjected(payouts, { employees, attendance, advances, lacePackingRecords, settings, payouts }),
    [payouts, employees, attendance, advances, lacePackingRecords, settings]
  );

  const handleSettleAll = () => {
    unsettled.filter((x) => x.settlement.ready).forEach((x) => settlePayout(x.payout.id, x.settlement));
  };

  // Close-out is destructive-ish (it books a real balance), so it goes through a confirm
  // that states the exact consequence rather than a bare "are you sure".
  const [closeOutTarget, setCloseOutTarget] = useState(null);
  const closeOutPreview = useMemo(() => {
    if (!closeOutTarget) return null;
    const employee = employees.find((e) => e.id === closeOutTarget.employeeId);
    return computeSettlement(
      closeOutTarget,
      { employee, attendance, advances, lacePackingRecords, settings, payouts },
      { closeOut: true }
    );
  }, [closeOutTarget, employees, attendance, advances, lacePackingRecords, settings, payouts]);
  const [month, setMonth] = useState('all'); // 'all' or 'YYYY-MM'
  const [statusFilter, setStatusFilter] = useState('all'); // all | Pending | Paid
  const [search, setSearch] = useState('');
  const [payTarget, setPayTarget] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  // Distinct months that have at least one payout (newest first)
  const monthOptions = useMemo(() => {
    const set = new Set(payouts.map((p) => p.month));
    return [...set].sort().reverse();
  }, [payouts]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return payouts
      .filter((p) => (month === 'all' ? true : p.month === month))
      .filter((p) => (statusFilter === 'all' ? true : p.status === statusFilter))
      .filter((p) =>
        !q ||
        p.employeeName?.toLowerCase().includes(q) ||
        p.employeeCode?.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        // Pending first within a month, then by month descending
        if (a.month !== b.month) return b.month.localeCompare(a.month);
        if (a.status !== b.status) return a.status === 'Pending' ? -1 : 1;
        return (a.employeeName || '').localeCompare(b.employeeName || '');
      });
  }, [payouts, month, statusFilter, search]);

  const totals = useMemo(() => {
    const t = { total: 0, paid: 0, pending: 0, count: filtered.length, paidCount: 0, pendingCount: 0 };
    filtered.forEach((p) => {
      const amt = parseFloat(p.finalSalary) || 0;
      t.total += amt;
      if (p.status === 'Paid') { t.paid += amt; t.paidCount++; }
      else { t.pending += amt; t.pendingCount++; }
    });
    return t;
  }, [filtered]);

  const handleExport = () => {
    const rows = filtered.map((p) => ({
      Month: p.month,
      'Employee Code': p.employeeCode || '',
      Employee: p.employeeName || '',
      'Net Payable': (parseFloat(p.finalSalary) || 0).toFixed(2),
      Status: p.status,
      'Paid Date': p.paidDate || '',
      'Payment Mode': p.paidMode || '',
      Remarks: p.remarks || '',
      'Finalised At': p.finalisedAt || '',
    }));
    downloadCSV(rows, `salary_payouts_${month === 'all' ? 'all' : month}.csv`);
  };

  return (
    <div className="space-y-4">
      <SettlementBanner items={unsettled} onSettle={settlePayout} onSettleAll={handleSettleAll}
        onCloseOut={setCloseOutTarget} />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Finalised</p>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(totals.total)}</p>
          <p className="text-[11px] text-gray-400">{totals.count} record(s)</p>
        </div>
        <div className="bg-green-50 rounded-xl border border-green-200 p-4 shadow-sm">
          <p className="text-xs text-green-700">Paid Out</p>
          <p className="text-xl font-bold text-green-700">{formatCurrency(totals.paid)}</p>
          <p className="text-[11px] text-green-600">{totals.paidCount} payment(s)</p>
        </div>
        <div className="bg-yellow-50 rounded-xl border border-yellow-200 p-4 shadow-sm">
          <p className="text-xs text-yellow-700">Pending Payout</p>
          <p className="text-xl font-bold text-yellow-700">{formatCurrency(totals.pending)}</p>
          <p className="text-[11px] text-yellow-600">{totals.pendingCount} pending</p>
        </div>
        <div className="bg-blue-50 rounded-xl border border-blue-200 p-4 shadow-sm">
          <p className="text-xs text-blue-700">Months Tracked</p>
          <p className="text-xl font-bold text-blue-700">{monthOptions.length}</p>
          <p className="text-[11px] text-blue-600">Across all months</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <select value={month} onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Months</option>
          {monthOptions.map((m) => <option key={m} value={m}>{formatMonthLabel(m)}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="all">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employee name or code…"
            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 bg-white whitespace-nowrap">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No payouts yet"
          description="Finalise a salary from the Salary Calculator to track its payout status here."
        />
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Month', 'Employee', 'Net Payable', 'Status', 'Paid Date', 'Mode', 'Remarks', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatMonthLabel(p.month)}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold text-gray-800">{p.employeeName}</p>
                    <p className="text-xs text-gray-400">{p.employeeCode}</p>
                    {p.basis === 'projected' && (
                      <span className={`inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.5 text-[10px] font-medium rounded ${
                        p.settled ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
                      }`}>
                        <CalendarClock size={9} />
                        {p.settled
                          ? (p.settlementDelta
                              ? `settled ${p.settlementDelta < 0 ? '−' : '+'}${formatCurrency(Math.abs(p.settlementDelta))}`
                              : 'settled, no adj.')
                          : `early · ${(p.projectedDates || []).length}d assumed`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-bold text-gray-800">{formatCurrency(p.finalSalary)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.status === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>{p.status}</span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{p.paidDate || '—'}</td>
                  <td className="px-3 py-2 text-gray-600">{p.paidMode || '—'}</td>
                  <td className="px-3 py-2 text-gray-500 max-w-[180px] truncate" title={p.remarks}>{p.remarks || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {p.status === 'Pending' ? (
                        <button onClick={() => setPayTarget(p)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700">
                          <Check size={12} /> Mark Paid
                        </button>
                      ) : (
                        <button onClick={() => markPayoutPending(p.id)}
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200">
                          <Undo2 size={12} /> Undo
                        </button>
                      )}
                      <button onClick={() => setDeleteId(p.id)}
                        className="p-1 rounded hover:bg-red-50 text-red-400" title="Remove record">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t border-gray-200">
              <tr>
                <td colSpan={2} className="px-3 py-2 text-xs font-semibold text-gray-600">Totals</td>
                <td className="px-3 py-2 font-bold text-gray-800">{formatCurrency(totals.total)}</td>
                <td colSpan={5} className="px-3 py-2 text-xs text-gray-500">
                  <span className="text-green-700 font-medium">Paid {formatCurrency(totals.paid)}</span>
                  {' · '}
                  <span className="text-yellow-700 font-medium">Pending {formatCurrency(totals.pending)}</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <Modal isOpen={!!payTarget} onClose={() => setPayTarget(null)} title="Mark Salary as Paid" size="md">
        {payTarget && (
          <MarkPaidForm
            payout={payTarget}
            onSave={(data) => { markPayoutPaid(payTarget.id, data); setPayTarget(null); }}
            onCancel={() => setPayTarget(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        isOpen={!!closeOutTarget}
        title="Close out this early payout?"
        message={closeOutPreview ? (
          `${closeOutTarget?.employeeName} — ${formatMonthLabel(closeOutTarget?.month || '')}\n\n` +
          `${closeOutPreview.neverMarkedDates.length} assumed day(s) were never marked and will count as not worked.\n\n` +
          `Paid out:   ${formatCurrency(closeOutPreview.paidAmount)}\n` +
          `Earned:     ${formatCurrency(closeOutPreview.trueFinalSalary)}\n\n` +
          (closeOutPreview.negligible
            ? 'Nothing outstanding either way — this just marks it settled.'
            : closeOutPreview.delta < 0
              ? `${formatCurrency(Math.abs(closeOutPreview.delta))} was overpaid. It will be recorded as an advance the employee owes back, and will show on their ledger.`
              : `${formatCurrency(closeOutPreview.delta)} is still due to the employee. It will be recorded as payable on final settlement.`)
        ) : ''}
        confirmLabel="Close out"
        onConfirm={() => { closeOutPayout(closeOutTarget.id, closeOutPreview); setCloseOutTarget(null); }}
        onCancel={() => setCloseOutTarget(null)}
      />

      <ConfirmDialog
        isOpen={!!deleteId}
        title="Remove payout record"
        message="This removes the finalisation record only. It does NOT undo any advance deduction that was already applied. Continue?"
        confirmLabel="Yes, remove"
        onConfirm={() => { deletePayout(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
