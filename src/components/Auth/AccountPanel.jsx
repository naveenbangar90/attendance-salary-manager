import React, { useEffect, useState } from 'react';
import { LogOut, KeyRound, Cloud, CloudOff, Loader2, AlertTriangle } from 'lucide-react';
import Modal from '../Common/Modal.jsx';
import {
  isOnline, currentUser, signOut, changePassword, onSyncStatus, syncStatus,
} from '../../utils/remoteSync.js';

const STATUS = {
  saved:      { Icon: Cloud, cls: 'text-green-600', label: 'All changes saved' },
  saving:     { Icon: Loader2, cls: 'text-blue-600 animate-spin', label: 'Saving…' },
  offline:    { Icon: CloudOff, cls: 'text-amber-600', label: 'Offline — will retry' },
  conflict:   { Icon: AlertTriangle, cls: 'text-red-600', label: 'Changed elsewhere — reload' },
  signed_out: { Icon: AlertTriangle, cls: 'text-red-600', label: 'Session ended' },
};

const field = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function PasswordForm({ onDone }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [msg, setMsg] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) return setMsg({ ok: false, text: 'The new passwords do not match.' });
    const res = await changePassword(current, next).catch(() => ({ status: 0 }));
    if (res.status === 200) {
      setMsg({ ok: true, text: 'Password changed. Other devices have been signed out.' });
      setTimeout(onDone, 1500);
    } else {
      const err = res.body?.error;
      setMsg({ ok: false, text: err === 'bad_credentials' ? 'Current password is wrong.' : err === 'weak_password' ? 'New password must be at least 8 characters.' : 'Could not change the password.' });
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <input className={field} type="password" placeholder="Current password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
      <input className={field} type="password" placeholder="New password (8+ characters)" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" minLength={8} required />
      <input className={field} type="password" placeholder="Confirm new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
      {msg && <p className={`text-sm rounded-lg px-3 py-2 ${msg.ok ? 'text-green-700 bg-green-50' : 'text-red-700 bg-red-50'}`}>{msg.text}</p>}
      <button type="submit" className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">Change password</button>
    </form>
  );
}

// Sidebar footer: who is signed in, whether changes have reached the database, and sign-out.
export default function AccountPanel() {
  const [status, setStatus] = useState(syncStatus());
  const [pwOpen, setPwOpen] = useState(false);
  useEffect(() => onSyncStatus(setStatus), []);

  if (!isOnline()) return <p className="text-xs text-gray-400 text-center">v1.1.0 • Local Storage</p>;

  const s = STATUS[status] || STATUS.saved;
  const out = async () => { if (await signOut()) window.location.reload(); };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <s.Icon size={14} className={s.cls} />
        <span className="text-gray-600">{s.label}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 truncate">Signed in as <b className="text-gray-700">{currentUser()?.username}</b></span>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => setPwOpen(true)} title="Change password" className="p-1.5 rounded hover:bg-gray-100 text-gray-500"><KeyRound size={14} /></button>
          <button onClick={out} title="Sign out" className="p-1.5 rounded hover:bg-red-50 text-red-500"><LogOut size={14} /></button>
        </div>
      </div>
      <Modal isOpen={pwOpen} onClose={() => setPwOpen(false)} title="Change password" size="sm">
        <PasswordForm onDone={() => setPwOpen(false)} />
      </Modal>
    </div>
  );
}
