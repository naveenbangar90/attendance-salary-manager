import React, { useState } from 'react';
import { Save, AlertTriangle, Database, Trash2, Settings as SettingsIcon } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';

export default function Settings() {
  const { settings, updateSettings, loadSampleData, clearAllData } = useApp();
  const [form, setForm] = useState(settings);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [saved, setSaved] = useState(false);

  const F = (f) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value;
    setForm((p) => ({ ...p, [f]: val }));
    setSaved(false);
  };

  const handleSave = (e) => {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';
  const Section = ({ title, children }) => (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 space-y-4">
      <h2 className="text-sm font-semibold text-gray-700 border-b border-gray-100 pb-2">{title}</h2>
      {children}
    </div>
  );

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-2xl">
      <Section title="Company Information">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Company Name</label>
          <input className={inp} value={form.companyName} onChange={F('companyName')} placeholder="My Company" />
        </div>
      </Section>

      <Section title="Salary Calculation">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Total Working Days / Month</label>
            <input className={inp} type="number" min="1" max="31" value={form.totalWorkingDays} onChange={F('totalWorkingDays')} />
            <p className="text-xs text-gray-400 mt-1">Used to calculate daily salary. Common values: 26, 27, 30.</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <input type="checkbox" id="weeklyOffPaid" checked={form.weeklyOffPaid} onChange={F('weeklyOffPaid')} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
          <div>
            <label htmlFor="weeklyOffPaid" className="text-sm font-medium text-gray-700 cursor-pointer">Weekly Off is Paid</label>
            <p className="text-xs text-gray-400">When enabled, Weekly Off days count as paid days.</p>
          </div>
        </div>
      </Section>

      <Section title="Overtime Settings">
        <div className="flex items-start gap-3 mb-3">
          <input type="checkbox" id="overtimeEnabled" checked={form.overtimeEnabled} onChange={F('overtimeEnabled')} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
          <div>
            <label htmlFor="overtimeEnabled" className="text-sm font-medium text-gray-700 cursor-pointer">Enable Overtime Calculation</label>
            <p className="text-xs text-gray-400">Show overtime hours in attendance and add to salary.</p>
          </div>
        </div>
        {form.overtimeEnabled && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Overtime Rate per Hour (₹)</label>
            <input className={`${inp} max-w-xs`} type="number" min="0" value={form.overtimeRatePerHour} onChange={F('overtimeRatePerHour')} placeholder="50" />
          </div>
        )}
      </Section>

      <Section title="Late Fine Settings">
        <div className="flex items-start gap-3 mb-3">
          <input type="checkbox" id="lateFineEnabled" checked={form.lateFineEnabled} onChange={F('lateFineEnabled')} className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600" />
          <div>
            <label htmlFor="lateFineEnabled" className="text-sm font-medium text-gray-700 cursor-pointer">Enable Late Fine</label>
            <p className="text-xs text-gray-400">Allow entering late fines per attendance record.</p>
          </div>
        </div>
        {form.lateFineEnabled && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Default Late Fine Amount (₹)</label>
            <input className={`${inp} max-w-xs`} type="number" min="0" value={form.defaultLateFineAmount} onChange={F('defaultLateFineAmount')} placeholder="0" />
          </div>
        )}
      </Section>

      <div className="flex gap-3">
        <button type="submit" className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors ${saved ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
          <Save size={16} /> {saved ? 'Saved!' : 'Save Settings'}
        </button>
      </div>

      {/* Danger Zone */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-red-700 flex items-center gap-2"><AlertTriangle size={16} /> Data Management</h2>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={loadSampleData}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700">
            <Database size={15} /> Load Sample Data
          </button>
          <button type="button" onClick={() => setShowClearConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700">
            <Trash2 size={15} /> Clear All Data
          </button>
        </div>
        <p className="text-xs text-red-600">"Clear All Data" permanently deletes all employees, attendance, and advance records from this device.</p>
      </div>

      <ConfirmDialog isOpen={showClearConfirm} title="Clear All Data"
        message="This will delete ALL employees, attendance records, and advances. This cannot be undone. Are you sure?"
        confirmLabel="Yes, Clear Everything"
        onConfirm={() => { clearAllData(); setShowClearConfirm(false); }}
        onCancel={() => setShowClearConfirm(false)} />
    </form>
  );
}
