import React, { useEffect, useRef, useState } from 'react';
import { Fingerprint, CheckCircle2, AlertTriangle, Loader2, Trash2 } from 'lucide-react';
import {
  ENROLL_SAMPLES, captureFinger, enrollFinger, removeFingerprint, cancelScan, describeError,
} from '../../utils/fingerprint.js';

// Enrol one finger for an employee: take ENROLL_SAMPLES fresh scans (lift between each), then the
// service keeps the scans that overlap at least one other and checks the finger isn't already
// someone else's before saving.
export default function EnrollFingerprint({ employee, enrolled, onChanged }) {
  const [phase, setPhase] = useState('idle'); // idle | scanning | saving | done | error
  const [images, setImages] = useState([]);
  const [message, setMessage] = useState('');
  const scanning = useRef(false);

  // Closing the modal mid-scan must release the scanner.
  useEffect(() => () => { if (scanning.current) cancelScan(); }, []);

  const start = async () => {
    setPhase('scanning');
    setMessage('');
    setImages([]);
    const ids = [];
    scanning.current = true;
    try {
      let poor = 0;
      while (ids.length < ENROLL_SAMPLES) {
        const res = await captureFinger(20);
        if (res.error === 'poor_quality' && ++poor <= 5) {
          setMessage(describeError(res.error)); // retry this slot
          continue;
        }
        if (!res.ok) {
          setPhase('error');
          setMessage(res.error === 'timeout' ? 'No finger detected. Press Start to try again.' : describeError(res.error));
          return;
        }
        setMessage('');
        ids.push(res.captureId);
        setImages((prev) => [...prev, res.image]);
      }
    } finally {
      scanning.current = false;
    }
    setPhase('saving');
    const res = await enrollFinger(employee.id, ids);
    if (res.ok) {
      setPhase('done');
      setMessage(`Enrolled with ${res.samples} scans${res.dropped ? ` (${res.dropped} unclear scan${res.dropped > 1 ? 's' : ''} left out)` : ''}.`);
      onChanged?.();
    } else {
      setPhase('error');
      setMessage(describeError(res.error));
    }
  };

  const remove = async () => {
    const res = await removeFingerprint(employee.id);
    if (res.ok) {
      setPhase('idle');
      setImages([]);
      setMessage('Fingerprint removed.');
      onChanged?.();
    } else {
      setMessage(describeError(res.error));
    }
  };

  const next = images.length + 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-gray-900">{employee.name}</p>
          <p className="text-xs text-gray-500">
            {enrolled ? `Fingerprint enrolled (${enrolled} scans)` : 'No fingerprint enrolled'}
          </p>
        </div>
        {enrolled > 0 && phase !== 'scanning' && phase !== 'saving' && (
          <button onClick={remove} className="flex items-center gap-1 px-3 py-1.5 text-xs text-red-600 bg-red-50 rounded-lg hover:bg-red-100">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>

      <div className="grid grid-cols-5 gap-2">
        {Array.from({ length: ENROLL_SAMPLES }, (_, i) => (
          <div key={i} className={`aspect-[26/33] rounded-lg border-2 flex items-center justify-center overflow-hidden
            ${images[i] ? 'border-green-400' : phase === 'scanning' && i === images.length ? 'border-blue-400 animate-pulse' : 'border-dashed border-gray-200'}`}>
            {images[i]
              ? <img src={images[i]} alt={`Scan ${i + 1}`} className="w-full h-full object-cover" />
              : <Fingerprint size={32} className="text-gray-300" />}
          </div>
        ))}
      </div>

      {phase === 'scanning' && (
        <p className="flex items-center gap-2 text-sm text-blue-700 bg-blue-50 rounded-lg px-3 py-2">
          <Loader2 size={16} className="animate-spin" />
          Scan {next} of {ENROLL_SAMPLES}: place the finger flat on the glass{next > 1 ? ' again (lift it first)' : ''}.
        </p>
      )}
      {phase === 'scanning' && message && (
        <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2">{message}</p>
      )}
      {phase === 'saving' && (
        <p className="flex items-center gap-2 text-sm text-blue-700"><Loader2 size={16} className="animate-spin" /> Checking scans…</p>
      )}
      {phase === 'done' && (
        <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2"><CheckCircle2 size={16} /> {message}</p>
      )}
      {phase === 'error' && (
        <p className="flex items-center gap-2 text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2"><AlertTriangle size={16} /> {message}</p>
      )}
      {phase === 'idle' && message && <p className="text-sm text-gray-600">{message}</p>}

      {(phase === 'idle' || phase === 'error') && (
        <button onClick={start} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
          <Fingerprint size={16} /> {enrolled ? 'Re-enroll fingerprint' : 'Start enrolment'}
        </button>
      )}
      <p className="text-xs text-gray-400">
        Use the same finger for all {ENROLL_SAMPLES} scans, pressed flat and firmly. Move it a little each time (higher, lower, tilted) so more of the finger is recorded. Fingerprints are stored only on this Mac.
      </p>
    </div>
  );
}
