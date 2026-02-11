// Local storage persistence for DagbanGraph
import { useSyncExternalStore, useCallback, useRef, useEffect, useMemo } from 'react';
import { DagbanGraph, placeholderUsers } from './types';

const STORAGE_VERSION = 1;
const DEFAULT_PROJECT_ID = 'default';

interface StorageEnvelope {
  version: number;
  data: DagbanGraph;
  savedAt: string;
}

function slugifyId(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizeGraph(graph: DagbanGraph): DagbanGraph {
  const users = Array.isArray(graph.users) ? [...graph.users] : [];
  const traversers = Array.isArray(graph.traversers) ? [...graph.traversers] : [];

  const userById = new Map(users.map(user => [user.id, user]));
  const userByName = new Map(users.map(user => [user.name.toLowerCase(), user]));
  let nextUserId = users.length + 1;

  const cards = graph.cards.map(card => {
    if (!card.assignee) return card;
    if (userById.has(card.assignee)) return card;

    const byName = userByName.get(card.assignee.toLowerCase());
    if (byName) {
      return { ...card, assignee: byName.id };
    }

    const generatedId = slugifyId(card.assignee) || `user-${nextUserId++}`;
    const newUser = { id: generatedId, name: card.assignee };
    users.push(newUser);
    userById.set(newUser.id, newUser);
    userByName.set(newUser.name.toLowerCase(), newUser);
    return { ...card, assignee: newUser.id };
  });

  if (users.length === 0) {
    users.push(...placeholderUsers.map(user => ({ ...user })));
    users.forEach(user => userById.set(user.id, user));
  }

  const edgeIds = new Set(graph.edges.map(edge => edge.id));
  const userIds = new Set(users.map(user => user.id));
  const normalizedTraversers = traversers
    .filter(traverser => edgeIds.has(traverser.edgeId) && userIds.has(traverser.userId))
    .map(traverser => ({
      ...traverser,
      position: typeof traverser.position === 'number'
        ? Math.min(Math.max(traverser.position, 0), 1)
        : 0,
    }));

  return {
    ...graph,
    users,
    cards,
    traversers: normalizedTraversers,
  };
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
): [DagbanGraph, (graph: DagbanGraph | ((prev: DagbanGraph) => DagbanGraph)) => void] {
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const normalizedFallback = useMemo(() => normalizeGraph(fallback), [fallback]);
  const graphRef = useRef<DagbanGraph>(normalizedFallback);
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
    return normalizedFallback;
  }, [normalizedFallback]);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = loadGraph(projectId);
    if (saved) {
      const normalized = normalizeGraph(saved);
      graphRef.current = normalized;
      // Notify subscribers
      listenersRef.current.forEach(cb => cb());
      return;
    }

    // No saved graph; seed storage with fallback so the graph isn't empty.
    graphRef.current = normalizedFallback;
    listenersRef.current.forEach(cb => cb());
    saveGraph(normalizedFallback, projectId);
  }, [projectId, normalizedFallback]);

  const graph = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Set graph with debounced auto-save
  const setGraph = useCallback((nextGraph: DagbanGraph | ((prev: DagbanGraph) => DagbanGraph)) => {
    const resolved = typeof nextGraph === 'function'
      ? nextGraph(graphRef.current)
      : nextGraph;
    graphRef.current = normalizeGraph(resolved);

    // Notify subscribers
    listenersRef.current.forEach(cb => cb());

    // Clear any pending save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Debounce save by 500ms to avoid excessive writes
    saveTimeoutRef.current = setTimeout(() => {
      saveGraph(graphRef.current, projectId);
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
