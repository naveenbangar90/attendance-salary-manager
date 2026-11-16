import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Fingerprint, Play, Square, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import { todayStr } from '../utils/calculations.js';
import {
  fingerprintStatus, identifyFinger, cancelScan, describeError, checkInRecord,
} from '../utils/fingerprint.js';

const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const TONES = {
  ok:    { cls: 'bg-green-50 border-green-200 text-green-800', Icon: CheckCircle2 },
  info:  { cls: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Clock },
  warn:  { cls: 'bg-amber-50 border-amber-200 text-amber-800', Icon: AlertTriangle },
  error: { cls: 'bg-red-50 border-red-200 text-red-800', Icon: XCircle },
};

// Kiosk: leave this page open on the Mac next to the scanner. Each touch identifies the employee
// and marks them present for today with their check-in time.
export default function FingerprintCheckIn() {
  const { employees, attendance, bulkSaveAttendance } = useApp();
  const [service, setService] = useState(null); // status payload, or { ok: false }
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);   // { tone, title, detail }

  // The scan loop outlives renders, so it reads the latest data through refs.
  const live = useRef({ employees, attendance });
  live.current = { employees, attendance };
  const runningRef = useRef(false);

  const refresh = useCallback(async () => setService(await fingerprintStatus()), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (runningRef.current) { runningRef.current = false; cancelScan(); } }, []);

  const handleMatch = (employeeId, score) => {
    const { employees: emps, attendance: att } = live.current;
    const emp = emps.find((e) => e.id === employeeId);
    if (!emp || emp.status !== 'Active') {
      setResult({ tone: 'warn', title: 'Fingerprint belongs to an inactive or deleted employee', detail: emp?.name || '' });
      return;
    }
    const date = todayStr();
    const existing = att.find((a) => a.employeeId === emp.id && a.date === date);
    const rec = checkInRecord(existing, emp.id, date, nowTime());
    if (!rec) {
      setResult({ tone: 'info', title: `${emp.name}, you're already checked in`, detail: `Checked in at ${existing.checkIn}` });
      return;
    }
    bulkSaveAttendance([rec]);
    setResult({ tone: 'ok', title: `Welcome, ${emp.name}`, detail: `Checked in at ${rec.checkIn} · ${rec.status} · match score ${Math.round(score)}` });
  };

  const start = async () => {
    runningRef.current = true;
    setRunning(true);
    setResult(null);
    let tentative = null; // a borderline press waiting for a confirming second press
    while (runningRef.current) {
      const res = await identifyFinger(20, tentative);
      if (!runningRef.current) break;
      tentative = null;
      if (res.ok) {
        if (res.employeeId) handleMatch(res.employeeId, res.score);
        else if (res.tentative) {
          tentative = res.tentative;
          setResult({ tone: 'info', title: 'Almost — press once more', detail: 'Lift your finger and press it flat again to confirm.' });
        } else setResult({ tone: 'error', title: 'Not recognised', detail: 'Lift your finger and press it flat again, or ask to be enrolled.' });
      } else if (res.error === 'poor_quality') {
        setResult({ tone: 'warn', title: 'Press more firmly', detail: describeError(res.error) });
      } else if (res.error !== 'timeout') {
        if (res.error !== 'cancelled') setResult({ tone: 'error', title: 'Scanner problem', detail: describeError(res.error) });
        break;
      }
    }
    runningRef.current = false;
    setRunning(false);
    refresh();
  };

  const stop = () => {
    runningRef.current = false;
    setRunning(false);
    cancelScan();
  };

  const today = todayStr();
  const checkIns = useMemo(() => {
    const byId = new Map(employees.map((e) => [e.id, e]));
    return attendance
      .filter((a) => a.date === today && a.checkIn)
      .map((a) => ({ ...a, name: byId.get(a.employeeId)?.name || 'Unknown' }))
      .sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  }, [attendance, employees, today]);

  const enrolledCount = service?.ok ? Object.keys(service.enrolled).length : 0;
  const offline = service && !service.ok;
  const tone = result && TONES[result.tone];

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fingerprint check-in</h2>
            <p className="text-sm text-gray-500">
              {offline ? 'Fingerprint service is not running.'
                : !service ? 'Connecting…'
                : !service.scanner ? 'Scanner not connected — check the USB cable.'
                : `${enrolledCount} employee${enrolledCount === 1 ? '' : 's'} enrolled. Enrol staff from the Employees page.`}
            </p>
          </div>
          {running ? (
            <button onClick={stop} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-900">
              <Square size={16} /> Stop
            </button>
          ) : (
            <button
              onClick={start}
              disabled={!service?.ok || !service.scanner || enrolledCount === 0}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={16} /> Start check-in
            </button>
          )}
        </div>

        {offline && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            Start it with <code>~/NBio/start-fingerprint.sh</code>, then{' '}
            <button onClick={refresh} className="underline">check again</button>.
          </p>
        )}

        <div className="mt-6 flex flex-col items-center text-center gap-3 py-6">
          <Fingerprint size={72} className={running ? 'text-blue-500 animate-pulse' : 'text-gray-300'} />
          <p className="text-gray-600">{running ? 'Place your finger on the scanner' : 'Press Start to begin taking check-ins'}</p>
          {result && (
            <div className={`w-full flex items-start gap-3 border rounded-xl px-4 py-3 text-left ${tone.cls}`}>
              <tone.Icon size={22} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-lg leading-tight">{result.title}</p>
                {result.detail && <p className="text-sm opacity-80 mt-0.5">{result.detail}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-800">Today's check-ins</h3>
          <span className="text-xs text-gray-400">{checkIns.length}</span>
        </div>
        {checkIns.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No fingerprint check-ins yet today.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {checkIns.map((a) => (
              <li key={a.employeeId} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{a.name}</span>
                <span className="text-gray-500 tabular-nums">{a.checkIn} · {a.status}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
