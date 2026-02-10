'use client';

import { useEffect } from 'react';
import { ToastState } from './types';

interface ToastNotificationProps {
  state: ToastState;
  onClose: () => void;
}

export function ToastNotification({ state, onClose }: ToastNotificationProps) {
  useEffect(() => {
    if (state.visible && !state.action) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.visible, state.action, onClose]);

  if (!state.visible) return null;

  return (
    <div className={`toast toast-${state.type}`}>
      <span>{state.message}</span>
      {state.action && (
        <button className="toast-action" onClick={state.action.onClick}>
          {state.action.label}
        </button>
      )}
      <button className="toast-close" onClick={onClose}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
