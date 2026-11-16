import { describe, it, expect } from 'vitest';
import { mergeCollection } from '../mergeCollections.js';

const att = (employeeId, date, extra = {}) => ({ id: `${employeeId}${date}`, employeeId, date, status: 'Present', ...extra });

describe('mergeCollection', () => {
  it('keeps kiosk check-ins made while the owner edited other records', () => {
    const base = [att('e1', '2026-11-16')];
    const local = [att('e1', '2026-11-16', { status: 'Half Day' })];
    const server = [...base, att('e2', '2026-11-16', { checkIn: '09:01' })];
    expect(mergeCollection('asm_attendance', base, local, server)).toEqual([
      att('e1', '2026-11-16', { status: 'Half Day' }),
      att('e2', '2026-11-16', { checkIn: '09:01' }),
    ]);
  });

  it("replays only the owner's changed fields, so a check-in time on the same record survives", () => {
    const base = [att('e1', '2026-11-16', { status: 'Absent' })];
    const local = [att('e1', '2026-11-16', { status: 'Absent', remarks: 'sick' })];
    const server = [att('e1', '2026-11-16', { status: 'Present', checkIn: '09:05' })];
    expect(mergeCollection('asm_attendance', base, local, server)).toEqual([
      att('e1', '2026-11-16', { status: 'Present', checkIn: '09:05', remarks: 'sick' }),
    ]);
  });

  it('matches attendance by employee and date even when the two sides created different ids', () => {
    const local = [{ id: 'a', employeeId: 'e1', date: '2026-11-16', status: 'Overtime' }];
    const server = [{ id: 'b', employeeId: 'e1', date: '2026-11-16', status: 'Present', checkIn: '08:58' }];
    expect(mergeCollection('asm_attendance', [], local, server)).toEqual([
      { id: 'a', employeeId: 'e1', date: '2026-11-16', status: 'Overtime', checkIn: '08:58' },
    ]);
  });

  it('applies local deletions and removed fields', () => {
    const base = [{ id: '1', n: 1, note: 'x' }, { id: '2', n: 2 }];
    const local = [{ id: '1', n: 1 }];
    const server = [{ id: '1', n: 1, note: 'x' }, { id: '2', n: 2 }, { id: '3', n: 3 }];
    expect(mergeCollection('asm_employees', base, local, server)).toEqual([{ id: '1', n: 1 }, { id: '3', n: 3 }]);
  });

  it('refuses collections it cannot merge safely', () => {
    expect(mergeCollection('asm_settings', {}, {}, {})).toBeNull();
    expect(mergeCollection('asm_employees', [{ n: 1 }], [], [])).toBeNull();
  });
});
