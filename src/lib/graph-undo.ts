import { useCallback, useEffect, useRef } from 'react';
import type { DagbanGraph } from './types';

type GraphUpdateOptions = {
  recordUndo?: boolean;
  transient?: boolean;
};

const MAX_UNDO = 50;
const TRANSIENT_RESET_MS = 300;

const scheduleMicrotask = (callback: () => void) => {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(callback);
  } else {
    Promise.resolve().then(callback);
  }
};

export function useGraphUndo(
  setGraph: (nextGraph: DagbanGraph | ((prev: DagbanGraph) => DagbanGraph)) => void
) {
  const undoStackRef = useRef<DagbanGraph[]>([]);
  const pendingUndoRef = useRef<DagbanGraph | null>(null);
  const batchTokenRef = useRef(0);
  const transientLockRef = useRef(false);
  const transientTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushUndoSnapshot = useCallback((snapshot: DagbanGraph) => {
    undoStackRef.current.push(snapshot);
    if (undoStackRef.current.length > MAX_UNDO) {
      undoStackRef.current.shift();
    }
  }, []);

  const flushPendingUndo = useCallback(() => {
    if (!pendingUndoRef.current) return;
    batchTokenRef.current += 1;
    pushUndoSnapshot(pendingUndoRef.current);
    pendingUndoRef.current = null;
  }, [pushUndoSnapshot]);

  const recordUndoSnapshot = useCallback((snapshot: DagbanGraph, options?: { transient?: boolean }) => {
    if (options?.transient) {
      if (!transientLockRef.current) {
        pushUndoSnapshot(snapshot);
        transientLockRef.current = true;
      }
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
      }
      transientTimerRef.current = setTimeout(() => {
        transientLockRef.current = false;
        transientTimerRef.current = null;
      }, TRANSIENT_RESET_MS);
      return;
    }

    if (transientLockRef.current) {
      return;
    }

    if (!pendingUndoRef.current) {
      pendingUndoRef.current = snapshot;
      const token = ++batchTokenRef.current;
      scheduleMicrotask(() => {
        if (batchTokenRef.current !== token) return;
        if (!pendingUndoRef.current) return;
        pushUndoSnapshot(pendingUndoRef.current);
        pendingUndoRef.current = null;
      });
    }
  }, [pushUndoSnapshot]);

  const applyGraphUpdate = useCallback((
    updater: (prev: DagbanGraph) => DagbanGraph,
    options?: GraphUpdateOptions
  ) => {
    setGraph(prev => {
      const next = updater(prev);
      if (next !== prev && options?.recordUndo !== false) {
        recordUndoSnapshot(prev, { transient: options?.transient });
      }
      return next;
    });
  }, [setGraph, recordUndoSnapshot]);

  const handleUndo = useCallback(() => {
    flushPendingUndo();
    if (transientTimerRef.current) {
      clearTimeout(transientTimerRef.current);
      transientTimerRef.current = null;
    }
    transientLockRef.current = false;
    const snapshot = undoStackRef.current.pop();
    if (!snapshot) return false;
    setGraph(snapshot);
    return true;
  }, [setGraph, flushPendingUndo]);

  const clearUndo = useCallback(() => {
    undoStackRef.current = [];
    pendingUndoRef.current = null;
    batchTokenRef.current += 1;
    if (transientTimerRef.current) {
      clearTimeout(transientTimerRef.current);
      transientTimerRef.current = null;
    }
    transientLockRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (transientTimerRef.current) {
        clearTimeout(transientTimerRef.current);
      }
    };
  }, []);

  return {
    applyGraphUpdate,
    handleUndo,
    clearUndo,
  };
}

export type { GraphUpdateOptions };
