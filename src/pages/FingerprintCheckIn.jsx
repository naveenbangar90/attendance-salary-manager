import React, { useMemo, useRef } from 'react';
import { useApp } from '../context/AppContext.jsx';
import { todayStr } from '../utils/calculations.js';
import { checkInRecord } from '../utils/fingerprint.js';
import CheckInStation, { nowTime } from '../components/Fingerprint/CheckInStation.jsx';

// Owner's check-in page (and the whole app offline): a match is saved straight into the app's
// attendance. The check-in-only login uses the same station via the server (KioskApp).
export default function FingerprintCheckIn() {
  const { employees, attendance, bulkSaveAttendance } = useApp();

  const live = useRef({ employees, attendance });
  live.current = { employees, attendance };

  const onMatch = async (employeeId, score) => {
    const { employees: emps, attendance: att } = live.current;
    const emp = emps.find((e) => e.id === employeeId);
    if (!emp || emp.status !== 'Active') {
      return { tone: 'warn', title: 'Fingerprint belongs to an inactive or deleted employee', detail: emp?.name || '' };
    }
    const date = todayStr();
    const existing = att.find((a) => a.employeeId === emp.id && a.date === date);
    const rec = checkInRecord(existing, emp.id, date, nowTime());
    if (!rec) return { tone: 'info', title: `${emp.name}, you're already checked in`, detail: `Checked in at ${existing.checkIn}` };
    bulkSaveAttendance([rec]);
    return { tone: 'ok', title: `Welcome, ${emp.name}`, detail: `Checked in at ${rec.checkIn} · ${rec.status} · match score ${Math.round(score)}` };
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
