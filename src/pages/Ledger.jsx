import React, { useState, useMemo } from 'react';
import { BookOpen, Download, Printer, Search, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { formatCurrency, round2 } from '../utils/calculations.js';
import { buildLedger, getLedgerSummary, ENTRY_TYPES } from '../utils/ledger.js';
import { downloadCSV, printElement } from '../utils/exportUtils.js';

const TYPE_STYLE = {
  [ENTRY_TYPES.ADVANCE_GIVEN]:    'bg-red-100 text-red-700',
  [ENTRY_TYPES.ADVANCE_DEDUCTED]: 'bg-emerald-100 text-emerald-700',
  [ENTRY_TYPES.ADVANCE_MANUAL]:   'bg-emerald-100 text-emerald-700',
  [ENTRY_TYPES.SALARY_FINALISED]: 'bg-gray-100 text-gray-600',
  [ENTRY_TYPES.SALARY_PAID]:      'bg-blue-100 text-blue-700',
  [ENTRY_TYPES.ADJUSTMENT]:       'bg-amber-100 text-amber-800',
};

export default function Ledger() {
  const { employees, advances, payouts, settings } = useApp();
  const [empId, setEmpId] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');

  // ── All-employees overview ────────────────────────────────────────────────
  const overview = useMemo(() => {
    const q = search.toLowerCase().trim();
    return employees
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.employeeCode?.toLowerCase().includes(q))
      .map((e) => ({ emp: e, ...getLedgerSummary({ employeeId: e.id, advances, payouts }) }))
      .filter((r) => r.entryCount > 0);
  }, [employees, advances, payouts, search]);

  const totals = useMemo(() => ({
    outstanding: round2(overview.reduce((s, r) => s + r.outstandingAdvance, 0)),
    paid:        round2(overview.reduce((s, r) => s + r.totalSalaryPaid, 0)),
    mismatches:  overview.filter((r) => !r.reconciles).length,
  }), [overview]);

  // ── One employee's statement ──────────────────────────────────────────────
  const employee = employees.find((e) => e.id === empId);
  const rows = useMemo(() => {
    if (empId === 'all') return [];
    return buildLedger({ employeeId: empId, advances, payouts })
      .filter((r) => typeFilter === 'all' || r.type === typeFilter)
      .filter((r) => !from || r.date >= from)
      .filter((r) => !to || r.date <= to);
  }, [empId, advances, payouts, typeFilter, from, to]);

  const summary = useMemo(
    () => (empId === 'all' ? null : getLedgerSummary({ employeeId: empId, advances, payouts })),
    [empId, advances, payouts]
  );

  const handleExport = () => {
    if (empId === 'all') {
      downloadCSV(
        overview.map((r) => ({
          'Employee Code': r.emp.employeeCode,
          Employee: r.emp.name,
          Status: r.emp.status,
          'Outstanding Advance': r.outstandingAdvance.toFixed(2),
          'Total Salary Paid': r.totalSalaryPaid.toFixed(2),
          Entries: r.entryCount,
          Reconciles: r.reconciles ? 'Yes' : 'NO — investigate',
        })),
        'ledger_all_employees.csv'
      );
      return;
    }
    downloadCSV(
      rows.map((r) => ({
        Date: r.date,
        Type: r.type,
        Detail: r.detail,
        Amount: (r.amount ?? r.cashOut ?? 0).toFixed(2),
        'Owes Change': (r.owesDelta || 0).toFixed(2),
        'Running Balance': r.balance.toFixed(2),
      })),
      `ledger_${employee?.employeeCode || empId}.csv`
    );
  };

  const inp = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-gray-200 p-3">
        <select value={empId} onChange={(e) => setEmpId(e.target.value)} className={`${inp} min-w-[190px]`}>
          <option value="all">All employees (summary)</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.name} ({e.employeeCode})</option>
          ))}
        </select>

        {empId === 'all' ? (
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className={`${inp} w-full pl-8`} placeholder="Search employee…"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        ) : (
          <>
            <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={inp}>
              <option value="all">All entry types</option>
              {Object.values(ENTRY_TYPES).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inp} title="From date" />
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inp} title="To date" />
          </>
        )}

        <button onClick={handleExport} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => printElement('ledger-print')} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
          <Printer size={14} /> Print
        </button>
      </div>

      {/* ── All-employees summary ─────────────────────────────────────────── */}
      {empId === 'all' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500">Total outstanding advance</p>
              <p className="text-xl font-bold text-red-600">{formatCurrency(totals.outstanding)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
              <p className="text-xs text-gray-500">Total salary paid</p>
              <p className="text-xl font-bold text-gray-800">{formatCurrency(totals.paid)}</p>
            </div>
            <div className={`rounded-xl border p-4 shadow-sm ${totals.mismatches ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-200'}`}>
              <p className={`text-xs ${totals.mismatches ? 'text-red-700' : 'text-green-700'}`}>Reconciliation</p>
              <p className={`text-xl font-bold flex items-center gap-1.5 ${totals.mismatches ? 'text-red-700' : 'text-green-700'}`}>
                {totals.mismatches
                  ? <><AlertTriangle size={18} /> {totals.mismatches} mismatch</>
                  : <><CheckCircle2 size={18} /> All balanced</>}
              </p>
              <p className="text-[11px] text-gray-500 mt-0.5">Ledger vs Advance Management</p>
            </div>
          </div>

          <div id="ledger-print" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold">{settings.companyName} — Employee balances</p>
            </div>
            {overview.length === 0 ? (
              <EmptyState icon={BookOpen} title="Nothing to show" description="Add an advance or finalise a salary to build a ledger." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Employee', 'Outstanding advance', 'Salary paid (all time)', 'Entries', 'Reconciles'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {overview.map((r) => (
                    <tr key={r.emp.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setEmpId(r.emp.id)}>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-gray-800">{r.emp.name}</p>
                        <p className="text-xs text-gray-400">{r.emp.employeeCode}</p>
                      </td>
                      <td className={`px-4 py-2.5 font-bold ${r.outstandingAdvance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatCurrency(r.outstandingAdvance)}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{formatCurrency(r.totalSalaryPaid)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.entryCount}</td>
                      <td className="px-4 py-2.5">
                        {r.reconciles
                          ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">✓ balanced</span>
                          : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">mismatch</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── One employee's statement ──────────────────────────────────────── */}
      {empId !== 'all' && (
        <>
          {summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Outstanding advance</p>
                <p className={`text-xl font-bold ${summary.outstandingAdvance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatCurrency(summary.outstandingAdvance)}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <p className="text-xs text-gray-500">Salary paid (all time)</p>
                <p className="text-xl font-bold text-gray-800">{formatCurrency(summary.totalSalaryPaid)}</p>
              </div>
              <div className={`rounded-xl border p-4 shadow-sm ${summary.reconciles ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-300'}`}>
                <p className={`text-xs ${summary.reconciles ? 'text-green-700' : 'text-red-700'}`}>Ledger vs Advance Management</p>
                <p className={`text-sm font-bold flex items-center gap-1.5 mt-1 ${summary.reconciles ? 'text-green-700' : 'text-red-700'}`}>
                  {summary.reconciles
                    ? <><CheckCircle2 size={16} /> Reconciled</>
                    : <><AlertTriangle size={16} /> {formatCurrency(summary.ledgerBalance)} vs {formatCurrency(summary.outstandingAdvance)}</>}
                </p>
              </div>
            </div>
          )}

          <div id="ledger-print" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-sm font-semibold">{settings.companyName} — Statement</p>
              <p className="text-xs text-gray-500">
                {employee?.name} ({employee?.employeeCode}){employee?.role ? ` · ${employee.role}` : ''}
              </p>
            </div>
            {rows.length === 0 ? (
              <EmptyState icon={BookOpen} title="No entries" description="Nothing matches these filters." />
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Date', 'Type', 'Detail', 'Amount', 'Owes ±', 'Balance'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{r.date || '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${TYPE_STYLE[r.type] || 'bg-gray-100 text-gray-600'}`}>
                          {r.type}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 max-w-[280px]">{r.detail || '—'}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">
                        {r.amount != null ? formatCurrency(r.amount) : r.cashOut ? formatCurrency(r.cashOut) : '—'}
                      </td>
                      <td className={`px-4 py-2.5 font-medium whitespace-nowrap ${
                        r.owesDelta > 0 ? 'text-red-600' : r.owesDelta < 0 ? 'text-emerald-600' : 'text-gray-300'
                      }`}>
                        {r.owesDelta ? `${r.owesDelta > 0 ? '+' : '−'}${formatCurrency(Math.abs(r.owesDelta))}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(r.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="signature-section flex justify-between px-6 py-6 text-xs text-gray-500 border-t border-gray-100">
              <div className="border-t border-gray-400 w-40 pt-1 text-center">Employee signature</div>
              <div className="border-t border-gray-400 w-40 pt-1 text-center">Employer signature</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
