import React from 'react';
import { Menu, Bell } from 'lucide-react';
import { useLocation } from 'react-router-dom';

const titles = {
  '/':             'Dashboard',
  '/employees':    'Employees',
  '/attendance':   'Attendance',
  '/lace-packing': 'Lace Packing',
  '/salary':       'Salary Calculator',
  '/advances':     'Advance Management',
  '/reports':      'Reports',
  '/settings':     'Settings',
};

export default function Header({ onMenuClick }) {
  const { pathname } = useLocation();
  const title = titles[pathname] || 'Attendance Manager';
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <Menu size={20} />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-400 hidden sm:block">
          {new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
    </header>
  );
}
