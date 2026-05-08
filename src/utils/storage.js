const KEYS = {
  EMPLOYEES: 'asm_employees',
  ATTENDANCE: 'asm_attendance',
  ADVANCES: 'asm_advances',
  SETTINGS: 'asm_settings',
  LACE_PACKING: 'asm_lace_packing',
};

const get = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};

const set = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('localStorage write failed:', e);
  }
};

export const DEFAULT_SETTINGS = {
  companyName: 'My Company',
  totalWorkingDays: 26,
  weeklyOffPaid: false,
  overtimeEnabled: true,
  overtimeRatePerHour: 50,
  lateFineEnabled: false,
  defaultLateFineAmount: 0,
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
