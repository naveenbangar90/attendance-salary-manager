import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, Play, Square, CheckCircle2, AlertTriangle, XCircle, Clock, Volume2, VolumeX } from 'lucide-react';
import { fingerprintStatus, identifyFinger, cancelScan, describeError } from '../../utils/fingerprint.js';
import { speak, voiceEnabled, setVoiceEnabled } from '../../utils/speech.js';

export const nowTime = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const TONES = {
  ok:    { cls: 'bg-green-50 border-green-200 text-green-800', Icon: CheckCircle2 },
  info:  { cls: 'bg-blue-50 border-blue-200 text-blue-800', Icon: Clock },
  warn:  { cls: 'bg-amber-50 border-amber-200 text-amber-800', Icon: AlertTriangle },
  error: { cls: 'bg-red-50 border-red-200 text-red-800', Icon: XCircle },
};

// The fingerprint check-in screen: runs the scan loop and shows the outcome. What a match does
// is up to the caller — `onMatch(employeeId, score)` records the check-in and resolves to the
// message to show ({ tone, title, detail, say }); `say` is spoken aloud. `checkIns` is today's list ({ employeeId, name,
// checkIn, checkOut, late, status }).
export default function CheckInStation({ onMatch, checkIns, enrolHint }) {
  const [service, setService] = useState(null); // status payload, or { ok: false }
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);   // { tone, title, detail, say }
  const [voice, setVoice] = useState(voiceEnabled);

  const show = (r) => {
    setResult(r);
    speak(r.say);
  };
  const toggleVoice = () => {
    setVoiceEnabled(!voice);
    setVoice(!voice);
  };

  // The scan loop outlives renders, so it calls the latest onMatch through a ref.
  const onMatchRef = useRef(onMatch);
  onMatchRef.current = onMatch;
  const runningRef = useRef(false);

  const refresh = useCallback(async () => setService(await fingerprintStatus()), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => () => { if (runningRef.current) { runningRef.current = false; cancelScan(); } }, []);

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
        if (res.employeeId) {
          try {
            show(await onMatchRef.current(res.employeeId, res.score));
          } catch {
            show({ tone: 'error', title: 'Could not save the check-in', detail: 'Check the internet connection and press again.', say: 'Could not save. Please press again.' });
          }
        } else if (res.tentative) {
          tentative = res.tentative;
          show({ tone: 'info', title: 'Almost — press once more', detail: 'Lift your finger and press it flat again to confirm.', say: 'Press once more.' });
        } else show({ tone: 'error', title: 'Not recognised', detail: 'Lift your finger and press it flat again, or ask to be enrolled.', say: 'Not recognised. Please try again.' });
      } else if (res.error === 'poor_quality') {
        show({ tone: 'warn', title: 'Press more firmly', detail: describeError(res.error), say: 'Press more firmly.' });
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

  const enrolledCount = service?.ok ? Object.keys(service.enrolled).length : 0;
  const offline = service && !service.ok;
  const tone = result && TONES[result.tone];

  return (
    <div className="space-y-4 max-w-3xl w-full">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fingerprint check-in</h2>
            <p className="text-sm text-gray-500">
              {offline ? 'Fingerprint service is not running.'
                : !service ? 'Connecting…'
                : !service.scanner ? 'Scanner not connected — check the USB cable.'
                : `${enrolledCount} employee${enrolledCount === 1 ? '' : 's'} enrolled.${enrolHint ? ` ${enrolHint}` : ''}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
          <button onClick={toggleVoice} title={voice ? 'Voice on — click to mute' : 'Voice off — click to turn on'}
            className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            {voice ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
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
        </div>

        {offline && (
          <p className="mt-4 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">
            This must run on the Mac with the scanner. Start the service with <code>~/NBio/start-fingerprint.sh</code>, then{' '}
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
          <h3 className="text-sm font-semibold text-gray-800">Today's check-ins <span className="font-normal text-gray-400">· scan again later to check out</span></h3>
          <span className="text-xs text-gray-400">{checkIns.length}</span>
        </div>
        {checkIns.length === 0 ? (
          <p className="px-4 py-6 text-sm text-gray-400 text-center">No fingerprint check-ins yet today.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {checkIns.map((a) => (
              <li key={a.employeeId} className="px-4 py-2.5 flex items-center justify-between text-sm">
                <span className="font-medium text-gray-800">{a.name}</span>
                <span className="text-gray-500 tabular-nums">
                  {a.checkIn}{a.checkOut ? ` – ${a.checkOut}` : ''}
                  {a.late && <span className="ml-1.5 px-1 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">LATE</span>}
                  {' · '}{a.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
