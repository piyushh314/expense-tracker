// ============================================================
// Toast notification context with undo support
// ============================================================
import { createContext, useContext, useState, useCallback, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Undo2 } from 'lucide-react';

interface Toast {
  id: string;
  message: string;
  onUndo?: () => void;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, options?: { onUndo?: () => void; duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType>({ showToast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counterRef = useRef(0);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, options?: { onUndo?: () => void; duration?: number }) => {
      const id = `toast-${++counterRef.current}`;
      const duration = options?.duration ?? 5000;
      setToasts(prev => [...prev, { id, message, onUndo: options?.onUndo, duration }]);
      setTimeout(() => removeToast(id), duration);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 w-[90vw] max-w-sm md:bottom-6">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div
              key={toast.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              className="bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-2xl px-4 py-3 shadow-2xl flex items-center gap-3 text-sm font-medium"
            >
              <span className="flex-1">{toast.message}</span>
              {toast.onUndo && (
                <button
                  onClick={() => {
                    toast.onUndo?.();
                    removeToast(toast.id);
                  }}
                  className="flex items-center gap-1 text-blue-400 dark:text-blue-600 font-semibold hover:text-blue-300 transition-colors shrink-0"
                >
                  <Undo2 size={14} />
                  Undo
                </button>
              )}
              <button
                onClick={() => removeToast(toast.id)}
                className="text-gray-400 hover:text-gray-200 dark:text-gray-500 dark:hover:text-gray-700 transition-colors"
              >
                <X size={16} />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

