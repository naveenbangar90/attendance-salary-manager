import React, { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Trash2, KeyRound, Plus } from 'lucide-react';
import { listLogins, createCheckinLogin, resetCheckinPassword, deleteCheckinLogin } from '../../utils/remoteSync.js';

const ERRORS = {
  bad_username: 'Username must be 3–40 letters, numbers, dots, dashes or @.',
  weak_password: 'Password must be at least 8 characters.',
  username_taken: 'That username is already in use.',
};
const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// Owner-only (Settings, online): logins that can do nothing but record fingerprint check-ins.
// Rendered inside the Settings <form>, so it uses plain buttons rather than a nested form.
export default function CheckinLogins() {
  const [logins, setLogins] = useState(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetFor, setResetFor] = useState(null); // login id whose password is being reset
  const [resetPw, setResetPw] = useState('');
  const [msg, setMsg] = useState(null);

  const load = useCallback(async () => {
    const res = await listLogins().catch(() => null);
    setLogins(res?.status === 200 ? res.body.users.filter((u) => u.role === 'checkin') : []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const report = (res, okText) => {
    if (res?.status === 200) setMsg({ ok: true, text: okText });
    else setMsg({ ok: false, text: ERRORS[res?.body?.error] || 'Something went wrong. Try again.' });
    return res?.status === 200;
  };

  const create = async () => {
    const res = await createCheckinLogin(username.trim(), password).catch(() => null);
    if (report(res, `Check-in login "${username.trim()}" created.`)) {
      setUsername('');
      setPassword('');
      load();
    }
  };

  const reset = async (id) => {
    const res = await resetCheckinPassword(id, resetPw).catch(() => null);
    if (report(res, 'Password changed. That device will need to sign in again.')) {
      setResetFor(null);
      setResetPw('');
    }
  };

  const remove = async (login) => {
    if (!window.confirm(`Remove the check-in login "${login.username}"? Any device using it is signed out.`)) return;
    report(await deleteCheckinLogin(login.id).catch(() => null), `Removed "${login.username}".`);
    load();
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2 flex items-center gap-2">
        <Fingerprint size={14} className="text-blue-600" /> Check-in logins
      </h2>
      <p className="text-xs text-gray-500">
        A check-in login opens only the fingerprint check-in screen. It can see staff names and today's check-ins,
        and nothing else — no salaries, advances or reports. Use it on the Mac with the scanner.
      </p>

      {logins?.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg">
          {logins.map((l) => (
            <li key={l.id} className="px-3 py-2 text-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-medium text-gray-800">{l.username}</span>
                <div className="flex gap-1">
                  <button type="button" title="Set a new password" onClick={() => { setResetFor(resetFor === l.id ? null : l.id); setResetPw(''); }}
                    className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><KeyRound size={14} /></button>
                  <button type="button" title="Remove login" onClick={() => remove(l)}
                    className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                </div>
              </div>
              {resetFor === l.id && (
                <div className="flex gap-2">
                  <input className={field} type="password" placeholder="New password (8+ characters)" value={resetPw}
                    onChange={(e) => setResetPw(e.target.value)} autoComplete="new-password" />
                  <button type="button" onClick={() => reset(l.id)} className="px-3 py-2 bg-blue-600 text-white text-sm rounded-lg whitespace-nowrap">Save</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input className={field} placeholder="Username, e.g. checkin" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoCapitalize="none" />
        <input className={field} type="password" placeholder="Password (8+ characters)" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <button type="button" onClick={create} disabled={!username.trim() || !password}
          className="flex items-center justify-center gap-1.5 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40">
          <Plus size={14} /> Add
        </button>
      </div>
      {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{msg.text}</p>}
    </div>
  );
}
