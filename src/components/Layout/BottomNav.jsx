import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Users, CalendarCheck, Package, Calculator } from 'lucide-react';

const nav = [
  { to: '/',             label: 'Home',       icon: LayoutDashboard },
  { to: '/employees',    label: 'Staff',      icon: Users },
  { to: '/attendance',   label: 'Attendance', icon: CalendarCheck },
  { to: '/lace-packing', label: 'Lace',       icon: Package },
  { to: '/salary',       label: 'Salary',     icon: Calculator },
];

export default function BottomNav() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 flex">
      {nav.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            `flex-1 flex flex-col items-center py-2 gap-0.5 text-xs font-medium transition-colors ${
              isActive ? 'text-blue-600' : 'text-gray-500'
            }`
          }
        >
          <Icon size={20} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
