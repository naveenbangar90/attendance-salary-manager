import React from 'react';
import { CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { useApp } from '../../context/AppContext.jsx';

const icons = {
  success: <CheckCircle size={18} className="text-green-500 flex-shrink-0" />,
  error:   <XCircle    size={18} className="text-red-500   flex-shrink-0" />,
  warning: <AlertCircle size={18} className="text-yellow-500 flex-shrink-0" />,
};

const bg = { success: 'bg-green-50 border-green-200', error: 'bg-red-50 border-red-200', warning: 'bg-yellow-50 border-yellow-200' };

export default function ToastContainer() {
  const { toasts, removeToast } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="fixed top-4 right-4 z-[999] flex flex-col gap-2 max-w-sm w-full px-2">
      {toasts.map((t) => (
        <div key={t.id} className={`flex items-start gap-3 p-3 rounded-lg border shadow-lg ${bg[t.type] || bg.success} animate-fade-in`}>
          {icons[t.type] || icons.success}
          <span className="text-sm text-gray-800 flex-1">{t.message}</span>
          <button onClick={() => removeToast(t.id)} className="text-gray-400 hover:text-gray-600"><X size={14} /></button>
        </div>
      ))}
    </div>
  );
}
