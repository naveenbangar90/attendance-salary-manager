import React, { useEffect, useState } from 'react';
import { Building2, Loader2, LogIn, AlertTriangle, UploadCloud, CloudOff, RefreshCw } from 'lucide-react';
import {
  detectMode, signIn, setupOwner, pullAll, seedServer, pushChanged, onSyncStatus, syncStatus,
} from '../../utils/remoteSync.js';
import { runMigrations } from '../../utils/storage.js';

const ERRORS = {
  bad_credentials: 'Wrong username or password.',
  too_many_attempts: 'Too many failed attempts. Wait 15 minutes and try again.',
  bad_setup_code: 'That setup code is not correct.',
  bad_username: 'Username must be 3–40 letters, numbers, dots, dashes or @.',
  weak_password: 'Password must be at least 8 characters.',
  already_set_up: 'The owner account already exists. Sign in instead.',
};

const input = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

function Card({ children }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg"><Building2 size={20} className="text-white" /></div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">Attendance Manager</p>
            <p className="text-xs text-gray-500">Online</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

function SignInForm({ needsSetup, onSignedIn }) {
  const [setupCode, setSetupCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (needsSetup && password !== confirm) return setError('The two passwords do not match.');
    setBusy(true);
    try {
      const res = needsSetup ? await setupOwner(setupCode, username.trim(), password) : await signIn(username.trim(), password);
      if (res.status === 200) return onSignedIn();
      setError(ERRORS[res.body?.error] || `Could not sign in (HTTP ${res.status}).`);
    } catch {
      setError('Cannot reach the server. Check your internet connection.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <div>
        <h1 className="text-lg font-semibold text-gray-900">{needsSetup ? 'Create the owner account' : 'Sign in'}</h1>
        {needsSetup && (
          <p className="text-sm text-gray-500 mt-1">
            First-time setup. Enter the setup code from the Railway project's <code>SETUP_CODE</code> variable.
          </p>
        )}
      </div>
      <form onSubmit={submit} className="space-y-3">
        {needsSetup && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Setup code</span>
            <input className={input} value={setupCode} onChange={(e) => setSetupCode(e.target.value)} autoComplete="off" required />
          </label>
        )}
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Username</span>
          <input className={input} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" required />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">Password</span>
          <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
            autoComplete={needsSetup ? 'new-password' : 'current-password'} minLength={needsSetup ? 8 : undefined} required />
        </label>
        {needsSetup && (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Confirm password</span>
            <input className={input} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </label>
        )}
        {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
          {needsSetup ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </Card>
  );
}

function SeedChoice({ onChoose }) {
  const [busy, setBusy] = useState(false);
  const choose = async (upload) => {
    setBusy(true);
    await onChoose(upload);
  };
  return (
    <Card>
      <div className="space-y-2">
        <h1 className="text-lg font-semibold text-gray-900">The online database is empty</h1>
        <p className="text-sm text-gray-600">
          This browser already has attendance data saved. Upload it so it is stored online and available on every device?
        </p>
      </div>
      <div className="space-y-2">
        <button disabled={busy} onClick={() => choose(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} Upload this browser's data
        </button>
        <button disabled={busy} onClick={() => choose(false)}
          className="w-full px-4 py-2.5 border border-gray-300 text-sm rounded-lg hover:bg-gray-50 disabled:opacity-50">
          Start with an empty database
        </button>
      </div>
    </Card>
  );
}

const BANNERS = {
  offline: { cls: 'bg-amber-50 text-amber-800 border-amber-200', Icon: CloudOff,
    text: 'Not connected — changes are kept on this device and will be saved when the connection returns.' },
  conflict: { cls: 'bg-red-50 text-red-800 border-red-200', Icon: AlertTriangle,
    text: 'This data was changed on another device. Reload to get the latest version; edits made here since then are not saved.' },
  signed_out: { cls: 'bg-red-50 text-red-800 border-red-200', Icon: AlertTriangle,
    text: 'Your session has ended. Reload and sign in again to keep saving.' },
};

function SyncBanner() {
  const [status, setStatus] = useState(syncStatus());
  useEffect(() => onSyncStatus(setStatus), []);
  const b = BANNERS[status];
  if (!b) return null;
  return (
    <div className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 max-w-xl w-[calc(100%-2rem)] flex items-start gap-3 border rounded-xl px-4 py-3 shadow-lg ${b.cls}`}>
      <b.Icon size={18} className="shrink-0 mt-0.5" />
      <p className="text-sm flex-1">{b.text}</p>
      {status !== 'offline' && (
        <button onClick={() => window.location.reload()} className="flex items-center gap-1 text-sm font-medium underline">
          <RefreshCw size={14} /> Reload
        </button>
      )}
    </div>
  );
}

// Decides how the app starts:
//   local  (no server API: localhost / GitHub Pages) — migrate localStorage and render;
//   online (Railway) — sign in, load the database into localStorage, migrate, render.
export default function AuthGate({ children }) {
  const [phase, setPhase] = useState({ name: 'loading' });

  const start = async () => {
    setPhase({ name: 'loading' });
    const mode = await detectMode();
    if (mode.mode === 'local') {
      runMigrations();
      return setPhase({ name: 'ready', online: false });
    }
    if (!mode.authenticated) return setPhase({ name: 'signin', needsSetup: mode.needsSetup });
    try {
      const { serverEmpty, localHasData } = await pullAll(mode.user);
      if (serverEmpty && localHasData) return setPhase({ name: 'seed' });
      if (serverEmpty) await seedServer(false);
      finishOnline();
    } catch (e) {
      setPhase({ name: 'error', message: e.message });
    }
  };

  const finishOnline = () => {
    runMigrations();
    pushChanged();
    setPhase({ name: 'ready', online: true });
  };

  useEffect(() => { start(); }, []);

  switch (phase.name) {
    case 'signin':
      return <SignInForm needsSetup={phase.needsSetup} onSignedIn={start} />;
    case 'seed':
      return <SeedChoice onChoose={async (upload) => { await seedServer(upload); finishOnline(); }} />;
    case 'error':
      return (
        <Card>
          <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2">{phase.message}</p>
          <button onClick={start} className="w-full px-4 py-2.5 bg-blue-600 text-white text-sm rounded-lg">Try again</button>
        </Card>
      );
    case 'ready':
      return <>{children}{phase.online && <SyncBanner />}</>;
    default:
      return (
        <div className="min-h-screen flex items-center justify-center text-gray-400">
          <Loader2 size={24} className="animate-spin" />
        </div>
      );
  }
}
