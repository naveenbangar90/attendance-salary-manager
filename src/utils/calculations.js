// Returns attendance breakdown for an array of attendance records
export const getAttendanceStats = (records, settings) => {
  let presentDays = 0, halfDays = 0, paidLeaveDays = 0,
    absentDays = 0, unpaidLeaveDays = 0, weeklyOffDays = 0,
    overtimeHours = 0, lateFineTotal = 0;

  records.forEach((r) => {
    switch (r.status) {
      case 'Present':      presentDays++;    break;
      case 'Half Day':     halfDays++;       break;
      case 'Paid Leave':   paidLeaveDays++;  break;
      case 'Weekly Off':   weeklyOffDays++;  break;
      case 'Absent':       absentDays++;     break;
      case 'Unpaid Leave': unpaidLeaveDays++;break;
      default: break;
    }
    overtimeHours  += parseFloat(r.overtimeHours || 0);
    lateFineTotal  += parseFloat(r.lateFine || 0);
  });

  const paidDays =
    presentDays +
    halfDays * 0.5 +
    paidLeaveDays +
    (settings.weeklyOffPaid ? weeklyOffDays : 0);

  return {
    presentDays, halfDays, paidLeaveDays,
    absentDays, unpaidLeaveDays, weeklyOffDays,
    overtimeHours, lateFineTotal, paidDays,
  };
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
}) => {
  const dailySalary = employee.monthlySalary / settings.totalWorkingDays;
  const stats = getAttendanceStats(attendanceRecords, settings);

  const grossSalary = dailySalary * stats.paidDays;

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

  const advanceDeduction =
    advanceDeductionOverride !== null
      ? parseFloat(advanceDeductionOverride)
      : 0;

  const finalSalary = Math.max(
    0,
    grossSalary + overtimeAmount + lace.laceTotal - advanceDeduction - parseFloat(otherDeduction) - lateFine
  );

  return {
    employeeId: employee.id,
    employeeName: employee.name,
    employeeCode: employee.employeeCode,
    role: employee.role,
    month: monthKey,
    monthlySalary: employee.monthlySalary,
    dailySalary,
    totalWorkingDays: settings.totalWorkingDays,
    ...stats,
    grossSalary,
    overtimeAmount,
    ...lace,
    advanceDeduction,
    otherDeduction: parseFloat(otherDeduction),
    lateFine,
    finalSalary,
    totalPendingAdvance,
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

// Today as "YYYY-MM-DD"
export const todayStr = () => new Date().toISOString().slice(0, 10);

// Current month as "YYYY-MM"
export const currentMonthKey = () => new Date().toISOString().slice(0, 7);
