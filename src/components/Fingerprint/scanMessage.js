// What the check-in station shows and says for each scan outcome (see applyScan in
// attendanceRules.js). Shared by the owner's check-in page and the check-in-only login.

import { CHECKOUT_MIN_GAP_MIN, to12h } from '../../utils/attendanceRules.js';

// `times` are that employee's rule times ({ lateAfter, earlyLeaveBefore, absentAfter }, timesFor).
export function scanMessage(kind, { name, checkIn, checkOut, status, late, earlyLeave }, times, score) {
  const match = score != null ? ` · match score ${Math.round(score)}` : '';
  switch (kind) {
    case 'checked_in':
      return late
        ? { tone: 'warn', title: `Welcome, ${name} — late`, detail: `Checked in at ${checkIn} (after ${times.lateAfter}) · ${status}${match}`, say: `Welcome, ${name}. You are late today.` }
        : { tone: 'ok', title: `Welcome, ${name}`, detail: `Checked in at ${checkIn} · ${status}${match}`, say: `Welcome, ${name}` };
    case 'after_cutoff':
      return status === 'Absent'
        ? { tone: 'warn', title: `${name}, marked Absent today`, detail: `Checked in at ${checkIn}, after ${times.absentAfter}. Ask the owner if this is wrong.`, say: `${name}, you came after ${to12h(times.absentAfter)}. Today is marked absent.` }
        : { tone: 'ok', title: `Welcome, ${name}`, detail: `Checked in at ${checkIn} · ${status}${match}`, say: `Welcome, ${name}` };
    case 'checked_out':
      return earlyLeave
        ? { tone: 'warn', title: `Goodbye, ${name} — left early`, detail: `Checked out at ${checkOut}, before ${times.earlyLeaveBefore} · marked ${status}`, say: `Goodbye, ${name}. Early leave, marked half day.` }
        : { tone: 'ok', title: `Goodbye, ${name}`, detail: `Checked in ${checkIn} · checked out ${checkOut}`, say: `Goodbye, ${name}` };
    case 'already':
      return { tone: 'info', title: `${name}, you're already checked in`, detail: `Checked in at ${checkIn}. To check out, scan again at least ${CHECKOUT_MIN_GAP_MIN} minutes later.`, say: `${name}, you are already checked in` };
    default:
      return { tone: 'warn', title: 'Fingerprint belongs to an inactive or deleted employee', detail: name || '', say: 'Not an active employee.' };
  }
}
