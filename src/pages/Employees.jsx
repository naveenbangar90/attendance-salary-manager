import React, { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, UserCheck, UserX, Users } from 'lucide-react';
import { useApp } from '../context/AppContext.jsx';
import Modal from '../components/Common/Modal.jsx';
import ConfirmDialog from '../components/Common/ConfirmDialog.jsx';
import EmptyState from '../components/Common/EmptyState.jsx';
import { formatCurrency } from '../utils/calculations.js';

const EMPTY_FORM = { employeeCode: '', name: '', mobile: '', role: '', monthlySalary: '', joiningDate: '', status: 'Active' };

function EmployeeForm({ initial = EMPTY_FORM, onSave, onCancel, settings }) {
  const [form, setForm] = useState(initial);
  const F = (field) => (e) => setForm((p) => ({ ...p, [field]: e.target.value }));

  const dailySalary = form.monthlySalary
    ? (parseFloat(form.monthlySalary) / (settings.totalWorkingDays || 26)).toFixed(2)
    : '0.00';

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.monthlySalary) return;
    onSave({ ...form, monthlySalary: parseFloat(form.monthlySalary) });
  };

  const inputCls = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Employee Code *</label>
          <input className={inputCls} value={form.employeeCode} onChange={F('employeeCode')} placeholder="EMP001" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Full Name *</label>
          <input className={inputCls} value={form.name} onChange={F('name')} placeholder="Rahul Sharma" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Number</label>
          <input className={inputCls} value={form.mobile} onChange={F('mobile')} placeholder="9876543210" maxLength={10} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Role / Designation</label>
          <input className={inputCls} value={form.role} onChange={F('role')} placeholder="Software Engineer" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Salary (₹) *</label>
          <input className={inputCls} type="number" value={form.monthlySalary} onChange={F('monthlySalary')} placeholder="25000" min="0" required />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Daily Salary (Auto)</label>
          <input className={`${inputCls} bg-gray-50 text-gray-500`} value={`₹${dailySalary}`} readOnly />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Joining Date</label>
          <input className={inputCls} type="date" value={form.joiningDate} onChange={F('joiningDate')} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
          <select className={inputCls} value={form.status} onChange={F('status')}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
        <button type="submit" className="px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">Save Employee</button>
      </div>
    </form>
  );
}

export default function Employees() {
  const { employees, settings, addEmployee, updateEmployee, deleteEmployee } = useApp();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modal, setModal] = useState(null); // null | 'add' | { id, ... }
  const [deleteId, setDeleteId] = useState(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return employees.filter((e) => {
      const matchSearch = !q || e.name.toLowerCase().includes(q) || e.mobile?.includes(q) || e.employeeCode?.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'All' || e.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [employees, search, statusFilter]);

  const handleSave = (data) => {
    if (modal === 'add') { addEmployee(data); }
    else { updateEmployee(modal.id, data); }
    setModal(null);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search by name, mobile, or code…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="All">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
        </select>
        <button onClick={() => setModal('add')} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 whitespace-nowrap">
          <Plus size={16} /> Add Employee
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-sm text-gray-600">
        <span className="flex items-center gap-1"><UserCheck size={14} className="text-green-500" /> {employees.filter(e => e.status === 'Active').length} Active</span>
        <span className="flex items-center gap-1"><UserX size={14} className="text-red-400" /> {employees.filter(e => e.status === 'Inactive').length} Inactive</span>
        <span className="text-gray-400">· {filtered.length} shown</span>
      </div>

      {/* Table / Cards */}
      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No employees found" description="Add your first employee or adjust search filters."
          action={<button onClick={() => setModal('add')} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">Add Employee</button>}
        />
      ) : (
        <>
          {/* Desktop Table */}
          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Code', 'Name', 'Mobile', 'Role', 'Monthly Salary', 'Daily Salary', 'Joining Date', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((emp) => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{emp.employeeCode}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{emp.name}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.mobile}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.role}</td>
                    <td className="px-4 py-3 font-semibold text-gray-800">{formatCurrency(emp.monthlySalary)}</td>
                    <td className="px-4 py-3 text-gray-600">{formatCurrency(emp.monthlySalary / settings.totalWorkingDays)}</td>
                    <td className="px-4 py-3 text-gray-500">{emp.joiningDate}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${emp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{emp.status}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => setModal(emp)} className="p-1.5 rounded hover:bg-blue-50 text-blue-600"><Edit2 size={14} /></button>
                        <button onClick={() => setDeleteId(emp.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filtered.map((emp) => (
              <div key={emp.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{emp.name}</p>
                    <p className="text-xs text-gray-400">{emp.employeeCode} · {emp.role}</p>
                    <p className="text-xs text-gray-500 mt-1">{emp.mobile}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${emp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>{emp.status}</span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div>
                    <p className="text-xs text-gray-400">Monthly</p>
                    <p className="text-sm font-bold text-gray-800">{formatCurrency(emp.monthlySalary)}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setModal(emp)} className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs rounded-lg"><Edit2 size={12} /></button>
                    <button onClick={() => setDeleteId(emp.id)} className="px-3 py-1.5 bg-red-50 text-red-500 text-xs rounded-lg"><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal === 'add' ? 'Add New Employee' : 'Edit Employee'} size="lg">
        <EmployeeForm
          initial={modal !== 'add' && modal ? modal : EMPTY_FORM}
          onSave={handleSave}
          onCancel={() => setModal(null)}
          settings={settings}
        />
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        title="Delete Employee"
        message="This will permanently delete the employee. Attendance and advance records will remain."
        onConfirm={() => { deleteEmployee(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
