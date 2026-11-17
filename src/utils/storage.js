import { queueWrite } from './remoteSync.js';
import { RULE_DEFAULTS } from './attendanceRules.js';

const KEYS = {
  EMPLOYEES: 'asm_employees',
  ATTENDANCE: 'asm_attendance',
  ADVANCES: 'asm_advances',
  SETTINGS: 'asm_settings',
  LACE_PACKING: 'asm_lace_packing',
  PAYOUTS: 'asm_payouts',
  SCHEMA_VERSION: 'asm_schema_version',
  BACKUP_V0: 'asm_backup_v0',
};

export const STORAGE_KEYS = KEYS;

// Bump this whenever a migration step is added below.
export const CURRENT_SCHEMA_VERSION = 3;

const get = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const set = (key, value) => {
  const json = JSON.stringify(value);
  try {
    localStorage.setItem(key, json);
  } catch (e) {
    console.error('localStorage write failed:', e);
  }
  queueWrite(key, json); // no-op unless signed in to the online database
};

export const DEFAULT_SETTINGS = {
  companyName: 'My Company',
  // The divisor: a month is worth this many days whether the calendar shows 28, 30 or 31.
  totalWorkingDays: 30,
  overtimeEnabled: true,
  overtimeRatePerHour: 50,
  lateFineEnabled: false,
  defaultLateFineAmount: 0,
  googleClientId: '',
  googleDriveFolderId: '',
  // Automatic attendance rules (late mark, check-out, auto-absent, weekly off, holidays).
  ...RULE_DEFAULTS,
};

export const getEmployees = () => get(KEYS.EMPLOYEES, []);
export const setEmployees = (d) => set(KEYS.EMPLOYEES, d);

export const getAttendance = () => get(KEYS.ATTENDANCE, []);
export const setAttendance = (d) => set(KEYS.ATTENDANCE, d);

export const getAdvances = () => get(KEYS.ADVANCES, []);
export const setAdvances = (d) => set(KEYS.ADVANCES, d);

export const getSettings = () => ({ ...DEFAULT_SETTINGS, ...get(KEYS.SETTINGS, {}) });
export const setSettings = (d) => set(KEYS.SETTINGS, d);

export const getLacePacking = () => get(KEYS.LACE_PACKING, []);
export const setLacePacking = (d) => set(KEYS.LACE_PACKING, d);

export const getPayouts = () => get(KEYS.PAYOUTS, []);
export const setPayouts = (d) => set(KEYS.PAYOUTS, d);

// ─── Schema migration ────────────────────────────────────────────────────────
// Runs once on app load, before any state is read into React. Must be idempotent:
// running it twice on already-migrated data is a no-op.

const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

export const getSchemaVersion = () => {
  const v = parseInt(localStorage.getItem(KEYS.SCHEMA_VERSION) || '0', 10);
  return isNaN(v) ? 0 : v;
};

export const getBackupV0 = () => get(KEYS.BACKUP_V0, null);

// Snapshot every asm_* data key verbatim before the first migration touches anything.
const writeBackupV0 = () => {
  if (localStorage.getItem(KEYS.BACKUP_V0)) return; // never overwrite the original
  const blob = { takenAt: new Date().toISOString(), data: {} };
  [KEYS.EMPLOYEES, KEYS.ATTENDANCE, KEYS.ADVANCES, KEYS.SETTINGS, KEYS.LACE_PACKING, KEYS.PAYOUTS]
    .forEach((k) => {
      const raw = localStorage.getItem(k);
      if (raw !== null) blob.data[k] = raw;   // raw strings — no re-serialisation risk
    });
  if (Object.keys(blob.data).length === 0) return; // nothing to back up on a fresh install
  set(KEYS.BACKUP_V0, blob);
};

// v1 → advances gain `kind`, `deductions[]`, and numeric-coerced amounts.
const migrateAdvancesV1 = () => {
  const advances = get(KEYS.ADVANCES, []);
  if (!advances.length) return;
  const next = advances.map((a) => {
    const amount    = round2(a.amount);
    const deducted  = round2(a.deductedAmount);
    let deductions  = Array.isArray(a.deductions) ? a.deductions : null;
    // Synthesise one historical entry so the ledger can account for money already deducted.
    if (!deductions) {
      deductions = deducted > 0
        ? [{ id: `${a.id}_legacy`, date: a.date || '', amount: deducted, source: 'legacy', payoutId: null }]
        : [];
    }
    return {
      ...a,
      kind: a.kind || 'loan',
      amount,
      deductedAmount: deducted,
      remainingAmount: round2(Math.max(0, amount - deducted)),
      emiAmount: round2(a.emiAmount || 0),
      deductions,
    };
  });
  set(KEYS.ADVANCES, next);
};

// v2 → payouts gain the projected/settlement fields used by early-payout settlement.
const migratePayoutsV2 = () => {
  const payouts = get(KEYS.PAYOUTS, []);
  if (!payouts.length) return;
  const next = payouts.map((p) => ({
    basis: 'actual',
    projectedDates: [],
    projectedPaidDays: 0,
    paidAmount: p.paidAmount ?? round2(p.finalSalary),
    settled: p.settled ?? false,
    settlementDelta: p.settlementDelta ?? null,
    settledIntoMonth: p.settledIntoMonth ?? null,
    // What the advance deduction actually moved, so re-finalising can apply only the delta.
    advanceDeductionApplied: p.advanceDeductionApplied ?? round2(p.snapshot?.advanceDeduction || 0),
    ...p,
  }));
  set(KEYS.PAYOUTS, next);
};

// v3 → the 30-day deduction salary model. The divisor becomes 30 for everyone (a month is
// worth 30 days regardless of calendar length) and `weeklyOffPaid` is retired: weekly offs
// sit inside the 30 and never deduct, so the flag no longer means anything.
const migrateSettingsV3 = () => {
  const s = get(KEYS.SETTINGS, {});
  const { weeklyOffPaid, ...rest } = s;
  set(KEYS.SETTINGS, { ...rest, totalWorkingDays: 30 });
};

export const runMigrations = () => {
  const from = getSchemaVersion();
  if (from >= CURRENT_SCHEMA_VERSION) return { migrated: false, from, to: from };

  writeBackupV0();
  if (from < 1) migrateAdvancesV1();
  if (from < 2) migratePayoutsV2();
  if (from < 3) migrateSettingsV3();

  localStorage.setItem(KEYS.SCHEMA_VERSION, String(CURRENT_SCHEMA_VERSION));
  return { migrated: true, from, to: CURRENT_SCHEMA_VERSION };
};
