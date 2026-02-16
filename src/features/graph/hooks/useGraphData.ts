'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Traverser } from '@/lib/types';
import { getGradientColor, computeIndegrees, computeOutdegrees, getMaxDegree } from '@/lib/colors';
import {
  getAvatarCSSStyles,
  getAvatarHTMLContent,
} from '@/lib/avatar';
import { ROOT_TRAVERSER_PREFIX } from '../traverserConstants';
import type { GraphNodeData, GraphLinkData, DisplayMode, ViewMode, ColorMode } from '../types';

// Lazy-loaded three.js modules (only loaded client-side)
let THREE: typeof import('three') | null = null;
let CSS2DRenderer: typeof import('three/examples/jsm/renderers/CSS2DRenderer.js').CSS2DRenderer | null = null;
let CSS2DObject: typeof import('three/examples/jsm/renderers/CSS2DRenderer.js').CSS2DObject | null = null;

// Initialize three.js modules (called only on client)
async function initThree() {
  if (!THREE) {
    THREE = await import('three');
    const css2d = await import('three/examples/jsm/renderers/CSS2DRenderer.js');
    CSS2DRenderer = css2d.CSS2DRenderer;
    CSS2DObject = css2d.CSS2DObject;
  }
}

// Dim a hex color by reducing its saturation and adding transparency
function dimColor(hex: string): string {
  // Handle rgba format
  if (hex.startsWith('rgba')) {
    return hex.replace(/[\d.]+\)$/, '0.25)');
  }
  // Convert hex to rgb and add low opacity
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, 0.25)`;
}

export type GraphThemeState = {
  fuseRed: string;
  fuseOrange: string;
  fuseYellow: string;
  categoryDefault: string;
};

export type UseGraphDataProps = {
  data: GraphData;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  nodeRadius: number;
  selectedAssignees: Set<string>;
  selectedCategories: Set<string>;
  selectedStatuses: Set<string>;
  searchQuery: string;
  blockerThreshold: number;
  burntAgeThreshold: number;
};

const BURNT_AGE_MAX = 30;

export function useGraphData({
  data,
  graphRef,
  containerRef,
  viewMode,
  displayMode,
  colorMode,
  nodeRadius,
  selectedAssignees,
  selectedCategories,
  selectedStatuses,
  searchQuery,
  blockerThreshold,
  burntAgeThreshold,
}: UseGraphDataProps) {
  // Keep stable graph data and node/link identities to avoid full re-init on updates
  const graphDataRef = useRef<{ nodes: GraphNodeData[]; links: GraphLinkData[] }>({ nodes: [], links: [] });
  const nodeByIdRef = useRef<Map<string, GraphNodeData>>(new Map());
  const linkByIdRef = useRef<Map<string, GraphLinkData>>(new Map());
  const graphStructureSignatureRef = useRef<string>('');
  const pendingStructuralUpdateRef = useRef(false);
  const pendingVisualUpdateRef = useRef(false);
  const pendingLabelUpdatesRef = useRef<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelCacheRef = useRef<Map<string, { el: HTMLDivElement; obj: any }>>(new Map());
  const nodeBckgDimensionsRef = useRef<Map<string, [number, number]>>(new Map());
  const hasSeededGraphRef = useRef(false);

  const [graphReady, setGraphReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [css2DRendererInstance, setCss2DRendererInstance] = useState<any>(null);
  const initialGraphData = useMemo(() => ({ nodes: [] as GraphNodeData[], links: [] as GraphLinkData[] }), []);
  const [graphDataView, setGraphDataView] = useState<{ nodes: GraphNodeData[]; links: GraphLinkData[] }>(initialGraphData);
  const [graphDataForForce, setGraphDataForForce] = useState(initialGraphData);
  const [graphTheme, setGraphTheme] = useState<GraphThemeState>(() => ({
    fuseRed: '#560D07',
    fuseOrange: '#D70C00',
    fuseYellow: '#FEDB00',
    categoryDefault: '#6b7280',
  }));

  // --- Three.js lazy loading ---

  // Load three.js on mount
  useEffect(() => {
    initThree().then(() => {
      if (CSS2DRenderer) {
        setCss2DRendererInstance(new CSS2DRenderer());
      }
    });
  }, []);

  // --- Graph ready polling ---

  // Track when the graph API is available (react-force-graph ref is ready)
  useEffect(() => {
    if (graphReady) return;

    let rafId: number | null = null;
    const checkReady = () => {
      if (graphRef.current && typeof graphRef.current.graphData === 'function') {
        setGraphReady(true);
        return;
      }
      rafId = requestAnimationFrame(checkReady);
    };
    rafId = requestAnimationFrame(checkReady);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [graphReady]);

  // --- Theme loading ---

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const container = containerRef.current;
    if (!container) return;

    // Theme/personalization hook: override these CSS vars per project/user on .graph-shell or :root.
    const updateThemeFromCss = () => {
      const rootStyles = getComputedStyle(document.documentElement);
      const containerStyles = getComputedStyle(container);
      const resolveVar = (name: string, fallback: string) => {
        const local = containerStyles.getPropertyValue(name).trim();
        if (local) return local;
        const root = rootStyles.getPropertyValue(name).trim();
        return root || fallback;
      };

      setGraphTheme({
        fuseRed: resolveVar('--graph-color-fuse-red', '#560D07'),
        fuseOrange: resolveVar('--graph-color-fuse-orange', '#D70C00'),
        fuseYellow: resolveVar('--graph-color-fuse-yellow', '#FEDB00'),
        categoryDefault: resolveVar('--graph-color-category-default', '#6b7280'),
      });
    };

    updateThemeFromCss();

    const observer = new MutationObserver(updateThemeFromCss);
    observer.observe(container, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });

    return () => observer.disconnect();
  }, []);

  // --- Memoized data maps ---

  const themedCategories = useMemo(() => (
    data.categories.map(category => (
      category.color
        ? category
        : { ...category, color: graphTheme.categoryDefault }
    ))
  ), [data.categories, graphTheme.categoryDefault]);

  const cardById = useMemo(() => new Map(data.cards.map(card => [card.id, card])), [data.cards]);

  const isBurntNodeId = useCallback((nodeId: string) => {
    return Boolean(cardById.get(nodeId)?.burntAt);
  }, [cardById]);

  const edgeById = useMemo(() => new Map(data.edges.map(edge => [edge.id, edge])), [data.edges]);
  const traverserByEdgeId = useMemo(() => new Map((data.traversers || []).map(traverser => [traverser.edgeId, traverser])), [data.traversers]);
  const traverserById = useMemo(() => new Map((data.traversers || []).map(traverser => [traverser.id, traverser])), [data.traversers]);
  const userById = useMemo(() => new Map((data.users || []).map(user => [user.id, user])), [data.users]);
  const rootTraverserByNodeId = useMemo(() => {
    const map = new Map<string, Traverser>();
    (data.traversers || []).forEach(traverser => {
      if (!traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) return;
      const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
      if (!nodeId) return;
      map.set(nodeId, traverser);
    });
    return map;
  }, [data.traversers]);

  const getAssigneeName = useCallback((assigneeId?: string) => {
    if (!assigneeId) return '';
    return userById.get(assigneeId)?.name || assigneeId;
  }, [userById]);

  // Compute degree maps for color modes
  const { indegrees, outdegrees, maxIndegree, maxOutdegree } = useMemo(() => {
    const indegrees = computeIndegrees(data.edges);
    const outdegrees = computeOutdegrees(data.edges);
    return {
      indegrees,
      outdegrees,
      maxIndegree: getMaxDegree(indegrees),
      maxOutdegree: getMaxDegree(outdegrees),
    };
  }, [data.edges]);

  // Compute blocker counts (outdegree - how many cards each card blocks)
  const blockerCounts = useMemo(() => {
    const counts = new Map<string, number>();
    data.edges.forEach(edge => {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
    });
    return counts;
  }, [data.edges]);

  const cardStatusById = useMemo(() => {
    const map = new Map<string, 'blocked' | 'active' | 'done'>();
    data.cards.forEach(card => {
      map.set(card.id, getCardStatus(card, data.edges, data.cards));
    });
    return map;
  }, [data.cards, data.edges]);

  const eligibleTraverserEdgeIds = useMemo(() => {
    const eligible = new Set<string>();
    data.edges.forEach(edge => {
      const status = cardStatusById.get(edge.target);
      if (status !== 'active') return;
      if (traverserByEdgeId.has(edge.id)) return;
      eligible.add(edge.id);
    });
    return eligible;
  }, [data.edges, cardStatusById, traverserByEdgeId]);

  const rootActiveNodeIds = useMemo(() => {
    const ids = new Set<string>();
    data.cards.forEach(card => {
      const status = cardStatusById.get(card.id);
      const indegree = indegrees.get(card.id) || 0;
      if (indegree === 0 && status === 'active') {
        ids.add(card.id);
      }
    });
    return ids;
  }, [data.cards, cardStatusById, indegrees]);

  // Check if a card matches the current filters
  const cardMatchesFilter = useCallback((card: Card, status: 'blocked' | 'active' | 'done'): boolean => {
    // Check search query first
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const titleMatch = card.title.toLowerCase().includes(query);
      const descMatch = card.description?.toLowerCase().includes(query);
      if (!titleMatch && !descMatch) return false;
    }

    // Check category filter
    if (selectedCategories.size > 0) {
      if (!selectedCategories.has(card.categoryId)) return false;
    }

    // Check status filter
    if (selectedStatuses.size > 0) {
      if (!selectedStatuses.has(status)) return false;
    }

    // Check assignee filter
    if (selectedAssignees.size > 0) {
      if (card.assignee) {
        if (!selectedAssignees.has(card.assignee)) return false;
      } else {
        if (!selectedAssignees.has('__unassigned__')) return false;
      }
    }

    // Check blocker threshold
    if (blockerThreshold > 0) {
      const blockerCount = blockerCounts.get(card.id) || 0;
      if (blockerCount < blockerThreshold) return false;
    }

    // Burnt age filter: 0 hides all burnt, max shows all burnt
    if (card.burntAt) {
      if (burntAgeThreshold === 0) return false;
      if (burntAgeThreshold < BURNT_AGE_MAX) {
        const burntAt = Date.parse(card.burntAt);
        if (!Number.isNaN(burntAt)) {
          const ageDays = (Date.now() - burntAt) / (1000 * 60 * 60 * 24);
          if (ageDays > burntAgeThreshold) return false;
        }
      }
    }

    return true;
  }, [searchQuery, selectedCategories, selectedStatuses, selectedAssignees, blockerThreshold, blockerCounts, burntAgeThreshold]);

  // --- Label management functions ---

  const getOrCreateLabelEntry = useCallback((nodeId: string) => {
    const cache = labelCacheRef.current;
    let entry = cache.get(nodeId);
    if (!entry) {
      entry = { el: document.createElement('div'), obj: null };
      cache.set(nodeId, entry);
    }
    return entry;
  }, []);

  const updateNodeLabelElement = useCallback((node: GraphNodeData, mode: DisplayMode) => {
    const entry = getOrCreateLabelEntry(node.id);
    const nodeEl = entry.el;
    nodeEl.className = 'node-label';
    nodeEl.style.color = node.color;
    nodeEl.style.display = 'flex';
    nodeEl.style.alignItems = 'center';
    nodeEl.style.gap = '4px';

    if (mode === 'labels') {
      nodeEl.textContent = node.title;
      return entry;
    }

    if (mode === 'full') {
      const avatarSize = 16;
      const avatarStyles = getAvatarCSSStyles(avatarSize);
      const avatarContent = getAvatarHTMLContent(getAssigneeName(node.card.assignee), 10);
      nodeEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 5px; flex-direction: row;">
          <span>${node.title}</span>
          <div style="${avatarStyles}">
            ${avatarContent}
          </div>
        </div>
      `;
      return entry;
    }

    nodeEl.textContent = '';
    return entry;
  }, [getOrCreateLabelEntry, getAssigneeName]);

  // Reconcile dagban data into stable graph data without recreating nodes/links.
  const applyPendingGraphUpdates = useCallback(() => {
    if (displayMode !== 'balls' && pendingLabelUpdatesRef.current.size > 0) {
      graphDataRef.current.nodes.forEach(node => {
        if (pendingLabelUpdatesRef.current.has(node.id)) {
          updateNodeLabelElement(node, displayMode);
        }
      });
      pendingLabelUpdatesRef.current.clear();
    }

    if (!graphReady || !graphRef.current || typeof graphRef.current.graphData !== 'function') {
      return;
    }

    if (pendingStructuralUpdateRef.current) {
      graphRef.current.graphData(graphDataRef.current);
      pendingStructuralUpdateRef.current = false;
      pendingVisualUpdateRef.current = false;
    } else if (pendingVisualUpdateRef.current && typeof graphRef.current.refresh === 'function') {
      graphRef.current.refresh();
      pendingVisualUpdateRef.current = false;
    }
  }, [graphReady, displayMode, updateNodeLabelElement]);

  // --- Main graph data reconciliation effect ---

  // Reconcile Dagban data into the stable graph data store.
  useEffect(() => {
    const nodeById = nodeByIdRef.current;
    const linkById = linkByIdRef.current;

    let structuralChanged = false;
    let visualChanged = false;
    const labelChangedNodeIds: string[] = [];

    // Check if any filters are active
    const hasActiveFilters = selectedAssignees.size > 0 ||
      selectedCategories.size > 0 ||
      selectedStatuses.size > 0 ||
      searchQuery.length > 0;

    const seenNodeIds = new Set<string>();

    for (const card of data.cards) {
      seenNodeIds.add(card.id);

      const status = getCardStatus(card, data.edges, data.cards);
      const categoryColor = getCardColor(card, status, themedCategories);
      const matchesFilter = cardMatchesFilter(card, status);

      // Compute color based on colorMode
      let color: string;
      if (colorMode === 'indegree') {
        const degree = indegrees.get(card.id) || 0;
        color = getGradientColor('indegree', degree, maxIndegree);
      } else if (colorMode === 'outdegree') {
        const degree = outdegrees.get(card.id) || 0;
        color = getGradientColor('outdegree', degree, maxOutdegree);
      } else {
        color = categoryColor;
      }

      if (status === 'done') {
        color = getCardColor(card, status, themedCategories);
      }

      // Dim the color if node doesn't match filter
      if (!matchesFilter && hasActiveFilters) {
        color = dimColor(color);
      }

      let node = nodeById.get(card.id);
      if (!node) {
        node = {
          id: card.id,
          title: card.title,
          color,
          status,
          card,
          matchesFilter,
        };
        nodeById.set(card.id, node);
        structuralChanged = true;
        continue;
      }

      const updates: Partial<GraphNodeData> = {};
      let shouldUpdateLabel = false;
      let didUpdate = false;

      if (node.title !== card.title) {
        updates.title = card.title;
        visualChanged = true;
        shouldUpdateLabel = true;
      }

      if (node.color !== color) {
        updates.color = color;
        visualChanged = true;
        if (displayMode !== 'balls') {
          shouldUpdateLabel = true;
        }
      }

      if (node.status !== status) {
        updates.status = status;
      }

      if (node.matchesFilter !== matchesFilter) {
        updates.matchesFilter = matchesFilter;
        visualChanged = true;
      }

      if (node.card !== card) {
        const assigneeChanged = node.card.assignee !== card.assignee;
        updates.card = card;
        if (displayMode === 'full' && assigneeChanged) {
          visualChanged = true;
          shouldUpdateLabel = true;
        }
      }

      if (Object.keys(updates).length > 0) {
        try {
          Object.assign(node, updates);
          didUpdate = true;
        } catch {
          const replacement: GraphNodeData = { ...node, ...updates };
          nodeById.set(replacement.id, replacement);
          node = replacement;
          structuralChanged = true;
          didUpdate = true;
        }
      }

      if (didUpdate && shouldUpdateLabel) {
        labelChangedNodeIds.push(node.id);
      }
    }

    for (const [nodeId] of nodeById) {
      if (!seenNodeIds.has(nodeId)) {
        nodeById.delete(nodeId);
        labelCacheRef.current.delete(nodeId);
        nodeBckgDimensionsRef.current.delete(nodeId);
        structuralChanged = true;
      }
    }

    const seenEdgeIds = new Set<string>();
    for (const edge of data.edges) {
      seenEdgeIds.add(edge.id);
      let link = linkById.get(edge.id);
      if (!link) {
        link = {
          source: edge.source,
          target: edge.target,
          edge,
        };
        linkById.set(edge.id, link);
        structuralChanged = true;
        continue;
      }

      const linkSourceId = typeof link.source === 'string' ? link.source : link.source.id;
      const linkTargetId = typeof link.target === 'string' ? link.target : link.target.id;
      const linkUpdates: Partial<GraphLinkData> = {};

      if (linkSourceId !== edge.source) {
        linkUpdates.source = edge.source;
        structuralChanged = true;
      }

      if (linkTargetId !== edge.target) {
        linkUpdates.target = edge.target;
        structuralChanged = true;
      }

      if (link.edge !== edge) {
        linkUpdates.edge = edge;
      }

      if (Object.keys(linkUpdates).length > 0) {
        try {
          Object.assign(link, linkUpdates);
        } catch {
          const replacement: GraphLinkData = { ...link, ...linkUpdates };
          linkById.set(edge.id, replacement);
          link = replacement;
          structuralChanged = true;
        }
      }
    }

    for (const [edgeId] of linkById) {
      if (!seenEdgeIds.has(edgeId)) {
        linkById.delete(edgeId);
        structuralChanged = true;
      }
    }

    const nodes = data.cards
      .map(card => nodeById.get(card.id))
      .filter(Boolean) as GraphNodeData[];

    const links = data.edges
      .map(edge => linkById.get(edge.id))
      .filter(Boolean) as GraphLinkData[];

    const nextGraphData = { nodes, links };
    const nextSignature = `${nodes.map(node => node.id).join('|')}::${links.map(link => link.edge.id).join('|')}`;
    const signatureChanged = nextSignature !== graphStructureSignatureRef.current;
    if (signatureChanged) {
      graphStructureSignatureRef.current = nextSignature;
    }

    graphDataRef.current = nextGraphData;
    if (signatureChanged || !hasSeededGraphRef.current) {
      setGraphDataView(nextGraphData);
      setGraphDataForForce(nextGraphData);
      hasSeededGraphRef.current = true;
    }

    if (structuralChanged || signatureChanged) {
      pendingStructuralUpdateRef.current = true;
    }
    if (visualChanged) {
      pendingVisualUpdateRef.current = true;
    }
    if (labelChangedNodeIds.length > 0) {
      labelChangedNodeIds.forEach(nodeId => pendingLabelUpdatesRef.current.add(nodeId));
    }

    applyPendingGraphUpdates();
  }, [
    data.cards,
    data.edges,
    themedCategories,
    colorMode,
    indegrees,
    outdegrees,
    maxIndegree,
    maxOutdegree,
    cardMatchesFilter,
    selectedAssignees,
    selectedCategories,
    selectedStatuses,
    searchQuery,
    displayMode,
    applyPendingGraphUpdates,
  ]);

  useEffect(() => {
    applyPendingGraphUpdates();
  }, [applyPendingGraphUpdates, graphReady]);

  return {
    // Three.js module references
    THREE,
    CSS2DObject,
    CSS2DRenderer,

    // State
    graphReady,
    graphDataView,
    graphDataForForce,
    css2DRendererInstance,
    graphTheme,

    // Refs (returned for use by other hooks and DagbanGraph)
    graphDataRef,
    nodeByIdRef,
    linkByIdRef,
    nodeBckgDimensionsRef,
    labelCacheRef,

    // Memoized data maps
    themedCategories,
    cardById,
    isBurntNodeId,
    edgeById,
    traverserByEdgeId,
    traverserById,
    userById,
    rootTraverserByNodeId,
    getAssigneeName,
    indegrees,
    outdegrees,
    maxIndegree,
    maxOutdegree,
    blockerCounts,
    cardStatusById,
    eligibleTraverserEdgeIds,
    rootActiveNodeIds,
    cardMatchesFilter,

    // Label management
    getOrCreateLabelEntry,
    updateNodeLabelElement,
    applyPendingGraphUpdates,
  };
}
