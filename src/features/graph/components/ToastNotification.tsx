'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { ToastState } from '../types';

/** Auto-dismiss duration: longer for toasts with actions so the user can click */
const DISMISS_MS = 2000;
const DISMISS_WITH_ACTION_MS = 2000;

interface ToastNotificationProps {
  state: ToastState;
  onClose: () => void;
}

export function ToastNotification({ state, onClose }: ToastNotificationProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const duration = state.action ? DISMISS_WITH_ACTION_MS : DISMISS_MS;

  useEffect(() => {
    if (!state.visible) return;

    // Kick off the progress bar drain after a frame
    // so the browser registers the initial 100% width first.
    const raf = requestAnimationFrame(() => {
      if (barRef.current) {
        barRef.current.style.transition = `width ${duration}ms linear`;
        barRef.current.style.width = '0%';
      }
    });

    const timer = setTimeout(onClose, duration);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [state.visible, state.action, duration, onClose]);

  if (!state.visible) return null;

  return (
    <div className="toast">
      <span>{state.message}</span>
      {state.action && (
        <button className="toast-action" onClick={state.action.onClick}>
          {state.action.label}
        </button>
      )}
      <button className="toast-close" onClick={onClose}>
        <X className="size-3" />
      </button>
      <div className="toast-progress">
        <div
          ref={barRef}
          className="toast-progress-fill"
          style={{ width: '100%' }}
        />
      </div>
    </div>
  );
}
