import { describe, it, expect } from 'vitest';
import { checkInRecord } from '../fingerprint.js';

describe('checkInRecord', () => {
  it('marks an unmarked day Present with the check-in time', () => {
    expect(checkInRecord(undefined, 'e1', '2026-11-16', '09:05'))
      .toEqual({ employeeId: 'e1', date: '2026-11-16', status: 'Present', checkIn: '09:05' });
  });

  it('turns a manual Absent into Present, since the employee is physically here', () => {
    expect(checkInRecord({ status: 'Absent' }, 'e1', '2026-11-16', '09:05').status).toBe('Present');
  });

  it('keeps any other manually marked status', () => {
    expect(checkInRecord({ status: 'Half Day' }, 'e1', '2026-11-16', '13:40').status).toBe('Half Day');
    expect(checkInRecord({ status: 'Overtime' }, 'e1', '2026-11-16', '08:00').status).toBe('Overtime');
  });

  it('never overwrites the first check-in of the day', () => {
    expect(checkInRecord({ status: 'Present', checkIn: '09:05' }, 'e1', '2026-11-16', '12:00')).toBeNull();
  });
});
