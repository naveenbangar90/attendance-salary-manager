// Early salary payout and next-cycle settlement.
//
// The rule, plainly: salary for month M is normally paid on the 5th of M+1, by which point
// every day of M is marked. If someone asks for their salary on the 28th, the remaining days
// of M have not happened yet — and under the 30-day model an unmarked day is not an absence,
// so those days are already being paid. Settle up once they are marked: an absence that
// lands on one of them means the employee was overpaid, and the difference is carried into
// the next month.
//
// Two invariants:
//   1. Projected days are NEVER written to attendance. Attendance records what actually
//      happened; the assumption lives on the payout.
//   2. Settlement is idempotent. It is guarded on `settled` and is a pure computation, so
//      running it twice can never double-apply.

import { calculateSalary, round2, formatMonthLabel, nextMonthKey, getMonthDates, todayStr } from './calculations.js';

// Deltas below a rupee are rounding noise, not a real adjustment.
export const SETTLEMENT_EPSILON = 1;

/** Dates in `month` that are today-or-earlier and still have no attendance record. */
export const unmarkedDatesInMonth = (month, employeeId, attendance, upTo = todayStr()) => {
  const marked = new Set(
    attendance.filter((a) => a.employeeId === employeeId && a.date.startsWith(month)).map((a) => a.date)
  );
  return getMonthDates(month).filter((d) => !marked.has(d) && d <= upTo);
};

/** Dates in `month` from `fromDate` (exclusive) to month end — what an early payout assumes. */
export const projectedDatesFrom = (month, fromDate, employeeId, attendance) => {
  const marked = new Set(
    attendance.filter((a) => a.employeeId === employeeId && a.date.startsWith(month)).map((a) => a.date)
  );
  return getMonthDates(month).filter((d) => d > fromDate && !marked.has(d));
};

/** Which of a payout's projected dates still have no attendance record. */
export const blockingDates = (payout, attendance) => {
  const marked = new Set(
    attendance.filter((a) => a.employeeId === payout.employeeId).map((a) => a.date)
  );
  return (payout.projectedDates || []).filter((d) => !marked.has(d));
};

/**
 * Recompute month M's TRUE salary now that its projected days are marked, and diff it
 * against what was actually handed over.
 *
 * The whole month is recomputed rather than just diffing the projected days — deliberately.
 * That also catches overtime, late fines and lace packing entered against those dates after
 * the payout was made.
 *
 * Returns null when the payout isn't a candidate; otherwise a plain descriptor. Applying it
 * is a separate step (see AppContext.settlePayout), so this stays pure.
 */
export const computeSettlement = (
  payout,
  { employee, attendance, advances, lacePackingRecords, settings, payouts = [] },
  { closeOut = false } = {}
) => {
  if (!payout || payout.basis !== 'projected') return null;
  if (payout.settled) return null;                       // idempotency guard
  if (!employee) return null;

  const blocking = blockingDates(payout, attendance);
  // Normally we wait for every projected date. A close-out deliberately settles against
  // whatever attendance exists — for someone who left before those days were ever marked,
  // waiting forever is not an option. Unmarked days simply contribute no paid days, so the
  // shortfall falls out of the same calculation.
  if (blocking.length && !closeOut) {
    return { ready: false, blocking, payoutId: payout.id, month: payout.month, canCloseOut: true };
  }

  const monthRecords = attendance.filter(
    (a) => a.employeeId === payout.employeeId && a.date.startsWith(payout.month)
  );

  // Reuse the adjustments captured at finalisation, so the settlement isolates the
  // attendance difference rather than re-litigating bonuses or deductions. The advance
  // deduction is passed as a NUMBER only — it is not re-applied to the advances.
  const snap = payout.snapshot || {};
  const truth = calculateSalary({
    employee,
    attendanceRecords: monthRecords,
    advances,
    lacePackingRecords,
    settings,
    monthKey: payout.month,
    advanceDeductionOverride: snap.advanceDeduction ?? 0,
    otherDeduction: snap.otherDeduction ?? 0,
    bonus: snap.bonus ?? 0,
    bonusRemarks: snap.bonusRemarks ?? '',
    // Chaining: if month M itself carried an adjustment in, that stays part of M's truth.
    priorAdjustment: snap.priorAdjustment ?? 0,
  });

  const paid = round2(payout.paidAmount ?? payout.finalSalary);
  const delta = round2(truth.finalSalary - paid);

  // How the assumption actually turned out, for the human-readable reason string.
  const assumed = (payout.projectedDates || []).length;
  const notWorked = (payout.projectedDates || []).filter((d) => {
    const rec = monthRecords.find((r) => r.date === d);
    return rec && !['Present', 'Overtime'].includes(rec.status);
  });
  const neverMarked = closeOut ? blocking : [];
  const notHonoured = notWorked.length + neverMarked.length;

  const reason = !assumed
    ? formatMonthLabel(payout.month)
    : closeOut
      ? `${formatMonthLabel(payout.month)}: closed out — ${notHonoured} of ${assumed} assumed day(s) not worked` +
        (neverMarked.length ? ` (${neverMarked.length} never marked)` : '')
      : `${formatMonthLabel(payout.month)}: ${notWorked.length} of ${assumed} assumed day(s) not worked`;

  return {
    ready: true,
    closeOut,
    payoutId: payout.id,
    employeeId: payout.employeeId,
    month: payout.month,
    // A close-out has no next cycle to carry into — the residue is booked immediately.
    intoMonth: closeOut ? null : nextMonthKey(payout.month),
    paidAmount: paid,
    trueFinalSalary: truth.finalSalary,
    delta,
    negligible: Math.abs(delta) < SETTLEMENT_EPSILON,
    assumedDays: assumed,
    notWorkedDates: notWorked.map((d) => d),
    neverMarkedDates: neverMarked,
    reason,
    note: `Prior period adjustment (${reason})`,
  };
};

/** Every projected payout that has not settled yet, with its readiness. */
export const getUnsettledProjected = (payouts, ctx) =>
  payouts
    .filter((p) => p.basis === 'projected' && !p.settled)
    .map((p) => {
      const employee = ctx.employees.find((e) => e.id === p.employeeId);
      const s = computeSettlement(p, { ...ctx, employee });
      return { payout: p, employee, settlement: s };
    })
    .filter((x) => x.settlement !== null);

/**
 * Net adjustment carried INTO `month` for an employee — the sum of settled deltas routed here.
 * Reading it off settled payouts (rather than a separate ledger) is what makes applying a
 * settlement twice impossible.
 */
export const getPriorAdjustment = (payouts, employeeId, month) => {
  const rows = payouts.filter(
    (p) => p.employeeId === employeeId && p.settled && p.settledIntoMonth === month && p.settlementDelta
  );
  const total = round2(rows.reduce((s, p) => s + (parseFloat(p.settlementDelta) || 0), 0));
  const note = rows.map((p) => p.settlementReason || formatMonthLabel(p.month)).join('; ');
  return { amount: total, note, sources: rows };
};
