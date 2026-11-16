import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as storage from '../utils/storage.js';
import { round2, todayStr } from '../utils/calculations.js';
import { applyDeductionToAdvances, reverseDeductionFromAdvances, deriveAdvanceStatus } from '../utils/advanceLogic.js';
import { onRemoteChange } from '../utils/remoteSync.js';

const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export const AppProvider = ({ children }) => {
  const [employees, setEmp]        = useState(() => storage.getEmployees());
  const [attendance, setAtt]       = useState(() => storage.getAttendance());
  const [advances, setAdv]         = useState(() => storage.getAdvances());
  const [lacePackingRecords, setLP] = useState(() => storage.getLacePacking());
  const [payouts, setPayouts]      = useState(() => storage.getPayouts());
  const [settings, setSet]         = useState(() => storage.getSettings());
  const [toasts, setToasts]        = useState([]);

  useEffect(() => { storage.setEmployees(employees); }, [employees]);
  useEffect(() => { storage.setAttendance(attendance); }, [attendance]);
  useEffect(() => { storage.setAdvances(advances); }, [advances]);
  useEffect(() => { storage.setLacePacking(lacePackingRecords); }, [lacePackingRecords]);
  useEffect(() => { storage.setPayouts(payouts); }, [payouts]);
  useEffect(() => { storage.setSettings(settings); }, [settings]);

  // Online: collections changed elsewhere (check-in kiosk, another device) replace local state.
  useEffect(() => onRemoteChange((key) => {
    const K = storage.STORAGE_KEYS;
    if (key === K.EMPLOYEES) setEmp(storage.getEmployees());
    else if (key === K.ATTENDANCE) setAtt(storage.getAttendance());
    else if (key === K.ADVANCES) setAdv(storage.getAdvances());
    else if (key === K.LACE_PACKING) setLP(storage.getLacePacking());
    else if (key === K.PAYOUTS) setPayouts(storage.getPayouts());
    else if (key === K.SETTINGS) setSet(storage.getSettings());
  }), []);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  // ── Employees ──────────────────────────────────────────────────────────────
  // Employee codes identify a person across attendance, advances, lace and payouts —
  // a duplicate silently merges two people in every report.
  const codeTaken = useCallback((code, exceptId = null) => {
    const norm = String(code || '').trim().toLowerCase();
    if (!norm) return false;
    return employees.some((e) => e.id !== exceptId && String(e.employeeCode || '').trim().toLowerCase() === norm);
  }, [employees]);

  const addEmployee = useCallback((data) => {
    if (codeTaken(data.employeeCode)) {
      const msg = `Employee code "${data.employeeCode}" is already in use`;
      showToast(msg, 'error');
      return { ok: false, error: msg };
    }
    const emp = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setEmp((p) => [...p, emp]);
    showToast('Employee added successfully');
    return { ok: true, employee: emp };
  }, [codeTaken, showToast]);

  const updateEmployee = useCallback((id, data) => {
    if (codeTaken(data.employeeCode, id)) {
      const msg = `Employee code "${data.employeeCode}" is already in use`;
      showToast(msg, 'error');
      return { ok: false, error: msg };
    }
    setEmp((p) => p.map((e) => (e.id === id ? { ...e, ...data } : e)));
    showToast('Employee updated');
    return { ok: true };
  }, [codeTaken, showToast]);

  const deleteEmployee = useCallback((id) => {
    setEmp((p) => p.filter((e) => e.id !== id));
    showToast('Employee deleted');
  }, [showToast]);

  // ── Attendance ─────────────────────────────────────────────────────────────
  // `records` are upserted on the employeeId_date key. `clearKeys` are "employeeId_date"
  // strings for cells the user explicitly unmarked — those rows are removed entirely, so an
  // unmarked cell leaves no record behind rather than silently persisting a stale status.
  const bulkSaveAttendance = useCallback((records, clearKeys = []) => {
    // Resolved outside the updater to keep it deterministic under StrictMode.
    const stamp = new Date().toISOString();
    const seed = Date.now().toString(36);
    setAtt((prev) => {
      const map = new Map(prev.map((a) => [`${a.employeeId}_${a.date}`, a]));
      clearKeys.forEach((k) => map.delete(k));
      records.forEach((r, i) => {
        const key = `${r.employeeId}_${r.date}`;
        const existing = map.get(key);
        map.set(key, {
          ...existing,
          ...r,
          id: existing?.id || `${seed}_${i}`,
          createdAt: existing?.createdAt || stamp,
        });
      });
      return Array.from(map.values());
    });
    const n = records.length;
    const c = clearKeys.length;
    showToast(c ? `Saved ${n}, cleared ${c}` : `Attendance saved (${n})`);
  }, [showToast]);

  const updateAttendance = useCallback((id, data) => {
    setAtt((p) => p.map((a) => (a.id === id ? { ...a, ...data } : a)));
    showToast('Attendance updated');
  }, [showToast]);

  const deleteAttendance = useCallback((id) => {
    setAtt((p) => p.filter((a) => a.id !== id));
    showToast('Attendance record deleted');
  }, [showToast]);

  // ── Advances ───────────────────────────────────────────────────────────────
  const addAdvance = useCallback((data) => {
    const amount = round2(data.amount);
    const adv = {
      kind: 'loan',            // 'loan' = money lent; 'salary_advance' = earnings paid early
      ...data,
      id: Date.now().toString(),
      amount,
      emiAmount: round2(data.emiAmount || 0),
      deductedAmount: 0,
      remainingAmount: amount,
      status: 'Pending',
      deductions: [],
      createdAt: new Date().toISOString(),
    };
    setAdv((p) => [...p, adv]);
    showToast('Advance added');
    return adv;
  }, [showToast]);

  // Editing the amount must re-derive remainingAmount and status, otherwise the balance
  // goes stale (e.g. ₹5,000 with ₹2,000 deducted, edited to ₹6,000, still shows ₹3,000 left).
  // Reducing the amount below what's already been deducted is rejected rather than
  // writing a negative balance.
  const updateAdvance = useCallback((id, data) => {
    const existing = advances.find((a) => a.id === id);
    if (!existing) return { ok: false, error: 'Advance not found' };

    const nextAmount = data.amount !== undefined ? round2(data.amount) : round2(existing.amount);
    const deducted   = round2(existing.deductedAmount);

    if (nextAmount < deducted) {
      const msg = `Amount can't be below ₹${deducted.toFixed(2)} already deducted`;
      showToast(msg, 'error');
      return { ok: false, error: msg };
    }

    setAdv((p) =>
      p.map((a) =>
        a.id === id
          ? {
              ...a,
              ...data,
              amount: nextAmount,
              emiAmount: round2(data.emiAmount ?? a.emiAmount ?? 0),
              deductedAmount: deducted,
              remainingAmount: round2(nextAmount - deducted),
              status: deriveAdvanceStatus(nextAmount, deducted),
            }
          : a
      )
    );
    showToast('Advance updated');
    return { ok: true };
  }, [advances, showToast]);

  const deleteAdvance = useCallback((id) => {
    setAdv((p) => p.filter((a) => a.id !== id));
    showToast('Advance deleted');
  }, [showToast]);

  // Apply a deduction to one or more pending advances for an employee.
  // `priorityIds` (optional) — advance IDs deducted first (e.g. the EMI plan for this month).
  const applyAdvanceDeduction = useCallback((employeeId, deductAmount, priorityIds = [], meta = {}) => {
    // Non-deterministic values are resolved OUTSIDE the updater. Date.now() inside would
    // mint two different ids across StrictMode's double-invoke, so the updater would not
    // be a pure function of `prev`.
    const entryDate = meta.date || todayStr();
    const entryId   = meta.entryId || `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const source    = meta.source || 'manual';
    const payoutId  = meta.payoutId || null;

    setAdv((prev) =>
      applyDeductionToAdvances(prev, { employeeId, deductAmount, priorityIds, entryDate, entryId, source, payoutId })
    );
  }, []);

  // Undo part of a previously-applied deduction (e.g. re-finalising a month with a smaller
  // advance deduction).
  const reverseAdvanceDeduction = useCallback((employeeId, reverseAmount, meta = {}) => {
    const payoutId = meta.payoutId || null;
    setAdv((prev) => reverseDeductionFromAdvances(prev, { employeeId, reverseAmount, payoutId }));
  }, []);

  // ── Lace Packing ───────────────────────────────────────────────────────────
  const addLacePacking = useCallback((data) => {
    const record = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setLP((p) => [...p, record]);
    showToast('Lace packing entry added');
    return record;
  }, [showToast]);

  const updateLacePacking = useCallback((id, data) => {
    setLP((p) => p.map((r) => (r.id === id ? { ...r, ...data } : r)));
    showToast('Entry updated');
  }, [showToast]);

  const deleteLacePacking = useCallback((id) => {
    setLP((p) => p.filter((r) => r.id !== id));
    showToast('Entry deleted');
  }, [showToast]);

  // ── Payouts (salary finalisation) ──────────────────────────────────────────
  // A payout is a per-employee per-month record created when salary is finalised.
  // status: 'Pending' | 'Paid'
  const upsertPayout = useCallback((record) => {
    setPayouts((prev) => {
      const key = (p) => `${p.employeeId}_${p.month}`;
      const idx = prev.findIndex((p) => key(p) === key(record));
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], ...record, updatedAt: new Date().toISOString() };
        return next;
      }
      return [
        ...prev,
        {
          id: Date.now().toString() + Math.random(),
          status: 'Pending',
          paidDate: '',
          paidMode: '',
          remarks: '',
          createdAt: new Date().toISOString(),
          ...record,
        },
      ];
    });
  }, []);

  const markPayoutPaid = useCallback((id, { paidDate, paidMode, remarks } = {}) => {
    setPayouts((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              status: 'Paid',
              paidDate: paidDate || todayStr(),
              paidMode: paidMode || p.paidMode || 'Cash',
              remarks: remarks ?? p.remarks,
              updatedAt: new Date().toISOString(),
            }
          : p
      )
    );
    showToast('Marked as Paid');
  }, [showToast]);

  const markPayoutPending = useCallback((id) => {
    setPayouts((prev) =>
      prev.map((p) =>
        p.id === id ? { ...p, status: 'Pending', paidDate: '', updatedAt: new Date().toISOString() } : p
      )
    );
    showToast('Marked as Pending');
  }, [showToast]);

  // Record the outcome of an early ("projected") payout. The delta is carried into the next
  // month as a Prior period adjustment. Guarded on `settled` at BOTH the call site and inside
  // the updater, so a double-click or a StrictMode re-invoke can never apply it twice.
  const settlePayout = useCallback((payoutId, settlement) => {
    if (!settlement?.ready) return { ok: false, error: 'Not ready to settle' };
    const stamp = new Date().toISOString();
    let applied = false;
    setPayouts((prev) =>
      prev.map((p) => {
        if (p.id !== payoutId || p.settled) return p;   // idempotent
        applied = true;
        return {
          ...p,
          settled: true,
          settlementDelta: settlement.negligible ? 0 : round2(settlement.delta),
          settledIntoMonth: settlement.negligible ? null : settlement.intoMonth,
          settlementReason: settlement.reason,
          trueFinalSalary: round2(settlement.trueFinalSalary),
          settledAt: stamp,
          updatedAt: stamp,
        };
      })
    );
    showToast(
      settlement.negligible
        ? 'Settled — no adjustment needed'
        : `Settled: ${settlement.delta > 0 ? '+' : ''}${round2(settlement.delta)} carried into ${settlement.intoMonth}`
    );
    return { ok: true, applied };
  }, [showToast]);

  // Close out an early payout that can never settle normally — typically because the
  // employee left before the assumed days were ever marked. Settles against whatever
  // attendance exists and books the residue immediately, since there is no next cycle to
  // carry it into:
  //   overpaid  → an advance the ex-employee owes back (shows in the ledger as a balance)
  //   underpaid → recorded on the payout as a final amount still due to them
  const closeOutPayout = useCallback((payoutId, settlement) => {
    if (!settlement?.ready || !settlement.closeOut) return { ok: false, error: 'Not a close-out' };
    const stamp = new Date().toISOString();
    const owed = settlement.delta < 0 ? round2(Math.abs(settlement.delta)) : 0;
    const recoveryId = owed > 0 ? `co_${payoutId}` : null;

    let applied = false;
    setPayouts((prev) =>
      prev.map((p) => {
        if (p.id !== payoutId || p.settled) return p;    // idempotent
        applied = true;
        return {
          ...p,
          settled: true,
          closedOut: true,
          settlementDelta: settlement.negligible ? 0 : round2(settlement.delta),
          settledIntoMonth: null,                        // nothing to carry forward
          settlementReason: settlement.reason,
          trueFinalSalary: round2(settlement.trueFinalSalary),
          recoveryAdvanceId: recoveryId,
          finalAmountDueToEmployee: settlement.delta > 0 ? round2(settlement.delta) : 0,
          settledAt: stamp,
          updatedAt: stamp,
        };
      })
    );

    if (owed > 0) {
      setAdv((prev) => {
        if (prev.some((a) => a.id === recoveryId)) return prev;   // never book it twice
        return [...prev, {
          id: recoveryId,
          employeeId: settlement.employeeId,
          kind: 'loan',                 // genuinely owed back, so it counts as outstanding
          origin: 'closeout',
          linkedPayoutId: payoutId,
          date: todayStr(),
          amount: owed,
          deductedAmount: 0,
          remainingAmount: owed,
          status: 'Pending',
          paymentMode: '—',
          repaymentType: 'Full',
          emiAmount: 0,
          emiStartMonth: '',
          remarks: `Unrecovered early salary — ${settlement.reason}`,
          deductions: [],
          createdAt: stamp,
        }];
      });
    }

    showToast(
      settlement.negligible ? 'Closed out — nothing outstanding'
        : owed > 0 ? `Closed out — ${round2(owed)} recorded as owed`
        : `Closed out — ${round2(settlement.delta)} still due to employee`
    );
    return { ok: true, applied, owed };
  }, [showToast]);

  const deletePayout = useCallback((id) => {
    setPayouts((prev) => prev.filter((p) => p.id !== id));
    showToast('Payout record removed');
  }, [showToast]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const updateSettings = useCallback((data) => {
    setSet((p) => ({ ...p, ...data }));
    showToast('Settings saved');
  }, [showToast]);

  // ── Sample / Reset ─────────────────────────────────────────────────────────
  const loadSampleData = useCallback(async () => {
    const { sampleEmployees, sampleAttendance, sampleAdvances } = await import('../utils/sampleData.js');
    setEmp(sampleEmployees);
    setAtt(sampleAttendance);
    setAdv(sampleAdvances);
    showToast('Sample data loaded!');
  }, [showToast]);

  const clearAllData = useCallback(() => {
    setEmp([]); setAtt([]); setAdv([]); setLP([]); setPayouts([]);
    showToast('All data cleared');
  }, [showToast]);

  const value = {
    employees, attendance, advances, lacePackingRecords, payouts, settings, toasts,
    showToast, removeToast,
    addEmployee, updateEmployee, deleteEmployee,
    bulkSaveAttendance, updateAttendance, deleteAttendance,
    addAdvance, updateAdvance, deleteAdvance, applyAdvanceDeduction, reverseAdvanceDeduction,
    addLacePacking, updateLacePacking, deleteLacePacking,
    upsertPayout, markPayoutPaid, markPayoutPending, deletePayout, settlePayout, closeOutPayout,
    updateSettings,
    loadSampleData, clearAllData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
