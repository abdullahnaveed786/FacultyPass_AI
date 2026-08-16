import React, { createContext, useContext, useState, useCallback } from 'react';

const NotificationContext = createContext(null);

export const NotificationProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addNotification = useCallback((message, type = 'info', duration = 5000) => {
    const safeMessage = typeof message === 'string'
      ? message
      : typeof message === 'object' && message !== null
      ? (Array.isArray(message) ? message.map(m => (typeof m === 'object' ? JSON.stringify(m) : String(m))).join('; ') : JSON.stringify(message))
      : String(message);

    const id = Date.now();
    setToasts((prev) => [...prev, { id, message: safeMessage, type }]);
    
    // Auto-remove toast after duration
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeNotification = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <NotificationContext.Provider value={{ addNotification }}>
      {children}
      {/* Toast Render Area */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-start justify-between gap-3 p-4 rounded-xl shadow-lg border text-xs font-semibold tracking-wide transition-all transform duration-300 translate-x-0 ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-800'
                : toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-800'
                : toast.type === 'warning'
                ? 'bg-amber-50/95 border-amber-200 text-amber-800'
                : 'bg-indigo-50/95 border-indigo-100/50 text-indigo-800'
            }`}
          >
            <div className="flex-1 leading-relaxed">
              {toast.message}
            </div>
            <button
              onClick={() => removeNotification(toast.id)}
              className="text-slate-400 hover:text-slate-700 transition-colors text-sm font-normal leading-none"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
