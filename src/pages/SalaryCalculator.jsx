import React, { useState, useMemo, useRef } from 'react';
import { Calculator, Download, Printer, ChevronDown, ChevronUp, IndianRupee } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { calculateSalary, formatCurrency, formatMonthLabel, currentMonthKey } from '../utils/calculations.js';
import { downloadCSV, printElement } from '../utils/exportUtils.js';

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
      <table className="w-full text-xs border border-gray-200 mb-4">
        <thead><tr className="bg-gray-100"><th className="text-left px-3 py-2 border-r border-gray-200">Particulars</th><th className="text-right px-3 py-2">Days / Amount</th></tr></thead>
        <tbody>
          {[
            ['Total Working Days', report.totalWorkingDays],
            ['Present Days', report.presentDays],
            ['Half Days', report.halfDays],
            ['Paid Leaves', report.paidLeaveDays],
            ['Absent Days', report.absentDays],
            ['Unpaid Leaves', report.unpaidLeaveDays],
            ['Weekly Off', report.weeklyOffDays],
            ['Total Paid Days', report.paidDays.toFixed(1)],
          ].map(([k, v]) => (
            <tr key={k} className="border-t border-gray-100">
              <td className="px-3 py-1.5 border-r border-gray-200">{k}</td>
              <td className="px-3 py-1.5 text-right">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full text-xs border border-gray-200 mb-4">
        <thead><tr className="bg-gray-100"><th className="text-left px-3 py-2 border-r border-gray-200">Earnings</th><th className="text-right px-3 py-2">Amount</th></tr></thead>
        <tbody>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Daily Salary</td><td className="px-3 py-1.5 text-right">{formatCurrency(report.dailySalary)}</td></tr>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Gross Salary</td><td className="px-3 py-1.5 text-right font-semibold">{formatCurrency(report.grossSalary)}</td></tr>
          <tr className="border-t border-gray-100"><td className="px-3 py-1.5 border-r border-gray-200">Overtime ({report.overtimeHours} hrs)</td><td className="px-3 py-1.5 text-right">+ {formatCurrency(report.overtimeAmount)}</td></tr>
        </tbody>
      </table>
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

function EmployeeRow({ emp, attendance, advances, settings, month }) {
  const [expanded, setExpanded] = useState(false);
  const [advDed, setAdvDed] = useState('');
  const [otherDed, setOtherDed] = useState('');
  const [showSlip, setShowSlip] = useState(false);
  const { applyAdvanceDeduction, showToast, settings: appSettings } = useApp();

  const empAtt = useMemo(() =>
    attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month)),
  [attendance, emp.id, month]);

  const report = useMemo(() =>
    calculateSalary({ employee: emp, attendanceRecords: empAtt, advances, settings, monthKey: month, otherDeduction: parseFloat(otherDed) || 0, advanceDeductionOverride: parseFloat(advDed) || 0 }),
  [emp, empAtt, advances, settings, month, otherDed, advDed]);

  const handleFinalise = () => {
    if (parseFloat(advDed) > 0) {
      applyAdvanceDeduction(emp.id, parseFloat(advDed));
    }
    showToast(`Salary finalised for ${emp.name}`);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50" onClick={() => setExpanded(!expanded)}>
        <div>
          <p className="font-semibold text-gray-900">{emp.name}</p>
          <p className="text-xs text-gray-400">{emp.employeeCode} · {emp.role}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-gray-400">Paid Days</p>
            <p className="font-semibold text-gray-700">{report.paidDays.toFixed(1)} / {settings.totalWorkingDays}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">Net Payable</p>
            <p className="font-bold text-green-600">{formatCurrency(report.finalSalary)}</p>
          </div>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 p-4 space-y-4">
          {/* Breakdown */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['Monthly Salary', formatCurrency(report.monthlySalary)],
              ['Daily Salary', formatCurrency(report.dailySalary)],
              ['Total Working Days', report.totalWorkingDays],
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

          {/* Adjustments */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-orange-50 border border-orange-100 rounded-lg p-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Advance Deduction (Pending: {formatCurrency(report.totalPendingAdvance)})
              </label>
              <input type="number" min="0" max={report.totalPendingAdvance} value={advDed}
                onChange={(e) => setAdvDed(e.target.value)}
                placeholder={`Max ${formatCurrency(report.totalPendingAdvance)}`}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Other Deduction</label>
              <input type="number" min="0" value={otherDed} onChange={(e) => setOtherDed(e.target.value)}
                placeholder="0"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400" />
            </div>
            <div className="flex items-end">
              <div className="w-full bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-gray-500">Net Payable</p>
                <p className="text-lg font-bold text-green-600">{formatCurrency(report.finalSalary)}</p>
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
              <Printer size={14} /> Print Slip
            </button>
            <button onClick={handleFinalise} className="flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700">
              Finalise & Deduct Advance
            </button>
          </div>

          {showSlip && <SalarySlip report={report} settings={settings} companyName={appSettings.companyName} />}
        </div>
      )}
    </div>
  );
}

export default function SalaryCalculator() {
  const { employees, attendance, advances, settings } = useApp();
  const [month, setMonth] = useState(currentMonthKey());
  const [empFilter, setEmpFilter] = useState('all');

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees]);
  const displayEmployees = useMemo(() =>
    empFilter === 'all' ? activeEmployees : activeEmployees.filter((e) => e.id === empFilter),
  [activeEmployees, empFilter]);

  const totalPayable = useMemo(() => {
    return displayEmployees.reduce((sum, emp) => {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month));
      const r = calculateSalary({ employee: emp, attendanceRecords: empAtt, advances, settings, monthKey: month });
      return sum + r.finalSalary;
    }, 0);
  }, [displayEmployees, attendance, advances, settings, month]);

  const handleExportCSV = () => {
    const rows = displayEmployees.map((emp) => {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month));
      const r = calculateSalary({ employee: emp, attendanceRecords: empAtt, advances, settings, monthKey: month });
      return {
        'Employee Code': r.employeeCode,
        'Name': r.employeeName,
        'Month': r.month,
        'Monthly Salary': r.monthlySalary,
        'Daily Salary': r.dailySalary.toFixed(2),
        'Working Days': r.totalWorkingDays,
        'Paid Days': r.paidDays.toFixed(1),
        'Present': r.presentDays,
        'Half Days': r.halfDays,
        'Paid Leave': r.paidLeaveDays,
        'Absent': r.absentDays,
        'Gross Salary': r.grossSalary.toFixed(2),
        'Overtime': r.overtimeAmount.toFixed(2),
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
          <option value="all">All Active Employees</option>
          {activeEmployees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <button onClick={handleExportCSV} className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 bg-white">
          <Download size={15} /> Export CSV
        </button>
      </div>

      {/* Total Summary Bar */}
      <div className="bg-blue-600 text-white rounded-xl p-4 flex items-center justify-between">
        <div>
          <p className="text-blue-200 text-xs font-medium">Total Salary Payable</p>
          <p className="text-2xl font-bold">{formatCurrency(totalPayable)}</p>
          <p className="text-blue-200 text-xs">{formatMonthLabel(month)} · {displayEmployees.length} employee(s)</p>
        </div>
        <Calculator size={32} className="text-blue-300" />
      </div>

      {/* Employee rows */}
      {activeEmployees.length === 0 ? (
        <EmptyState icon={Calculator} title="No employees" description="Add employees to calculate salary." />
      ) : displayEmployees.length === 0 ? (
        <EmptyState icon={Calculator} title="No match" />
      ) : (
        <div className="space-y-3">
          {displayEmployees.map((emp) => (
            <EmployeeRow key={emp.id} emp={emp} attendance={attendance} advances={advances} settings={settings} month={month} />
          ))}
        </div>
      )}
    </div>
  );
}
