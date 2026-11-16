import React, { useState, useMemo } from 'react';
import { Plus, Edit2, Trash2, CreditCard, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import Modal from '../components/Common/Modal.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { formatCurrency, todayStr, round2 } from '../utils/calculations.js';

const PAYMENT_MODES = ['Cash', 'UPI', 'Bank Transfer', 'Other'];
// A function, not a module-level constant: evaluated once at import, `date` would go
// stale if the app is left open past midnight.
const emptyForm = () => ({
  employeeId: '', date: todayStr(), amount: '', paymentMode: 'Cash', remarks: '',
  repaymentType: 'Full', emiAmount: '', emiStartMonth: '', kind: 'loan',
});

// "YYYY-MM-DD" → "YYYY-MM" of the NEXT month (default EMI start)
const nextMonthOf = (dateStr) => {
  const [y, m] = (dateStr || todayStr()).split('-').map(Number);
  const dt = new Date(y, (m - 1) + 1, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
};

function AdvanceForm({ initial, employees, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const F = (f) => (e) => setForm((p) => ({ ...p, [f]: e.target.value }));
  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  const isEmi = form.repaymentType === 'EMI' && form.kind !== 'salary_advance';
  const amt = parseFloat(form.amount) || 0;
  const emi = parseFloat(form.emiAmount) || 0;
  const monthsToClear = isEmi && emi > 0 && amt > 0 ? Math.ceil(amt / emi) : 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isEmi) {
      if (!(emi > 0)) {
        alert('Please enter a valid EMI amount.');
        return;
      }
      if (emi > amt) {
        alert('EMI amount cannot exceed the total advance amount.');
        return;
      }
    }
    const payload = {
      ...form,
      kind: form.kind === 'salary_advance' ? 'salary_advance' : 'loan',
      // Normalize EMI fields
      repaymentType: isEmi ? 'EMI' : 'Full',
      emiAmount: isEmi ? emi : 0,
      emiStartMonth: isEmi ? (form.emiStartMonth || nextMonthOf(form.date)) : '',
    };
    onSave(payload);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹) *</label>
          <input className={inp} type="number" min="1" value={form.amount} onChange={F('amount')} placeholder="5000" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Payment Mode</label>
          <select className={inp} value={form.paymentMode} onChange={F('paymentMode')}>
            {PAYMENT_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Remarks</label>
          <input className={inp} value={form.remarks} onChange={F('remarks')} placeholder="Medical emergency…" />
        </div>
      </div>

      {/* Loan vs salary paid early — these behave differently and must not be conflated. */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
        <p className="text-xs font-semibold text-gray-700">What is this?</p>
        <div className="flex flex-col sm:flex-row gap-3 text-sm">
          <label className="flex items-start gap-2 cursor-pointer flex-1">
            <input type="radio" name="kind" className="mt-1"
              checked={form.kind !== 'salary_advance'}
              onChange={() => setForm((p) => ({ ...p, kind: 'loan' }))} />
            <span>
              <span className="font-medium">Loan</span>
              <span className="block text-[11px] text-gray-500">Money lent. Owed back, deducted from future salary.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 cursor-pointer flex-1">
            <input type="radio" name="kind" className="mt-1"
              checked={form.kind === 'salary_advance'}
              onChange={() => setForm((p) => ({ ...p, kind: 'salary_advance', repaymentType: 'Full' }))} />
            <span>
              <span className="font-medium">Salary paid early</span>
              <span className="block text-[11px] text-gray-500">
                This month's own earnings, handed over ahead of payday. Settles with the payout —
                excluded from outstanding advances so it is never deducted twice.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/* Repayment plan — only meaningful for an actual loan */}
      {form.kind !== 'salary_advance' && (
      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 space-y-3">
        <p className="text-xs font-semibold text-indigo-700">Repayment Plan</p>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="repaymentType" value="Full"
              checked={form.repaymentType !== 'EMI'}
              onChange={() => setForm((p) => ({ ...p, repaymentType: 'Full' }))} />
            <span>Lump-sum / Manual</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="repaymentType" value="EMI"
              checked={form.repaymentType === 'EMI'}
              onChange={() => setForm((p) => ({
                ...p,
                repaymentType: 'EMI',
                emiStartMonth: p.emiStartMonth || nextMonthOf(p.date),
              }))} />
            <span>Auto-deduct EMI from salary</span>
          </label>
        </div>

        {isEmi && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">EMI per Month (₹) *</label>
              <input className={inp} type="number" min="1" step="1"
                value={form.emiAmount} onChange={F('emiAmount')} placeholder="1000" required={isEmi} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">First Deduction Month</label>
              <input className={inp} type="month"
                value={form.emiStartMonth || nextMonthOf(form.date)}
                onChange={F('emiStartMonth')} />
            </div>
            <div className="col-span-2 text-xs text-indigo-700">
              {emi > 0 && amt > 0 ? (
                <>Will clear in <span className="font-semibold">{monthsToClear} month(s)</span> ({formatCurrency(emi)}/mo × {monthsToClear - 1} + {formatCurrency(amt - emi * (monthsToClear - 1))} final).</>
              ) : (
                <>Enter an EMI amount to preview the repayment schedule.</>
              )}
            </div>
          </div>
        )}
      </div>
      )}

      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Advance</button>
      </div>
    </form>
  );
}

function DeductModal({ advance, onSave, onCancel }) {
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const max = round2(advance.remainingAmount);

  const submit = () => {
    const val = round2(amount);
    if (!(val > 0)) { setError('Enter an amount greater than zero.'); return; }
    // The `max` attribute on a number input is advisory only — enforce it here, otherwise
    // an over-entry silently spills onto the employee's other advances.
    if (val > max) { setError(`Can't exceed the ${formatCurrency(max)} remaining on this advance.`); return; }
    onSave(val);
  };

  return (
    <div className="space-y-4">
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <p><span className="text-gray-500">Total Advance:</span> <span className="font-semibold">{formatCurrency(advance.amount)}</span></p>
        <p><span className="text-gray-500">Already Deducted:</span> <span className="font-semibold">{formatCurrency(advance.deductedAmount)}</span></p>
        <p><span className="text-gray-500">Remaining:</span> <span className="font-bold text-red-600">{formatCurrency(max)}</span></p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Deduct Amount (₹)</label>
        <input type="number" min="0" step="any" max={max} value={amount}
          onChange={(e) => { setAmount(e.target.value); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ${error ? 'border-red-400 focus:ring-red-400' : 'border-gray-300 focus:ring-blue-500'}`}
          placeholder={`Max ${formatCurrency(max)}`} />
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>
      <div className="flex gap-3 justify-end">
        <button onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button onClick={submit}
          className="px-5 py-2 text-sm bg-orange-500 text-white rounded-lg hover:bg-orange-600">Apply Deduction</button>
      </div>
    </div>
  );
}

function EmployeeAdvanceCard({ emp, advances, onEdit, onDelete, onDeduct }) {
  const [expanded, setExpanded] = useState(false);
  const empAdvances = advances.filter((a) => a.employeeId === emp.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const pending = empAdvances.filter((a) => a.status !== 'Deducted').reduce((s, a) => s + parseFloat(a.remainingAmount || 0), 0);
  const total = empAdvances.reduce((s, a) => s + parseFloat(a.amount || 0), 0);

  if (empAdvances.length === 0) return null;

  const statusColor = { Pending: 'bg-red-100 text-red-700', 'Partially Deducted': 'bg-yellow-100 text-yellow-700', Deducted: 'bg-green-100 text-green-700' };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(!expanded)}>
        <div>
          <p className="font-semibold text-gray-900">{emp.name}</p>
          <p className="text-xs text-gray-400">{emp.employeeCode} · {empAdvances.length} advance(s)</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-xs text-gray-400">Pending Balance</p>
            <p className={`font-bold ${pending > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(pending)}</p>
          </div>
          {expanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                {['Date', 'Amount', 'Deducted', 'Remaining', 'Mode', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {empAdvances.map((adv) => (
                <tr key={adv.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-600">{adv.date}</td>
                  <td className="px-3 py-2 font-semibold">
                    {formatCurrency(adv.amount)}
                    {adv.kind === 'salary_advance' && (
                      <span className="ml-2 px-1.5 py-0.5 bg-teal-100 text-teal-800 text-[10px] font-medium rounded"
                        title="Salary paid early — settles with the payout, not counted as outstanding">
                        SALARY EARLY
                      </span>
                    )}
                    {adv.repaymentType === 'EMI' && adv.kind !== 'salary_advance' && (
                      <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] font-medium rounded">
                        EMI {formatCurrency(adv.emiAmount)}/mo
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-orange-600">{formatCurrency(adv.deductedAmount)}</td>
                  <td className="px-3 py-2 font-semibold text-red-600">{formatCurrency(adv.remainingAmount)}</td>
                  <td className="px-3 py-2 text-gray-500">{adv.paymentMode}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[adv.status] || 'bg-gray-100 text-gray-600'}`}>{adv.status}</span>
                    {adv.repaymentType === 'EMI' && adv.emiStartMonth && (
                      <div className="text-[10px] text-gray-400 mt-0.5">from {adv.emiStartMonth}</div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {adv.status !== 'Deducted' && (
                        <button onClick={() => onDeduct(adv)} className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded hover:bg-orange-200">Deduct</button>
                      )}
                      <button onClick={() => onEdit(adv)} className="p-1 rounded hover:bg-blue-50 text-blue-500"><Edit2 size={13} /></button>
                      <button onClick={() => onDelete(adv.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {empAdvances.some((a) => a.remarks) && (
            <div className="px-4 py-2 text-xs text-gray-400 bg-gray-50 border-t border-gray-100">
              {empAdvances.filter((a) => a.remarks).map((a) => <span key={a.id} className="mr-3">{a.date}: {a.remarks}</span>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdvanceManagement() {
  const { employees, advances, addAdvance, updateAdvance, deleteAdvance, applyAdvanceDeduction, showToast } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal, setModal] = useState(null);
  const [deductTarget, setDeductTarget] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees]);

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase();
    return activeEmployees.filter((emp) => {
      const empAdvances = advances.filter((a) => a.employeeId === emp.id);
      if (empAdvances.length === 0) return false;
      const matchSearch = !q || emp.name.toLowerCase().includes(q) || emp.mobile?.includes(q);
      const matchStatus = statusFilter === 'All' || empAdvances.some((a) => a.status === statusFilter);
      return matchSearch && matchStatus;
    });
  }, [activeEmployees, advances, search, statusFilter]);

  // Early-paid salary settles through its payout, not by being deducted again — so it
  // must not be counted as outstanding here.
  const totalPending = useMemo(() =>
    round2(advances
      .filter((a) => a.status !== 'Deducted' && a.kind !== 'salary_advance')
      .reduce((s, a) => s + parseFloat(a.remainingAmount || 0), 0)),
  [advances]);

  const totalAdvances = useMemo(() => advances.reduce((s, a) => s + parseFloat(a.amount || 0), 0), [advances]);

  const handleSave = (data) => {
    if (modal === 'add') { addAdvance(data); setModal(null); return; }
    // updateAdvance rejects an amount below what's already been deducted — keep the
    // modal open in that case so the user can correct it.
    const res = updateAdvance(modal.id, data);
    if (res?.ok !== false) setModal(null);
  };

  const handleDeduct = (adv) => setDeductTarget(adv);
  const handleDeductSave = (amount) => {
    // Target THIS advance, not the employee's oldest one. Without priorityIds the
    // deduction lands on whichever advance happens to come first in the array.
    applyAdvanceDeduction(deductTarget.employeeId, amount, [deductTarget.id], { source: 'manual' });
    showToast(`${formatCurrency(amount)} deducted`);
    setDeductTarget(null);
  };

  const empWithAdvances = useMemo(() =>
    activeEmployees.filter((e) => advances.some((a) => a.employeeId === e.id)),
  [activeEmployees, advances]);

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Advances</p>
          <p className="text-xl font-bold text-gray-800">{formatCurrency(totalAdvances)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Total Pending</p>
          <p className="text-xl font-bold text-red-600">{formatCurrency(totalPending)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <p className="text-xs text-gray-500">Employees with Advance</p>
          <p className="text-xl font-bold text-gray-800">{empWithAdvances.length}</p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by employee name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Partially Deducted">Partially Deducted</option>
          <option value="Deducted">Deducted</option>
        </select>
        <button onClick={() => setModal('add')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap">
          <Plus size={16} /> Add Advance
        </button>
      </div>

      {/* Employee Cards */}
      {filteredEmployees.length === 0 ? (
        <EmptyState icon={CreditCard} title="No advances found" description="Add an advance for an employee."
          action={<button onClick={() => setModal('add')} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Add Advance</button>}
        />
      ) : (
        <div className="space-y-3">
          {filteredEmployees.map((emp) => (
            <EmployeeAdvanceCard key={emp.id} emp={emp} advances={advances}
              onEdit={(adv) => setModal(adv)}
              onDelete={(id) => setDeleteId(id)}
              onDeduct={handleDeduct}
            />
          ))}
        </div>
      )}

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Add Advance' : 'Edit Advance'}>
        <AdvanceForm initial={modal !== 'add' && modal ? {
            employeeId: modal.employeeId, date: modal.date, amount: modal.amount,
            paymentMode: modal.paymentMode, remarks: modal.remarks,
            repaymentType: modal.repaymentType || 'Full',
            emiAmount: modal.emiAmount || '',
            emiStartMonth: modal.emiStartMonth || '',
            kind: modal.kind || 'loan',
          } : emptyForm()}
          employees={employees} onSave={handleSave} onCancel={() => setModal(null)} />
      </Modal>

      <Modal isOpen={!!deductTarget} onClose={() => setDeductTarget(null)} title="Apply Advance Deduction" size="sm">
        {deductTarget && <DeductModal advance={deductTarget} onSave={handleDeductSave} onCancel={() => setDeductTarget(null)} />}
      </Modal>

      <ConfirmDialog isOpen={!!deleteId} title="Delete Advance" message="Delete this advance record?"
        onConfirm={() => { deleteAdvance(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} />
    </div>
  );
}
