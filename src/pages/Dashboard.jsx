import React, { useMemo } from 'react';
import { Users, UserCheck, UserX, IndianRupee, CreditCard, TrendingDown, Database } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import StatCard from '../components/Common/StatCard.jsx';
import { formatCurrency, todayStr, currentMonthKey, calculateSalary, getAttendanceStats } from '../utils/calculations.js';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const { employees, attendance, advances, settings, loadSampleData } = useApp();
  const navigate = useNavigate();
  const today = todayStr();
  const month = currentMonthKey();

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees]);

  const todayAttendance = useMemo(() => attendance.filter((a) => a.date === today), [attendance, today]);
  const presentToday = todayAttendance.filter((a) => ['Present', 'Paid Leave', 'Half Day'].includes(a.status)).length;
  const absentToday  = todayAttendance.filter((a) => a.status === 'Absent').length;
  const notMarked    = activeEmployees.length - todayAttendance.length;

  const totalPendingAdvance = useMemo(() =>
    advances.filter((a) => a.status !== 'Deducted').reduce((s, a) => s + parseFloat(a.remainingAmount || 0), 0),
  [advances]);

  const monthAdvanceDeducted = useMemo(() =>
    advances.filter((a) => a.status === 'Deducted' && a.date?.startsWith(month))
      .reduce((s, a) => s + parseFloat(a.deductedAmount || 0), 0),
  [advances, month]);

  // Rough total salary payable this month
  const totalSalaryPayable = useMemo(() => {
    return activeEmployees.reduce((sum, emp) => {
      const empAtt = attendance.filter((a) => a.employeeId === emp.id && a.date?.startsWith(month));
      const { paidDays } = getAttendanceStats(empAtt, settings);
      const daily = emp.monthlySalary / settings.totalWorkingDays;
      return sum + daily * paidDays;
    }, 0);
  }, [activeEmployees, attendance, settings, month]);

  // Chart data — last 7 days attendance
  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' });
      const dayRecs = attendance.filter((a) => a.date === key);
      days.push({
        date: label,
        Present: dayRecs.filter((a) => a.status === 'Present').length,
        Absent:  dayRecs.filter((a) => a.status === 'Absent').length,
        Leave:   dayRecs.filter((a) => ['Paid Leave', 'Unpaid Leave'].includes(a.status)).length,
      });
    }
    return days;
  }, [attendance]);

  // Today's attendance list
  const todayList = useMemo(() => {
    return activeEmployees.map((emp) => {
      const rec = todayAttendance.find((a) => a.employeeId === emp.id);
      return { ...emp, todayStatus: rec?.status || 'Not Marked' };
    });
  }, [activeEmployees, todayAttendance]);

  const recentAdvances = useMemo(() =>
    [...advances].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5),
  [advances]);

  const getEmpName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';

  const statusColor = (s) => {
    const map = { Present: 'bg-green-100 text-green-700', Absent: 'bg-red-100 text-red-700', 'Half Day': 'bg-yellow-100 text-yellow-700', 'Paid Leave': 'bg-blue-100 text-blue-700', 'Weekly Off': 'bg-purple-100 text-purple-700', 'Unpaid Leave': 'bg-orange-100 text-orange-700', 'Not Marked': 'bg-gray-100 text-gray-500' };
    return map[s] || 'bg-gray-100 text-gray-500';
  };

  const hasData = employees.length > 0;

  return (
    <div className="space-y-6">
      {!hasData && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="font-semibold text-blue-800">Welcome! No data yet.</p>
            <p className="text-sm text-blue-600">Load sample data to explore the app, or add your first employee.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={loadSampleData} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
              <Database size={14} /> Load Sample Data
            </button>
            <button onClick={() => navigate('/employees')} className="px-4 py-2 bg-white border border-blue-300 text-blue-700 text-sm rounded-lg hover:bg-blue-50">
              Add Employee
            </button>
          </div>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard title="Active Employees"       value={activeEmployees.length}           icon={Users}        color="blue"   onClick={() => navigate('/employees')} />
        <StatCard title="Present Today"          value={presentToday}                     icon={UserCheck}    color="green"  onClick={() => navigate('/attendance')} />
        <StatCard title="Absent Today"           value={absentToday}                      icon={UserX}        color="red"    onClick={() => navigate('/attendance')} />
        <StatCard title="Not Marked Today"       value={notMarked}                        icon={UserX}        color="yellow" onClick={() => navigate('/attendance')} />
        <StatCard title="Salary Payable (MTD)"   value={formatCurrency(totalSalaryPayable)} icon={IndianRupee} color="indigo" onClick={() => navigate('/salary')} />
        <StatCard title="Pending Advance"        value={formatCurrency(totalPendingAdvance)} icon={CreditCard} color="purple" onClick={() => navigate('/advances')} />
      </div>

      {/* Charts + Today's Attendance */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* 7-day chart */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Attendance — Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barSize={10}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Bar dataKey="Present" fill="#22c55e" radius={[3,3,0,0]} />
              <Bar dataKey="Absent"  fill="#ef4444" radius={[3,3,0,0]} />
              <Bar dataKey="Leave"   fill="#f59e0b" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Today's attendance */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Today's Attendance</h2>
            <button onClick={() => navigate('/attendance')} className="text-xs text-blue-600 hover:underline">Mark Attendance →</button>
          </div>
          <div className="overflow-y-auto flex-1 max-h-56 scrollbar-thin">
            {todayList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No active employees</p>
            ) : todayList.map((emp) => (
              <div key={emp.id} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 border-b border-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                  <p className="text-xs text-gray-400">{emp.employeeCode}</p>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(emp.todayStatus)}`}>{emp.todayStatus}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Advances + Pending Advances */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Recent Advances</h2>
            <button onClick={() => navigate('/advances')} className="text-xs text-blue-600 hover:underline">View All →</button>
          </div>
          <div className="divide-y divide-gray-50">
            {recentAdvances.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No advances yet</p>
            ) : recentAdvances.map((adv) => (
              <div key={adv.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{getEmpName(adv.employeeId)}</p>
                  <p className="text-xs text-gray-400">{adv.date} · {adv.paymentMode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-800">{formatCurrency(adv.amount)}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${adv.status === 'Deducted' ? 'bg-green-100 text-green-700' : adv.status === 'Partially Deducted' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{adv.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Pending advances summary */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between p-5 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Employees with Pending Advance</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {activeEmployees.filter((emp) => {
              const pending = advances.filter((a) => a.employeeId === emp.id && a.status !== 'Deducted');
              return pending.length > 0;
            }).length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No pending advances</p>
            ) : activeEmployees.filter((emp) => {
              return advances.some((a) => a.employeeId === emp.id && a.status !== 'Deducted');
            }).map((emp) => {
              const pending = advances.filter((a) => a.employeeId === emp.id && a.status !== 'Deducted')
                .reduce((s, a) => s + parseFloat(a.remainingAmount || 0), 0);
              return (
                <div key={emp.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.role}</p>
                  </div>
                  <p className="text-sm font-semibold text-red-600">{formatCurrency(pending)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
