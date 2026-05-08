import React, { useState, useMemo } from 'react';
import { Download, Printer, BarChart2, Calendar, Users, CreditCard, Filter } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { formatCurrency, calculateSalary, formatMonthLabel, currentMonthKey, getAttendanceStats } from '../utils/calculations.js';
import { downloadCSV, printElement } from '../utils/exportUtils.js';

const STATUS_COLORS = {
  Present: 'bg-green-100 text-green-700', Absent: 'bg-red-100 text-red-700',
  'Half Day': 'bg-yellow-100 text-yellow-700', 'Paid Leave': 'bg-blue-100 text-blue-700',
  'Unpaid Leave': 'bg-orange-100 text-orange-700', 'Weekly Off': 'bg-purple-100 text-purple-700',
  Overtime: 'bg-indigo-100 text-indigo-700',
};

export default function Reports() {
  const { employees, attendance, advances, settings } = useApp();
  const [tab, setTab] = useState('attendance');
  const [month, setMonth] = useState(currentMonthKey());
  const [empFilter, setEmpFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]     = useState('');
  const [advStatus, setAdvStatus] = useState('All');

  const getEmpName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';

  // ── Attendance Report ─────────────────────────────────────────────────────
  const attReport = useMemo(() => {
    let rows = attendance.filter((a) => a.date.startsWith(month));
    if (empFilter !== 'all') rows = rows.filter((a) => a.employeeId === empFilter);
    if (dateFrom) rows = rows.filter((a) => a.date >= dateFrom);
    if (dateTo)   rows = rows.filter((a) => a.date <= dateTo);
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, month, empFilter, dateFrom, dateTo]);

  // ── Salary Report ─────────────────────────────────────────────────────────
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees]);
  const salaryReport = useMemo(() => {
    const emps = empFilter === 'all' ? activeEmployees : activeEmployees.filter((e) => e.id === empFilter);
    return emps.map((emp) => {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month));
      return calculateSalary({ employee: emp, attendanceRecords: empAtt, advances, settings, monthKey: month });
    });
  }, [activeEmployees, attendance, advances, settings, month, empFilter]);

  // ── Advance Report ────────────────────────────────────────────────────────
  const advReport = useMemo(() => {
    let rows = advances;
    if (empFilter !== 'all') rows = rows.filter((a) => a.employeeId === empFilter);
    if (advStatus !== 'All') rows = rows.filter((a) => a.status === advStatus);
    return rows.sort((a, b) => b.date.localeCompare(a.date));
  }, [advances, empFilter, advStatus]);

  // ── Employee Attendance Summary ────────────────────────────────────────────
  const empAttSummary = useMemo(() => {
    const emps = empFilter === 'all' ? activeEmployees : activeEmployees.filter((e) => e.id === empFilter);
    return emps.map((emp) => {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month));
      const stats = getAttendanceStats(empAtt, settings);
      return { ...emp, ...stats, totalRecords: empAtt.length };
    });
  }, [activeEmployees, attendance, settings, month, empFilter]);

  const exportAtt = () => {
    const rows = attReport.map((r) => ({
      Date: r.date, Employee: getEmpName(r.employeeId), Status: r.status,
      'OT Hours': r.overtimeHours || 0, 'Late Fine': r.lateFine || 0, Remarks: r.remarks || '',
    }));
    downloadCSV(rows, `attendance_${month}.csv`);
  };

  const exportSalary = () => {
    const rows = salaryReport.map((r) => ({
      Code: r.employeeCode, Name: r.employeeName, Month: r.month,
      'Monthly Salary': r.monthlySalary, 'Daily Salary': r.dailySalary.toFixed(2),
      'Paid Days': r.paidDays.toFixed(1), Present: r.presentDays, Absent: r.absentDays,
      'Gross Salary': r.grossSalary.toFixed(2), 'Net Payable': r.finalSalary.toFixed(2),
    }));
    downloadCSV(rows, `salary_report_${month}.csv`);
  };

  const exportAdv = () => {
    const rows = advReport.map((r) => ({
      Date: r.date, Employee: getEmpName(r.employeeId), Amount: r.amount,
      Deducted: r.deductedAmount, Remaining: r.remainingAmount, Mode: r.paymentMode, Status: r.status, Remarks: r.remarks,
    }));
    downloadCSV(rows, `advance_report.csv`);
  };

  const tabs = [
    { id: 'attendance',   label: 'Attendance',   icon: Calendar },
    { id: 'summary',      label: 'Emp. Summary', icon: Users },
    { id: 'salary',       label: 'Salary',        icon: BarChart2 },
    { id: 'advance',      label: 'Advance',       icon: CreditCard },
  ];

  const inpCls = 'border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 overflow-x-auto">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center bg-white rounded-xl border border-gray-200 p-3">
        <Filter size={14} className="text-gray-400 flex-shrink-0" />
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className={inpCls} />
        <select value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className={`${inpCls} flex-1 min-w-40`}>
          <option value="all">All Employees</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        {tab === 'attendance' && <>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={inpCls} placeholder="From" />
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={inpCls} placeholder="To" />
        </>}
        {tab === 'advance' && (
          <select value={advStatus} onChange={(e) => setAdvStatus(e.target.value)} className={inpCls}>
            <option value="All">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Partially Deducted">Partially Deducted</option>
            <option value="Deducted">Deducted</option>
          </select>
        )}
        {tab === 'attendance' && <button onClick={exportAtt} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-sm rounded-lg hover:bg-gray-50"><Download size={13} /> CSV</button>}
        {tab === 'salary'     && <button onClick={exportSalary} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-sm rounded-lg hover:bg-gray-50"><Download size={13} /> CSV</button>}
        {tab === 'advance'    && <button onClick={exportAdv} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-sm rounded-lg hover:bg-gray-50"><Download size={13} /> CSV</button>}
        <button onClick={() => printElement('report-table')} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-gray-300 text-sm rounded-lg hover:bg-gray-50 no-print"><Printer size={13} /> Print</button>
      </div>

      {/* Attendance Tab */}
      {tab === 'attendance' && (
        <div id="report-table" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold">Attendance Report — {formatMonthLabel(month)} · {attReport.length} records</p>
          </div>
          {attReport.length === 0 ? <EmptyState icon={Calendar} title="No records" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Date', 'Employee', 'Status', 'OT Hours', 'Late Fine', 'Remarks'].map((h) => <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {attReport.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{r.date}</td>
                      <td className="px-4 py-2.5 font-medium">{getEmpName(r.employeeId)}</td>
                      <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100'}`}>{r.status}</span></td>
                      <td className="px-4 py-2.5 text-gray-500">{r.overtimeHours || 0}</td>
                      <td className="px-4 py-2.5 text-gray-500">{r.lateFine ? `₹${r.lateFine}` : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Emp Summary Tab */}
      {tab === 'summary' && (
        <div id="report-table" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
            <p className="text-sm font-semibold">Employee Attendance Summary — {formatMonthLabel(month)}</p>
          </div>
          {empAttSummary.length === 0 ? <EmptyState icon={Users} title="No data" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Employee', 'Present', 'Half Days', 'Paid Leave', 'Absent', 'Unpaid Leave', 'Weekly Off', 'OT Hrs', 'Paid Days'].map((h) => <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empAttSummary.map((e) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium">{e.name}</td>
                      <td className="px-3 py-2.5"><span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs">{e.presentDays}</span></td>
                      <td className="px-3 py-2.5 text-gray-600">{e.halfDays}</td>
                      <td className="px-3 py-2.5 text-gray-600">{e.paidLeaveDays}</td>
                      <td className="px-3 py-2.5"><span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full text-xs">{e.absentDays}</span></td>
                      <td className="px-3 py-2.5 text-gray-600">{e.unpaidLeaveDays}</td>
                      <td className="px-3 py-2.5 text-gray-600">{e.weeklyOffDays}</td>
                      <td className="px-3 py-2.5 text-gray-600">{e.overtimeHours}</td>
                      <td className="px-3 py-2.5 font-bold text-blue-700">{e.paidDays.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Salary Tab */}
      {tab === 'salary' && (
        <div id="report-table" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold">Salary Report — {formatMonthLabel(month)}</p>
            <p className="text-sm font-bold text-green-600">Total: {formatCurrency(salaryReport.reduce((s, r) => s + r.finalSalary, 0))}</p>
          </div>
          {salaryReport.length === 0 ? <EmptyState icon={BarChart2} title="No data" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Employee', 'Monthly', 'Daily', 'Paid Days', 'Gross', 'OT', 'Adv. Ded.', 'Other Ded.', 'Late Fine', 'Net Payable'].map((h) => <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {salaryReport.map((r) => (
                    <tr key={r.employeeId} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium">{r.employeeName}</td>
                      <td className="px-3 py-2.5">{formatCurrency(r.monthlySalary)}</td>
                      <td className="px-3 py-2.5 text-gray-500">{formatCurrency(r.dailySalary)}</td>
                      <td className="px-3 py-2.5 font-semibold text-blue-700">{r.paidDays.toFixed(1)}</td>
                      <td className="px-3 py-2.5">{formatCurrency(r.grossSalary)}</td>
                      <td className="px-3 py-2.5 text-green-600">+{formatCurrency(r.overtimeAmount)}</td>
                      <td className="px-3 py-2.5 text-red-500">-{formatCurrency(r.advanceDeduction)}</td>
                      <td className="px-3 py-2.5 text-red-500">-{formatCurrency(r.otherDeduction)}</td>
                      <td className="px-3 py-2.5 text-red-500">-{formatCurrency(r.lateFine)}</td>
                      <td className="px-3 py-2.5 font-bold text-green-600">{formatCurrency(r.finalSalary)}</td>
                    </tr>
                  ))}
                  <tr className="bg-blue-50 font-bold">
                    <td className="px-3 py-2.5 text-blue-800" colSpan={9}>Total Payable</td>
                    <td className="px-3 py-2.5 text-green-700">{formatCurrency(salaryReport.reduce((s, r) => s + r.finalSalary, 0))}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Advance Tab */}
      {tab === 'advance' && (
        <div id="report-table" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
            <p className="text-sm font-semibold">Advance Report · {advReport.length} records</p>
            <p className="text-sm font-bold text-red-600">Pending: {formatCurrency(advReport.filter(a => a.status !== 'Deducted').reduce((s, a) => s + parseFloat(a.remainingAmount || 0), 0))}</p>
          </div>
          {advReport.length === 0 ? <EmptyState icon={CreditCard} title="No advances" /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>{['Date', 'Employee', 'Amount', 'Deducted', 'Remaining', 'Mode', 'Status', 'Remarks'].map((h) => <th key={h} className="text-left px-3 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {advReport.map((r) => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-600">{r.date}</td>
                      <td className="px-3 py-2.5 font-medium">{getEmpName(r.employeeId)}</td>
                      <td className="px-3 py-2.5 font-semibold">{formatCurrency(r.amount)}</td>
                      <td className="px-3 py-2.5 text-orange-600">{formatCurrency(r.deductedAmount)}</td>
                      <td className="px-3 py-2.5 font-bold text-red-600">{formatCurrency(r.remainingAmount)}</td>
                      <td className="px-3 py-2.5 text-gray-500">{r.paymentMode}</td>
                      <td className="px-3 py-2.5"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${r.status === 'Deducted' ? 'bg-green-100 text-green-700' : r.status === 'Partially Deducted' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{r.status}</span></td>
                      <td className="px-3 py-2.5 text-gray-400">{r.remarks || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
