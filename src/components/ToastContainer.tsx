"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Info, CheckCircle, AlertTriangle, AlertCircle, X } from 'lucide-react';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  type?: 'info' | 'success' | 'warn' | 'error';
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    const handleToastEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ title: string; description?: string; type?: ToastItem['type'] }>;
      if (!customEvent.detail) return;

      const newToast: ToastItem = {
        id: crypto.randomUUID(),
        title: customEvent.detail.title,
        description: customEvent.detail.description,
        type: customEvent.detail.type || 'info',
      };

      setToasts((prev) => [...prev, newToast]);

      // Auto dismiss after 4 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== newToast.id));
      }, 4000);
    };

    window.addEventListener('app-toast', handleToastEvent);
    return () => {
      window.removeEventListener('app-toast', handleToastEvent);
    };
  }, []);

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none font-sans">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95, transition: { duration: 0.15 } }}
            className="pointer-events-auto w-full bg-slate-900/95 border border-slate-800/80 backdrop-blur-md rounded-xl p-4 shadow-2xl flex gap-3 items-start justify-between relative overflow-hidden text-slate-100"
          >
            {/* Shutter line at the bottom of the toast as a progress indicator */}
            <motion.div 
              initial={{ width: '100%' }}
              animate={{ width: 0 }}
              transition={{ duration: 4, ease: 'linear' }}
              className="absolute bottom-0 left-0 h-[2px] bg-sky-500"
            />

            <div className="p-1 rounded-lg bg-sky-500/10 text-sky-400">
              <Sparkles className="w-4 h-4 animate-pulse" />
            </div>

            <div className="flex-1 flex flex-col gap-0.5 min-w-0 pr-2">
              <span className="text-xs font-bold font-display tracking-tight text-white">{toast.title}</span>
              {toast.description && (
                <span className="text-[11px] text-slate-400 leading-normal">{toast.description}</span>
              )}
            </div>

            <button 
              onClick={() => removeToast(toast.id)}
              className="text-slate-500 hover:text-slate-300 transition-colors p-0.5 rounded hover:bg-slate-800/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
