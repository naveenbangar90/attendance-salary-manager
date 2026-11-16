import { describe, it, expect } from 'vitest';
import { calculateSalary, round2 } from '../calculations.js';
import { computeSettlement, getPriorAdjustment, blockingDates, projectedDatesFrom } from '../settlement.js';
import { buildLedger, getLedgerSummary, ENTRY_TYPES } from '../ledger.js';
import { applyDeductionToAdvances } from '../advanceLogic.js';

const settings = {
  totalWorkingDays: 30,
  overtimeEnabled: true, overtimeRatePerHour: 50, lateFineEnabled: true,
};
// ₹30,000 / 30 = ₹1,000 a day — keeps the arithmetic legible.
const employee = { id: 'e1', name: 'Suman', employeeCode: 'EMP001', role: 'Packer',
                   monthlySalary: 30000, joiningDate: '2020-01-01', status: 'Active' };

const present = (dates) => dates.map((d) => ({ employeeId: 'e1', date: d, status: 'Present' }));
const rec = (d, status) => ({ employeeId: 'e1', date: d, status });

// Aug 2026 (31 days): paid on the 27th. Days 28–31 carry no attendance yet, and under the
// 30-day model an unmarked day is not an absence — so they are already being paid.
const WORKED_1_27 = present(Array.from({ length: 27 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`));
const PROJECTED = ['2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31'];

describe('early payout — unmarked days are already paid', () => {
  it('pays the full 30 even though the last four days have no record', () => {
    const r = calculateSalary({
      employee, attendanceRecords: WORKED_1_27, advances: [], settings, monthKey: '2026-08',
    });
    expect(r.paidDays).toBe(30);
    expect(r.grossSalary).toBe(30000);
    // These are the days at risk: paid, but nothing has happened on them yet.
    expect(r.unmarkedDates).toEqual(PROJECTED);
    expect(r.unmarkedPaidDays).toBe(4);
  });

  it('shrinks the at-risk set as days get marked, and only absences cost money', () => {
    const plusPresent = [...WORKED_1_27, rec('2026-08-28', 'Present')];
    const a = calculateSalary({ employee, attendanceRecords: plusPresent, advances: [], settings, monthKey: '2026-08' });
    expect(a.unmarkedPaidDays).toBe(3);
    expect(a.paidDays).toBe(30);           // marking it Present changes nothing

    const plusAbsent = [...WORKED_1_27, rec('2026-08-28', 'Absent')];
    const b = calculateSalary({ employee, attendanceRecords: plusAbsent, advances: [], settings, monthKey: '2026-08' });
    expect(b.unmarkedPaidDays).toBe(3);
    expect(b.paidDays).toBe(29);           // marking it Absent costs a day
  });
});

// ─── The headline scenario ──────────────────────────────────────────────────
describe('settlement — paid on the 27th, then 2 of the last 4 days go absent', () => {
  const payout = {
    id: 'p1', employeeId: 'e1', month: '2026-08', basis: 'projected',
    projectedDates: PROJECTED, projectedPaidDays: 4,
    paidAmount: 30000, finalSalary: 30000, settled: false,
    snapshot: { advanceDeduction: 0, otherDeduction: 0, bonus: 0, priorAdjustment: 0 },
  };
  const settledAttendance = [
    ...WORKED_1_27,
    rec('2026-08-28', 'Present'), rec('2026-08-29', 'Present'),
    rec('2026-08-30', 'Absent'),  rec('2026-08-31', 'Absent'),
  ];
  const ctx = { employee, attendance: settledAttendance, advances: [], lacePackingRecords: [], settings };

  it('produces a −2-day adjustment carried into the next month', () => {
    const s = computeSettlement(payout, ctx);
    expect(s.ready).toBe(true);
    expect(s.trueFinalSalary).toBe(28000);        // 30 − 2 absent = 28 paid days
    expect(s.delta).toBe(-2000);
    expect(s.intoMonth).toBe('2026-09');
    expect(s.reason).toMatch(/2 of 4 assumed day\(s\) not worked/);
  });

  it('shows up as a named line in the next month, not folded into Other Deduction', () => {
    const s = computeSettlement(payout, ctx);
    const settledPayout = {
      ...payout, settled: true,
      settlementDelta: s.delta, settledIntoMonth: s.intoMonth, settlementReason: s.reason,
    };
    const prior = getPriorAdjustment([settledPayout], 'e1', '2026-09');
    expect(prior.amount).toBe(-2000);

    const sep = calculateSalary({
      employee, attendanceRecords: [], advances: [], settings, monthKey: '2026-09',
      priorAdjustment: prior.amount, priorAdjustmentNote: prior.note,
    });
    expect(sep.priorAdjustment).toBe(-2000);
    expect(sep.otherDeduction).toBe(0);           // kept separate, by design
    expect(sep.finalSalary).toBe(28000);          // 30,000 − 2,000 carried back
  });

  it('blocks while any at-risk date is still unmarked', () => {
    const partial = [...WORKED_1_27, rec('2026-08-28', 'Present')];
    const s = computeSettlement(payout, { ...ctx, attendance: partial });
    expect(s.ready).toBe(false);
    expect(s.blocking).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
  });

  it('is a no-op once settled — applying twice cannot double-count', () => {
    const s1 = computeSettlement(payout, ctx);
    const settledPayout = { ...payout, settled: true, settlementDelta: s1.delta, settledIntoMonth: s1.intoMonth };
    expect(computeSettlement(settledPayout, ctx)).toBeNull();

    const a = getPriorAdjustment([settledPayout], 'e1', '2026-09').amount;
    const b = getPriorAdjustment([settledPayout], 'e1', '2026-09').amount;
    expect(a).toBe(-2000);
    expect(b).toBe(-2000);
  });

  it('treats a sub-rupee delta as settled with no line item', () => {
    const exact = { ...payout, paidAmount: 28000 };
    const s = computeSettlement(exact, ctx);
    expect(s.delta).toBe(0);
    expect(s.negligible).toBe(true);
  });
});

describe('settlement edge cases', () => {
  const ctxBase = { employee, advances: [], lacePackingRecords: [], settings };

  it('does not re-apply the advance deduction that was taken at finalisation', () => {
    const payout = {
      id: 'p2', employeeId: 'e1', month: '2026-08', basis: 'projected',
      projectedDates: ['2026-08-28'], paidAmount: 29000, settled: false,
      snapshot: { advanceDeduction: 1000, otherDeduction: 0, bonus: 0, priorAdjustment: 0 },
    };
    const attendance = [...WORKED_1_27, rec('2026-08-28', 'Present')];
    const s = computeSettlement(payout, { ...ctxBase, attendance });
    // 30 paid days × 1000 = 30,000, minus the SAME 1,000 advance = 29,000. Delta zero: the
    // advance is a number in the formula here, it is not moved against the advances again.
    expect(s.trueFinalSalary).toBe(29000);
    expect(s.delta).toBe(0);
  });

  it('costs nothing when an at-risk day turns out to be a weekly off', () => {
    const payout = {
      id: 'p3', employeeId: 'e1', month: '2026-08', basis: 'projected',
      projectedDates: ['2026-08-28'], paidAmount: 30000, settled: false,
      snapshot: { advanceDeduction: 0, otherDeduction: 0, bonus: 0, priorAdjustment: 0 },
    };
    // Weekly offs sit inside the 30 and never deduct, so there is nothing to claw back.
    const off = computeSettlement(payout, { ...ctxBase, attendance: [...WORKED_1_27, rec('2026-08-28', 'Weekly Off')] });
    expect(off.trueFinalSalary).toBe(30000);
    expect(off.delta).toBe(0);

    // An absence on the same day does cost a day.
    const absent = computeSettlement(payout, { ...ctxBase, attendance: [...WORKED_1_27, rec('2026-08-28', 'Absent')] });
    expect(absent.trueFinalSalary).toBe(29000);
    expect(absent.delta).toBe(-1000);
  });

  it('chains across two consecutive early payouts', () => {
    const augSettled = {
      id: 'pA', employeeId: 'e1', month: '2026-08', basis: 'projected', settled: true,
      settlementDelta: -2000, settledIntoMonth: '2026-09', settlementReason: 'Aug: 2 of 4 not worked',
    };
    const priorSep = getPriorAdjustment([augSettled], 'e1', '2026-09');
    expect(priorSep.amount).toBe(-2000);

    // September is ALSO paid early and carries August's −2,000 in.
    const sepPayout = {
      id: 'pS', employeeId: 'e1', month: '2026-09', basis: 'projected',
      projectedDates: ['2026-09-30'], paidAmount: 28000, settled: false,
      snapshot: { advanceDeduction: 0, otherDeduction: 0, bonus: 0, priorAdjustment: priorSep.amount },
    };
    const sepAttendance = [
      ...present(Array.from({ length: 29 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)),
      rec('2026-09-30', 'Absent'),
    ];
    const s = computeSettlement(sepPayout, { ...ctxBase, attendance: sepAttendance, payouts: [augSettled] });
    expect(s.trueFinalSalary).toBe(27000);   // 29 paid days − 2,000 carried in
    expect(s.delta).toBe(-1000);             // September's own one-day shortfall
    expect(s.intoMonth).toBe('2026-10');
  });
});

// ─── §3.2.8 manual close-out for someone who left ───────────────────────────
describe('close-out when the employee leaves before the days are marked', () => {
  // She left on the 28th, so days 29–31 fall outside her employment window entirely.
  const leaver = { ...employee, status: 'Inactive', leftDate: '2026-08-28' };
  const payout = {
    id: 'p9', employeeId: 'e1', month: '2026-08', basis: 'projected',
    projectedDates: PROJECTED, projectedPaidDays: 4,
    paidAmount: 30000, finalSalary: 30000, settled: false,
    snapshot: { advanceDeduction: 0, otherDeduction: 0, bonus: 0, priorAdjustment: 0 },
  };
  const attendance = [...WORKED_1_27, rec('2026-08-28', 'Present')];
  const ctx = { employee: leaver, attendance, advances: [], lacePackingRecords: [], settings };

  it('refuses to settle normally, but advertises that a close-out is possible', () => {
    const s = computeSettlement(payout, ctx);
    expect(s.ready).toBe(false);
    expect(s.canCloseOut).toBe(true);
    expect(s.blocking).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
  });

  it('pro-rates to the days actually employed, so the overpayment falls out', () => {
    const s = computeSettlement(payout, ctx, { closeOut: true });
    expect(s.ready).toBe(true);
    expect(s.closeOut).toBe(true);
    expect(s.trueFinalSalary).toBe(27100);        // 30 × 28/31 = 27.1 days × ₹1,000
    expect(s.delta).toBe(-2900);
    expect(s.neverMarkedDates).toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
    expect(s.reason).toMatch(/closed out/);
  });

  it('has no next month to carry into — the residue is booked immediately', () => {
    const s = computeSettlement(payout, ctx, { closeOut: true });
    expect(s.intoMonth).toBeNull();
    const closed = { ...payout, settled: true, closedOut: true, settlementDelta: s.delta, settledIntoMonth: null };
    expect(getPriorAdjustment([closed], 'e1', '2026-09').amount).toBe(0);
  });

  it('books an overpayment as a balance the ex-employee owes back', () => {
    const s = computeSettlement(payout, ctx, { closeOut: true });
    const recovery = {
      id: `co_${payout.id}`, employeeId: 'e1', kind: 'loan', origin: 'closeout',
      linkedPayoutId: payout.id, date: '2026-09-01', amount: Math.abs(s.delta),
      deductedAmount: 0, remainingAmount: Math.abs(s.delta), status: 'Pending',
      remarks: `Unrecovered early salary — ${s.reason}`, deductions: [],
    };
    const closed = { ...payout, settled: true, closedOut: true, settlementDelta: s.delta, settledIntoMonth: null };

    const summary = getLedgerSummary({ employeeId: 'e1', advances: [recovery], payouts: [closed] });
    expect(summary.outstandingAdvance).toBe(2900);
    expect(summary.reconciles).toBe(true);

    const rows = buildLedger({ employeeId: 'e1', advances: [recovery], payouts: [closed], newestFirst: false });
    expect(rows.map((r) => r.type)).toContain(ENTRY_TYPES.CLOSEOUT_OWED);
    // Represented once — by the recovery advance, not also as a duplicate adjustment row.
    expect(rows.filter((r) => r.type === ENTRY_TYPES.ADJUSTMENT)).toHaveLength(0);
    expect(rows[rows.length - 1].balance).toBe(2900);
  });

  it('records an underpayment as due to the employee, not as a debt', () => {
    const underpaid = { ...payout, paidAmount: 25000 };   // 27,100 earned, 25,000 handed over
    const s = computeSettlement(underpaid, ctx, { closeOut: true });
    expect(s.delta).toBe(2100);

    const closed = { ...underpaid, settled: true, closedOut: true, settlementDelta: s.delta, settledIntoMonth: null };
    const rows = buildLedger({ employeeId: 'e1', advances: [], payouts: [closed], newestFirst: false });
    const due = rows.find((r) => r.type === ENTRY_TYPES.CLOSEOUT_DUE);
    expect(due).toBeTruthy();
    expect(due.amount).toBe(2100);
    expect(due.detail).toMatch(/pay on final settlement/);
    expect(rows[rows.length - 1].balance).toBe(0);        // they owe nothing
  });

  it('is idempotent — a closed-out payout is never a settlement candidate again', () => {
    const s = computeSettlement(payout, ctx, { closeOut: true });
    const closed = { ...payout, settled: true, closedOut: true, settlementDelta: s.delta };
    expect(computeSettlement(closed, ctx, { closeOut: true })).toBeNull();
    expect(computeSettlement(closed, ctx)).toBeNull();
  });
});

describe('projectedDatesFrom / blockingDates', () => {
  it('projects only unmarked dates after the payout date', () => {
    const d = projectedDatesFrom('2026-08', '2026-08-27', 'e1', WORKED_1_27);
    expect(d).toEqual(PROJECTED);
  });

  it('reports exactly the dates still missing attendance', () => {
    const payout = { employeeId: 'e1', projectedDates: PROJECTED };
    expect(blockingDates(payout, [...WORKED_1_27, rec('2026-08-28', 'Present')]))
      .toEqual(['2026-08-29', '2026-08-30', '2026-08-31']);
  });
});

// ─── Ledger ─────────────────────────────────────────────────────────────────
describe('ledger', () => {
  const advances = [
    { id: 'a1', employeeId: 'e1', kind: 'loan', date: '2026-06-01', amount: 5000,
      deductedAmount: 0, remainingAmount: 5000, status: 'Pending', paymentMode: 'Cash', deductions: [] },
  ];

  it('derives a running balance from advances and their deduction trail', () => {
    const afterDeduct = applyDeductionToAdvances(advances, {
      employeeId: 'e1', deductAmount: 1500, entryDate: '2026-07-05', entryId: 'd1', source: 'payout', payoutId: 'e1_2026-06',
    });
    const rows = buildLedger({ employeeId: 'e1', advances: afterDeduct, payouts: [], newestFirst: false });
    expect(rows.map((r) => r.type)).toEqual([ENTRY_TYPES.ADVANCE_GIVEN, ENTRY_TYPES.ADVANCE_DEDUCTED]);
    expect(rows[0].balance).toBe(5000);
    expect(rows[1].balance).toBe(3500);
  });

  it('reconciles exactly with remainingAmount in Advance Management', () => {
    const afterDeduct = applyDeductionToAdvances(advances, {
      employeeId: 'e1', deductAmount: 1500, entryDate: '2026-07-05', entryId: 'd1',
    });
    const s = getLedgerSummary({ employeeId: 'e1', advances: afterDeduct, payouts: [] });
    expect(s.outstandingAdvance).toBe(3500);
    expect(s.ledgerBalance).toBe(3500);
    expect(s.reconciles).toBe(true);
  });

  it('excludes salary-paid-early from the outstanding balance', () => {
    const withSalaryAdvance = [
      ...advances,
      { id: 'a2', employeeId: 'e1', kind: 'salary_advance', date: '2026-08-28', amount: 20000,
        deductedAmount: 0, remainingAmount: 20000, status: 'Pending', deductions: [] },
    ];
    const s = getLedgerSummary({ employeeId: 'e1', advances: withSalaryAdvance, payouts: [] });
    // Only the ₹5,000 loan is owed; early-paid salary settles via its payout.
    expect(s.outstandingAdvance).toBe(5000);
    expect(s.reconciles).toBe(true);
  });

  it('includes salary paid and settlement adjustments as entries', () => {
    const payouts = [{
      id: 'p1', employeeId: 'e1', month: '2026-08', basis: 'projected', status: 'Paid',
      finalSalary: 31000, paidAmount: 31000, paidDate: '2026-08-28', paidMode: 'Cash',
      finalisedAt: '2026-08-28T10:00:00.000Z', projectedDates: PROJECTED,
      settled: true, settlementDelta: -2000, settledIntoMonth: '2026-09',
      settlementReason: 'Aug: 2 of 4 not worked', settledAt: '2026-09-02T10:00:00.000Z',
    }];
    const rows = buildLedger({ employeeId: 'e1', advances: [], payouts, newestFirst: false });
    const types = rows.map((r) => r.type);
    expect(types).toContain(ENTRY_TYPES.SALARY_FINALISED);
    expect(types).toContain(ENTRY_TYPES.SALARY_PAID);
    expect(types).toContain(ENTRY_TYPES.ADJUSTMENT);
    // Salary movements don't change what the employee OWES.
    expect(rows[rows.length - 1].balance).toBe(0);
  });
});
