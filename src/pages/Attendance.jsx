import React, { useState, useMemo, useCallback } from 'react';
import { Save, Search, Edit2, Trash2, CalendarCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { todayStr } from '../utils/calculations.js';

const STATUSES = ['Present', 'Absent', 'Half Day', 'Paid Leave', 'Unpaid Leave', 'Weekly Off', 'Overtime'];
const STATUS_COLORS = {
  Present: 'bg-green-100 text-green-700 border-green-300',
  Absent: 'bg-red-100 text-red-700 border-red-300',
  'Half Day': 'bg-yellow-100 text-yellow-700 border-yellow-300',
  'Paid Leave': 'bg-blue-100 text-blue-700 border-blue-300',
  'Unpaid Leave': 'bg-orange-100 text-orange-700 border-orange-300',
  'Weekly Off': 'bg-purple-100 text-purple-700 border-purple-300',
  Overtime: 'bg-indigo-100 text-indigo-700 border-indigo-300',
};

function ShiftDate({ date, setDate }) {
  const shift = (n) => {
    const d = new Date(date); d.setDate(d.getDate() + n);
    setDate(d.toISOString().slice(0, 10));
  };
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => shift(-1)} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronLeft size={16} /></button>
      <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      <button onClick={() => shift(1)} className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronRight size={16} /></button>
    </div>
  );
}

export default function Attendance() {
  const { employees, attendance, settings, bulkSaveAttendance, updateAttendance, deleteAttendance, showToast } = useApp();
  const [date, setDate] = useState(todayStr());
  const [search, setSearch] = useState('');
  const [markAll, setMarkAll] = useState('');
  const [localRecords, setLocalRecords] = useState({});  // employeeId → {status, overtimeHours, lateFine, remarks}
  const [editMode, setEditMode] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [tab, setTab] = useState('mark'); // 'mark' | 'history'
  const [historyMonth, setHistoryMonth] = useState(date.slice(0, 7));

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees]);

  // Records already saved for this date
  const savedForDate = useMemo(() =>
    attendance.filter((a) => a.date === date),
  [attendance, date]);

  const savedMap = useMemo(() =>
    Object.fromEntries(savedForDate.map((a) => [a.employeeId, a])),
  [savedForDate]);

  // Init local state when date changes
  React.useEffect(() => {
    const init = {};
    activeEmployees.forEach((emp) => {
      const saved = savedMap[emp.id];
      init[emp.id] = saved
        ? { status: saved.status, overtimeHours: saved.overtimeHours || '', lateFine: saved.lateFine || '', remarks: saved.remarks || '' }
        : { status: 'Present', overtimeHours: '', lateFine: '', remarks: '' };
    });
    setLocalRecords(init);
    setMarkAll('');
    setEditMode(false);
  }, [date, JSON.stringify(savedMap)]);

  const updateLocal = useCallback((empId, field, value) => {
    setLocalRecords((p) => ({ ...p, [empId]: { ...p[empId], [field]: value } }));
  }, []);

  const applyMarkAll = (status) => {
    setMarkAll(status);
    setLocalRecords((p) => {
      const next = { ...p };
      filteredEmployees.forEach((emp) => { next[emp.id] = { ...next[emp.id], status }; });
      return next;
    });
  };

  const handleSave = () => {
    const records = activeEmployees.map((emp) => ({
      employeeId: emp.id,
      date,
      status: localRecords[emp.id]?.status || 'Present',
      overtimeHours: parseFloat(localRecords[emp.id]?.overtimeHours || 0),
      lateFine: parseFloat(localRecords[emp.id]?.lateFine || 0),
      remarks: localRecords[emp.id]?.remarks || '',
    }));
    bulkSaveAttendance(records);
    setEditMode(false);
  };

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase();
    return activeEmployees.filter((e) => !q || e.name.toLowerCase().includes(q) || e.mobile?.includes(q));
  }, [activeEmployees, search]);

  // History tab
  const historyRecords = useMemo(() => {
    return attendance
      .filter((a) => a.date.startsWith(historyMonth))
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendance, historyMonth]);

  const getEmpName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';

  const isSaved = savedForDate.length > 0;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {['mark', 'history'].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'mark' ? 'Mark Attendance' : 'Attendance History'}
          </button>
        ))}
      </div>

      {tab === 'mark' && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center flex-wrap">
            <ShiftDate date={date} setDate={setDate} />
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {(isSaved && !editMode) && (
              <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-3 py-2 border border-blue-300 text-blue-600 text-sm rounded-lg hover:bg-blue-50">
                <Edit2 size={14} /> Edit
              </button>
            )}
          </div>

          {/* Mark All */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs text-gray-500 font-medium">Mark All:</span>
            {['Present', 'Absent', 'Weekly Off', 'Paid Leave'].map((s) => (
              <button key={s} onClick={() => applyMarkAll(s)}
                className={`px-3 py-1 text-xs rounded-full border font-medium transition-colors ${markAll === s ? STATUS_COLORS[s] : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {s}
              </button>
            ))}
          </div>

          {/* Status badge */}
          {isSaved && !editMode && (
            <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2 text-sm text-green-700 flex items-center gap-2">
              <CalendarCheck size={14} /> Attendance saved for this date. Click Edit to modify.
            </div>
          )}

          {/* Employee List */}
          {filteredEmployees.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No active employees" description="Add active employees first." />
          ) : (
            <div className="space-y-2">
              {filteredEmployees.map((emp) => {
                const rec = localRecords[emp.id] || { status: 'Present' };
                const disabled = isSaved && !editMode;
                return (
                  <div key={emp.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                      {/* Employee info */}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">{emp.name}</p>
                        <p className="text-xs text-gray-400">{emp.employeeCode} · {emp.role}</p>
                      </div>
                      {/* Status buttons */}
                      <div className="flex flex-wrap gap-1.5">
                        {STATUSES.map((s) => (
                          <button key={s} disabled={disabled}
                            onClick={() => updateLocal(emp.id, 'status', s)}
                            className={`px-2.5 py-1 text-xs rounded-full border font-medium transition-colors disabled:opacity-50 disabled:cursor-default ${rec.status === s ? STATUS_COLORS[s] : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                            {s}
                          </button>
                        ))}
                      </div>
                    </div>
                    {/* Extra fields for Overtime or fine */}
                    {(['Overtime', 'Present'].includes(rec.status) || rec.overtimeHours) && (
                      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-100">
                        {settings.overtimeEnabled && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">OT Hours</label>
                            <input type="number" min="0" step="0.5" disabled={disabled}
                              value={rec.overtimeHours} onChange={(e) => updateLocal(emp.id, 'overtimeHours', e.target.value)}
                              className="w-16 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder="0" />
                          </div>
                        )}
                        {settings.lateFineEnabled && (
                          <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-500">Late Fine ₹</label>
                            <input type="number" min="0" disabled={disabled}
                              value={rec.lateFine} onChange={(e) => updateLocal(emp.id, 'lateFine', e.target.value)}
                              className="w-20 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder="0" />
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-1">
                          <label className="text-xs text-gray-500">Remarks</label>
                          <input type="text" disabled={disabled}
                            value={rec.remarks} onChange={(e) => updateLocal(emp.id, 'remarks', e.target.value)}
                            className="flex-1 min-w-0 border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none" placeholder="Optional remarks" />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {(!isSaved || editMode) && filteredEmployees.length > 0 && (
            <div className="flex gap-3 justify-end sticky bottom-20 lg:bottom-4">
              {editMode && <button onClick={() => setEditMode(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 bg-white shadow-sm">Cancel</button>}
              <button onClick={handleSave} className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 shadow-md">
                <Save size={16} /> Save Attendance
              </button>
            </div>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          {historyRecords.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No records" description="No attendance records for this month." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Date', 'Employee', 'Status', 'OT Hrs', 'Late Fine', 'Remarks', 'Actions'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{rec.date}</td>
                      <td className="px-4 py-2.5 font-medium">{getEmpName(rec.employeeId)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[rec.status] || 'bg-gray-100 text-gray-600'}`}>{rec.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{rec.overtimeHours || 0}</td>
                      <td className="px-4 py-2.5 text-gray-500">{rec.lateFine ? `₹${rec.lateFine}` : '—'}</td>
                      <td className="px-4 py-2.5 text-gray-400 max-w-32 truncate">{rec.remarks || '—'}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => setDeleteId(rec.id)} className="p-1 rounded hover:bg-red-50 text-red-400"><Trash2 size={13} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteId} title="Delete Record" message="Delete this attendance record?"
        onConfirm={() => { deleteAttendance(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)} />
    </div>
  );
}
