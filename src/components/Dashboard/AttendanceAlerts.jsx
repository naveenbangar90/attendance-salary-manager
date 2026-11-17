import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Clock, LogOut, UserX } from 'lucide-react';
import { todayStr, shiftDateStr } from '../../utils/calculations.js';
import { rulesOf, holidayOn, offStatusFor, lateSkipped, to12h, timesFor } from '../../utils/attendanceRules.js';

const nowHHMM = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

function Group({ icon: Icon, tone, title, people, empty, action }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <p className={`text-xs font-semibold flex items-center gap-1.5 ${tone}`}>
          <Icon size={13} /> {title} <span className="text-gray-400 font-normal">· {people.length}</span>
        </p>
        {action}
      </div>
      {people.length === 0 ? (
        <p className="text-xs text-gray-400">{empty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {people.map((p) => (
            <li key={p.key} className="text-xs bg-gray-50 border border-gray-200 rounded-md px-2 py-1">
              {p.name}{p.note && <span className="text-gray-400"> · {p.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Today at a glance under the automatic rules: who hasn't scanned (before the cut-off) or was
// marked absent (after it), who came late, and who forgot to scan out yesterday.
export default function AttendanceAlerts({ activeEmployees, attendance, settings, updateSettings, bulkSaveAttendance }) {
  const rules = useMemo(() => rulesOf(settings), [settings]);
  const [now, setNow] = useState(nowHHMM);
  useEffect(() => {
    const t = setInterval(() => setNow(nowHHMM()), 60000);
    return () => clearInterval(t);
  }, []);

  const today = todayStr();
  const yesterday = shiftDateStr(today, -1);
  const data = useMemo(() => {
    const rec = (id, d) => attendance.find((a) => a.employeeId === id && a.date === d);
    const notScanned = [], absent = [], late = [], noCheckout = [];
    for (const emp of activeEmployees) {
      const t = rec(emp.id, today);
      if (!t) {
        if (!offStatusFor(emp, today, rules)) notScanned.push({ key: emp.id, name: emp.name });
      } else if (t.status === 'Absent') {
        absent.push({ key: emp.id, name: emp.name, note: t.checkIn ? `came ${t.checkIn}` : t.auto ? 'no scan' : '' });
      }
      if (t?.late) late.push({ key: emp.id, name: emp.name, note: `${t.checkIn}, due by ${timesFor(emp, rules).lateAfter}` });
      const y = rec(emp.id, yesterday);
      if (y?.checkIn && !y.checkOut && y.status !== 'Absent') noCheckout.push({ key: emp.id, name: emp.name, note: `in ${y.checkIn}` });
    }
    const anyScan = attendance.some((a) => a.date === today && a.checkIn);
    return { notScanned, absent, late, noCheckout, anyScan };
  }, [activeEmployees, attendance, today, yesterday, rules]);

  const skipped = lateSkipped(today, rules);
  // Excuse everyone's lateness today: future scans aren't marked late, and late marks (and the
  // automatic late fine) already given today are removed. Undo only affects scans from then on.
  const toggleLateSkip = () => {
    const keepFrom = shiftDateStr(today, -60);
    const others = (rules.lateSkipDates || []).filter((d) => d !== today && d >= keepFrom);
    updateSettings({ ...settings, lateSkipDates: skipped ? others : [...others, today] });
    if (skipped) return;
    const fixes = attendance
      .filter((a) => a.date === today && a.late)
      .map((a) => ({ ...a, late: false, ...(a.lateFineAuto ? { lateFine: 0, lateFineAuto: false } : {}) }));
    if (fixes.length) bulkSaveAttendance(fixes);
  };
  const lateAction = (
    <button type="button" onClick={toggleLateSkip}
      className={`text-[11px] px-2 py-0.5 rounded-md border ${skipped ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
      {skipped ? 'Late marks off today · Undo' : 'Skip late marks today'}
    </button>
  );

  if (!rules.autoRules || activeEmployees.length === 0) return null;
  const pastCutoff = now >= rules.absentAfter;
  const holiday = holidayOn(today, rules);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-gray-700">Today's attendance alerts</h2>
        <span className="text-xs text-gray-400">Absent if no scan by {to12h(rules.absentAfter)}</span>
      </div>
      {holiday ? (
        <p className="text-sm text-pink-700 bg-pink-50 rounded-lg px-3 py-2">Today is a holiday{holiday.name ? `: ${holiday.name}` : ''}.</p>
      ) : pastCutoff && !data.anyScan ? (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-lg px-3 py-2 flex items-start gap-2">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          Nobody scanned today, so nobody was marked absent. If the shop was open, check the scanner and mark attendance by hand.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {pastCutoff
            ? <Group icon={UserX} tone="text-red-700" title="Absent today" people={data.absent} empty="Nobody is absent." />
            : <Group icon={UserX} tone="text-gray-700" title={`Not scanned yet (absent after ${to12h(rules.absentAfter)})`} people={data.notScanned} empty="Everyone has scanned." />}
          <Group icon={Clock} tone="text-amber-700" title="Late today" people={data.late}
            empty={skipped ? 'Late marks are switched off for today.' : 'Nobody was late.'} action={lateAction} />
        </div>
      )}
      <Group icon={LogOut} tone="text-gray-700" title="Didn't scan out yesterday" people={data.noCheckout} empty="Everyone scanned out yesterday." />
    </div>
  );
}
