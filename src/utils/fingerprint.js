// Client for the local fingerprint service (~/NBio/fpbridge.py), which drives the NITGEN
// scanner and the SourceAFIS matcher. Templates live with that service, not in localStorage.

export const FINGERPRINT_URL = 'http://127.0.0.1:5180';
// Several presses cover more of the finger; one template alone misses about a third of later presses.
export const ENROLL_SAMPLES = 5;

async function call(path, body) {
  let res;
  try {
    res = await fetch(`${FINGERPRINT_URL}${path}`, body === undefined
      ? {}
      : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    return { ok: false, error: 'offline' };
  }
  try {
    return await res.json();
  } catch {
    return { ok: false, error: `HTTP ${res.status}` };
  }
}

export const fingerprintStatus = () => call('/status');
export const captureFinger = (timeout = 20) => call('/capture', { timeout });
// `tentative`: the employee a borderline previous press pointed at, to confirm with this press.
export const identifyFinger = (timeout = 20, tentative = null) => call('/identify', { timeout, tentative });
export const enrollFinger = (employeeId, captureIds) => call('/enroll', { employeeId, captureIds });
export const removeFingerprint = (employeeId) => call('/remove', { employeeId });
export const cancelScan = () => call('/cancel', {});

export function describeError(error) {
  switch (error) {
    case 'offline': return 'Fingerprint service is not running. Start it with ~/NBio/start-fingerprint.sh';
    case 'busy': return 'The scanner is in use by another window.';
    case 'timeout': return 'No finger detected.';
    case 'cancelled': return 'Scan cancelled.';
    case 'scanner_stuck': return 'The scanner stopped responding. Unplug it, wait 5 seconds, plug it back in, then press Start.';
    case 'poor_quality': return 'That press was too faint or smudged. Press the finger flat and firmly.';
    case 'samples_disagree': return 'Too few scans matched each other. Use the same finger each time, pressed flat and firmly.';
    case 'already_enrolled': return 'This finger is already enrolled for another employee.';
    default: return error || 'Unknown error';
  }
}

// Mark an employee present from a fingerprint check-in. A manually marked status for the day is
// kept (Half Day, Overtime…) except Absent, which the check-in proves wrong; the first
// check-in time of the day is never overwritten.
export function checkInRecord(existing, employeeId, date, time) {
  if (existing?.checkIn) return null;
  const status = !existing || existing.status === 'Absent' ? 'Present' : existing.status;
  return { employeeId, date, status, checkIn: time };
}
