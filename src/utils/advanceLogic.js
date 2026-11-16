// Pure reducers over the advances array.
//
// These are deliberately separate from AppContext so they can be unit-tested directly and,
// more importantly, so the React state updaters that wrap them are provably pure. An impure
// updater is silently broken under React.StrictMode: it double-invokes updaters in dev and
// keeps the SECOND result, so any state carried in the enclosing closure (a running
// `remaining` counter, say) is already drained on the second pass and the update no-ops.
//
// Every function here is a pure function of (advances, args) → new advances array.

import { round2 } from './calculations.js';

// Single source of truth for an advance's derived status. Compares on rounded paise rather
// than a fuzzy `<= 0.01` epsilon, so a fully-repaid advance is always exactly 'Deducted'.
export const deriveAdvanceStatus = (amount, deductedAmount) => {
  const amt = round2(amount);
  const ded = round2(deductedAmount);
  if (ded <= 0) return 'Pending';
  if (ded >= amt) return 'Deducted';
  return 'Partially Deducted';
};

/**
 * Apply a deduction across an employee's open advances.
 * `priorityIds` are charged first, in the order given; everything else follows in array order.
 */
export const applyDeductionToAdvances = (
  advances,
  { employeeId, deductAmount, priorityIds = [], entryDate = '', entryId = 'd', source = 'manual', payoutId = null }
) => {
  let remaining = round2(deductAmount);
  if (remaining <= 0) return advances;

  const eligible = advances
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.employeeId === employeeId && a.status !== 'Deducted')
    .sort((x, y) => {
      const xp = priorityIds.indexOf(x.a.id);
      const yp = priorityIds.indexOf(y.a.id);
      if (xp !== -1 && yp !== -1) return xp - yp;
      if (xp !== -1) return -1;
      if (yp !== -1) return 1;
      return x.i - y.i;
    });

  const next = [...advances];
  for (const { i } of eligible) {
    if (remaining <= 0) break;
    const a = next[i];
    const canDeduct = round2(Math.min(parseFloat(a.remainingAmount) || 0, remaining));
    if (canDeduct <= 0) continue;
    remaining = round2(remaining - canDeduct);

    const newDeducted = round2((parseFloat(a.deductedAmount) || 0) + canDeduct);
    next[i] = {
      ...a,
      deductedAmount: newDeducted,
      remainingAmount: round2(Math.max(0, (parseFloat(a.amount) || 0) - newDeducted)),
      status: deriveAdvanceStatus(a.amount, newDeducted),
      // Dated trail — the ledger derives "advance deducted" entries from this.
      deductions: [
        ...(a.deductions || []),
        { id: `${entryId}_${i}`, date: entryDate, amount: canDeduct, source, payoutId },
      ],
    };
  }
  return next;
};

/**
 * Undo part of a previously-applied deduction (e.g. re-finalising a month with a smaller
 * advance deduction). Unwinds this payout's own entries first, then the most recent.
 */
export const reverseDeductionFromAdvances = (advances, { employeeId, reverseAmount, payoutId = null }) => {
  let toReverse = round2(reverseAmount);
  if (toReverse <= 0) return advances;

  const candidates = advances
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.employeeId === employeeId && round2(a.deductedAmount) > 0)
    .sort((x, y) => {
      const xm = (x.a.deductions || []).some((d) => d.payoutId === payoutId) ? 0 : 1;
      const ym = (y.a.deductions || []).some((d) => d.payoutId === payoutId) ? 0 : 1;
      return xm !== ym ? xm - ym : y.i - x.i;
    });

  const next = [...advances];
  for (const { i } of candidates) {
    if (toReverse <= 0) break;
    const a = next[i];
    const canReverse = round2(Math.min(parseFloat(a.deductedAmount) || 0, toReverse));
    if (canReverse <= 0) continue;
    toReverse = round2(toReverse - canReverse);

    // Trim the trail from the end so the recorded history matches the new balance.
    let left = canReverse;
    const trail = [...(a.deductions || [])];
    for (let k = trail.length - 1; k >= 0 && left > 0; k--) {
      const amt = round2(trail[k].amount);
      if (amt <= left) { left = round2(left - amt); trail.splice(k, 1); }
      else { trail[k] = { ...trail[k], amount: round2(amt - left) }; left = 0; }
    }

    const newDeducted = round2((parseFloat(a.deductedAmount) || 0) - canReverse);
    next[i] = {
      ...a,
      deductedAmount: newDeducted,
      remainingAmount: round2(Math.max(0, (parseFloat(a.amount) || 0) - newDeducted)),
      status: deriveAdvanceStatus(a.amount, newDeducted),
      deductions: trail,
    };
  }
  return next;
};
