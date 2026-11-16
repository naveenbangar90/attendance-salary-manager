import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Save, Search, Trash2, CalendarCheck, ChevronLeft, ChevronRight,
  MoreHorizontal, X, CheckCheck,
} from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import {
  todayStr, currentMonthKey, getShortDayName, getDayOfWeek,
  shiftDateStr, getMonthDates, formatMonthLabel, getMonthDayStats,
} from '../utils/calculations.js';

// ─── Status vocabulary ───────────────────────────────────────────────────────
// Every row in the active column starts pre-filled as Present (Weekly Off on Sundays), so
// only exceptions need touching. Pre-fills render dashed until saved, and the day banner
// counts how many are still untouched.
//
// UNMARKED ('') remains a real value — reachable via "… → Clear" — and saving a cleared cell
// deletes any existing record rather than leaving a stale status behind. Under the 30-day
// salary model an unmarked day pays the same as Present, so clearing costs nothing; it just
// means "no record was kept for this day".
const UNMARKED = '';

const STATUS = {
  'Present':      { code: 'P', label: 'Present',      cell: 'bg-green-100  text-green-800  border-green-300',  dot: 'bg-green-500'  },
  'Absent':       { code: 'A', label: 'Absent',       cell: 'bg-red-100    text-red-800    border-red-300',    dot: 'bg-red-500'    },
  'Half Day':     { code: 'H', label: 'Half Day',     cell: 'bg-yellow-100 text-yellow-800 border-yellow-300', dot: 'bg-yellow-500' },
  'Paid Leave':   { code: 'L', label: 'Paid Leave',   cell: 'bg-blue-100   text-blue-800   border-blue-300',   dot: 'bg-blue-500'   },
  'Weekly Off':   { code: 'W', label: 'Weekly Off',   cell: 'bg-purple-100 text-purple-800 border-purple-300', dot: 'bg-purple-500' },
  'Unpaid Leave': { code: 'U', label: 'Unpaid Leave', cell: 'bg-orange-100 text-orange-800 border-orange-300', dot: 'bg-orange-500' },
  'Overtime':     { code: 'O', label: 'Overtime',     cell: 'bg-indigo-100 text-indigo-800 border-indigo-300', dot: 'bg-indigo-500' },
};
const UNMARKED_CELL = 'bg-gray-50 text-gray-300 border-gray-200';

// The five used every day get their own buttons; U and O live behind "more" but stay
// fully reachable — both already participate in salary calculation.
const QUICK = ['Present', 'Absent', 'Half Day', 'Paid Leave', 'Weekly Off'];
const EXTRA = ['Unpaid Leave', 'Overtime'];
const ALL_STATUSES = [...QUICK, ...EXTRA];

const codeOf = (s) => (s && STATUS[s] ? STATUS[s].code : '–');
const cellClassOf = (s) => (s && STATUS[s] ? STATUS[s].cell : UNMARKED_CELL);

// ─── Suggestion rule ─────────────────────────────────────────────────────────
// Sundays pre-select Weekly Off, except for someone marked Absent on the adjacent
// Saturday or Monday, who pre-selects Absent. A suggestion renders OUTLINED rather than
// filled so it is visibly unconfirmed until the user saves.
const suggestFor = (date, empId, attendance) => {
  if (getDayOfWeek(date) !== 0) return UNMARKED;
  const sat = shiftDateStr(date, -1);
  const mon = shiftDateStr(date, 1);
  const adjacentAbsent = attendance.some(
    (a) => a.employeeId === empId && (a.date === sat || a.date === mon) && a.status === 'Absent'
  );
  return adjacentAbsent ? 'Absent' : 'Weekly Off';
};

// ─── Status picker shared by the desktop active column and the mobile list ───
function StatusPicker({ value, isSuggestion, onPick, onClear }) {
  const [showMore, setShowMore] = useState(false);
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1">
        {QUICK.map((s) => {
          const active = value === s;
          return (
            <button
              key={s}
              type="button"
              title={s}
              onClick={() => onPick(s)}
              className={`w-7 h-7 rounded-md text-xs font-bold border transition-colors ${
                active
                  ? (isSuggestion
                      // Outlined = suggested but not yet confirmed.
                      ? `bg-white border-dashed ${STATUS[s].cell.split(' ').filter((c) => c.startsWith('text-') || c.startsWith('border-')).join(' ')}`
                      : STATUS[s].cell)
                  : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {STATUS[s].code}
            </button>
          );
        })}
        <button
          type="button"
          title="More statuses"
          onClick={() => setShowMore((v) => !v)}
          className={`w-7 h-7 rounded-md border text-gray-500 transition-colors flex items-center justify-center ${
            EXTRA.includes(value) ? STATUS[value].cell : 'bg-white border-gray-200 hover:bg-gray-50'
          }`}
        >
          {EXTRA.includes(value) ? <span className="text-xs font-bold">{STATUS[value].code}</span> : <MoreHorizontal size={13} />}
        </button>
      </div>
      {showMore && (
        <div className="flex flex-wrap gap-1">
          {EXTRA.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => { onPick(s); setShowMore(false); }}
              className={`px-2 h-7 rounded-md text-[11px] font-medium border transition-colors ${
                value === s ? STATUS[s].cell : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {STATUS[s].code} · {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { onClear(); setShowMore(false); }}
            className="px-2 h-7 rounded-md text-[11px] font-medium border bg-white text-gray-500 border-gray-200 hover:bg-gray-50 flex items-center gap-1"
          >
            <X size={11} /> Clear
          </button>
        </div>
      )}
    </div>
  );
}

// Extra per-day inputs, shown only where they are relevant.
function DayExtras({ rec, settings, onChange, compact }) {
  const showOt = settings.overtimeEnabled && (rec.status === 'Overtime' || rec.status === 'Present' || rec.overtimeHours);
  const showFine = settings.lateFineEnabled && rec.status && rec.status !== 'Weekly Off';
  if (!showOt && !showFine && !rec.status) return null;
  const inp = 'border border-gray-300 rounded px-1.5 py-0.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-blue-400';
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${compact ? '' : 'mt-1.5'}`}>
      {showOt && (
        <label className="flex items-center gap-1 text-[10px] text-gray-500">
          OT
          <input type="number" min="0" step="0.5" value={rec.overtimeHours ?? ''}
            onChange={(e) => onChange({ overtimeHours: e.target.value })}
            className={`${inp} w-12`} placeholder="0" />
        </label>
      )}
      {showFine && (
        <label className="flex items-center gap-1 text-[10px] text-gray-500">
          Fine ₹
          <input type="number" min="0" value={rec.lateFine ?? ''}
            onChange={(e) => onChange({ lateFine: e.target.value })}
            className={`${inp} w-14`} placeholder="0" />
        </label>
      )}
      {rec.status && (
        <input type="text" value={rec.remarks ?? ''}
          onChange={(e) => onChange({ remarks: e.target.value })}
          className={`${inp} flex-1 min-w-[70px]`} placeholder="Remarks" />
      )}
    </div>
  );
}

export default function Attendance() {
  const {
    employees, attendance, settings,
    bulkSaveAttendance, deleteAttendance,
  } = useApp();

  const [tab, setTab] = useState('grid');                       // 'grid' | 'history'
  const [month, setMonth] = useState(currentMonthKey());
  const [search, setSearch] = useState('');
  const [activeDate, setActiveDate] = useState(null);
  const [draft, setDraft] = useState({});                       // empId → { status, suggested, overtimeHours, lateFine, remarks }
  const [deleteId, setDeleteId] = useState(null);
  const [historyMonth, setHistoryMonth] = useState(currentMonthKey());

  const today = todayStr();
  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'Active'), [employees]);
  const dates = useMemo(() => getMonthDates(month), [month]);

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim();
    return activeEmployees.filter(
      (e) => !q || e.name.toLowerCase().includes(q) || e.employeeCode?.toLowerCase().includes(q) || e.mobile?.includes(q)
    );
  }, [activeEmployees, search]);

  // employeeId_date → saved record
  const savedMap = useMemo(() => {
    const m = {};
    attendance.forEach((a) => { m[`${a.employeeId}_${a.date}`] = a; });
    return m;
  }, [attendance]);

  // date → how many ACTIVE employees are marked that day
  const markedCountByDate = useMemo(() => {
    const m = {};
    dates.forEach((d) => {
      m[d] = activeEmployees.reduce((n, e) => n + (savedMap[`${e.id}_${d}`] ? 1 : 0), 0);
    });
    return m;
  }, [dates, activeEmployees, savedMap]);

  const isFuture = useCallback((d) => d > today, [today]);

  // Default active column: the earliest day this month that isn't fully marked, or today,
  // whichever is earlier — and never a future date.
  useEffect(() => {
    const firstIncomplete = dates.find((d) => !isFuture(d) && (markedCountByDate[d] || 0) < activeEmployees.length);
    const lastUsable = [...dates].reverse().find((d) => !isFuture(d));
    const target = firstIncomplete || lastUsable || null;
    setActiveDate(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, activeEmployees.length]);

  // (Re)seed the draft whenever the active column changes: saved values win, otherwise the
  // Sunday suggestion, otherwise unmarked.
  useEffect(() => {
    if (!activeDate) { setDraft({}); return; }
    const next = {};
    activeEmployees.forEach((emp) => {
      const saved = savedMap[`${emp.id}_${activeDate}`];
      if (saved) {
        next[emp.id] = {
          status: saved.status || UNMARKED, suggested: false,
          overtimeHours: saved.overtimeHours || '', lateFine: saved.lateFine || '', remarks: saved.remarks || '',
        };
      } else {
        // Everyone starts Present — the normal case — so only the exceptions need touching.
        // Sundays still default to Weekly Off (or Absent next to an adjacent absence).
        // These are pre-fills, not confirmations, so they render dashed until saved.
        const s = suggestFor(activeDate, emp.id, attendance) || 'Present';
        next[emp.id] = { status: s, suggested: true, overtimeHours: '', lateFine: '', remarks: '' };
      }
    });
    setDraft(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDate, activeEmployees.length]);

  // Keep the mobile day-strip scrolled to whichever day is active, since Save Day advances it.
  const activeChipRef = React.useRef(null);
  useEffect(() => {
    activeChipRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeDate]);

  const patchDraft = useCallback((empId, patch) => {
    setDraft((p) => ({ ...p, [empId]: { ...p[empId], ...patch } }));
  }, []);

  // Picking a status confirms it — it is no longer a suggestion.
  const pickStatus = useCallback((empId, status) => patchDraft(empId, { status, suggested: false }), [patchDraft]);
  const clearStatus = useCallback((empId) => patchDraft(empId, { status: UNMARKED, suggested: false }), [patchDraft]);

  // Mark All applies to the ACTIVE column only, and only to rows visible after search.
  const markAllVisible = (status) => {
    setDraft((p) => {
      const next = { ...p };
      filteredEmployees.forEach((e) => { next[e.id] = { ...next[e.id], status, suggested: false }; });
      return next;
    });
  };

  const draftStats = useMemo(() => {
    // `onDefault` is the number nobody has looked at yet — the count worth showing now that
    // every row starts pre-filled. `cleared` are rows deliberately blanked out.
    let confirmed = 0, onDefault = 0, cleared = 0;
    filteredEmployees.forEach((e) => {
      const r = draft[e.id];
      if (!r?.status) cleared++;
      else if (r.suggested) onDefault++;
      else confirmed++;
    });
    return { confirmed, onDefault, cleared, marked: confirmed + onDefault };
  }, [draft, filteredEmployees]);

  const handleSaveDay = () => {
    if (!activeDate) return;
    const upserts = [];
    const clearKeys = [];
    filteredEmployees.forEach((emp) => {
      const r = draft[emp.id];
      const key = `${emp.id}_${activeDate}`;
      if (!r || !r.status) {
        // Explicitly cleared a previously-saved cell → remove it. Never invent a status.
        if (savedMap[key]) clearKeys.push(key);
        return;
      }
      upserts.push({
        employeeId: emp.id,
        date: activeDate,
        status: r.status,
        overtimeHours: parseFloat(r.overtimeHours || 0) || 0,
        lateFine: parseFloat(r.lateFine || 0) || 0,
        remarks: r.remarks || '',
      });
    });

    if (!upserts.length && !clearKeys.length) return;
    bulkSaveAttendance(upserts, clearKeys);

    // Advance to the next day that still needs work.
    const marked = new Set(upserts.map((u) => u.employeeId));
    const nextDate = dates.find((d) => {
      if (d <= activeDate || isFuture(d)) return false;
      const n = activeEmployees.reduce((acc, e) => acc + (savedMap[`${e.id}_${d}`] ? 1 : 0), 0);
      return n < activeEmployees.length;
    });
    if (nextDate) setActiveDate(nextDate);
    else if (marked.size) { /* month complete — stay put */ }
  };

  // Per-employee month summary (from SAVED records, not the draft).
  const rowSummary = useMemo(() => {
    const out = {};
    activeEmployees.forEach((emp) => {
      const recs = attendance.filter((a) => a.employeeId === emp.id && a.date.startsWith(month));
      out[emp.id] = getMonthDayStats(emp, recs, settings, month);
    });
    return out;
  }, [activeEmployees, attendance, month, settings]);

  const historyRecords = useMemo(
    () => attendance.filter((a) => a.date.startsWith(historyMonth)).sort((a, b) => b.date.localeCompare(a.date)),
    [attendance, historyMonth]
  );
  const getEmpName = (id) => employees.find((e) => e.id === id)?.name || 'Unknown';

  const monthIsFuture = month > currentMonthKey();

  // ── Cell renderers ────────────────────────────────────────────────────────
  const CollapsedCell = ({ emp, d }) => {
    const saved = savedMap[`${emp.id}_${d}`];
    const status = saved?.status || UNMARKED;
    const future = isFuture(d);
    return (
      <td className="p-0 border-b border-r border-gray-100">
        <button
          type="button"
          disabled={future}
          onClick={() => setActiveDate(d)}
          title={future ? 'Future date' : `${d} — ${status || 'Not marked'} (click to edit)`}
          className={`w-7 h-8 text-[11px] font-bold border-x-0 ${
            future ? 'bg-gray-50 text-gray-200 cursor-not-allowed' : `${cellClassOf(status)} hover:ring-2 hover:ring-blue-400 hover:ring-inset cursor-pointer`
          }`}
        >
          {future ? '' : codeOf(status)}
        </button>
      </td>
    );
  };

  const ActiveCell = ({ emp }) => {
    const rec = draft[emp.id] || { status: UNMARKED };
    return (
      <td className="p-2 border-b border-r-2 border-r-blue-400 border-gray-100 bg-blue-50/40 align-top">
        <StatusPicker
          value={rec.status}
          isSuggestion={rec.suggested}
          onPick={(s) => pickStatus(emp.id, s)}
          onClear={() => clearStatus(emp.id)}
        />
        <DayExtras rec={rec} settings={settings} onChange={(p) => patchDraft(emp.id, p)} />
      </td>
    );
  };

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[['grid', 'Mark Attendance'], ['history', 'Attendance History']].map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'grid' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap items-start sm:items-center">
            <div className="flex items-center gap-1">
              <button onClick={() => setMonth(shiftDateStr(`${month}-01`, -1).slice(0, 7))}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronLeft size={16} /></button>
              <input type="month" value={month} onChange={(e) => setMonth(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => setMonth(shiftDateStr(`${month}-28`, 7).slice(0, 7))}
                className="p-1.5 rounded-lg border border-gray-300 hover:bg-gray-50"><ChevronRight size={16} /></button>
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {activeDate && (
              <button onClick={handleSaveDay}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 shadow-sm whitespace-nowrap">
                <Save size={15} /> Save Day
              </button>
            )}
          </div>

          {/* Active-day banner + Mark All */}
          {activeDate && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
              <span className="text-sm font-semibold text-blue-900">
                {getShortDayName(activeDate)} {parseInt(activeDate.slice(-2), 10)} {formatMonthLabel(month)}
              </span>
              {getDayOfWeek(activeDate) === 0 && (
                <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-semibold rounded">SUNDAY</span>
              )}
              <span className="text-xs text-blue-700">
                {draftStats.marked} to save
                {draftStats.confirmed > 0 && <> · {draftStats.confirmed} changed</>}
                {draftStats.onDefault > 0 && <> · {draftStats.onDefault} on default</>}
                {draftStats.cleared > 0 && <> · {draftStats.cleared} cleared</>}
              </span>
              <span className="hidden sm:inline text-xs text-blue-400">|</span>
              <span className="text-xs text-blue-700 font-medium">Mark all visible:</span>
              <div className="flex gap-1">
                {QUICK.map((s) => (
                  <button key={s} onClick={() => markAllVisible(s)} title={`Mark all ${s}`}
                    className={`w-6 h-6 rounded text-[11px] font-bold border ${STATUS[s].cell} hover:ring-2 hover:ring-blue-400`}>
                    {STATUS[s].code}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Legend */}
          <div className="flex flex-wrap gap-2 text-[11px] text-gray-500">
            {ALL_STATUSES.map((s) => (
              <span key={s} className="flex items-center gap-1">
                <span className={`w-4 h-4 rounded border text-[9px] font-bold flex items-center justify-center ${STATUS[s].cell}`}>{STATUS[s].code}</span>
                {s}
              </span>
            ))}
            <span className="flex items-center gap-1">
              <span className={`w-4 h-4 rounded border text-[9px] font-bold flex items-center justify-center ${UNMARKED_CELL}`}>–</span>
              Not marked
            </span>
            <span className="flex items-center gap-1 text-gray-400">
              <span className="w-4 h-4 rounded border border-dashed border-gray-400 bg-white" /> dashed = still on the default, not yet reviewed
            </span>
          </div>

          {monthIsFuture && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg px-3 py-2">
              This month is in the future — attendance can only be marked up to today.
            </div>
          )}

          {filteredEmployees.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No active employees" description="Add active employees, or clear the search." />
          ) : (
            <>
              {/* ── Desktop: month grid ─────────────────────────────────── */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="border-separate border-spacing-0 text-sm">
                  <thead>
                    <tr>
                      <th className="sticky left-0 z-20 bg-gray-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-500 min-w-[150px]">
                        Employee
                      </th>
                      {dates.map((d) => {
                        const sunday = getDayOfWeek(d) === 0;
                        const active = d === activeDate;
                        const future = isFuture(d);
                        return (
                          <th key={d}
                            className={`border-b border-r border-gray-200 px-0 py-1 text-center align-bottom ${
                              active ? 'bg-blue-100 border-r-2 border-r-blue-400 min-w-[190px]'
                                     : sunday ? 'bg-purple-50 w-7' : future ? 'bg-gray-50 w-7' : 'bg-gray-50 w-7'
                            }`}>
                            <div className={`text-[9px] uppercase leading-none ${sunday ? 'text-purple-600 font-bold' : 'text-gray-400'}`}>
                              {getShortDayName(d).slice(0, 1)}
                            </div>
                            <div className={`text-[11px] font-semibold leading-tight ${
                              active ? 'text-blue-800' : sunday ? 'text-purple-700' : future ? 'text-gray-300' : 'text-gray-600'
                            }`}>
                              {parseInt(d.slice(-2), 10)}
                            </div>
                          </th>
                        );
                      })}
                      <th className="sticky right-0 z-20 bg-gray-50 border-b border-l-2 border-l-gray-300 border-gray-200 px-2 py-2 text-center text-xs font-semibold text-gray-500 min-w-[132px]">
                        Month summary
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEmployees.map((emp) => {
                      const s = rowSummary[emp.id] || {};
                      return (
                        <tr key={emp.id} className="hover:bg-gray-50/60">
                          <td className="sticky left-0 z-10 bg-white border-b border-r border-gray-200 px-3 py-1.5 whitespace-nowrap">
                            <p className="font-medium text-gray-800 text-[13px] leading-tight">{emp.name}</p>
                            <p className="text-[10px] text-gray-400">{emp.employeeCode}</p>
                          </td>
                          {dates.map((d) =>
                            d === activeDate
                              ? <ActiveCell key={d} emp={emp} />
                              : <CollapsedCell key={d} emp={emp} d={d} />
                          )}
                          <td className="sticky right-0 z-10 bg-white border-b border-l-2 border-l-gray-300 border-gray-200 px-2 py-1.5">
                            <div className="flex items-center justify-center gap-1 text-[10px]">
                              {[['Present', s.presentDays], ['Absent', s.absentDays], ['Half Day', s.halfDays], ['Paid Leave', s.paidLeaveDays], ['Weekly Off', s.weeklyOffDays]].map(([k, v]) => (
                                <span key={k} title={k}
                                  className={`w-5 h-5 rounded flex items-center justify-center font-semibold ${v ? STATUS[k].cell : 'bg-gray-50 text-gray-300 border border-gray-200'}`}>
                                  {v || 0}
                                </span>
                              ))}
                            </div>
                            <p className="text-[10px] text-center text-gray-500 mt-0.5">
                              <span className="font-bold text-gray-800">{(s.paidDays ?? 0).toFixed(1)}</span> paid days
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className="sticky left-0 z-10 bg-gray-50 border-t border-r border-gray-200 px-3 py-1.5 text-[10px] font-semibold text-gray-500">
                        Marked / total
                      </td>
                      {dates.map((d) => {
                        const n = markedCountByDate[d] || 0;
                        const total = activeEmployees.length;
                        const future = isFuture(d);
                        const complete = !future && total > 0 && n >= total;
                        return (
                          <td key={d}
                            className={`border-t border-r border-gray-200 text-center text-[9px] font-semibold py-1 ${
                              d === activeDate ? 'bg-blue-100 border-r-2 border-r-blue-400 text-blue-800'
                                : future ? 'bg-gray-50 text-gray-300'
                                : complete ? 'bg-green-50 text-green-700'
                                : n > 0 ? 'bg-yellow-50 text-yellow-700'
                                : 'bg-gray-50 text-gray-400'
                            }`}
                            title={future ? 'Future date' : `${n} of ${total} marked, ${Math.max(0, total - n)} unmarked`}>
                            {future ? '' : d === activeDate ? `${n}/${total} saved` : complete ? <CheckCheck size={10} className="inline" /> : n}
                          </td>
                        );
                      })}
                      <td className="sticky right-0 z-10 bg-gray-50 border-t border-l-2 border-l-gray-300 border-gray-200" />
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Mobile: day strip + single-column list ──────────────── */}
              <div className="md:hidden space-y-3">
                {/* Compact month strip so a past day is still reachable */}
                <div className="bg-white rounded-xl border border-gray-200 p-2 overflow-x-auto">
                  <div className="flex gap-1">
                    {dates.map((d) => {
                      const isActive = d === activeDate;
                      const future = isFuture(d);
                      const n = markedCountByDate[d] || 0;
                      const complete = !future && activeEmployees.length > 0 && n >= activeEmployees.length;
                      const active = isActive;
                      return (
                        <button key={d} disabled={future} onClick={() => setActiveDate(d)}
                          // Keep the active day in view when the column advances on save.
                          ref={active ? activeChipRef : undefined}
                          className={`flex-shrink-0 w-8 rounded-md py-1 text-center border transition-colors ${
                            active ? 'bg-blue-600 text-white border-blue-600'
                              : future ? 'bg-gray-50 text-gray-200 border-gray-100 cursor-not-allowed'
                              : complete ? 'bg-green-50 text-green-700 border-green-200'
                              : 'bg-white text-gray-600 border-gray-200'
                          }`}>
                          <div className="text-[8px] uppercase leading-none opacity-70">{getShortDayName(d).slice(0, 1)}</div>
                          <div className="text-[11px] font-bold leading-tight">{parseInt(d.slice(-2), 10)}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeDate && filteredEmployees.map((emp) => {
                  const rec = draft[emp.id] || { status: UNMARKED };
                  const s = rowSummary[emp.id] || {};
                  return (
                    <div key={emp.id} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{emp.name}</p>
                          <p className="text-[10px] text-gray-400">
                            {emp.employeeCode} · {(s.paidDays ?? 0).toFixed(1)} paid days this month
                          </p>
                        </div>
                        <span className={`w-7 h-7 flex-shrink-0 rounded-md border text-xs font-bold flex items-center justify-center ${
                          rec.suggested ? 'bg-white border-dashed border-purple-400 text-purple-600' : cellClassOf(rec.status)
                        }`}>
                          {codeOf(rec.status)}
                        </span>
                      </div>
                      <StatusPicker value={rec.status} isSuggestion={rec.suggested}
                        onPick={(st) => pickStatus(emp.id, st)} onClear={() => clearStatus(emp.id)} />
                      <DayExtras rec={rec} settings={settings} onChange={(p) => patchDraft(emp.id, p)} />
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'history' && (
        <div className="space-y-4">
          <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {historyRecords.length === 0 ? (
            <EmptyState icon={CalendarCheck} title="No records" description="No attendance records for this month." />
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {['Date', 'Day', 'Employee', 'Status', 'OT Hrs', 'Late Fine', 'Remarks', ''].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {historyRecords.map((rec) => (
                    <tr key={rec.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-600">{rec.date}</td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className={`px-2 py-0.5 rounded-full font-medium ${getDayOfWeek(rec.date) === 0 ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                          {getShortDayName(rec.date)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 font-medium">{getEmpName(rec.employeeId)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cellClassOf(rec.status)}`}>{rec.status}</span>
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
