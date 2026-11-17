import React, { useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { todayStr } from '../utils/calculations.js';
import { applyScan, rulesOf, timesFor } from '../utils/attendanceRules.js';
import CheckInStation, { nowTime } from '../components/Fingerprint/CheckInStation.jsx';
import { scanMessage } from '../components/Fingerprint/scanMessage.js';

// Owner's check-in page (and the whole app offline): a scan is saved straight into the app's
// attendance. The check-in-only login uses the same station via the server (KioskApp).
export default function FingerprintCheckIn() {
  const { employees, attendance, settings, bulkSaveAttendance } = useApp();

  const live = useRef({ employees, attendance, settings });
  live.current = { employees, attendance, settings };

  const onMatch = async (employeeId, score) => {
    const { employees: emps, attendance: att, settings: s } = live.current;
    const emp = emps.find((e) => e.id === employeeId);
    if (!emp || emp.status !== 'Active') return scanMessage('inactive', { name: emp?.name }, {});
    const date = todayStr();
    const existing = att.find((a) => a.employeeId === emp.id && a.date === date);
    const { kind, patch } = applyScan(existing, emp, date, nowTime(), s);
    if (patch) bulkSaveAttendance([{ ...existing, ...patch, employeeId: emp.id, date }]);
    return scanMessage(kind, { name: emp.name, ...existing, ...patch }, timesFor(emp, rulesOf(s)), score);
  };

  const today = todayStr();
  const checkIns = useMemo(() => {
    const byId = new Map(employees.map((e) => [e.id, e]));
    return attendance
      .filter((a) => a.date === today && a.checkIn)
      .map((a) => ({ ...a, name: byId.get(a.employeeId)?.name || 'Unknown' }))
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  }, [attendance, employees, today]);

  return <CheckInStation onMatch={onMatch} checkIns={checkIns} enrolHint="Enrol staff from the Employees page." />;
}
