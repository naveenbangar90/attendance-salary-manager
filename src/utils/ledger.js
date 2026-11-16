// Combined per-employee statement.
//
// Every entry is DERIVED from records that already exist — advances (and the dated
// `deductions[]` trail on each), payouts, and settled settlements. There is deliberately no
// parallel hand-maintained list, because a second list drifts out of sync with the first and
// then nobody knows which one is true.
//
// Balance convention: `owes` is what the employee still owes the business (outstanding
// advance). Giving an advance raises it; deducting or repaying lowers it.

import { round2, formatMonthLabel } from './calculations.js';

export const ENTRY_TYPES = {
  ADVANCE_GIVEN:     'Advance given',
  ADVANCE_DEDUCTED:  'Advance deducted (salary)',
  ADVANCE_MANUAL:    'Advance deducted (manual)',
  SALARY_FINALISED:  'Salary finalised',
  SALARY_PAID:       'Salary paid',
  ADJUSTMENT:        'Prior period adjustment',
  CLOSEOUT_OWED:     'Close-out — owed back',
  CLOSEOUT_DUE:      'Close-out — due to employee',
};

/**
 * Build one employee's statement, oldest → newest, with a running "owes" balance.
 * Pass `newestFirst` to flip the display order while keeping the balance maths correct.
 */
export const buildLedger = ({ employeeId, advances, payouts, newestFirst = true }) => {
  const rows = [];

  advances
    .filter((a) => a.employeeId === employeeId)
    .forEach((a) => {
      const isSalaryAdvance = a.kind === 'salary_advance';
      const isCloseOut = a.origin === 'closeout';
      rows.push({
        id: `adv_${a.id}`,
        date: a.date || '',
        type: isCloseOut ? ENTRY_TYPES.CLOSEOUT_OWED : ENTRY_TYPES.ADVANCE_GIVEN,
        detail: isCloseOut
          ? a.remarks
          : [
              isSalaryAdvance ? 'Salary paid in advance' : 'Loan',
              a.paymentMode,
              a.repaymentType === 'EMI' ? `EMI ${a.emiAmount}/mo from ${a.emiStartMonth || '—'}` : null,
              a.remarks,
            ].filter(Boolean).join(' · '),
        // A salary advance is this month's earnings paid early, not money lent — it settles
        // through its payout and must not inflate the outstanding-advance balance.
        owesDelta: isSalaryAdvance ? 0 : round2(a.amount),
        cashOut: round2(a.amount),
        ref: a.id,
      });

      (a.deductions || []).forEach((d) => {
        rows.push({
          id: `ded_${d.id}`,
          date: d.date || a.date || '',
          type: d.source === 'manual' ? ENTRY_TYPES.ADVANCE_MANUAL : ENTRY_TYPES.ADVANCE_DEDUCTED,
          detail: d.source === 'legacy'
            ? 'Recorded before deduction history was kept'
            : d.payoutId ? `Against payout ${d.payoutId}` : 'Manual deduction',
          owesDelta: isSalaryAdvance ? 0 : -round2(d.amount),
          cashOut: 0,
          ref: a.id,
        });
      });
    });

  payouts
    .filter((p) => p.employeeId === employeeId)
    .forEach((p) => {
      rows.push({
        id: `pf_${p.id}`,
        date: p.finalisedAt ? p.finalisedAt.slice(0, 10) : `${p.month}-28`,
        type: ENTRY_TYPES.SALARY_FINALISED,
        detail: `${formatMonthLabel(p.month)}${p.basis === 'projected' ? ` · early payout, ${(p.projectedDates || []).length} day(s) assumed` : ''}`,
        owesDelta: 0,                       // informational only
        cashOut: 0,
        amount: round2(p.finalSalary),
        ref: p.id,
      });

      if (p.status === 'Paid') {
        rows.push({
          id: `pp_${p.id}`,
          date: p.paidDate || `${p.month}-05`,
          type: ENTRY_TYPES.SALARY_PAID,
          detail: `${formatMonthLabel(p.month)} · ${p.paidMode || 'Cash'}${p.remarks ? ` · ${p.remarks}` : ''}`,
          owesDelta: 0,
          cashOut: round2(p.paidAmount ?? p.finalSalary),
          ref: p.id,
        });
      }

      if (p.settled && p.settlementDelta) {
        // A close-out that overpaid is represented by the recovery advance above, so it is
        // not repeated here. What remains to show is a close-out that UNDERpaid — a final
        // amount still owed to the employee — or a normal carry-forward adjustment.
        const isCloseOutOwed = p.closedOut && p.settlementDelta < 0;
        if (!isCloseOutOwed) {
          rows.push({
            id: `adj_${p.id}`,
            date: p.settledAt ? p.settledAt.slice(0, 10) : `${p.month}-28`,
            type: p.closedOut ? ENTRY_TYPES.CLOSEOUT_DUE : ENTRY_TYPES.ADJUSTMENT,
            detail: p.closedOut
              ? `${p.settlementReason || formatMonthLabel(p.month)} — pay on final settlement`
              : `${p.settlementReason || formatMonthLabel(p.month)} → carried into ${formatMonthLabel(p.settledIntoMonth)}`,
            owesDelta: 0,
            cashOut: 0,
            amount: round2(p.settlementDelta),
            ref: p.id,
          });
        }
      }
    });

  // Chronological for the running balance, then flipped for display if asked.
  rows.sort((a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id));
  let owes = 0;
  rows.forEach((r) => { owes = round2(owes + (r.owesDelta || 0)); r.balance = owes; });

  return newestFirst ? [...rows].reverse() : rows;
};

/**
 * Closing outstanding-advance balance for an employee.
 * This MUST equal the sum of remainingAmount over their non-salary-advance advances —
 * `reconciles` proves it, and a false there is a bug, not a rounding quirk.
 */
export const getLedgerSummary = ({ employeeId, advances, payouts }) => {
  const mine = advances.filter((a) => a.employeeId === employeeId && a.kind !== 'salary_advance');
  const fromAdvances = round2(mine.reduce((s, a) => s + (parseFloat(a.remainingAmount) || 0), 0));

  const rows = buildLedger({ employeeId, advances, payouts, newestFirst: false });
  const fromLedger = rows.length ? rows[rows.length - 1].balance : 0;

  const paidOut = round2(
    payouts.filter((p) => p.employeeId === employeeId && p.status === 'Paid')
      .reduce((s, p) => s + (parseFloat(p.paidAmount ?? p.finalSalary) || 0), 0)
  );

  return {
    outstandingAdvance: fromAdvances,
    ledgerBalance: round2(fromLedger),
    reconciles: Math.abs(round2(fromAdvances - fromLedger)) < 0.01,
    totalSalaryPaid: paidOut,
    entryCount: rows.length,
  };
};
