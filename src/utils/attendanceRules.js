// Automatic attendance rules, shared by the check-in station, the server's daily run and the
// salary maths so they can never disagree:
//
//   • Shifts          — each employee works one of `shifts` (default `defaultShiftId`).
//   • Late mark       — a check-in more than `lateGraceMin` after the shift starts is marked late
//                       (and gets the default late fine when late fines are on). Every
//                       `latesPerHalfDay` late marks in a month deduct half a day.
//   • Check-out       — a later scan the same day records the check-out; leaving before the shift
//                       ends turns a Present day into a Half Day.
//   • Auto-absent     — at `absentAfter`, anyone with no record for the day is marked Absent, and a
//                       first scan after that time still counts as Absent.
//   • Weekly off and holidays — marked automatically and never auto-absent.
//   • Sandwich rule   — Absent on both sides of a weekly off / holiday makes the off days Absent too.
//
// Times are "HH:MM" strings (24-hour), so they compare correctly as plain strings.

import { getDayOfWeek, shiftDateStr } from './calculations.js';

export const RULE_DEFAULTS = {
  autoRules: true,
  shifts: [
    { id: 's1', start: '09:00', end: '17:00' },
    { id: 's2', start: '09:00', end: '18:00' },
    { id: 's3', start: '10:00', end: '18:00' },
  ],
  defaultShiftId: 's3',
  lateGraceMin: 15,       // minutes after the shift starts before a check-in counts as late
  latesPerHalfDay: 3,     // 0 = late marks never deduct
  absentAfter: '14:00',
  weeklyOffDay: 0,        // 0 = Sunday … 6 = Saturday, '' = no common weekly off
  sandwichRule: true,
  holidays: [],           // [{ date: 'YYYY-MM-DD', name }]
  lateSkipDates: [],      // days the owner excused all late arrivals ('YYYY-MM-DD')
};

// A second scan sooner than this after checking in is a repeat press, not a check-out.
export const CHECKOUT_MIN_GAP_MIN = 60;

export const OFF_STATUSES = ['Weekly Off', 'Holiday'];

export const rulesOf = (settings) => ({ ...RULE_DEFAULTS, ...(settings || {}) });

const minutes = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  return h * 60 + m;
};
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

// "14:00" → "2:00 PM"
export const to12h = (t) => {
  const [h, m] = String(t || '').split(':').map(Number);
  if (Number.isNaN(h)) return t || '';
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
};

export const shiftLabel = (shift) => (shift ? `${to12h(shift.start)} – ${to12h(shift.end)}` : '');

const FALLBACK_SHIFT = { id: '', start: '10:00', end: '18:00' };

// The employee's shift; anyone unassigned (or on a shift since deleted) works the default one.
export function shiftOf(employee, rules) {
  const shifts = rules.shifts || [];
  return shifts.find((s) => s.id === employee?.shiftId)
    || shifts.find((s) => s.id === rules.defaultShiftId)
    || shifts[0] || FALLBACK_SHIFT;
}

// The times that apply to one employee: late after shift start + grace, early leave before the
// shift ends, absent after the common cut-off.
export function timesFor(employee, rules) {
  const shift = shiftOf(employee, rules);
  return {
    lateAfter: hhmm(Math.min(minutes(shift.start) + (parseInt(rules.lateGraceMin, 10) || 0), 23 * 60 + 59)),
    earlyLeaveBefore: shift.end,
    absentAfter: rules.absentAfter,
  };
}

// Employee's own weekly off ('' / undefined = company default; 'none' = works every day).
export function weeklyOffOf(employee, rules) {
  const own = employee?.weeklyOffDay;
  if (own === 'none') return null;
  if (own !== undefined && own !== '' && own !== null) return Number(own);
  return rules.weeklyOffDay === '' || rules.weeklyOffDay === null ? null : Number(rules.weeklyOffDay);
}

export const lateSkipped = (date, rules) => (rules.lateSkipDates || []).includes(date);

export const holidayOn = (date, rules) => (rules.holidays || []).find((h) => h.date === date) || null;

// The status a day defaults to when nobody marks it: Holiday, Weekly Off, or null (a working day).
export function offStatusFor(employee, date, rules) {
  if (holidayOn(date, rules)) return 'Holiday';
  return weeklyOffOf(employee, rules) === getDayOfWeek(date) ? 'Weekly Off' : null;
}

// Same window as getEmploymentDaysInMonth: the left date only counts once someone is Inactive.
export const isEmployedOn = (employee, date) =>
  (!employee.joiningDate || date >= employee.joiningDate)
  && (employee.status !== 'Inactive' || !employee.leftDate || date <= employee.leftDate);

/**
 * Apply one fingerprint scan by `employee`. Returns { kind, patch } where patch holds the fields to merge into
 * the day's record (null when nothing changes):
 *   checked_in   first scan of the day (patch.late set when after the late time)
 *   after_cutoff first scan after the auto-absent time — recorded, but the day stays Absent
 *   checked_out  a later scan: records/updates the check-out time
 *   already      a repeat press within CHECKOUT_MIN_GAP_MIN of checking in
 */
export function applyScan(existing, employee, date, time, settings) {
  const rules = rulesOf(settings);
  const auto = rules.autoRules;
  const { lateAfter, earlyLeaveBefore } = timesFor(employee, rules);

  if (existing?.checkIn) {
    if (minutes(time) - minutes(existing.checkIn) < CHECKOUT_MIN_GAP_MIN) return { kind: 'already', patch: null };
    const patch = { checkOut: time };
    // Early leave only downgrades a full day, and is undone if a later scan shows they stayed.
    if (auto) {
      const early = time < earlyLeaveBefore;
      if (early && existing.status === 'Present') Object.assign(patch, { status: 'Half Day', earlyLeave: true });
      else if (!early && existing.earlyLeave) Object.assign(patch, { status: 'Present', earlyLeave: false });
    }
    return { kind: 'checked_out', patch };
  }

  const patch = { employeeId: employee.id, date, checkIn: time };
  if (auto && time >= rules.absentAfter) {
    // Arrived after the cut-off: the day counts as Absent unless the owner already marked it.
    patch.status = existing?.status && existing.status !== 'Absent' ? existing.status : 'Absent';
    return { kind: 'after_cutoff', patch };
  }
  // A check-in proves they came: Absent / an off day becomes Present; Half Day, Overtime, leave
  // and other statuses the owner set are kept.
  patch.status = !existing || existing.status === 'Absent' || OFF_STATUSES.includes(existing.status)
    ? 'Present' : existing.status;
  if (auto && time > lateAfter && !lateSkipped(date, rules)) {
    patch.late = true;
    const fine = parseFloat(settings?.defaultLateFineAmount) || 0;
    if (settings?.lateFineEnabled && fine > 0 && !existing?.lateFine) Object.assign(patch, { lateFine: fine, lateFineAuto: true });
  }
  return { kind: 'checked_in', patch };
}

/**
 * The daily run for `date`, after the auto-absent time has passed. Pure: returns the new
 * attendance array (or null when nothing changed) and what was done.
 *   • Holiday / weekly off → marked for everyone who has no record.
 *   • Working day → no record means Absent — unless nobody at all checked in (shop closed, scanner
 *     or internet down), in which case nobody is marked and `skipped` says why.
 *   • Sandwich rule → for everyone Absent today, off days just before are Absent too when the
 *     working day before them was Absent.
 */
export function runDailyRules(date, { employees, attendance, settings }) {
  const rules = rulesOf(settings);
  const summary = { date, absent: [], weeklyOff: [], holiday: [], sandwich: [], skipped: null };
  if (!rules.autoRules) return { attendance: null, summary: { ...summary, skipped: 'rules_off' } };

  const byKey = new Map(attendance.map((a) => [`${a.employeeId}_${a.date}`, a]));
  const changed = new Map();
  const put = (rec) => {
    const key = `${rec.employeeId}_${rec.date}`;
    const merged = { ...byKey.get(key), ...rec };
    if (!merged.id) merged.id = `${Date.now().toString(36)}_r${changed.size}`;
    if (!merged.createdAt) merged.createdAt = new Date().toISOString();
    byKey.set(key, merged);
    changed.set(key, merged);
  };

  const staff = employees.filter((e) => e.status === 'Active' && isEmployedOn(e, date));
  const anyoneScanned = attendance.some((a) => a.date === date && a.checkIn);

  for (const emp of staff) {
    if (byKey.has(`${emp.id}_${date}`)) continue;
    const off = offStatusFor(emp, date, rules);
    if (off) {
      put({ employeeId: emp.id, date, status: off, auto: true, remarks: off === 'Holiday' ? holidayOn(date, rules).name : '' });
      summary[off === 'Holiday' ? 'holiday' : 'weeklyOff'].push(emp.id);
    } else if (anyoneScanned) {
      put({ employeeId: emp.id, date, status: 'Absent', auto: true, remarks: `No scan by ${rules.absentAfter}` });
      summary.absent.push(emp.id);
    }
  }
  if (!anyoneScanned && !holidayOn(date, rules)) summary.skipped = 'no_scans';

  if (rules.sandwichRule) {
    for (const emp of staff) {
      if (byKey.get(`${emp.id}_${date}`)?.status !== 'Absent') continue;
      // Walk back over the off days directly before today (at most a week).
      const offDays = [];
      let d = shiftDateStr(date, -1);
      while (offDays.length < 7) {
        const rec = byKey.get(`${emp.id}_${d}`);
        const status = rec ? rec.status : offStatusFor(emp, d, rules);
        if (!OFF_STATUSES.includes(status)) break;
        offDays.push(d);
        d = shiftDateStr(d, -1);
      }
      if (!offDays.length || byKey.get(`${emp.id}_${d}`)?.status !== 'Absent') continue;
      for (const od of offDays) {
        put({ employeeId: emp.id, date: od, status: 'Absent', auto: true, remarks: 'Sandwich rule' });
        summary.sandwich.push({ employeeId: emp.id, date: od });
      }
    }
  }

  if (!changed.size) return { attendance: null, summary };
  const keyOf = (a) => `${a.employeeId}_${a.date}`;
  const seen = new Set();
  const next = attendance.map((a) => {
    const k = keyOf(a);
    seen.add(k);
    return changed.get(k) || a;
  });
  for (const [k, rec] of changed) if (!seen.has(k)) next.push(rec);
  return { attendance: next, summary };
}

// Late marks that count toward the half-day penalty: late check-ins on days that still count as
// worked (an Absent or Half Day already carries its own deduction).
export function latePenalty(records, settings) {
  const rules = rulesOf(settings);
  const lateDays = records.filter((r) => r.late && !lateSkipped(r.date, rules) && (r.status === 'Present' || r.status === 'Overtime')).length;
  const per = parseInt(rules.latesPerHalfDay, 10) || 0;
  const halfDays = rules.autoRules && per > 0 ? Math.floor(lateDays / per) : 0;
  return { lateDays, latePenaltyDays: halfDays * 0.5 };
}
