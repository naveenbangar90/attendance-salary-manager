import { describe, it, expect } from 'vitest';
import { applyScan, runDailyRules, latePenalty, offStatusFor, rulesOf, timesFor, shiftOf } from '../attendanceRules.js';
import { getAttendanceStats } from '../calculations.js';

// 2026-11-15 is a Sunday.
const S = { absentAfter: '14:00', latesPerHalfDay: 3, weeklyOffDay: 0, sandwichRule: true, holidays: [] };
const E1 = { id: 'e1', name: 'e1' }; // default shift 10:00–18:00 → late after 10:15
const emp = (id, extra) => ({ id, name: id, status: 'Active', joiningDate: '2026-01-01', ...extra });

describe('applyScan', () => {
  it('first scan on time checks in Present', () => {
    expect(applyScan(undefined, E1, '2026-11-16', '09:05', S))
      .toEqual({ kind: 'checked_in', patch: { employeeId: 'e1', date: '2026-11-16', checkIn: '09:05', status: 'Present' } });
  });

  it('a scan after the late time is marked late, with the default fine when fines are on', () => {
    expect(applyScan(undefined, E1, '2026-11-16', '10:16', S).patch.late).toBe(true);
    expect(applyScan(undefined, E1, '2026-11-16', '10:15', S).patch.late).toBeUndefined();
    const fined = applyScan(undefined, E1, '2026-11-16', '10:30', { ...S, lateFineEnabled: true, defaultLateFineAmount: 50 });
    expect(fined.patch.lateFine).toBe(50);
  });

  it('no late marks on a skipped day, and earlier late marks that day stop counting', () => {
    const skip = { ...S, lateSkipDates: ['2026-11-16'] };
    expect(applyScan(undefined, E1, '2026-11-16', '11:00', skip).patch.late).toBeUndefined();
    expect(applyScan(undefined, E1, '2026-11-17', '11:00', skip).patch.late).toBe(true);
    const recs = ['2026-11-16', '2026-11-17', '2026-11-18'].map((date) => ({ date, status: 'Present', late: true }));
    expect(latePenalty(recs, skip)).toEqual({ lateDays: 2, latePenaltyDays: 0 });
  });

  it('a check-in overrides Absent and off days but keeps statuses the owner set', () => {
    expect(applyScan({ status: 'Absent' }, E1, '2026-11-16', '09:05', S).patch.status).toBe('Present');
    expect(applyScan({ status: 'Weekly Off' }, E1, '2026-11-15', '09:05', S).patch.status).toBe('Present');
    expect(applyScan({ status: 'Half Day' }, E1, '2026-11-16', '13:40', S).patch.status).toBe('Half Day');
  });

  it('a first scan after the absent cut-off stays Absent', () => {
    const r = applyScan(undefined, E1, '2026-11-16', '14:05', S);
    expect(r.kind).toBe('after_cutoff');
    expect(r.patch).toMatchObject({ status: 'Absent', checkIn: '14:05' });
    expect(applyScan({ status: 'Paid Leave' }, E1, '2026-11-16', '15:00', S).patch.status).toBe('Paid Leave');
  });

  it('a repeat press soon after checking in changes nothing', () => {
    expect(applyScan({ status: 'Present', checkIn: '09:05' }, E1, '2026-11-16', '09:40', S)).toEqual({ kind: 'already', patch: null });
  });

  it('a later scan checks out; leaving early makes a Half Day, staying later undoes it', () => {
    const rec = { status: 'Present', checkIn: '09:05' };
    expect(applyScan(rec, E1, '2026-11-16', '18:30', S)).toEqual({ kind: 'checked_out', patch: { checkOut: '18:30' } });
    const early = applyScan(rec, E1, '2026-11-16', '16:00', S).patch;
    expect(early).toEqual({ checkOut: '16:00', status: 'Half Day', earlyLeave: true });
    expect(applyScan({ ...rec, ...early }, E1, '2026-11-16', '18:10', S).patch)
      .toEqual({ checkOut: '18:10', status: 'Present', earlyLeave: false });
  });

  it('with the rules off it only records times', () => {
    const off = { ...S, autoRules: false };
    expect(applyScan(undefined, E1, '2026-11-16', '15:00', off).patch.status).toBe('Present');
    expect(applyScan({ status: 'Present', checkIn: '09:00' }, E1, '2026-11-16', '12:00', off).patch).toEqual({ checkOut: '12:00' });
  });
});

describe('shifts', () => {
  const nine5 = { id: 'n', shiftId: 's1' };   // 09:00–17:00
  const nine6 = { id: 'm', shiftId: 's2' };   // 09:00–18:00

  it('late and early-leave times follow the employee\'s shift', () => {
    expect(timesFor(nine5, rulesOf(S))).toEqual({ lateAfter: '09:15', earlyLeaveBefore: '17:00', absentAfter: '14:00' });
    expect(timesFor(E1, rulesOf(S))).toEqual({ lateAfter: '10:15', earlyLeaveBefore: '18:00', absentAfter: '14:00' });
    expect(applyScan(undefined, nine5, '2026-11-16', '09:20', S).patch.late).toBe(true);
    expect(applyScan(undefined, E1, '2026-11-16', '09:20', S).patch.late).toBeUndefined();
    expect(applyScan({ status: 'Present', checkIn: '09:00' }, nine5, '2026-11-16', '17:05', S).patch).toEqual({ checkOut: '17:05' });
    expect(applyScan({ status: 'Present', checkIn: '09:00' }, nine6, '2026-11-16', '17:05', S).patch.status).toBe('Half Day');
  });

  it('the grace period is configurable, and a deleted shift falls back to the default', () => {
    expect(timesFor(nine5, rulesOf({ ...S, lateGraceMin: 0 })).lateAfter).toBe('09:00');
    expect(shiftOf({ shiftId: 'gone' }, rulesOf(S)).id).toBe('s3');
    expect(shiftOf(nine5, rulesOf({ ...S, defaultShiftId: 's2' })).id).toBe('s1');
  });
});

describe('runDailyRules', () => {
  const scanned = (id, date) => ({ id: `${id}${date}`, employeeId: id, date, status: 'Present', checkIn: '09:00' });

  it('marks everyone without a record Absent, leaving existing records alone', () => {
    const attendance = [scanned('a', '2026-11-16'), { id: 'x', employeeId: 'c', date: '2026-11-16', status: 'Paid Leave' }];
    const { attendance: next, summary } = runDailyRules('2026-11-16', { employees: [emp('a'), emp('b'), emp('c')], attendance, settings: S });
    expect(summary.absent).toEqual(['b']);
    expect(next.find((r) => r.employeeId === 'b')).toMatchObject({ status: 'Absent', auto: true });
    expect(next.find((r) => r.employeeId === 'c').status).toBe('Paid Leave');
  });

  it('marks nobody absent when nobody scanned', () => {
    const r = runDailyRules('2026-11-16', { employees: [emp('a')], attendance: [], settings: S });
    expect(r.attendance).toBeNull();
    expect(r.summary.skipped).toBe('no_scans');
  });

  it('skips inactive staff and days before joining', () => {
    const r = runDailyRules('2026-11-16', {
      employees: [emp('a'), emp('b', { status: 'Inactive' }), emp('c', { joiningDate: '2026-11-20' })],
      attendance: [scanned('a', '2026-11-16')], settings: S,
    });
    expect(r.attendance).toBeNull();
  });

  it('marks weekly offs (company and per-person) and holidays instead of Absent', () => {
    const settings = { ...S, holidays: [{ date: '2026-11-18', name: 'Diwali' }] };
    const sun = runDailyRules('2026-11-15', { employees: [emp('a'), emp('b', { weeklyOffDay: '1' })], attendance: [], settings });
    expect(sun.summary.weeklyOff).toEqual(['a']);
    const mon = runDailyRules('2026-11-16', { employees: [emp('a'), emp('b', { weeklyOffDay: '1' })], attendance: [scanned('a', '2026-11-16')], settings });
    expect(mon.summary.weeklyOff).toEqual(['b']);
    const hol = runDailyRules('2026-11-18', { employees: [emp('a')], attendance: [], settings });
    expect(hol.attendance[0]).toMatchObject({ status: 'Holiday', remarks: 'Diwali' });
    expect(hol.summary.skipped).toBeNull();
  });

  it('sandwich rule: Absent Saturday and Monday makes Sunday Absent', () => {
    const attendance = [
      { id: '1', employeeId: 'a', date: '2026-11-14', status: 'Absent' },
      { id: '2', employeeId: 'a', date: '2026-11-15', status: 'Weekly Off', auto: true },
      scanned('b', '2026-11-16'),
    ];
    const { attendance: next, summary } = runDailyRules('2026-11-16', { employees: [emp('a'), emp('b')], attendance, settings: S });
    expect(summary.sandwich).toEqual([{ employeeId: 'a', date: '2026-11-15' }]);
    expect(next.find((r) => r.date === '2026-11-15').status).toBe('Absent');
  });

  it('sandwich rule needs both sides Absent and can be switched off', () => {
    const attendance = [
      { id: '1', employeeId: 'a', date: '2026-11-14', status: 'Present' },
      scanned('b', '2026-11-16'),
    ];
    expect(runDailyRules('2026-11-16', { employees: [emp('a'), emp('b')], attendance, settings: S }).summary.sandwich).toEqual([]);
    const both = [{ id: '1', employeeId: 'a', date: '2026-11-14', status: 'Absent' }, scanned('b', '2026-11-16')];
    expect(runDailyRules('2026-11-16', { employees: [emp('a'), emp('b')], attendance: both, settings: { ...S, sandwichRule: false } }).summary.sandwich).toEqual([]);
  });

  it('does nothing when the rules are off', () => {
    expect(runDailyRules('2026-11-16', { employees: [emp('a')], attendance: [scanned('b', '2026-11-16')], settings: { ...S, autoRules: false } }).attendance).toBeNull();
  });
});

describe('late marks in salary', () => {
  const late = (date, status = 'Present') => ({ date, status, late: true });

  it('every 3 late marks deduct half a day', () => {
    const recs = [late('2026-11-02'), late('2026-11-03'), late('2026-11-04'), late('2026-11-05'), late('2026-11-06'), late('2026-11-07')];
    expect(latePenalty(recs, S)).toEqual({ lateDays: 6, latePenaltyDays: 1 });
    expect(getAttendanceStats(recs, S).deductionDays).toBe(1);
  });

  it('late marks on days already deducted, or with the penalty off, cost nothing extra', () => {
    expect(latePenalty([late('a', 'Half Day'), late('b', 'Absent'), late('c')], S).latePenaltyDays).toBe(0);
    expect(latePenalty([late('a'), late('b'), late('c')], { ...S, latesPerHalfDay: 0 }).latePenaltyDays).toBe(0);
  });

  it('holidays do not deduct', () => {
    expect(getAttendanceStats([{ date: '2026-11-18', status: 'Holiday' }], S)).toMatchObject({ holidayDays: 1, deductionDays: 0 });
  });
});

describe('offStatusFor', () => {
  it('per-person weekly off overrides the company one; "none" means no weekly off', () => {
    const rules = rulesOf(S);
    expect(offStatusFor(emp('a'), '2026-11-15', rules)).toBe('Weekly Off');
    expect(offStatusFor(emp('a', { weeklyOffDay: 'none' }), '2026-11-15', rules)).toBeNull();
    expect(offStatusFor(emp('a', { weeklyOffDay: '2' }), '2026-11-17', rules)).toBe('Weekly Off');
  });
});
