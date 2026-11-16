import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Calculator, Download, Printer, ChevronDown, ChevronUp, IndianRupee, Package, Mail, MessageCircle, CalendarClock, History } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import { calculateSalary, formatCurrency, formatMonthLabel, currentMonthKey, LACE_RATES, getSuggestedEmiDeduction, round2, todayStr, nextMonthKey } from '../utils/calculations.js';
import { getPriorAdjustment } from '../utils/settlement.js';
import { downloadCSV, printElement, openGmailCompose, openWhatsAppShare } from '../utils/exportUtils.js';

// Format an array of "YYYY-MM-DD" dates as a compact comma-separated day list, e.g. "3, 7, 14, 22"
const formatDayList = (dates = []) =>
  dates
    .map((d) => parseInt((d || '').slice(-2), 10))
    .filter((n) => !isNaN(n))
    .sort((a, b) => a - b)
    .join(', ');

// Build a phone-friendly plain-text salary slip suitable for WhatsApp / Email body.
// Uses Unicode separators and short labels so it stays readable on a narrow phone screen.
const buildSlipText = (report, companyName) => {
  const L = []; // lines
  const push = (s = '') => L.push(s);
  const money = (n) => formatCurrency(n).replace(/\u00a0/g, ' ');

  push(`*${companyName || 'Salary Slip'}*`);
  push(`SALARY SLIP — ${formatMonthLabel(report.month)}`);
  push('────────────────────');
  push(`Employee: ${report.employeeName}`);
  push(`Code: ${report.employeeCode}`);
  if (report.role) push(`Role: ${report.role}`);
  push(`Monthly Salary: ${money(report.monthlySalary)}`);
  push('');
  push('*Attendance*');
  push(`• Salary Days: ${report.entitledDays}`);
  push(`• Present: ${report.presentDays}`);
  if (report.halfDays > 0)        push(`• Half Days: ${report.halfDays}`);
  if (report.paidLeaveDays > 0)   push(`• Paid Leaves: ${report.paidLeaveDays}`);
  if (report.absentDays > 0)      push(`• Absent: ${report.absentDays}`);
  if (report.unpaidLeaveDays > 0) push(`• Unpaid Leaves: ${report.unpaidLeaveDays}`);
  if (report.weeklyOffDays > 0)   push(`• Weekly Off: ${report.weeklyOffDays}`);
  push(`• Deduction Days: ${report.deductionDays}`);
  push(`• Paid Days: ${report.paidDays.toFixed(1)}`);
  if (report.absentDates && report.absentDates.length > 0) {
    push(`• Absent Dates: ${formatDayList(report.absentDates)}`);
  }
  if (report.unpaidLeaveDates && report.unpaidLeaveDates.length > 0) {
    push(`• Unpaid Leave Dates: ${formatDayList(report.unpaidLeaveDates)}`);
  }
  push('');
  push('*Earnings*');
  push(`• Daily Salary: ${money(report.dailySalary)}`);
  push(`• Gross: ${money(report.grossSalary)}`);
  if (report.overtimeAmount > 0)  push(`• Overtime (${report.overtimeHours} hr): +${money(report.overtimeAmount)}`);
  if (report.bonus > 0)           push(`• Bonus${report.bonusRemarks ? ` (${report.bonusRemarks})` : ''}: +${money(report.bonus)}`);
  if (report.laceTotal > 0) {
    if (report.type1Amount > 0) push(`• Flat Lace (${report.type1Packed} pkts): +${money(report.type1Amount)}`);
    if (report.type2Amount > 0) push(`• Round Lace (${report.type2Packed} pkts): +${money(report.type2Amount)}`);
  }
  if (report.unmarkedPaidDays > 0) {
    push(`• Paid early: ${report.unmarkedPaidDays} day(s) not yet marked`);
  }
  if (report.priorAdjustment !== 0) {
    push(`• Prior period adjustment (${report.priorAdjustmentNote}): ${report.priorAdjustment < 0 ? '-' : '+'}${money(Math.abs(report.priorAdjustment))}`);
  }
  if (report.advanceDeduction > 0 || report.otherDeduction > 0 || report.lateFine > 0) {
    push('');
    push('*Deductions*');
    if (report.advanceDeduction > 0) push(`• Advance: -${money(report.advanceDeduction)}`);
    if (report.otherDeduction > 0)   push(`• Other: -${money(report.otherDeduction)}`);
    if (report.lateFine > 0)         push(`• Late Fine: -${money(report.lateFine)}`);
  }
  push('────────────────────');
  push(`*NET PAYABLE: ${money(report.finalSalary)}*`);
  return L.join('\n');
};

function SalarySlip({ report, settings, companyName }) {
  return (
    <div id="salary-slip-print" className="bg-white p-6 rounded-xl border border-gray-200 text-sm font-mono">
      <div className="text-center border-b border-gray-300 pb-4 mb-4">
        <h1 className="text-xl font-bold">{companyName}</h1>
        <p className="text-gray-500 text-xs mt-1">SALARY SLIP</p>
        <p className="font-semibold mt-1">{formatMonthLabel(report.month)}</p>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 mb-4 text-xs">
        <div><span className="text-gray-500">Employee Name:</span> <span className="font-semibold">{report.employeeName}</span></div>
        <div><span className="text-gray-500">Employee Code:</span> <span className="font-semibold">{report.employeeCode}</span></div>
        <div><span className="text-gray-500">Designation:</span> <span className="font-semibold">{report.role}</span></div>
        <div><span className="text-gray-500">Monthly Salary:</span> <span className="font-semibold">{formatCurrency(report.monthlySalary)}</span></div>
      </div>

      {/* Attendance days */}
      <table className="w-full text-xs border border-gray-200 mb-4">
        <thead><tr className="bg-gray-100"><th className="text-left px-3 py-2 border-r border-gray-200">Particulars</th><th className="text-right px-3 py-2">Days / Amount</th></tr></thead>
        <tbody>
          {[
            ['Salary Days in Month', report.entitledDays],
            ['Present Days', report.presentDays],
            ['Weekly Off', report.weeklyOffDays],
            ['Paid Leaves', report.paidLeaveDays],
            ['Absent Days', report.absentDays],
            ['Half Days', report.halfDays],
            ['Unpaid Leaves', report.unpaidLeaveDays],
            ['Less: Deduction Days', `− ${report.deductionDays}`],
            ['Total Paid Days', report.paidDays.toFixed(1)],
          ].map(([k, v]) => (
            <tr key={k} className="border-t border-gray-100">
              <td className="px-3 py-1.5 border-r border-gray-200">{k}</td>
              <td className="px-3 py-1.5 text-right">{v}</td>
            </tr>
          ))}
          {report.unmarkedPaidDays > 0 && (
            <tr className="border-t border-gray-100 bg-amber-50">
              <td className="px-3 py-1.5 border-r border-gray-200 text-amber-800">
                Paid without attendance yet
              </td>
              <td className="px-3 py-1.5 text-right text-amber-800">
                {report.unmarkedPaidDays} — {formatDayList(report.unmarkedDates)}
              </td>
            </tr>
          )}
          {report.absentDates && report.absentDates.length > 0 && (
            <tr className="border-t border-gray-100 bg-red-50">
              <td className="px-3 py-1.5 border-r border-gray-200 text-red-700">Absent Dates</td>
              <td className="px-3 py-1.5 text-right text-red-700 break-words">{formatDayList(report.absentDates)}</td>
            </tr>
          )}
          {report.unpaidLeaveDates && report.unpaidLeaveDates.length > 0 && (
            <tr className="border-t border-gray-100 bg-orange-50">
              <td className="px-3 py-1.5 border-r border-gray-200 text-orange-700">Unpaid Leave Dates</td>
              <td className="px-3 py-1.5 text-right text-orange-700 break-words">{formatDayList(report.unpaidLeaveDates)}</td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Earnings */}
      <table className="w-full text-xs border border-gray-200 mb-4">
        <thead><tr className="bg-gray-100"><th className="text-left px-3 py-2 border-r border-gray-200">Earnings</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
        <tbody>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Daily Salary</td><td className="px-3 py-1.5 text-right">{formatCurrency(report.dailySalary)}</td></tr>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Gross Salary (Paid Days × Daily Rate)</td><td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(report.grossSalary)}</td></tr>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Overtime ({report.overtimeHours} hrs)</td><td className="px-3 py-1.5 text-right">+ {formatCurrency(report.overtimeAmount)}</td></tr>
          {report.bonus > 0 && (
            <tr className="border-t border-gray-100 bg-green-50">
              <td className="px-3 py-1.5 border-r border-gray-200">
                Bonus{report.bonusRemarks ? ` (${report.bonusRemarks})` : ''}
              </td>
              <td className="px-3 py-1.5 text-right text-green-700">+ {formatCurrency(report.bonus)}</td>
            </tr>
          )}
          {/* Its own named line — never folded into "Other Deduction". */}
          {report.priorAdjustment !== 0 && (
            <tr className={`border-t border-gray-100 ${report.priorAdjustment < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <td className="px-3 py-1.5 border-r border-gray-200">
                Prior period adjustment{report.priorAdjustmentNote ? ` (${report.priorAdjustmentNote})` : ''}
              </td>
              <td className={`px-3 py-1.5 text-right ${report.priorAdjustment < 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                {report.priorAdjustment < 0 ? '−' : '+'} {formatCurrency(Math.abs(report.priorAdjustment))}
              </td>
            </tr>
          )}
          {/* Lace packing */}
          {(report.type1Packed > 0 || report.type2Packed > 0) && <>
            <tr className="border-t border-gray-100 bg-blue-50">
              <td className="px-3 py-1.5 border-r border-gray-200">Flat Lace Packing ({report.type1Packed} pkts × ₹{LACE_RATES.type1})</td>
              <td className="px-3 py-1.5 text-right">+ {formatCurrency(report.type1Amount)}</td>
            </tr>
            <tr className="border-t border-gray-100 bg-purple-50">
              <td className="px-3 py-1.5 border-r border-gray-200">Round Lace Packing ({report.type2Packed} pkts × ₹{LACE_RATES.type2})</td>
              <td className="px-3 py-1.5 text-right">+ {formatCurrency(report.type2Amount)}</td>
            </tr>
            <tr className="border-t border-gray-200 font-semibold">
              <td className="px-3 py-1.5 border-r border-gray-200">Total Lace Packing</td>
              <td className="px-3 py-1.5 text-right text-green-600">+ {formatCurrency(report.laceTotal)}</td>
            </tr>
          </>}
        </tbody>
      </table>

      {/* Deductions */}
      <table className="w-full text-xs border border-gray-200 mb-4">
        <thead><tr className="bg-gray-100"><th className="text-left px-3 py-2 border-r border-gray-200">Deductions</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
        <tbody>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Advance Deduction</td><td className="px-3 py-1.5 text-right text-red-600">- {formatCurrency(report.advanceDeduction)}</td></tr>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Other Deduction</td><td className="px-3 py-1.5 text-right text-red-600">- {formatCurrency(report.otherDeduction)}</td></tr>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Late Fine</td><td className="px-3 py-1.5 text-right text-red-600">- {formatCurrency(report.lateFine)}</td></tr>
        </tbody>
      </table>

      <div className="bg-blue-50 border border-blue-200 rounded p-3 flex justify-between font-bold">
        <span>NET PAYABLE</span>
        <span className="text-blue-700">{formatCurrency(report.finalSalary)}</span>
      </div>
      <div className="signature-section flex justify-between mt-8 text-xs text-gray-500">
        <div className="text-center"><div className="border-t border-gray-400 w-36 pt-1">Employee Signature</div></div>
        <div className="text-center"><div className="border-t border-gray-400 w-36 pt-1">Employer Signature</div></div>
      </div>
    </div>
  );
}

function EmployeeRow({ emp, advances, settings, month, report, adj, onAdjChange }) {
  const [expanded, setExpanded] = useState(false);
  const [showSlip, setShowSlip] = useState(false);
  const [confirmRefinalise, setConfirmRefinalise] = useState(false);
  const { applyAdvanceDeduction, reverseAdvanceDeduction, upsertPayout, payouts, showToast, settings: appSettings } = useApp();

  const { advDed, otherDed, bonus, bonusRemarks, advDedTouched, suggestedEmi } = adj;

  const existingPayout = useMemo(
    () => payouts.find((p) => p.employeeId === emp.id && p.month === month),
    [payouts, emp.id, month]
  );

  const isPaid = existingPayout?.status === 'Paid';
  // What the previous finalisation actually moved against this employee's advances.
  const alreadyApplied = round2(existingPayout?.advanceDeductionApplied || 0);

  // EMI-active advances for this month get deducted first.
  const priorityIds = useMemo(() => advances
    .filter((a) =>
      a.employeeId === emp.id &&
      a.repaymentType === 'EMI' &&
      (!a.emiStartMonth || a.emiStartMonth <= month)
    )
    .sort((x, y) => (x.emiStartMonth || '').localeCompare(y.emiStartMonth || ''))
    .map((a) => a.id),
  [advances, emp.id, month]);

  const doFinalise = () => {
    const wanted = round2(parseFloat(advDed) || 0);
    // Only move the DIFFERENCE. Finalising twice must not deduct the advance twice.
    const delta = round2(wanted - alreadyApplied);
    const payoutKey = `${emp.id}_${month}`;

    if (delta > 0) {
      applyAdvanceDeduction(emp.id, delta, priorityIds, { source: 'payout', payoutId: payoutKey });
    } else if (delta < 0) {
      reverseAdvanceDeduction(emp.id, Math.abs(delta), { payoutId: payoutKey });
    }

    upsertPayout({
      employeeId: emp.id,
      employeeName: emp.name,
      employeeCode: emp.employeeCode,
      month,
      finalSalary: report.finalSalary,
      // What was actually handed over — the figure the settlement diffs against.
      paidAmount: report.finalSalary,
      basis: report.unmarkedPaidDays > 0 ? 'projected' : 'actual',
      projectedDates: report.unmarkedDates || [],
      projectedPaidDays: report.unmarkedPaidDays || 0,
      settled: existingPayout?.settled ?? false,
      settlementDelta: existingPayout?.settlementDelta ?? null,
      settledIntoMonth: existingPayout?.settledIntoMonth ?? null,
      advanceDeductionApplied: wanted,
      snapshot: {
        monthlySalary: report.monthlySalary,
        paidDays: report.paidDays,
        deductionDays: report.deductionDays,
        grossSalary: report.grossSalary,
        overtimeAmount: report.overtimeAmount,
        laceTotal: report.laceTotal,
        bonus: report.bonus,
        bonusRemarks: report.bonusRemarks,
        advanceDeduction: report.advanceDeduction,
        otherDeduction: report.otherDeduction,
        lateFine: report.lateFine,
        // Kept so a chained settlement (M+1 also paid early) recomputes M+1's truth correctly.
        priorAdjustment: report.priorAdjustment,
      },
      finalisedAt: new Date().toISOString(),
    });

    const note = delta === 0 ? 'no further advance deducted'
      : delta > 0 ? `advance -${formatCurrency(delta)}`
      : `advance +${formatCurrency(Math.abs(delta))} returned`;
    showToast(`Salary finalised for ${emp.name} (${note})`);
    setConfirmRefinalise(false);
  };

  const handleFinalise = () => {
    if (isPaid) return;                        // button is disabled once paid
    if (existingPayout) { setConfirmRefinalise(true); return; }
    doFinalise();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(!expanded)}>
        <div>
          <p className="font-semibold text-gray-900 flex items-center gap-2">
            {emp.name}
            {emp.status === 'Inactive' && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-medium rounded-full">
                Left {emp.leftDate || '—'}
              </span>
            )}
            {existingPayout && (
              <span className={`px-2 py-0.5 text-[10px] font-medium rounded-full ${
                existingPayout.status === 'Paid'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-yellow-100 text-yellow-700'
              }`}>
                {existingPayout.status === 'Paid'
                  ? `Paid ${existingPayout.paidDate || ''}`
                  : 'Finalised · Pending payout'}
              </span>
            )}
          </p>
          <p className="text-xs text-gray-400">{emp.employeeCode} · {emp.role}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Paid Days</p>
            <p className="font-semibold text-gray-700">{report.paidDays.toFixed(1)} / {report.entitledDays}</p>
          </div>
          {report.laceTotal > 0 && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-400">Lace Packing</p>
              <p className="font-semibold text-green-500">+{formatCurrency(report.laceTotal)}</p>
            </div>
          )}
          <div className="text-right">
            <p className="text-xs text-gray-400">Net Payable</p>
            <p className="font-bold text-green-600">{formatCurrency(report.finalSalary)}</p>
          </div>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Attendance breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Monthly Salary', formatCurrency(report.monthlySalary)],
              ['Daily Salary', formatCurrency(report.dailySalary)],
              ['Salary Days', report.entitledDays],
              ['Paid Days', report.paidDays.toFixed(1)],
              ['Present', report.presentDays],
              ['Half Days', report.halfDays],
              ['Paid Leaves', report.paidLeaveDays],
              ['Absent', report.absentDays],
              ['Unpaid Leaves', report.unpaidLeaveDays],
              ['Weekly Off', report.weeklyOffDays],
              ['OT Hours', report.overtimeHours],
              ['Gross Salary', formatCurrency(report.grossSalary)],
            ].map(([k, v]) => (
              <div key={k} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">{k}</p>
                <p className="font-semibold text-gray-800">{v}</p>
              </div>
            ))}
          </div>

          {/* Lace packing summary */}
          {(report.type1Packed > 0 || report.type2Packed > 0) && (
            <div className="grid grid-cols-3 gap-3 bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-500 font-medium">Flat Lace (T1)</p>
                <p className="font-bold text-blue-700">{report.type1Packed} pkts</p>
                <p className="text-xs text-blue-600">= {formatCurrency(report.type1Amount)}</p>
              </div>
              <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 text-center">
                <p className="text-xs text-purple-500 font-medium">Round Lace (T2)</p>
                <p className="font-bold text-purple-700">{report.type2Packed} pkts</p>
                <p className="text-xs text-purple-600">= {formatCurrency(report.type2Amount)}</p>
              </div>
              <div className="bg-green-100 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600 font-medium flex items-center justify-center gap-1"><Package size={11} /> Lace Total</p>
                <p className="font-bold text-green-700">{formatCurrency(report.laceTotal)}</p>
              </div>
            </div>
          )}

          {/* Prior period adjustment carried in from an earlier early payout */}
          {report.priorAdjustment !== 0 && (
            <div className={`rounded-lg border p-3 text-sm ${
              report.priorAdjustment < 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}>
              <p className="font-semibold flex items-center gap-1.5">
                <History size={14} /> Prior period adjustment {report.priorAdjustment < 0 ? '−' : '+'}{formatCurrency(Math.abs(report.priorAdjustment))}
              </p>
              <p className="text-xs mt-0.5 opacity-90">{report.priorAdjustmentNote}</p>
            </div>
          )}

          {/* Unmarked days are PAID under the 30-day model, so finalising now carries risk:
              an absence marked later against one of these days means an overpayment. No
              checkbox — the exposure exists whether or not anyone ticks a box, so it is
              stated plainly and tracked automatically for settlement. */}
          {report.unmarkedPaidDays > 0 && !isPaid && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <CalendarClock size={14} />
                Paying early — {report.unmarkedPaidDays} day(s) have no attendance yet
              </p>
              <p className="text-xs text-amber-800 mt-0.5">
                Those days are being paid ({formatCurrency(round2(report.dailySalary * report.unmarkedPaidDays))}
                {' '}of this total) because only marked absences reduce salary. If any is later
                marked absent, the difference is carried into {formatMonthLabel(nextMonthKey(month))} as a
                prior period adjustment.
              </p>
              <p className="text-[11px] text-amber-800 mt-1">
                <span className="font-medium">Unmarked dates:</span>{' '}
                <span className="font-mono">{report.unmarkedDates.map((d) => parseInt(d.slice(-2), 10)).join(', ')}</span>
              </p>
            </div>
          )}

          {/* Adjustments */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-orange-50 border border-orange-100 rounded-lg p-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Advance Deduction (Pending: {formatCurrency(report.totalPendingAdvance)})
              </label>
              <input type="number" min="0" max={report.totalPendingAdvance} value={advDed}
                onChange={(e) => onAdjChange({ advDed: e.target.value, advDedTouched: true })}
                placeholder={`Max ${formatCurrency(report.totalPendingAdvance)}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
              {suggestedEmi > 0 && (
                <p className="text-[11px] mt-1 flex items-center gap-1.5">
                  <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded font-medium">EMI</span>
                  <span className="text-gray-500">
                    Auto-deduct {formatCurrency(suggestedEmi)} from EMI plan{advDedTouched ? ' (overridden)' : ''}.
                    {advDedTouched && (
                      <button type="button"
                        onClick={() => onAdjChange({ advDed: String(suggestedEmi), advDedTouched: false })}
                        className="ml-1 text-indigo-600 hover:underline">Reset</button>
                    )}
                  </span>
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Other Deduction</label>
              <input type="number" min="0" value={otherDed} onChange={(e) => onAdjChange({ otherDed: e.target.value })}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Bonus (+) <span className="text-green-600">added to payout</span>
              </label>
              <input type="number" min="0" step="any" value={bonus} onChange={(e) => onAdjChange({ bonus: e.target.value })}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
              <input type="text" value={bonusRemarks} onChange={(e) => onAdjChange({ bonusRemarks: e.target.value })}
                placeholder="Bonus reason (optional)"
                className="mt-1.5 w-full border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-300" />
            </div>
            <div className="flex items-end">
              <div className="w-full bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Net Payable</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(report.finalSalary)}</p>
                {parseFloat(bonus) > 0 && (
                  <p className="text-[10px] text-green-600 mt-0.5">incl. bonus +{formatCurrency(parseFloat(bonus))}</p>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2 justify-end">
            <button onClick={() => setShowSlip(!showSlip)} className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50">
              <IndianRupee size={14} /> {showSlip ? 'Hide' : 'View'} Slip
            </button>
            <button onClick={() => { setShowSlip(true); setTimeout(() => printElement('salary-slip-print'), 100); }}
              className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 text-blue-600 text-sm rounded-lg hover:bg-blue-50">
              <Printer size={14} /> Print
            </button>
            <button
              onClick={() => {
                const text = buildSlipText(report, appSettings.companyName);
                openWhatsAppShare({ phone: emp.mobile, text });
              }}
              title={emp.mobile ? `Send via WhatsApp to ${emp.mobile}` : 'Open WhatsApp with slip text'}
              className="flex items-center gap-1.5 px-3 py-2 border border-green-300 text-green-700 text-sm rounded-lg hover:bg-green-50">
              <MessageCircle size={14} /> WhatsApp
            </button>
            <button
              onClick={() => {
                const text = buildSlipText(report, appSettings.companyName);
                openGmailCompose({
                  to: emp.email || '',
                  subject: `Salary Slip — ${emp.name} (${formatMonthLabel(month)})`,
                  body: text,
                });
              }}
              title="Email salary slip via Gmail"
              className="flex items-center gap-1.5 px-3 py-2 border border-red-300 text-red-600 text-sm rounded-lg hover:bg-red-50">
              <Mail size={14} /> Email
            </button>
            <button onClick={handleFinalise} disabled={isPaid}
              title={isPaid ? 'This month is already paid out — reopen it on the Payouts page to change it.' : undefined}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed">
              {existingPayout ? 'Re-finalise' : 'Finalise'} &amp; Deduct Advance
            </button>
          </div>

          {showSlip && <SalarySlip report={report} settings={settings} companyName={appSettings.companyName} />}
        </div>
      )}

      {/* Re-finalising must not deduct the advance a second time — show what was already
          applied and move only the difference. */}
      <ConfirmDialog
        isOpen={confirmRefinalise}
        title="Re-finalise this month?"
        message={
          `${emp.name} — ${formatMonthLabel(month)} was already finalised.\n\n` +
          `Advance already deducted: ${formatCurrency(alreadyApplied)}\n` +
          `New advance deduction:    ${formatCurrency(round2(parseFloat(advDed) || 0))}\n\n` +
          (round2((parseFloat(advDed) || 0) - alreadyApplied) === 0
            ? 'No further advance will be deducted.'
            : round2((parseFloat(advDed) || 0) - alreadyApplied) > 0
              ? `Only the difference of ${formatCurrency(round2((parseFloat(advDed) || 0) - alreadyApplied))} will be deducted.`
              : `${formatCurrency(Math.abs(round2((parseFloat(advDed) || 0) - alreadyApplied)))} will be returned to the advance balance.`)
        }
        confirmLabel="Re-finalise"
        onConfirm={doFinalise}
        onCancel={() => setConfirmRefinalise(false)}
      />
    </div>
  );
}

export default function SalaryCalculator() {
  const { employees, attendance, advances, lacePackingRecords, settings } = useApp();
  const [month, setMonth] = useState(currentMonthKey());
  const [empFilter, setEmpFilter] = useState('all');

  // Include Active employees, plus Inactive employees who left during (or after) the selected month
  // so their pro-rated salary for the month they left is still shown.
  const eligibleEmployees = useMemo(() => employees.filter((e) => {
    if (e.status === 'Active') return true;
    if (e.status === 'Inactive' && e.leftDate) {
      // Show if leftDate is in the same month or later than the selected month
      const leftMonth = e.leftDate.slice(0, 7);
      return leftMonth >= month;
    }
    // Also include inactive employees who have any attendance in this month (fallback)
    if (e.status === 'Inactive') {
      return attendance.some((a) => a.employeeId === e.id && a.date.startsWith(month));
    }
    return false;
  }), [employees, attendance, month]);

  const displayEmployees = useMemo(() =>
    empFilter === 'all' ? eligibleEmployees : eligibleEmployees.filter((e) => e.id === empFilter),
  [eligibleEmployees, empFilter]);

  // ── Single source of truth for per-employee adjustments ────────────────────
  // These used to live inside each EmployeeRow, so the summary bar, the CSV and Reports
  // recomputed salary WITHOUT them and disagreed with the row. Holding them here means
  // every surface reads the same numbers.
  const { payouts } = useApp();
  const [adjustments, setAdjustments] = useState({});   // empId → { advDed, otherDed, bonus, bonusRemarks, advDedTouched }

  // Adjustments are month-specific; switching month starts from the EMI defaults again.
  useEffect(() => { setAdjustments({}); }, [month]);

  const setAdjustment = useCallback((empId, patch) => {
    setAdjustments((prev) => ({ ...prev, [empId]: { ...prev[empId], ...patch } }));
  }, []);

  // Merge stored overrides over derived defaults: the advance deduction defaults to the
  // month's EMI total until the user types over it.
  const effectiveAdjustments = useMemo(() => {
    const out = {};
    displayEmployees.forEach((emp) => {
      const stored = adjustments[emp.id] || {};
      const suggestedEmi = round2(getSuggestedEmiDeduction(advances, emp.id, month));
      out[emp.id] = {
        advDed: stored.advDedTouched ? (stored.advDed ?? '') : (suggestedEmi > 0 ? String(suggestedEmi) : ''),
        otherDed: stored.otherDed ?? '',
        bonus: stored.bonus ?? '',
        bonusRemarks: stored.bonusRemarks ?? '',
        advDedTouched: !!stored.advDedTouched,
        suggestedEmi,
      };
    });
    return out;
  }, [displayEmployees, adjustments, advances, month]);

  // One report per employee — shared by the rows, the summary bar and the CSV.
  const reports = useMemo(() => {
    const out = {};
    displayEmployees.forEach((emp) => {
      const adj = effectiveAdjustments[emp.id] || {};
      const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month));
      const prior = getPriorAdjustment(payouts, emp.id, month);
      out[emp.id] = calculateSalary({
        employee: emp,
        attendanceRecords: empAtt,
        advances,
        lacePackingRecords,
        settings,
        monthKey: month,
        otherDeduction: parseFloat(adj.otherDed) || 0,
        advanceDeductionOverride: parseFloat(adj.advDed) || 0,
        bonus: parseFloat(adj.bonus) || 0,
        bonusRemarks: adj.bonusRemarks || '',
        priorAdjustment: prior.amount,
        priorAdjustmentNote: prior.note,
      });
    });
    return out;
  }, [displayEmployees, effectiveAdjustments, attendance, advances, lacePackingRecords, settings, month, payouts]);

  const totalPayable = useMemo(
    () => round2(displayEmployees.reduce((sum, emp) => sum + (reports[emp.id]?.finalSalary || 0), 0)),
    [displayEmployees, reports]
  );

  const handleExportCSV = () => {
    const rows = displayEmployees.map((emp) => {
      const r = reports[emp.id];
      return {
        'Employee Code': r.employeeCode,
        'Name': r.employeeName,
        'Month': r.month,
        'Monthly Salary': r.monthlySalary,
        'Daily Salary': r.dailySalary.toFixed(2),
        'Salary Days': r.entitledDays,
        'Deduction Days': r.deductionDays,
        'Paid Days': r.paidDays.toFixed(1),
        'Present': r.presentDays,
        'Half Days': r.halfDays,
        'Paid Leave': r.paidLeaveDays,
        'Absent': r.absentDays,
        'Gross Salary': r.grossSalary.toFixed(2),
        'Overtime': r.overtimeAmount.toFixed(2),
        'Flat Lace Pkts': r.type1Packed,
        'Flat Lace Amount': r.type1Amount.toFixed(2),
        'Round Lace Pkts': r.type2Packed,
        'Round Lace Amount': r.type2Amount.toFixed(2),
        'Total Lace': r.laceTotal.toFixed(2),
        'Bonus': (r.bonus || 0).toFixed(2),
        'Bonus Remarks': r.bonusRemarks || '',
        'Unmarked Days Paid': r.unmarkedPaidDays || 0,
        'Prior Period Adjustment': (r.priorAdjustment || 0).toFixed(2),
        'Adjustment Reason': r.priorAdjustmentNote || '',
        'Advance Deduction': r.advanceDeduction.toFixed(2),
        'Other Deduction': r.otherDeduction.toFixed(2),
        'Late Fine': r.lateFine.toFixed(2),
        'Net Payable': r.finalSalary.toFixed(2),
      };
    });
    downloadCSV(rows, `salary_${month}.csv`);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 flex-1">
          <option value="all">All Eligible Employees</option>
          {eligibleEmployees.map((e) => (
            <option key={e.id} value={e.id}>{e.name}{e.status === 'Inactive' ? ` (Left ${e.leftDate || ''})` : ''}</option>
          ))}
        </select>
        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 bg-white">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Total Summary Bar */}
      <div className="bg-blue-600 text-white rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-blue-200 text-xs font-medium">Total Salary Payable (incl. Lace Packing)</p>
          <p className="text-2xl font-bold">{formatCurrency(totalPayable)}</p>
          <p className="text-blue-200 text-xs">{formatMonthLabel(month)} · {displayEmployees.length} employee(s)</p>
        </div>
        <Calculator size={32} className="text-blue-300" />
      </div>

      {/* Employee rows */}
      {eligibleEmployees.length === 0 ? (
        <EmptyState icon={Calculator} title="No employees" description="Add employees to calculate salary." />
      ) : displayEmployees.length === 0 ? (
        <EmptyState icon={Calculator} title="No match" />
      ) : (
        <div className="space-y-3">
          {displayEmployees.map((emp) => (
            <EmployeeRow key={emp.id} emp={emp} advances={advances}
              settings={settings} month={month}
              report={reports[emp.id]}
              adj={effectiveAdjustments[emp.id]}
              onAdjChange={(patch) => setAdjustment(emp.id, patch)} />
          ))}
        </div>
      )}
    </div>
  );
}
