import { describe, it, expect } from 'vitest';
import {
  getAttendanceStats,
  calculateSalary,
  round2,
  todayStr,
  currentMonthKey,
  daysInMonth,
  getMonthDates,
  LACE_RATES,
} from '../calculations.js';
import {
  applyDeductionToAdvances,
  reverseDeductionFromAdvances,
  deriveAdvanceStatus,
} from '../advanceLogic.js';

const settings = {
  totalWorkingDays: 30,          // a month is worth 30 days, whatever the calendar says
  overtimeEnabled: true,
  overtimeRatePerHour: 50,
  lateFineEnabled: true,
};

// ₹30,000 / 30 = ₹1,000 a day.
const employee = { id: 'e1', name: 'Test', employeeCode: 'EMP001', role: 'Packer', monthlySalary: 30000, joiningDate: '2020-01-01', status: 'Active' };

// Build N attendance records for 2026-08, day 1..N
const days = (n, status, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    employeeId: 'e1',
    date: `2026-08-${String(i + 1).padStart(2, '0')}`,
    status,
    ...extra,
  }));

// ─── The 30-day deduction model ─────────────────────────────────────────────
// paid days = 30 − (absent + ½·half day + unpaid leave)
describe('30-day salary model', () => {
  const salary = (records, monthKey = '2026-08', emp = employee) =>
    calculateSalary({ employee: emp, attendanceRecords: records, advances: [], settings, monthKey });

  it('is worth 30 days whether the month has 28, 30 or 31', () => {
    for (const m of ['2026-02', '2026-04', '2026-08']) {
      const r = salary([], m);
      expect(r.entitledDays).toBe(30);
      expect(r.paidDays).toBe(30);
      expect(r.grossSalary).toBe(30000);
      expect(r.dailySalary).toBe(1000);
    }
  });

  it('deducts only absences, half days and unpaid leave', () => {
    const stats = getAttendanceStats([
      ...days(3, 'Absent'),
      { employeeId: 'e1', date: '2026-08-10', status: 'Half Day' },
      { employeeId: 'e1', date: '2026-08-11', status: 'Unpaid Leave' },
      { employeeId: 'e1', date: '2026-08-12', status: 'Present' },
      { employeeId: 'e1', date: '2026-08-13', status: 'Weekly Off' },
      { employeeId: 'e1', date: '2026-08-14', status: 'Paid Leave' },
      { employeeId: 'e1', date: '2026-08-15', status: 'Overtime' },
    ], settings);
    // 3 absent + 0.5 half + 1 unpaid = 4.5. Present/Weekly Off/Paid Leave/Overtime: nothing.
    expect(stats.deductionDays).toBe(4.5);
  });

  it('pays a day that carries no attendance record', () => {
    // Only one day marked in the whole month, and it is a plain Present.
    const r = salary([{ employeeId: 'e1', date: '2026-08-03', status: 'Present' }]);
    expect(r.paidDays).toBe(30);
    expect(r.unmarkedPaidDays).toBe(30);      // 31 calendar days − the 1 marked
    expect(r.finalSalary).toBe(30000);
  });

  it('subtracts absences from the 30', () => {
    const r = salary(days(4, 'Absent'));
    expect(r.deductionDays).toBe(4);
    expect(r.paidDays).toBe(26);
    expect(r.grossSalary).toBe(26000);
  });

  it('counts a half day as half a day of pay', () => {
    const r = salary([
      { employeeId: 'e1', date: '2026-08-01', status: 'Half Day' },
      { employeeId: 'e1', date: '2026-08-02', status: 'Half Day' },
    ]);
    expect(r.paidDays).toBe(29);
    expect(r.grossSalary).toBe(29000);
  });

  it('never lets weekly offs or paid leave reduce pay', () => {
    const r = salary([...days(8, 'Weekly Off'), { employeeId: 'e1', date: '2026-08-09', status: 'Paid Leave' }]);
    expect(r.deductionDays).toBe(0);
    expect(r.paidDays).toBe(30);
    expect(r.finalSalary).toBe(30000);
  });

  it('pays nothing when every day of the month is absent', () => {
    // The whole point of the short-month guard: 30 − 28 must not leave 2 days standing.
    const feb = Array.from({ length: 28 }, (_, i) => ({
      employeeId: 'e1', date: `2026-02-${String(i + 1).padStart(2, '0')}`, status: 'Absent',
    }));
    const rFeb = calculateSalary({ employee, attendanceRecords: feb, advances: [], settings, monthKey: '2026-02' });
    expect(rFeb.deductionDays).toBe(28);
    expect(rFeb.paidDays).toBe(0);
    expect(rFeb.finalSalary).toBe(0);

    // And in the long and normal months too.
    const aug = days(31, 'Absent');
    expect(salary(aug).paidDays).toBe(0);
    const apr = Array.from({ length: 30 }, (_, i) => ({
      employeeId: 'e1', date: `2026-04-${String(i + 1).padStart(2, '0')}`, status: 'Absent',
    }));
    expect(calculateSalary({ employee, attendanceRecords: apr, advances: [], settings, monthKey: '2026-04' }).paidDays).toBe(0);
  });

  it('still pays one day when all but one day of February is absent', () => {
    const feb = Array.from({ length: 27 }, (_, i) => ({
      employeeId: 'e1', date: `2026-02-${String(i + 1).padStart(2, '0')}`, status: 'Absent',
    }));
    const r = calculateSalary({ employee, attendanceRecords: feb, advances: [], settings, monthKey: '2026-02' });
    expect(r.paidDays).toBe(3);          // 30 − 27, the standard convention's short-month quirk
    expect(r.finalSalary).toBe(3000);
  });

  it('pro-rates the 30 for someone who joins mid-month', () => {
    const joiner = { ...employee, joiningDate: '2026-08-17' };   // 15 of 31 days employed
    const r = salary([], '2026-08', joiner);
    expect(r.employedDays).toBe(15);
    expect(r.entitledDays).toBe(14.52);   // 30 × 15/31
    expect(r.paidDays).toBe(14.52);
  });

  it('pro-rates for someone who leaves mid-month, and stops at their last day', () => {
    const leaver = { ...employee, status: 'Inactive', leftDate: '2026-08-10' };
    const r = salary([], '2026-08', leaver);
    expect(r.employedDays).toBe(10);
    expect(r.entitledDays).toBe(9.68);    // 30 × 10/31
    // Days after they left are outside the window, so they are not "unmarked paid days".
    expect(r.unmarkedDates.every((d) => d <= '2026-08-10')).toBe(true);
  });
});

// ─── Overtime must not cost the employee the day ────────────────────────────
describe('Overtime status', () => {
  it('does not deduct, and pays the OT hours on top', () => {
    const stats = getAttendanceStats(
      [{ employeeId: 'e1', date: '2026-08-26', status: 'Overtime', overtimeHours: 3 }], settings);
    expect(stats.deductionDays).toBe(0);
    expect(stats.presentDays).toBe(1);

    const r = calculateSalary({
      employee,
      attendanceRecords: [...days(25, 'Present'), { employeeId: 'e1', date: '2026-08-26', status: 'Overtime', overtimeHours: 3 }],
      advances: [], settings, monthKey: '2026-08',
    });
    expect(r.paidDays).toBe(30);
    expect(r.grossSalary).toBe(30000);
    expect(r.overtimeAmount).toBe(150);      // 3 hrs × ₹50
    expect(r.finalSalary).toBe(30150);
  });
});

// ─── 1.1 Lace earnings appear in the line items AND the total ───────────────
describe('Lace packing earnings', () => {
  const lace = [
    { employeeId: 'e1', date: '2026-08-05', type1Taken: 10, type1Packed: 10, type2Taken: 5, type2Packed: 5 },
  ];

  it('exposes packed packets under the key the UI reads', () => {
    const r = calculateSalary({
      employee, attendanceRecords: days(26, 'Present'), advances: [],
      lacePackingRecords: lace, settings, monthKey: '2026-08',
    });
    // The UI renders report.type1Packed / type2Packed — these must be defined and non-zero,
    // otherwise the lace rows silently disappear from the slip while laceTotal is still paid.
    expect(r.type1Packed).toBe(10);
    expect(r.type2Packed).toBe(5);
    expect(r.type1Packed).not.toBeUndefined();
    expect(r.type2Packed).not.toBeUndefined();
  });

  it('has line items that reconcile to laceTotal and to the net', () => {
    const r = calculateSalary({
      employee, attendanceRecords: days(26, 'Present'), advances: [],
      lacePackingRecords: lace, settings, monthKey: '2026-08',
    });
    expect(r.type1Amount).toBe(10 * LACE_RATES.type1);   // 750
    expect(r.type2Amount).toBe(5 * LACE_RATES.type2);    // 200
    expect(r.laceTotal).toBe(950);
    expect(r.type1Amount + r.type2Amount).toBe(r.laceTotal);
    expect(r.finalSalary).toBe(30950);                   // full 30 days + lace
  });

  it('slip line items sum exactly to the net payable', () => {
    const r = calculateSalary({
      employee, attendanceRecords: days(20, 'Absent'), advances: [],
      lacePackingRecords: lace, settings, monthKey: '2026-08',
      bonus: 500, otherDeduction: 123.45, advanceDeductionOverride: 1000, priorAdjustment: -250,
    });
    const sum = round2(
      r.grossSalary + r.overtimeAmount + r.laceTotal + r.bonus + r.priorAdjustment
      - r.advanceDeduction - r.otherDeduction - r.lateFine
    );
    expect(r.finalSalary).toBe(sum);
  });
});

// ─── 1.4 applyAdvanceDeduction is pure ──────────────────────────────────────
describe('applyDeductionToAdvances purity', () => {
  const base = [
    { id: 'a1', employeeId: 'e1', date: '2026-06-01', amount: 3000, deductedAmount: 0, remainingAmount: 3000, status: 'Pending', deductions: [] },
  ];
  const args = { employeeId: 'e1', deductAmount: 1000, entryDate: '2026-08-31', entryId: 'fixed' };

  it('is a pure function of prev — StrictMode double-invoke yields the same result', () => {
    const once  = applyDeductionToAdvances(base, args);
    const twice = applyDeductionToAdvances(base, args);   // same `prev`, as React does in dev
    expect(twice).toEqual(once);
    expect(twice[0].deductedAmount).toBe(1000);
    expect(twice[0].remainingAmount).toBe(2000);
    expect(twice[0].status).toBe('Partially Deducted');
  });

  it('does not mutate the input array', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    applyDeductionToAdvances(base, args);
    expect(base).toEqual(snapshot);
  });

  it('applied to its own output, deducts again (genuinely sequential calls)', () => {
    const first  = applyDeductionToAdvances(base, args);
    const second = applyDeductionToAdvances(first, args);
    expect(second[0].deductedAmount).toBe(2000);
  });
});

// ─── 1.5 Deduction targets the advance the user clicked ─────────────────────
describe('deduction targeting', () => {
  const two = [
    { id: 'a1', employeeId: 'e1', date: '2026-06-01', amount: 5000, deductedAmount: 0, remainingAmount: 5000, status: 'Pending', deductions: [] },
    { id: 'a2', employeeId: 'e1', date: '2026-08-01', amount: 2000, deductedAmount: 0, remainingAmount: 2000, status: 'Pending', deductions: [] },
  ];

  it('charges the prioritised advance, not merely the oldest', () => {
    const out = applyDeductionToAdvances(two, { employeeId: 'e1', deductAmount: 2000, priorityIds: ['a2'] });
    expect(out.find((a) => a.id === 'a2').deductedAmount).toBe(2000);
    expect(out.find((a) => a.id === 'a2').status).toBe('Deducted');
    expect(out.find((a) => a.id === 'a1').deductedAmount).toBe(0);
  });

  it('falls back to array order when no priority is given', () => {
    const out = applyDeductionToAdvances(two, { employeeId: 'e1', deductAmount: 2000 });
    expect(out.find((a) => a.id === 'a1').deductedAmount).toBe(2000);
  });
});

// ─── 1.6 Reversal (re-finalise with a smaller deduction) ────────────────────
describe('reverseDeductionFromAdvances', () => {
  it('unwinds a deduction and trims the trail', () => {
    const after = applyDeductionToAdvances(
      [{ id: 'a1', employeeId: 'e1', amount: 3000, deductedAmount: 0, remainingAmount: 3000, status: 'Pending', deductions: [] }],
      { employeeId: 'e1', deductAmount: 1000, payoutId: 'e1_2026-08', source: 'payout' }
    );
    expect(after[0].deductedAmount).toBe(1000);
    expect(after[0].deductions).toHaveLength(1);

    const back = reverseDeductionFromAdvances(after, { employeeId: 'e1', reverseAmount: 400, payoutId: 'e1_2026-08' });
    expect(back[0].deductedAmount).toBe(600);
    expect(back[0].remainingAmount).toBe(2400);
    expect(back[0].deductions[0].amount).toBe(600);   // trail matches the balance
  });

  it('is pure', () => {
    const seed = [{ id: 'a1', employeeId: 'e1', amount: 3000, deductedAmount: 1000, remainingAmount: 2000, status: 'Partially Deducted', deductions: [{ id: 'x', date: '', amount: 1000, source: 'payout', payoutId: 'p' }] }];
    const a = reverseDeductionFromAdvances(seed, { employeeId: 'e1', reverseAmount: 500, payoutId: 'p' });
    const b = reverseDeductionFromAdvances(seed, { employeeId: 'e1', reverseAmount: 500, payoutId: 'p' });
    expect(b).toEqual(a);
  });
});

describe('deriveAdvanceStatus', () => {
  it('classifies on exact paise, not a fuzzy epsilon', () => {
    expect(deriveAdvanceStatus(1000, 0)).toBe('Pending');
    expect(deriveAdvanceStatus(1000, 999.99)).toBe('Partially Deducted');
    expect(deriveAdvanceStatus(1000, 1000)).toBe('Deducted');
    expect(deriveAdvanceStatus(1000, 1000.004)).toBe('Deducted');
  });
});

// ─── 1.8 Local calendar dates, not UTC ──────────────────────────────────────
describe('local date helpers', () => {
  it('todayStr matches the local calendar date', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(todayStr()).toBe(expected);
  });

  it('currentMonthKey matches the local calendar month', () => {
    const d = new Date();
    expect(currentMonthKey()).toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  });

  it('does not drift to the previous day in positive UTC offsets', () => {
    // 2026-08-01 02:00 IST is 2026-07-31 20:30 UTC. toISOString() would say July.
    const orig = Date;
    const fixed = new orig('2026-08-01T02:00:00+05:30');
    // eslint-disable-next-line no-global-assign
    Date = class extends orig {
      constructor(...a) { return a.length ? new orig(...a) : new orig(fixed); }
      static now() { return fixed.getTime(); }
    };
    try {
      // Only meaningful when the test machine is actually ahead of UTC.
      if (fixed.getTimezoneOffset() < 0) {
        expect(todayStr()).toBe('2026-08-01');
        expect(currentMonthKey()).toBe('2026-08');
        expect(fixed.toISOString().slice(0, 10)).toBe('2026-07-31'); // the old, broken value
      }
    } finally {
      // eslint-disable-next-line no-global-assign
      Date = orig;
    }
  });
});

// ─── Phase 2 grid helpers ───────────────────────────────────────────────────
describe('month date helpers', () => {
  it('counts days correctly, including leap years', () => {
    expect(daysInMonth('2026-08')).toBe(31);
    expect(daysInMonth('2026-09')).toBe(30);
    expect(daysInMonth('2026-02')).toBe(28);
    expect(daysInMonth('2028-02')).toBe(29);   // leap
  });

  it('enumerates every date in the month, zero-padded', () => {
    const d = getMonthDates('2026-02');
    expect(d).toHaveLength(28);
    expect(d[0]).toBe('2026-02-01');
    expect(d[27]).toBe('2026-02-28');
    expect(d.every((x) => /^\d{4}-\d{2}-\d{2}$/.test(x))).toBe(true);
  });
});

describe('round2', () => {
  it('rounds money to paise', () => {
    expect(round2(1000 / 3)).toBe(333.33);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2('12.345')).toBe(12.35);
    expect(round2(undefined)).toBe(0);
  });
});
