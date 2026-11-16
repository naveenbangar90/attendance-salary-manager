// Keeps the app's localStorage collections in step with the online database when the app is
// served by server.mjs with DATABASE_URL (Railway). Anywhere else (localhost dev, GitHub Pages)
// /api is missing and the app runs from localStorage alone, exactly as before.
//
// The app still reads and writes localStorage synchronously; this module mirrors it:
//   • on start, pull every collection from the server into localStorage (server wins), then render;
//   • every storage write is queued and PUT (debounced) with the version it was based on, so an
//     edit made meanwhile on another device produces a conflict instead of being overwritten.

const API = '/api';
const DEBOUNCE_MS = 800;
const RETRY_MS = 5000;

const state = {
  online: false,
  user: null,
  versions: {},   // key -> server version our copy is based on
  synced: {},     // key -> JSON string last confirmed by the server
  pending: new Map(),
  timer: null,
  flushing: false,
  status: 'saved', // saved | saving | offline | conflict | signed_out
  listeners: new Set(),
};

function setStatus(status) {
  if (state.status === status) return;
  state.status = status;
  state.listeners.forEach((fn) => fn(status));
}

export const isOnline = () => state.online;
export const currentUser = () => state.user;
export const syncStatus = () => state.status;
export function onSyncStatus(fn) {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

async function api(path, options = {}) {
  const res = await fetch(API + path, {
    credentials: 'same-origin',
    ...options,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch', ...(options.headers || {}) },
  });
  let body = null;
  if ((res.headers.get('content-type') || '').includes('application/json')) body = await res.json();
  return { status: res.status, body };
}

// → { mode: 'local' } | { mode: 'online', authenticated, needsSetup, user }
export async function detectMode() {
  try {
    const { status, body } = await api('/session');
    if (status === 200 && body?.mode === 'online') return body;
  } catch { /* no server: local mode */ }
  return { mode: 'local' };
}

export async function signIn(username, password) {
  return api('/login', { method: 'POST', body: JSON.stringify({ username, password }) });
}

export async function setupOwner(setupCode, username, password) {
  return api('/setup', { method: 'POST', body: JSON.stringify({ setupCode, username, password }) });
}

export async function changePassword(currentPassword, newPassword) {
  return api('/password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
}

const isAppKey = (k) => k && k.startsWith('asm_');
const localAppKeys = () => Object.keys(localStorage).filter(isAppKey);

// Start syncing for a signed-in user. Returns { serverEmpty, localHasData }.
export async function pullAll(user) {
  const { status, body } = await api('/data');
  if (status !== 200) throw new Error(`Could not load data (HTTP ${status})`);
  state.online = true;
  state.user = user;
  const items = body.items || {};
  const serverEmpty = Object.keys(items).length === 0;
  const localHasData = (() => {
    try { return JSON.parse(localStorage.getItem('asm_employees') || '[]').length > 0; } catch { return false; }
  })();
  if (!serverEmpty) {
    // The server is the source of truth: drop this browser's copy and take the server's.
    localAppKeys().forEach((k) => localStorage.removeItem(k));
    for (const [key, { value, version }] of Object.entries(items)) {
      localStorage.setItem(key, value);
      state.versions[key] = version;
      state.synced[key] = value;
    }
  }
  return { serverEmpty, localHasData };
}

// When the database is empty: either upload what this browser already has, or start empty.
export async function seedServer(uploadLocal) {
  if (!uploadLocal) localAppKeys().forEach((k) => localStorage.removeItem(k));
  else localAppKeys().forEach((k) => queueWrite(k, localStorage.getItem(k)));
  await flush();
}

// Queue anything in localStorage that differs from what the server last confirmed
// (used after migrations, which write localStorage directly).
export function pushChanged() {
  if (!state.online) return;
  localAppKeys().forEach((k) => queueWrite(k, localStorage.getItem(k)));
}

// Called by storage.js for every write.
export function queueWrite(key, json) {
  if (!state.online || !isAppKey(key) || state.status === 'conflict') return;
  if (state.synced[key] === json) {
    state.pending.delete(key);
    return;
  }
  state.pending.set(key, json);
  setStatus('saving');
  clearTimeout(state.timer);
  state.timer = setTimeout(flush, DEBOUNCE_MS);
}

export async function flush() {
  clearTimeout(state.timer);
  if (state.flushing) {
    state.timer = setTimeout(flush, DEBOUNCE_MS);
    return;
  }
  state.flushing = true;
  try {
    for (const [key, value] of [...state.pending]) {
      let res;
      try {
        res = await api(`/data/${encodeURIComponent(key)}`, {
          method: 'PUT',
          body: JSON.stringify({ value, baseVersion: state.versions[key] || 0 }),
        });
      } catch {
        setStatus('offline');
        state.timer = setTimeout(flush, RETRY_MS);
        return;
      }
      if (res.status === 200) {
        state.versions[key] = res.body.version;
        state.synced[key] = value;
        if (state.pending.get(key) === value) state.pending.delete(key);
      } else if (res.status === 409) {
        setStatus('conflict');
        return;
      } else if (res.status === 401) {
        setStatus('signed_out');
        return;
      } else {
        setStatus('offline');
        state.timer = setTimeout(flush, RETRY_MS);
        return;
      }
    }
    if (state.pending.size === 0) setStatus('saved');
    else state.timer = setTimeout(flush, DEBOUNCE_MS);
  } finally {
    state.flushing = false;
  }
}

export const hasUnsaved = () => state.pending.size > 0;

// Sign out and remove this device's copy of the data (it lives safely in the database).
export async function signOut() {
  await flush();
  if (state.pending.size > 0 && !window.confirm('Some changes have not reached the server yet and will be lost. Sign out anyway?')) return false;
  await api('/logout', { method: 'POST' }).catch(() => {});
  localAppKeys().forEach((k) => localStorage.removeItem(k));
  return true;
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    // After a conflict or expired session the pending edits can't be saved anyway, and the banner
    // already says so — don't add a "Leave site?" prompt to the reload it asks for.
    if (state.online && state.pending.size > 0 && (state.status === 'saving' || state.status === 'offline')) {
      flush();
      e.preventDefault();
      e.returnValue = '';
    }
  });
}
