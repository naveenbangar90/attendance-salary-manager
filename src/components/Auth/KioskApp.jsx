import React, { useCallback, useEffect, useState } from 'react';
import { Building2, LogOut } from 'lucide-react';
import CheckInStation, { nowTime } from '../Fingerprint/CheckInStation.jsx';
import { todayStr } from '../../utils/calculations.js';
import { kioskToday, kioskCheckIn, signOut } from '../../utils/remoteSync.js';

const REFRESH_MS = 60000;

// What the check-in-only login sees: the check-in station and nothing else. It never loads the
// app's data — the server gives it only active staff names and today's check-ins.
export default function KioskApp({ user }) {
  const [today, setToday] = useState({ companyName: '', employees: [], checkIns: [] });

  const load = useCallback(async () => {
    const res = await kioskToday(todayStr()).catch(() => null);
    if (res?.status === 200) setToday(res.body);
    else if (res?.status === 401) window.location.reload();
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const onMatch = async (employeeId, score) => {
    const res = await kioskCheckIn(employeeId, todayStr(), nowTime());
    if (res.status === 401) window.location.reload();
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    load();
    const { result, name, checkIn, status } = res.body;
    if (result === 'checked_in') return { tone: 'ok', title: `Welcome, ${name}`, detail: `Checked in at ${checkIn} · ${status} · match score ${Math.round(score)}` };
    if (result === 'already') return { tone: 'info', title: `${name}, you're already checked in`, detail: `Checked in at ${checkIn}` };
    return { tone: 'warn', title: 'Fingerprint belongs to an inactive or deleted employee', detail: name };
  };

  const out = async () => { if (await signOut()) window.location.reload(); };
  const checkIns = [...today.checkIns].sort((a, b) => b.checkIn.localeCompare(a.checkIn));

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg"><Building2 size={18} className="text-white" /></div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">{today.companyName || 'Attendance'}</p>
            <p className="text-xs text-gray-500">Check-in station · {user.username}</p>
          </div>
        </div>
        <button onClick={out} className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100">
          <LogOut size={16} /> Sign out
        </button>
      </header>
      <main className="p-4 sm:p-6 flex justify-center">
        <CheckInStation onMatch={onMatch} checkIns={checkIns} enrolHint="Ask the owner to enrol new staff." />
      </main>
    </div>
  );
}
