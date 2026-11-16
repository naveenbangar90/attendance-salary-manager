import React from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({ isOpen, onConfirm, onCancel, title = 'Confirm Delete', message = 'Are you sure? This action cannot be undone.', confirmLabel = 'Delete', danger = true }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-4">
          <div className={`p-2 rounded-full ${danger ? 'bg-red-100' : 'bg-yellow-100'}`}>
            <AlertTriangle size={22} className={danger ? 'text-red-600' : 'text-yellow-600'} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {/* whitespace-pre-line so callers can lay out figures on their own lines —
                a settlement summary is unreadable as one run-on paragraph. */}
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-line break-words">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 mt-6 justify-end">
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} className={`px-4 py-2 text-sm rounded-lg text-white ${danger ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-500 hover:bg-yellow-600'}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
