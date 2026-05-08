import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import * as storage from '../utils/storage.js';

const AppContext = createContext(null);

export const useApp = () => {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
};

export const AppProvider = ({ children }) => {
  const [employees, setEmp]        = useState(() => storage.getEmployees());
  const [attendance, setAtt]       = useState(() => storage.getAttendance());
  const [advances, setAdv]         = useState(() => storage.getAdvances());
  const [lacePackingRecords, setLP] = useState(() => storage.getLacePacking());
  const [settings, setSet]         = useState(() => storage.getSettings());
  const [toasts, setToasts]        = useState([]);

  useEffect(() => { storage.setEmployees(employees); }, [employees]);
  useEffect(() => { storage.setAttendance(attendance); }, [attendance]);
  useEffect(() => { storage.setAdvances(advances); }, [advances]);
  useEffect(() => { storage.setLacePacking(lacePackingRecords); }, [lacePackingRecords]);
  useEffect(() => { storage.setSettings(settings); }, [settings]);

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((message, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3500);
  }, []);

  const removeToast = useCallback((id) => setToasts((p) => p.filter((t) => t.id !== id)), []);

  // ── Employees ──────────────────────────────────────────────────────────────
  const addEmployee = useCallback((data) => {
    const emp = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setEmp((p) => [...p, emp]);
    showToast('Employee added successfully');
    return emp;
  }, [showToast]);

  const updateEmployee = useCallback((id, data) => {
    setEmp((p) => p.map((e) => (e.id === id ? { ...e, ...data } : e)));
    showToast('Employee updated');
  }, [showToast]);

  const deleteEmployee = useCallback((id) => {
    setEmp((p) => p.filter((e) => e.id !== id));
    showToast('Employee deleted');
  }, [showToast]);

  // ── Attendance ─────────────────────────────────────────────────────────────
  const bulkSaveAttendance = useCallback((records) => {
    setAtt((prev) => {
      const map = new Map(prev.map((a) => [`${a.employeeId}_${a.date}`, a]));
      records.forEach((r) => {
        const key = `${r.employeeId}_${r.date}`;
        map.set(key, { ...map.get(key), ...r, id: map.get(key)?.id || (Date.now().toString() + Math.random()), createdAt: map.get(key)?.createdAt || new Date().toISOString() });
      });
      return Array.from(map.values());
    });
    showToast('Attendance saved');
  }, [showToast]);

  const updateAttendance = useCallback((id, data) => {
    setAtt((p) => p.map((a) => (a.id === id ? { ...a, ...data } : a)));
    showToast('Attendance updated');
  }, [showToast]);

  const deleteAttendance = useCallback((id) => {
    setAtt((p) => p.filter((a) => a.id !== id));
    showToast('Attendance record deleted');
  }, [showToast]);

  // ── Advances ───────────────────────────────────────────────────────────────
  const addAdvance = useCallback((data) => {
    const amount = parseFloat(data.amount);
    const adv = { ...data, id: Date.now().toString(), amount, deductedAmount: 0, remainingAmount: amount, status: 'Pending', createdAt: new Date().toISOString() };
    setAdv((p) => [...p, adv]);
    showToast('Advance added');
    return adv;
  }, [showToast]);

  const updateAdvance = useCallback((id, data) => {
    setAdv((p) => p.map((a) => (a.id === id ? { ...a, ...data } : a)));
    showToast('Advance updated');
  }, [showToast]);

  const deleteAdvance = useCallback((id) => {
    setAdv((p) => p.filter((a) => a.id !== id));
    showToast('Advance deleted');
  }, [showToast]);

  // Apply a deduction to one or more pending advances for an employee
  const applyAdvanceDeduction = useCallback((employeeId, deductAmount) => {
    let remaining = parseFloat(deductAmount);
    setAdv((prev) => {
      const updated = prev.map((a) => {
        if (a.employeeId !== employeeId || a.status === 'Deducted' || remaining <= 0) return a;
        const canDeduct = Math.min(parseFloat(a.remainingAmount), remaining);
        remaining -= canDeduct;
        const newDeducted = parseFloat(a.deductedAmount) + canDeduct;
        const newRemaining = parseFloat(a.amount) - newDeducted;
        return {
          ...a,
          deductedAmount: newDeducted,
          remainingAmount: Math.max(0, newRemaining),
          status: newRemaining <= 0.01 ? 'Deducted' : 'Partially Deducted',
        };
      });
      return updated;
    });
  }, []);

  // ── Lace Packing ───────────────────────────────────────────────────────────
  const addLacePacking = useCallback((data) => {
    const record = { ...data, id: Date.now().toString(), createdAt: new Date().toISOString() };
    setLP((p) => [...p, record]);
    showToast('Lace packing entry added');
    return record;
  }, [showToast]);

  const updateLacePacking = useCallback((id, data) => {
    setLP((p) => p.map((r) => (r.id === id ? { ...r, ...data } : r)));
    showToast('Entry updated');
  }, [showToast]);

  const deleteLacePacking = useCallback((id) => {
    setLP((p) => p.filter((r) => r.id !== id));
    showToast('Entry deleted');
  }, [showToast]);

  // ── Settings ───────────────────────────────────────────────────────────────
  const updateSettings = useCallback((data) => {
    setSet((p) => ({ ...p, ...data }));
    showToast('Settings saved');
  }, [showToast]);

  // ── Sample / Reset ─────────────────────────────────────────────────────────
  const loadSampleData = useCallback(async () => {
    const { sampleEmployees, sampleAttendance, sampleAdvances } = await import('../utils/sampleData.js');
    setEmp(sampleEmployees);
    setAtt(sampleAttendance);
    setAdv(sampleAdvances);
    showToast('Sample data loaded!');
  }, [showToast]);

  const clearAllData = useCallback(() => {
    setEmp([]); setAtt([]); setAdv([]); setLP([]);
    showToast('All data cleared');
  }, [showToast]);

  const value = {
    employees, attendance, advances, lacePackingRecords, settings, toasts,
    showToast, removeToast,
    addEmployee, updateEmployee, deleteEmployee,
    bulkSaveAttendance, updateAttendance, deleteAttendance,
    addAdvance, updateAdvance, deleteAdvance, applyAdvanceDeduction,
    addLacePacking, updateLacePacking, deleteLacePacking,
    updateSettings,
    loadSampleData, clearAllData,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
