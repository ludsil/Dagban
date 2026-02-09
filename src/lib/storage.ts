// Local storage persistence for DagbanGraph
import { useSyncExternalStore, useCallback, useRef, useEffect } from 'react';
import { DagbanGraph } from './types';

const STORAGE_VERSION = 1;
const DEFAULT_PROJECT_ID = 'default';

interface StorageEnvelope {
  version: number;
  data: DagbanGraph;
  savedAt: string;
}

function getStorageKey(projectId: string = DEFAULT_PROJECT_ID): string {
  return `dagban:project:${projectId}`;
}

/**
 * Save a DagbanGraph to localStorage
 */
export function saveGraph(graph: DagbanGraph, projectId: string = DEFAULT_PROJECT_ID): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const envelope: StorageEnvelope = {
      version: STORAGE_VERSION,
      data: graph,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getStorageKey(projectId), JSON.stringify(envelope));
    // Notify any listeners
    window.dispatchEvent(new StorageEvent('storage', { key: getStorageKey(projectId) }));
    return true;
  } catch (error) {
    console.error('Failed to save graph to localStorage:', error);
    return false;
  }
}

/**
 * Load a DagbanGraph from localStorage
 * Returns null if no saved data or on error
 */
export function loadGraph(projectId: string = DEFAULT_PROJECT_ID): DagbanGraph | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(getStorageKey(projectId));
    if (!raw) return null;

    const envelope: StorageEnvelope = JSON.parse(raw);

    // Version check - could add migrations here in the future
    if (envelope.version !== STORAGE_VERSION) {
      console.warn(`Storage version mismatch: expected ${STORAGE_VERSION}, got ${envelope.version}`);
      // For now, just return the data; add migrations as needed
    }

    return envelope.data;
  } catch (error) {
    console.error('Failed to load graph from localStorage:', error);
    return null;
  }
}

/**
 * Clear saved graph data for a project
 */
export function clearGraph(projectId: string = DEFAULT_PROJECT_ID): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(getStorageKey(projectId));
}

/**
 * Check if a saved graph exists for a project
 */
export function hasSavedGraph(projectId: string = DEFAULT_PROJECT_ID): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(getStorageKey(projectId)) !== null;
}

/**
 * Hook to use persisted graph with auto-save
 * Uses useSyncExternalStore for proper React 18+ hydration
 */
export function usePersistedGraph(
  fallback: DagbanGraph,
  projectId: string = DEFAULT_PROJECT_ID
): [DagbanGraph, (graph: DagbanGraph) => void] {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const graphRef = useRef<DagbanGraph>(fallback);
  const listenersRef = useRef<Set<() => void>>(new Set());

  // Subscribe function for useSyncExternalStore
  const subscribe = useCallback((callback: () => void) => {
    listenersRef.current.add(callback);
    return () => {
      listenersRef.current.delete(callback);
    };
  }, []);

  // Get snapshot for client
  const getSnapshot = useCallback(() => {
    return graphRef.current;
  }, []);

  // Get server snapshot (fallback data)
  const getServerSnapshot = useCallback(() => {
    return fallback;
  }, [fallback]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadGraph(projectId);
    if (saved) {
      graphRef.current = saved;
      // Notify subscribers
      listenersRef.current.forEach(cb => cb());
    }
  }, [projectId]);

  const graph = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Set graph with debounced auto-save
  const setGraph = useCallback((newGraph: DagbanGraph) => {
    graphRef.current = newGraph;

    // Notify subscribers
    listenersRef.current.forEach(cb => cb());

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 500ms to avoid excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      saveGraph(newGraph, projectId);
    }, 500);
  }, [projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return [graph, setGraph];
}
