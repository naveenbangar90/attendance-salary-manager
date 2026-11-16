// ─── Salary model ────────────────────────────────────────────────────────────
// A month is worth SALARY_DAYS regardless of whether the calendar month has 28, 30 or 31
// days. Pay is computed by DEDUCTION, not accrual:
//
//     paid days = 30 − (absent + ½·half day + unpaid leave)
//
// Consequences that follow from that single rule:
//   • Weekly offs and paid leave sit inside the 30 — they never deduct, so there is no
//     "is weekly off paid?" question to answer.
//   • A day with no attendance record is not an absence, so it is paid. Only marked
//     absences reduce salary.
//   • A full month of absence pays nothing, including in February where 30 − 28 would
//     otherwise leave two days standing.
export const SALARY_DAYS = 30;

// Returns attendance breakdown for an array of attendance records
export const getAttendanceStats = (records, settings) => {
  let presentDays = 0, halfDays = 0, paidLeaveDays = 0,
    absentDays = 0, unpaidLeaveDays = 0, weeklyOffDays = 0,
    overtimeHours = 0, lateFineTotal = 0;
  const absentDates = [];
  const unpaidLeaveDates = [];

  records.forEach((r) => {
    switch (r.status) {
      // 'Overtime' is a full working day that also carries OT hours. The OT hours are
      // paid separately via overtimeAmount; the day itself must still count as present.
      case 'Present':
      case 'Overtime':     presentDays++;    break;
      case 'Half Day':     halfDays++;       break;
      case 'Paid Leave':   paidLeaveDays++;  break;
      case 'Weekly Off':   weeklyOffDays++;  break;
      case 'Absent':       absentDays++;     absentDates.push(r.date); break;
      case 'Unpaid Leave': unpaidLeaveDays++; unpaidLeaveDates.push(r.date); break;
      default: break;
    }
    overtimeHours  += parseFloat(r.overtimeHours || 0);
    lateFineTotal  += parseFloat(r.lateFine || 0);
  });

  // The only thing that reduces pay. Present / Overtime / Paid Leave / Weekly Off all
  // deduct nothing, so they never appear here.
  const deductionDays = round2(absentDays + halfDays * 0.5 + unpaidLeaveDays);

  absentDates.sort();
  unpaidLeaveDates.sort();

  return {
    presentDays, halfDays, paidLeaveDays,
    absentDays, unpaidLeaveDays, weeklyOffDays,
    overtimeHours, lateFineTotal, deductionDays,
    absentDates, unpaidLeaveDates,
  };
};

// Calendar days of `monthKey` that fall inside the employee's employment window.
// Someone who joins on the 15th, or leaves on the 10th, is entitled to a pro-rated slice
// of the 30 rather than the whole month.
export const getEmploymentDaysInMonth = (employee, monthKey) => {
  const join = employee?.joiningDate || '';
  const left = employee?.status === 'Inactive' ? (employee?.leftDate || '') : '';
  return getMonthDates(monthKey).filter((d) => (!join || d >= join) && (!left || d <= left)).length;
};

// Lace packing rates
export const LACE_RATES = {
  type1: 75, // Flat lace — ₹75/packet
  type2: 40, // Round lace — ₹40/packet
};

// Total lace packing earnings for an employee in a month
// Earnings are based on PACKED packets only. Pending = Taken - Packed (all-time).
export const getLacePackingEarnings = (laceRecords, employeeId, monthKey) => {
  // Month records for earnings
  const monthRecords = laceRecords.filter(
    (r) => r.employeeId === employeeId && r.date.startsWith(monthKey)
  );
  const type1Taken  = monthRecords.reduce((s, r) => s + (parseFloat(r.type1Taken)  || 0), 0);
  const type1Packed = monthRecords.reduce((s, r) => s + (parseFloat(r.type1Packed) || 0), 0);
  const type2Taken  = monthRecords.reduce((s, r) => s + (parseFloat(r.type2Taken)  || 0), 0);
  const type2Packed = monthRecords.reduce((s, r) => s + (parseFloat(r.type2Packed) || 0), 0);
  const type1Amount = type1Packed * LACE_RATES.type1;
  const type2Amount = type2Packed * LACE_RATES.type2;

  // All-time pending balance for this employee
  const allRecords = laceRecords.filter((r) => r.employeeId === employeeId);
  const pendingType1 = allRecords.reduce((s, r) => s + (parseFloat(r.type1Taken) || 0) - (parseFloat(r.type1Packed) || 0), 0);
  const pendingType2 = allRecords.reduce((s, r) => s + (parseFloat(r.type2Taken) || 0) - (parseFloat(r.type2Packed) || 0), 0);

  return {
    type1Taken, type1Packed, type1Amount,
    type2Taken, type2Packed, type2Amount,
    laceTotal: type1Amount + type2Amount,
    pendingType1: Math.max(0, pendingType1),
    pendingType2: Math.max(0, pendingType2),
  };
};

// Suggested EMI deduction for an employee for a given month, summed across all
// EMI-enabled advances whose start month <= monthKey and which still have a balance.
// Each contribution is capped at the advance's remaining amount.
export const getSuggestedEmiDeduction = (advances, employeeId, monthKey) => {
  return advances
    .filter((a) =>
      a.employeeId === employeeId &&
      a.repaymentType === 'EMI' &&
      a.status !== 'Deducted' &&
      parseFloat(a.remainingAmount || 0) > 0 &&
      (!a.emiStartMonth || a.emiStartMonth <= monthKey)
    )
    .reduce((sum, a) => {
      const emi = parseFloat(a.emiAmount || 0);
      const rem = parseFloat(a.remainingAmount || 0);
      return sum + Math.min(emi, rem);
    }, 0);
};

/**
 * Paid days for one employee-month under the 30-day deduction model, plus the attendance
 * counts it was derived from. This is the ONE place the day-count rule lives — the salary
 * calculator, the attendance grid's row summary and the reports all call it, so they cannot
 * drift apart.
 */
export const getMonthDayStats = (employee, attendanceRecords, settings, monthKey) => {
  const salaryDays   = parseFloat(settings?.totalWorkingDays) || SALARY_DAYS;
  const stats        = getAttendanceStats(attendanceRecords, settings);
  const calendarDays = daysInMonth(monthKey);
  const employedDays = getEmploymentDaysInMonth(employee, monthKey);

  // Full month employed → the whole 30. Joined or left mid-month → a pro-rated slice.
  const entitledDays = round2(salaryDays * (employedDays / calendarDays));

  let paidDays = round2(Math.max(0, entitledDays - stats.deductionDays));
  // Short-month guard: February with 28 absences must pay nothing, but 30 − 28 would
  // otherwise leave two days standing. Absent for every employed day means no pay.
  if (employedDays > 0 && stats.deductionDays >= employedDays) paidDays = 0;

  return { ...stats, salaryDays, calendarDays, employedDays, entitledDays, paidDays };
};

// Full salary breakdown for one employee-month
export const calculateSalary = ({
  employee,
  attendanceRecords,
  advances,
  lacePackingRecords = [],
  settings,
  monthKey,         // "YYYY-MM"
  otherDeduction = 0,
  advanceDeductionOverride = null,
  bonus = 0,
  bonusRemarks = '',
  // Carried settlement from a previous early payout. Positive = underpaid then, add now.
  priorAdjustment = 0,
  priorAdjustmentNote = '',
}) => {
  const stats = getMonthDayStats(employee, attendanceRecords, settings, monthKey);
  const { salaryDays, calendarDays, employedDays, entitledDays, paidDays } = stats;
  const dailySalary = employee.monthlySalary / salaryDays;

  // Days inside the employment window carrying no attendance record. They are PAID (only
  // marked absences deduct), so they are what an early payout is really risking — surfaced
  // so the UI can warn, and tracked on the payout for settlement.
  const markedDates = new Set(attendanceRecords.map((r) => r.date));
  const join = employee?.joiningDate || '';
  const left = employee?.status === 'Inactive' ? (employee?.leftDate || '') : '';
  const unmarkedDates = getMonthDates(monthKey).filter(
    (d) => (!join || d >= join) && (!left || d <= left) && !markedDates.has(d)
  );

  const grossSalary = dailySalary * paidDays;

  const overtimeAmount = settings.overtimeEnabled
    ? stats.overtimeHours * settings.overtimeRatePerHour
    : 0;

  const lateFine = settings.lateFineEnabled ? stats.lateFineTotal : 0;

  // Lace packing bonus
  const lace = getLacePackingEarnings(lacePackingRecords, employee.id, monthKey);

  // Pending/partial advances for this employee
  const employeeAdvances = advances.filter(
    (a) => a.employeeId === employee.id && a.status !== 'Deducted'
  );
  const totalPendingAdvance = employeeAdvances.reduce(
    (s, a) => s + parseFloat(a.remainingAmount || 0), 0
  );

  // Auto-suggested EMI deduction for this month (capped by what's actually pending)
  const suggestedEmiDeduction = Math.min(
    getSuggestedEmiDeduction(advances, employee.id, monthKey),
    totalPendingAdvance
  );

  const advanceDeduction =
    advanceDeductionOverride !== null
      ? parseFloat(advanceDeductionOverride)
      : 0;

  // Round every component to paise BEFORE summing, so the line items on the slip
  // add up exactly to the net. Summing raw floats and rounding only the total
  // produces slips whose lines don't reconcile.
  const r_gross    = round2(grossSalary);
  const r_overtime = round2(overtimeAmount);
  const r_type1    = round2(lace.type1Amount);
  const r_type2    = round2(lace.type2Amount);
  const r_lace     = round2(r_type1 + r_type2);
  const r_bonus    = round2(bonus);
  const r_advDed   = round2(advanceDeduction);
  const r_otherDed = round2(otherDeduction);
  const r_lateFine = round2(lateFine);
  const r_prior    = round2(priorAdjustment);   // signed: + underpaid before, − overpaid before

  const finalSalary = Math.max(
    0,
    round2(r_gross + r_overtime + r_lace + r_bonus + r_prior - r_advDed - r_otherDed - r_lateFine)
  );

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    role: employee.role,
    month: monthKey,
    monthlySalary: employee.monthlySalary,
    dailySalary: round2(dailySalary),
    totalWorkingDays: salaryDays,
    ...stats,
    calendarDays,
    employedDays,
    entitledDays,
    paidDays,
    // Days being paid on no record — what an early payout is exposed to.
    unmarkedDates,
    unmarkedPaidDays: unmarkedDates.length,
    grossSalary: r_gross,
    overtimeAmount: r_overtime,
    ...lace,
    type1Amount: r_type1,
    type2Amount: r_type2,
    laceTotal: r_lace,
    advanceDeduction: r_advDed,
    otherDeduction: r_otherDed,
    lateFine: r_lateFine,
    bonus: r_bonus,
    bonusRemarks,
    priorAdjustment: r_prior,
    priorAdjustmentNote,
    finalSalary,
    totalPendingAdvance: round2(totalPendingAdvance),
    suggestedEmiDeduction: round2(suggestedEmiDeduction),
    employeeAdvances,
  };
};

// Format currency in INR
export const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount || 0);

// "YYYY-MM" → "January 2025"
export const formatMonthLabel = (monthKey) => {
  if (!monthKey) return '';
  const [y, m] = monthKey.split('-');
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

// ── Local calendar dates ─────────────────────────────────────────────────────
// NEVER use toISOString() for a calendar date: it converts to UTC, so in IST (UTC+5:30)
// any time before 05:30 local resolves to *yesterday* — and on the 1st, to last month.
// Always build the string from local date components.

// Format a Date as local "YYYY-MM-DD"
export const toDateStr = (d = new Date()) => {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};

// Format a Date as local "YYYY-MM"
export const toMonthKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

// Today as local "YYYY-MM-DD"
export const todayStr = () => toDateStr(new Date());

// Current month as local "YYYY-MM"
export const currentMonthKey = () => toMonthKey(new Date());

// Round a money figure to 2 decimals. Use at every boundary where a figure is
// stored or displayed so floats never leak raw precision into records or the UI.
export const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

// Full day name from "YYYY-MM-DD" e.g. "Sunday"
export const getDayName = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'long' });
};

// Short day name e.g. "Sun"
export const getShortDayName = (dateStr) => {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' });
};

// Day of week index (0 = Sunday)
export const getDayOfWeek = (dateStr) => {
  if (!dateStr) return -1;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
};

// "YYYY-MM" → the following month, e.g. "2026-12" → "2027-01"
export const nextMonthKey = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m, 1);          // month is 0-based, so this is the next month
  return toMonthKey(d);
};

// Number of days in a "YYYY-MM"
export const daysInMonth = (monthKey) => {
  const [y, m] = monthKey.split('-').map(Number);
  return new Date(y, m, 0).getDate();   // day 0 of next month = last day of this one
};

// Every date in a "YYYY-MM" as ["YYYY-MM-01", … ]
export const getMonthDates = (monthKey) => {
  const n = daysInMonth(monthKey);
  return Array.from({ length: n }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, '0')}`);
};

// Shift a "YYYY-MM-DD" by N days
export const shiftDateStr = (dateStr, days) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
};
