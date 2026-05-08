import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Users, CalendarCheck, Calculator,
  CreditCard, BarChart2, Settings, Building2,
} from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';

const nav = [
  { to: '/',            label: 'Dashboard',         icon: LayoutDashboard },
  { to: '/employees',   label: 'Employees',          icon: Users },
  { to: '/attendance',  label: 'Attendance',         icon: CalendarCheck },
  { to: '/salary',      label: 'Salary Calculator',  icon: Calculator },
  { to: '/advances',    label: 'Advance Management', icon: CreditCard },
  { to: '/reports',     label: 'Reports',            icon: BarChart2 },
  { to: '/settings',    label: 'Settings',           icon: Settings },
];

export default function Sidebar({ onClose }) {
  const { settings } = useApp();
  return (
    <div className="h-full bg-white border-r border-gray-200 flex flex-col">
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-gray-200">
        <div className="bg-blue-600 p-2 rounded-lg">
          <Building2 size={20} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">{settings.companyName || 'My Company'}</p>
          <p className="text-xs text-gray-400">Attendance Manager</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto scrollbar-thin">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              }`
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="px-4 py-4 border-t border-gray-200">
        <p className="text-xs text-gray-400 text-center">v1.0.0 • Local Storage</p>
      </div>
    </div>
  );
}
