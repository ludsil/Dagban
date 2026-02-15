'use client';

import { useCallback, useEffect, useRef, useState, useMemo, type FormEvent } from 'react';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Category, Traverser } from '@/lib/types';
import { getGradientColor, computeIndegrees, computeOutdegrees, getMaxDegree } from '@/lib/colors';
import {
  getAvatarConfig,
  drawAvatar,
  drawAvatarCircle,
  drawAvatarInitials,
  drawAvatarPlaceholder,
  getAvatarCSSStyles,
  getAvatarHTMLContent,
  getInitials,
} from '@/lib/avatar';

import { useTraverserSystem } from './hooks/useTraverserSystem';
import type { TraverserTuning } from './traverserTuning';
import { ROOT_TRAVERSER_PREFIX } from './traverserConstants';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Import extracted components
import {
  CardDetailPanel,
  CardCreationForm,
  ToastNotification,
  KeyboardShortcutsHelp,
  GraphCanvasLayer,
  GraphHudLeft,
  GraphHudRight,
  GraphOverlays,
  // Types
  GraphNodeData,
  GraphLinkData,
  SelectedNodeInfo,
  CardCreationState,
  EdgeContextMenuState,
  HoverTooltipState,
  ToastState,
  ConnectionModeState,
  ViewMode,
  DisplayMode,
  ColorMode,
  ArrowMode,
} from './components';

const INITIAL_3D_CAMERA_DISTANCE = 300;

interface Props {
  data: GraphData;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
  onCategoryAdd?: (category: Category) => void;
  onCategoryDelete?: (categoryId: string) => void;
  onCardCreate?: (card: Card, parentCardId?: string, childCardId?: string) => void;
  onCardDelete?: (cardId: string) => void;
  onEdgeCreate?: (sourceId: string, targetId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onUserAdd?: (name: string) => void;
  onTraverserCreate?: (traverser: Traverser) => void;
  onTraverserUpdate?: (
    traverserId: string,
    updates: Partial<Traverser>,
    options?: { transient?: boolean; recordUndo?: boolean }
  ) => void;
  onTraverserDelete?: (traverserId: string) => void;
  onGraphImport?: (graph: GraphData) => void;
  onUndo?: () => boolean;
  projectHud?: React.ReactNode;
  showSettingsProp?: boolean;
  triggerNewNode?: boolean;
  devDatasetMode?: 'sample' | 'miserables';
  onDevDatasetModeChange?: (mode: 'sample' | 'miserables') => void;
  traverserTuning?: Partial<TraverserTuning>;
}

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

// Generate unique ID for new cards
function generateId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateTraverserId(): string {
  return `traverser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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

export default function DagbanGraph({
  data,
  onCardChange,
  onCardCreate,
  onCardDelete,
  onEdgeCreate,
  onEdgeDelete,
  onUserAdd,
  onTraverserCreate,
  onTraverserUpdate,
  onTraverserDelete,
  onGraphImport,
  onUndo,
  projectHud,
  showSettingsProp = true,
  triggerNewNode = false,
  devDatasetMode,
  onDevDatasetModeChange,
  traverserTuning,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const initial3DCameraSetRef = useRef(false);
  // Keep stable graph data and node/link identities to avoid full re-init on updates
  const graphDataRef = useRef<{ nodes: GraphNodeData[]; links: GraphLinkData[] }>({ nodes: [], links: [] });
  const nodeByIdRef = useRef<Map<string, GraphNodeData>>(new Map());
  const linkByIdRef = useRef<Map<string, GraphLinkData>>(new Map());
  const graphStructureSignatureRef = useRef<string>('');
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('balls');
  const [nodeRadius, setNodeRadius] = useState(8);
  const [colorMode, setColorMode] = useState<ColorMode>('category');
  const [arrowMode, setArrowMode] = useState<ArrowMode>('end');
  const showSettings = showSettingsProp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [css2DRendererInstance, setCss2DRendererInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [graphReady, setGraphReady] = useState(false);
  const pendingStructuralUpdateRef = useRef(false);
  const pendingVisualUpdateRef = useRef(false);
  const pendingLabelUpdatesRef = useRef<Set<string>>(new Set());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const labelCacheRef = useRef<Map<string, { el: HTMLDivElement; obj: any }>>(new Map());
  const nodeBckgDimensionsRef = useRef<Map<string, [number, number]>>(new Map());
  const initialGraphData = useMemo(() => ({ nodes: [] as GraphNodeData[], links: [] as GraphLinkData[] }), []);
  const [graphDataView, setGraphDataView] = useState<{ nodes: GraphNodeData[]; links: GraphLinkData[] }>(initialGraphData);
  const hasSeededGraphRef = useRef(false);
  const [graphDataForForce, setGraphDataForForce] = useState(initialGraphData);

  // Card creation form state
  const [cardCreation, setCardCreation] = useState<CardCreationState>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    description: '',
    parentNodeId: null,
    childNodeId: null,
  });

  // Hover tooltip state (tracks which node is hovered for keyboard shortcuts)
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    nodeId: null,
    color: null,
    assignee: null,
  });

  // Toast notification state
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Keyboard shortcuts help state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Add user dialog state
  const [addUserDialogOpen, setAddUserDialogOpen] = useState(false);
  const [addUserName, setAddUserName] = useState('');
  const addUserInputRef = useRef<HTMLInputElement | null>(null);

  // Connection mode state (for creating edges between nodes)
  const [connectionMode, setConnectionMode] = useState<ConnectionModeState>({
    active: false,
    sourceNode: null,
    direction: 'downstream',
  });

  // Drag-to-connect state
  const [dragConnect, setDragConnect] = useState<{
    active: boolean;
    sourceNode: GraphNodeData | null;
    targetNode: GraphNodeData | null;
    progress: number; // 0 to 1 (3 seconds)
    startTime: number | null;
  }>({
    active: false,
    sourceNode: null,
    targetNode: null,
    progress: 0,
    startTime: null,
  });
  const dragConnectAnimationRef = useRef<number | null>(null);

  const [renderTick, setRenderTick] = useState(0);
  const renderRafRef = useRef<number | null>(null);
  const [fuseAnimationTime, setFuseAnimationTime] = useState(0);
  const fuseAnimationRef = useRef<number | null>(null);
  const [graphTheme, setGraphTheme] = useState(() => ({
    fuseRed: '#560D07',
    fuseOrange: '#D70C00',
    fuseYellow: '#FEDB00',
    categoryDefault: '#6b7280',
  }));
  const [edgeStartPicker, setEdgeStartPicker] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);
  const [edgeContextMenu, setEdgeContextMenu] = useState<EdgeContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    containerX: 0,
    containerY: 0,
    edgeId: null,
  });
  const suppressBackgroundClickRef = useRef(false);

  // Filter state
  const BURNT_AGE_MAX = 30;
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [blockerThreshold, setBlockerThreshold] = useState(0);
  const [burntAgeThreshold, setBurntAgeThreshold] = useState(BURNT_AGE_MAX);

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

  // Show toast notification
  const showToast = useCallback((message: string, type: ToastState['type'] = 'info', action?: ToastState['action']) => {
    setToast({ visible: true, message, type, action });
  }, [getAssigneeName]);

  // Hide toast
  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const handleDownloadGraph = useCallback(() => {
    try {
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `dagban-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showToast('Downloaded graph JSON', 'success');
    } catch (error) {
      console.error('Failed to download graph JSON', error);
      showToast('Failed to download graph JSON', 'warning');
    }
  }, [data, showToast]);

  const handleUploadGraph = useCallback((file: File) => {
    if (!onGraphImport) {
      showToast('Upload not available in this view', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed = JSON.parse(text);
        const isValid =
          parsed &&
          typeof parsed === 'object' &&
          Array.isArray(parsed.cards) &&
          Array.isArray(parsed.edges) &&
          Array.isArray(parsed.categories) &&
          Array.isArray(parsed.users) &&
          Array.isArray(parsed.traversers);
        if (!isValid) {
          showToast('Invalid Dagban JSON format', 'warning');
          return;
        }
        onGraphImport(parsed as GraphData);
        showToast('Graph imported', 'success');
      } catch (error) {
        console.error('Failed to import graph JSON', error);
        showToast('Failed to import graph JSON', 'warning');
      }
    };
    reader.onerror = () => {
      showToast('Failed to read file', 'warning');
    };
    reader.readAsText(file);
  }, [onGraphImport, showToast]);

  // Handle assignee filter toggle
  const handleAssigneeToggle = useCallback((assignee: string) => {
    setSelectedAssignees(prev => {
      const next = new Set(prev);
      if (next.has(assignee)) {
        next.delete(assignee);
      } else {
        next.add(assignee);
      }
      return next;
    });
  }, []);

  const handleAddUserOpenChange = useCallback((open: boolean) => {
    setAddUserDialogOpen(open);
    if (!open) {
      setAddUserName('');
    }
  }, []);

  const handleAddUserSubmit = useCallback((event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!onUserAdd) return;
    const trimmed = addUserName.trim();
    if (!trimmed) return;
    onUserAdd(trimmed);
    setAddUserName('');
    setAddUserDialogOpen(false);
  }, [addUserName, onUserAdd]);

  const handleAddUser = useCallback(() => {
    if (!onUserAdd) return;
    setAddUserDialogOpen(true);
  }, [onUserAdd]);

  useEffect(() => {
    if (!addUserDialogOpen) return;
    const raf = requestAnimationFrame(() => {
      addUserInputRef.current?.focus();
      addUserInputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [addUserDialogOpen]);

  // Handle category filter toggle
  const handleCategoryToggle = useCallback((categoryId: string) => {
    setSelectedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  // Handle status filter toggle
  const handleStatusToggle = useCallback((status: string) => {
    setSelectedStatuses(prev => {
      const next = new Set(prev);
      if (next.has(status)) {
        next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  // Clear all filters
  const handleClearFilters = useCallback(() => {
    setSelectedAssignees(new Set());
    setSelectedCategories(new Set());
    setSelectedStatuses(new Set());
    setSearchQuery('');
    setBlockerThreshold(0);
    setBurntAgeThreshold(0);
  }, []);

  // Load three.js on mount
  useEffect(() => {
    initThree().then(() => {
      if (CSS2DRenderer) {
        setCss2DRendererInstance(new CSS2DRenderer());
      }
    });
  }, []);

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
  }, [searchQuery, selectedCategories, selectedStatuses, selectedAssignees, blockerThreshold, blockerCounts, burntAgeThreshold, BURNT_AGE_MAX]);

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

  const hasActiveFuses = useMemo(() => (data.traversers?.length ?? 0) > 0, [data.traversers]);

  useEffect(() => {
    if (viewMode !== '2D' || !hasActiveFuses) {
      if (fuseAnimationRef.current) {
        cancelAnimationFrame(fuseAnimationRef.current);
        fuseAnimationRef.current = null;
      }
      return;
    }

    const animate = (time: number) => {
      setFuseAnimationTime(time);
      fuseAnimationRef.current = requestAnimationFrame(animate);
    };

    fuseAnimationRef.current = requestAnimationFrame(animate);
    return () => {
      if (fuseAnimationRef.current) {
        cancelAnimationFrame(fuseAnimationRef.current);
        fuseAnimationRef.current = null;
      }
    };
  }, [viewMode, hasActiveFuses]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      if (!container.contains(target)) return;
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && target.closest('.graph-canvas')) {
        const selection = window.getSelection();
        if (selection && selection.type === 'Range') {
          selection.removeAllRanges();
        }
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('pointerdown', handlePointerDown);

    return () => {
      container.removeEventListener('wheel', handleWheel);
      container.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  // Ensure node labels refresh when display mode changes
  useEffect(() => {
    if (displayMode !== 'balls') {
      graphDataView.nodes.forEach(node => updateNodeLabelElement(node, displayMode));
    }
    if (graphRef.current && typeof graphRef.current.refresh === 'function') {
      graphRef.current.refresh();
    }
  }, [displayMode, graphDataView.nodes, updateNodeLabelElement]);

  // Resize handling
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Set initial camera distance for 3D mode (more zoomed in than default)
  useEffect(() => {
    if (viewMode !== '3D') {
      initial3DCameraSetRef.current = false;
      return;
    }
    if (!css2DRendererInstance || initial3DCameraSetRef.current) return;

    let rafId: number | null = null;
    const trySetCamera = () => {
      const graph = graphRef.current;
      if (graph?.cameraPosition) {
        // Set camera distance to INITIAL_3D_CAMERA_DISTANCE for a more zoomed-in view
        // (default is typically around 1000)
        graph.cameraPosition(
          { z: INITIAL_3D_CAMERA_DISTANCE },
          { x: 0, y: 0, z: 0 },
          0
        );
        initial3DCameraSetRef.current = true;
        return;
      }
      rafId = requestAnimationFrame(trySetCamera);
    };
    rafId = requestAnimationFrame(trySetCamera);
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [viewMode, css2DRendererInstance]);

  // Handle undo
  const handleUndo = useCallback(() => {
    if (!onUndo) {
      showToast('Nothing to undo', 'warning');
      return;
    }
    const didUndo = onUndo();
    if (didUndo === false) {
      showToast('Nothing to undo', 'warning');
      return;
    }
    showToast('Undone', 'success');
  }, [onUndo, showToast]);

  // Handle delete node
  const handleDeleteNode = useCallback((node: GraphNodeData) => {
    if (!onCardDelete) return;

    // Delete the card
    onCardDelete(node.id);

    // Show toast with undo option
    showToast(`Deleted "${node.title}"`, 'info', {
      label: 'Undo',
      onClick: () => {
        handleUndo();
      },
    });
  }, [onCardDelete, showToast, handleUndo]);

  // Start downstream connection mode - selected node becomes source, pick target
  const startDownstreamConnection = useCallback((sourceNode: GraphNodeData) => {
    setConnectionMode({
      active: true,
      sourceNode,
      direction: 'downstream',
    });
    showToast(`Click a node to make it downstream of "${sourceNode.title}"`, 'info');
  }, [showToast]);

  // Start upstream connection mode - selected node becomes target, pick source
  const startUpstreamConnection = useCallback((targetNode: GraphNodeData) => {
    if (isBurntNodeId(targetNode.id)) {
      showToast('Cannot add dependencies to a burnt node', 'warning');
      return;
    }
    setConnectionMode({
      active: true,
      sourceNode: targetNode, // Store the target node here, we'll swap in completeConnection
      direction: 'upstream',
    });
    showToast(`Click a node to make it upstream of "${targetNode.title}"`, 'info');
  }, [isBurntNodeId, showToast]);

  // Cancel connection mode
  const cancelConnectionMode = useCallback(() => {
    setConnectionMode({
      active: false,
      sourceNode: null,
      direction: 'downstream',
    });
  }, []);

  // Complete connection - create edge based on direction
  const completeConnection = useCallback((clickedNode: GraphNodeData) => {
    if (!connectionMode.sourceNode || !onEdgeCreate) return;

    // Determine source and target based on direction
    let sourceId: string;
    let targetId: string;

    if (connectionMode.direction === 'downstream') {
      // sourceNode -> clickedNode
      sourceId = connectionMode.sourceNode.id;
      targetId = clickedNode.id;
    } else {
      // clickedNode -> sourceNode (upstream)
      sourceId = clickedNode.id;
      targetId = connectionMode.sourceNode.id;
    }

    // Don't allow self-connections
    if (sourceId === targetId) {
      showToast('Cannot connect a node to itself', 'warning');
      return;
    }

    if (isBurntNodeId(targetId)) {
      showToast('Cannot add dependencies to a burnt node', 'warning');
      return;
    }

    // Check if edge already exists
    const edgeExists = data.edges.some(
      e => e.source === sourceId && e.target === targetId
    );
    if (edgeExists) {
      showToast('Connection already exists', 'warning');
      cancelConnectionMode();
      return;
    }

    // Create the edge
    onEdgeCreate(sourceId, targetId);
    const sourceNode = data.cards.find(c => c.id === sourceId);
    const targetNode = data.cards.find(c => c.id === targetId);
    showToast(`Connected "${sourceNode?.title}" -> "${targetNode?.title}"`, 'success');
    cancelConnectionMode();
  }, [connectionMode.sourceNode, connectionMode.direction, onEdgeCreate, data.edges, data.cards, isBurntNodeId, showToast, cancelConnectionMode]);

  // Fast root-node spawn for hotkey flow (blank title/description, editable later).
  const createEmptyRootNode = useCallback(() => {
    if (!onCardCreate) return;
    const now = new Date().toISOString();
    const newCard: Card = {
      id: generateId(),
      title: '',
      description: undefined,
      categoryId: themedCategories.length > 0 ? themedCategories[0].id : '',
      createdAt: now,
      updatedAt: now,
    };
    onCardCreate(newCard);
  }, [onCardCreate, themedCategories]);

  // Open card creation form for new root node
  const openRootNodeCreation = useCallback((initialTitle?: string) => {
    // Center on screen
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: initialTitle || '',
      description: '',
      parentNodeId: null,
      childNodeId: null,
    });
  }, []);

  // Trigger new node creation from parent component
  useEffect(() => {
    if (triggerNewNode) {
      openRootNodeCreation();
    }
  }, [triggerNewNode, openRootNodeCreation]);

  // Open card creation form for downstream task
  const openDownstreamCreation = useCallback((parentNode: GraphNodeData) => {
    // Position near the center of the screen
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: '',
      description: '',
      parentNodeId: parentNode.id,
      childNodeId: null,
    });
  }, []);

  // Open card creation form for upstream dependency
  const openUpstreamCreation = useCallback((childNode: GraphNodeData) => {
    if (isBurntNodeId(childNode.id)) {
      showToast('Cannot add dependencies to a burnt node', 'warning');
      return;
    }
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: '',
      description: '',
      parentNodeId: null,
      childNodeId: childNode.id,
    });
  }, [isBurntNodeId, showToast]);

  // Close card creation form
  const closeCardCreation = useCallback(() => {
    setCardCreation(prev => ({ ...prev, visible: false, title: '', description: '', parentNodeId: null, childNodeId: null }));
  }, []);

  // Handle card creation submission
  const handleCardCreation = useCallback(() => {
    const titleValue = typeof cardCreation.title === 'string' ? cardCreation.title : '';
    if (!titleValue.trim() || !onCardCreate) return;
    const descriptionValue = typeof cardCreation.description === 'string' ? cardCreation.description : '';

    if (cardCreation.childNodeId && isBurntNodeId(cardCreation.childNodeId)) {
      showToast('Cannot add dependencies to a burnt node', 'warning');
      return;
    }

    const now = new Date().toISOString();
    const newCard: Card = {
      id: generateId(),
      title: titleValue.trim(),
      description: descriptionValue.trim() || undefined,
      categoryId: themedCategories.length > 0 ? themedCategories[0].id : '',
      createdAt: now,
      updatedAt: now,
    };

    // Create the card with optional parent (downstream) or child (upstream)
    onCardCreate(
      newCard,
      cardCreation.parentNodeId || undefined,
      cardCreation.childNodeId || undefined
    );

    closeCardCreation();
  }, [cardCreation, themedCategories, onCardCreate, closeCardCreation, isBurntNodeId, showToast]);

  // Node radius
  const NODE_RADIUS = nodeRadius;
  const TRAVERSER_RADIUS = 9;
  const TRAVERSER_HIT_RADIUS = TRAVERSER_RADIUS + 4;
  const FUSE_COLOR = graphTheme.fuseOrange;
  const FUSE_GRADIENT_STOPS = useMemo(() => ([
    { stop: 0, color: graphTheme.fuseRed },
    { stop: 0.45, color: graphTheme.fuseOrange },
    { stop: 0.78, color: graphTheme.fuseYellow },
    { stop: 1, color: graphTheme.fuseRed },
  ]), [graphTheme.fuseRed, graphTheme.fuseOrange, graphTheme.fuseYellow]);
  const fuseGradientPhase = useMemo(() => (fuseAnimationTime * 0.00018) % 1, [fuseAnimationTime]);
  const BURNT_COLOR = 'rgba(17, 24, 39, 0.9)'; // dark gray
  const PENDING_RING_COLOR = 'rgba(148, 163, 184, 0.8)';
  const ROOT_RING_RADIUS = NODE_RADIUS + 10;

  const getGraphCoords = useCallback((clientX: number, clientY: number) => {
    const graph = graphRef.current;
    if (!graph || typeof graph.screen2GraphCoords !== 'function') {
      return null;
    }
    const canvas = typeof graph.canvas === 'function' ? graph.canvas() : null;
    if (!canvas) {
      return graph.screen2GraphCoords(clientX, clientY) as { x: number; y: number };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const localX = (clientX - rect.left) * scaleX;
    const localY = (clientY - rect.top) * scaleY;
    return graph.screen2GraphCoords(localX, localY) as { x: number; y: number };
  }, []);

  const getZoomScale = useCallback(() => {
    if (!graphRef.current || typeof graphRef.current.zoom !== 'function') {
      return 1;
    }
    return graphRef.current.zoom() as number;
  }, []);

  const getScreenCoords = useCallback((x: number, y: number) => {
    const graph = graphRef.current;
    if (!graph || typeof graph.graph2ScreenCoords !== 'function') {
      return null;
    }
    const coords = graph.graph2ScreenCoords(x, y) as { x: number; y: number } | null;
    if (!coords) return null;
    const canvas = typeof graph.canvas === 'function' ? graph.canvas() : null;
    if (!canvas) return coords;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const isAbsolute =
      coords.x >= rect.left &&
      coords.x <= rect.right &&
      coords.y >= rect.top &&
      coords.y <= rect.bottom;

    if (isAbsolute) {
      return {
        x: coords.x - rect.left,
        y: coords.y - rect.top,
      };
    }

    const isDevicePixels = coords.x > rect.width || coords.y > rect.height;
    if (isDevicePixels && scaleX && scaleY) {
      return {
        x: coords.x / scaleX,
        y: coords.y / scaleY,
      };
    }

    return coords;
  }, []);

  const getEdgeNodes = useCallback((edgeId: string) => {
    const link = linkByIdRef.current.get(edgeId);
    if (!link) return null;
    const sourceNode = typeof link.source === 'string'
      ? nodeByIdRef.current.get(link.source)
      : link.source;
    const targetNode = typeof link.target === 'string'
      ? nodeByIdRef.current.get(link.target)
      : link.target;
    if (!sourceNode || !targetNode) return null;
    if (sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) {
      return null;
    }
    return { sourceNode, targetNode };
  }, []);

  const getTraverserRenderPoint = useCallback((
    sourceNode: GraphNodeData,
    targetNode: GraphNodeData,
    position: number
  ) => {
    const sx = sourceNode.x ?? 0;
    const sy = sourceNode.y ?? 0;
    const tx = targetNode.x ?? 0;
    const ty = targetNode.y ?? 0;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (!dist) {
      return {
        x: sx,
        y: sy,
        startX: sx,
        startY: sy,
        clampedT: position,
        offsetT: 0,
      };
    }

    const ux = dx / dist;
    const uy = dy / dist;
    const safeOffset = Math.min(NODE_RADIUS, dist * 0.45);
    const offsetT = safeOffset / dist;
    const clampedT = clamp(position, offsetT, 1 - offsetT);
    const startX = sx + ux * safeOffset;
    const startY = sy + uy * safeOffset;
    const x = sx + dx * clampedT;
    const y = sy + dy * clampedT;

    return { x, y, startX, startY, clampedT, offsetT };
  }, [NODE_RADIUS]);

  const ROOT_START_ANGLE = -Math.PI / 2;

  const getRootTraverserPoint = useCallback((
    node: GraphNodeData,
    position: number
  ) => {
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;
    const angle = ROOT_START_ANGLE + clamp(position, 0, 1) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * ROOT_RING_RADIUS,
      y: cy + Math.sin(angle) * ROOT_RING_RADIUS,
      angle,
      startAngle: ROOT_START_ANGLE,
      radius: ROOT_RING_RADIUS,
    };
  }, [ROOT_RING_RADIUS, ROOT_START_ANGLE]);

  const getRootPositionFromCoords = useCallback((node: GraphNodeData, point: { x: number; y: number }) => {
    const dx = point.x - (node.x ?? 0);
    const dy = point.y - (node.y ?? 0);
    const angle = Math.atan2(dy, dx);
    let theta = angle - ROOT_START_ANGLE;
    if (theta < 0) theta += Math.PI * 2;
    return clamp(theta / (Math.PI * 2), 0, 1);
  }, [ROOT_START_ANGLE]);

  const getShiftedGradientStops = useCallback((phase: number) => {
    const epsilon = 0.0001;
    const stops = FUSE_GRADIENT_STOPS;
    let startIndex = stops.findIndex(stop => stop.stop >= phase);
    if (startIndex === -1) startIndex = 0;
    const rotated = [...stops.slice(startIndex), ...stops.slice(0, startIndex)].map(stop => {
      let shifted = stop.stop - phase;
      if (shifted < 0) shifted += 1;
      return { stop: shifted, color: stop.color };
    });
    const output: Array<{ stop: number; color: string }> = [];
    const first = rotated[0];
    const last = rotated[rotated.length - 1];
    if (first.stop > epsilon) {
      output.push({ stop: 0, color: last.color });
    }
    output.push(...rotated);
    if (last.stop < 1 - epsilon) {
      output.push({ stop: 1, color: first.color });
    }
    return output;
  }, [FUSE_GRADIENT_STOPS]);

  const getFuseGradient = useCallback((
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) => {
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    const shiftedStops = getShiftedGradientStops(fuseGradientPhase);
    shiftedStops.forEach(({ stop, color }) => gradient.addColorStop(stop, color));
    return gradient;
  }, [getShiftedGradientStops, fuseGradientPhase]);

  const getFuseRingGradient = useCallback((ctx: CanvasRenderingContext2D, centerX: number, centerY: number) => {
    const conicFactory = (ctx as CanvasRenderingContext2D & {
      createConicGradient?: (startAngle: number, x: number, y: number) => CanvasGradient;
    }).createConicGradient;
    if (typeof conicFactory !== 'function') {
      return FUSE_COLOR;
    }
    const gradient = conicFactory.call(ctx, -Math.PI / 2 + fuseGradientPhase * Math.PI * 2, centerX, centerY);
    FUSE_GRADIENT_STOPS.forEach(({ stop, color }) => gradient.addColorStop(stop, color));
    return gradient;
  }, [FUSE_COLOR, FUSE_GRADIENT_STOPS, fuseGradientPhase]);


  const bumpRenderTick = useCallback(() => {
    if (renderRafRef.current !== null) return;
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null;
      setRenderTick(prev => prev + 1);
    });
  }, []);

  const createTraverserForEdge = useCallback((edgeId: string, userId: string, position: number) => {
    const now = new Date().toISOString();
    return {
      id: generateTraverserId(),
      edgeId,
      userId,
      position: clamp(position, 0, 1),
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  const createTraverserForRoot = useCallback((nodeId: string, userId: string, position: number) => {
    const now = new Date().toISOString();
    return {
      id: generateTraverserId(),
      edgeId: `${ROOT_TRAVERSER_PREFIX}${nodeId}`,
      userId,
      position: clamp(position, 0, 1),
      createdAt: now,
      updatedAt: now,
    };
  }, []);

  const handleCardAssigneeChange = useCallback((cardId: string, assigneeId: string | null) => {
    if (onCardChange) {
      onCardChange(cardId, { assignee: assigneeId || undefined });
    }
    if (!assigneeId) return;
    if (!rootActiveNodeIds.has(cardId)) return;
    const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${cardId}`;
    const existing = traverserByEdgeId.get(rootEdgeId);
    if (existing) {
      if (existing.userId !== assigneeId && onTraverserUpdate) {
        onTraverserUpdate(existing.id, { userId: assigneeId, updatedAt: new Date().toISOString() });
      }
      return;
    }
    if (!onTraverserCreate) return;
    const traverser = createTraverserForRoot(cardId, assigneeId, 0);
    onTraverserCreate(traverser);
  }, [
    onCardChange,
    onTraverserCreate,
    onTraverserUpdate,
    rootActiveNodeIds,
    traverserByEdgeId,
    createTraverserForRoot,
  ]);

  const suppressNextBackgroundClick = useCallback(() => {
    suppressBackgroundClickRef.current = true;
    requestAnimationFrame(() => {
      suppressBackgroundClickRef.current = false;
    });
  }, []);

  const closeEdgeStartPicker = useCallback(() => {
    setEdgeStartPicker(null);
  }, []);

  const {
    pendingBurn,
    previewBurn,
    setPreviewBurn,
    beginPendingBurn,
    cancelPendingBurn,
    confirmPendingBurn,
    clearDetachedDrag,
    draggingUserId,
    draggingTraverserId,
    draggingUserGhost,
    detachedDrag,
    handleUserDragStart,
    handleUserDragEnd,
    handleUserDragOver,
    handleUserDrop,
    handleTraverserPointerDown,
    handleTraverserOverlayPointerDown,
    traverserOverlays,
  } = useTraverserSystem({
    data,
    viewMode,
    displayMode,
    nodeRadius: NODE_RADIUS,
    rootRingRadius: ROOT_RING_RADIUS,
    traverserHitRadius: TRAVERSER_HIT_RADIUS,
    containerRef,
    renderTick,
    graphDataView,
    nodeByIdRef,
    cardById,
    edgeById,
    traverserByEdgeId,
    traverserById,
    userById,
    rootActiveNodeIds,
    eligibleTraverserEdgeIds,
    getGraphCoords,
    getScreenCoords,
    getZoomScale,
    getEdgeNodes,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getRootPositionFromCoords,
    createTraverserForEdge,
    createTraverserForRoot,
    onTraverserCreate,
    onTraverserUpdate,
    onTraverserDelete,
    onCardChange,
    showToast,
    closeEdgeStartPicker,
    suppressNextBackgroundClick,
    tuning: traverserTuning,
  });

  useEffect(() => {
    if (graphRef.current && typeof graphRef.current.refresh === 'function') {
      graphRef.current.refresh();
    }
  }, [draggingUserId, pendingBurn?.targetNodeId]);

  const handleEdgeStartPickUser = useCallback((userId: string) => {
    if (!edgeStartPicker || !onTraverserCreate) return;
    const edgeId = edgeStartPicker.edgeId;
    if (traverserByEdgeId.has(edgeId)) {
      showToast('That edge already has a traverser', 'warning');
      closeEdgeStartPicker();
      return;
    }
    if (!eligibleTraverserEdgeIds.has(edgeId)) {
      showToast('That node is blocked or already complete', 'warning');
      closeEdgeStartPicker();
      return;
    }
    const traverser = createTraverserForEdge(edgeId, userId, 0);
    onTraverserCreate(traverser);
    closeEdgeStartPicker();
  }, [
    edgeStartPicker,
    onTraverserCreate,
    traverserByEdgeId,
    eligibleTraverserEdgeIds,
    createTraverserForEdge,
    showToast,
    closeEdgeStartPicker,
  ]);

  // Keyboard shortcuts handler (must be after handleDeleteNode and handleUndo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (pendingBurn && e.key === 'Enter') {
        e.preventDefault();
        confirmPendingBurn();
        return;
      }

      if (pendingBurn && e.key === 'Escape') {
        e.preventDefault();
        cancelPendingBurn();
        return;
      }

      if (previewBurn && e.key === 'Escape') {
        e.preventDefault();
        setPreviewBurn(null);
        return;
      }

      if (edgeStartPicker && e.key === 'Escape') {
        e.preventDefault();
        closeEdgeStartPicker();
        return;
      }

      // Escape cancels connection mode
      if (e.key === 'Escape' && connectionMode.active) {
        e.preventDefault();
        cancelConnectionMode();
        showToast('Connection cancelled', 'info');
        return;
      }

      // Cmd+Z / Ctrl+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // N - New root node
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        createEmptyRootNode();
      }

      // M - Hotkey map
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setShowShortcutsHelp(prev => !prev);
      }

      // ? - Show keyboard shortcuts help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowShortcutsHelp(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    hoverTooltip.nodeId,
    connectionMode.active,
    graphDataView.nodes,
    pendingBurn,
    previewBurn,
    edgeStartPicker,
    confirmPendingBurn,
    cancelPendingBurn,
    closeEdgeStartPicker,
    handleDeleteNode,
    handleUndo,
    createEmptyRootNode,
    cancelConnectionMode,
    showToast,
  ]);

  // Custom node rendering for 2D - matches text-nodes example exactly
  const nodeCanvasObject = useCallback((node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const rootTraverser = rootTraverserByNodeId.get(node.id);
    const rootAvailable = !rootTraverser || rootTraverser.id === detachedDrag?.traverserId;
    const isRootCandidate =
      ((Boolean(draggingUserId) || Boolean(detachedDrag?.traverserId)) && rootActiveNodeIds.has(node.id) && rootAvailable) ||
      (detachedDrag?.candidateRootNodeId === node.id);
    const isPendingBurn = pendingBurn?.targetNodeId === node.id;
    const isPreviewBurnt = previewBurn?.targetNodeId === node.id || isPendingBurn;
    const drawColor = isPreviewBurnt ? BURNT_COLOR : node.color;
    const rootProgress = rootTraverser ? clamp(rootTraverser.position, 0, 1) : null;

    // Check if this is the source node in connection mode
    const isConnectionSource = connectionMode.active && connectionMode.sourceNode?.id === node.id;

    // Check if this node is part of a drag-to-connect animation
    const isDragConnectTarget =
      dragConnect.active &&
      dragConnect.targetNode?.id === node.id &&
      !isBurntNodeId(node.id);
    const isDragConnectSource = dragConnect.active && dragConnect.sourceNode?.id === node.id;

    if (displayMode === 'balls') {
      if (rootTraverser && rootProgress !== null) {
        const startAngle = -Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x, y, ROOT_RING_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = Math.max(1.2 / globalScale, 0.6);
        ctx.stroke();

        if (rootProgress > 0) {
          ctx.beginPath();
          ctx.arc(x, y, ROOT_RING_RADIUS, startAngle, startAngle + rootProgress * Math.PI * 2);
          ctx.strokeStyle = getFuseRingGradient(ctx, x, y);
          ctx.lineWidth = Math.max(2 / globalScale, 1);
          ctx.stroke();
        }
      }

      // Draw glow effect for connection source
      if (isConnectionSource) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS + 6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.3)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw spinning circle animation for drag-to-connect on target node
      if (isDragConnectTarget && dragConnect.progress > 0) {
        const animRadius = NODE_RADIUS + 8;
        const progress = dragConnect.progress;
        const rotation = performance.now() / 200; // Spinning speed

        // Outer glow that grows with progress
        ctx.beginPath();
        ctx.arc(x, y, animRadius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(74, 222, 128, ${0.2 * progress})`;
        ctx.fill();

        // Background arc (faint circle)
        ctx.beginPath();
        ctx.arc(x, y, animRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Progress arc (spinning and filling up)
        ctx.beginPath();
        ctx.arc(x, y, animRadius, rotation, rotation + progress * 2 * Math.PI);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.stroke();
      }

      // Highlight source node during drag connect
      if (isDragConnectSource) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Balls mode: just draw the colored ball
      ctx.beginPath();
      ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = drawColor;
      ctx.fill();

      if (isPendingBurn) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS + 8, 0, 2 * Math.PI);
        ctx.strokeStyle = PENDING_RING_COLOR;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      if (isRootCandidate) {
        ctx.beginPath();
        ctx.arc(x, y, ROOT_RING_RADIUS, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Store dimensions for pointer area
      nodeBckgDimensionsRef.current.set(node.id, [NODE_RADIUS * 2, NODE_RADIUS * 2]);
    } else {
      // Labels/Full mode: text IS the node (like text-nodes example)
      const label = node.title;
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;
      const textWidth = ctx.measureText(label).width;

      // For full mode, add space for avatar using standardized config
      const avatarConfig = getAvatarConfig(fontSize);
      const avatarSpace = displayMode === 'full' ? avatarConfig.size + avatarConfig.gap : 0;
      const totalWidth = textWidth + avatarSpace;

      const bckgDimensions: [number, number] = [totalWidth + avatarConfig.padding * 2, fontSize * 1.2];

      // Draw ball behind the label (matches 3D sphere + label)
      if (rootTraverser && rootProgress !== null) {
        const startAngle = -Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x, y, ROOT_RING_RADIUS, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = Math.max(1.2 / globalScale, 0.6);
        ctx.stroke();

        if (rootProgress > 0) {
          ctx.beginPath();
          ctx.arc(x, y, ROOT_RING_RADIUS, startAngle, startAngle + rootProgress * Math.PI * 2);
          ctx.strokeStyle = getFuseRingGradient(ctx, x, y);
          ctx.lineWidth = Math.max(2 / globalScale, 1);
          ctx.stroke();
        }
      }

      ctx.beginPath();
      ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = drawColor;
      ctx.fill();

      if (isPendingBurn) {
        ctx.beginPath();
        ctx.arc(x, y, NODE_RADIUS + 8, 0, 2 * Math.PI);
        ctx.strokeStyle = PENDING_RING_COLOR;
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Draw dark background (matches html-nodes example)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x - bckgDimensions[0] / 2, y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

      // Draw text (centered, or left-aligned if full mode with avatar)
      ctx.textAlign = displayMode === 'full' ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = drawColor;

      if (displayMode === 'full') {
        // Text on left side
        ctx.fillText(label, x - bckgDimensions[0] / 2 + avatarConfig.padding, y);

        // Assignee avatar on right side using standardized utility
        const avatarX = x + bckgDimensions[0] / 2 - avatarConfig.radius - avatarConfig.padding;
        drawAvatar(ctx, getAssigneeName(node.card.assignee), avatarX, y, fontSize, globalScale);
      } else {
        ctx.fillText(label, x, y);
      }

      if (isRootCandidate) {
        ctx.beginPath();
        ctx.arc(x, y, ROOT_RING_RADIUS, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Store dimensions for pointer area
      nodeBckgDimensionsRef.current.set(node.id, bckgDimensions);
    }
  }, [
    displayMode,
    nodeRadius,
    connectionMode.active,
    connectionMode.sourceNode?.id,
    dragConnect.active,
    dragConnect.progress,
    dragConnect.sourceNode?.id,
    dragConnect.targetNode?.id,
    getAssigneeName,
    isBurntNodeId,
    pendingBurn?.targetNodeId,
    previewBurn?.targetNodeId,
    FUSE_COLOR,
    getFuseRingGradient,
    PENDING_RING_COLOR,
    BURNT_COLOR,
    draggingUserId,
    rootActiveNodeIds,
    rootTraverserByNodeId,
    ROOT_RING_RADIUS,
    detachedDrag?.traverserId,
    detachedDrag?.candidateRootNodeId,
  ]);

  // Custom link rendering for 2D - supports traversers ("fuses") and burnt edges
  const linkCanvasObject = useCallback((link: GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;

    if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return;

    const targetCard = cardById.get(link.edge.target);
    const isPreviewBurnt = previewBurn?.edgeId === link.edge.id || pendingBurn?.targetNodeId === link.edge.target;
    const isBurnt = Boolean(targetCard?.burntAt);
    const baseStroke = isBurnt
      ? BURNT_COLOR
      : isPreviewBurnt
        ? 'rgba(255, 255, 255, 0.5)'
        : 'rgba(255, 255, 255, 0.3)';
    const isEligible =
      (Boolean(draggingUserId) || Boolean(detachedDrag?.traverserId)) &&
      eligibleTraverserEdgeIds.has(link.edge.id);
    const isCandidateEdge = detachedDrag?.candidateEdgeId === link.edge.id;

    // Draw base line from source to target
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = baseStroke;
    ctx.lineWidth = (isBurnt ? 1.6 : 1) / globalScale;
    ctx.stroke();

    if ((isEligible || isCandidateEdge) && !isBurnt) {
      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
      ctx.lineWidth = Math.max(3.5 / globalScale, 1.8);
      ctx.stroke();
    }

    const traverser = traverserByEdgeId.get(link.edge.id);
    if (traverser && !isBurnt) {
      const pos = clamp(traverser.position, 0, 1);
      const render = getTraverserRenderPoint(source, target, pos);

      // Draw burning segment behind the traverser
      ctx.beginPath();
      ctx.moveTo(render.startX, render.startY);
      ctx.lineTo(render.x, render.y);
      ctx.strokeStyle = getFuseGradient(ctx, render.startX, render.startY, render.x, render.y);
      ctx.lineWidth = Math.max(2 / globalScale, 1);
      ctx.stroke();
    }

    // Draw arrow based on arrowMode
    if (arrowMode !== 'none') {
      const angle = Math.atan2(target.y - source.y, target.x - source.x);
      const arrowLength = Math.max(4, NODE_RADIUS * 0.75);
      const arrowWidth = Math.PI / 6;

      let arrowX: number, arrowY: number;
      if (arrowMode === 'end') {
        const arrowOffset = NODE_RADIUS;
        arrowX = target.x - arrowOffset * Math.cos(angle);
        arrowY = target.y - arrowOffset * Math.sin(angle);
      } else {
        // middle
        const midX = (source.x + target.x) / 2;
        const midY = (source.y + target.y) / 2;
        const forwardOffset = arrowLength / 2;
        arrowX = midX + forwardOffset * Math.cos(angle);
        arrowY = midY + forwardOffset * Math.sin(angle);
      }

      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle - arrowWidth),
        arrowY - arrowLength * Math.sin(angle - arrowWidth)
      );
      ctx.lineTo(
        arrowX - arrowLength * Math.cos(angle + arrowWidth),
        arrowY - arrowLength * Math.sin(angle + arrowWidth)
      );
      ctx.closePath();
      ctx.fillStyle = baseStroke;
      ctx.fill();
    }
  }, [
    arrowMode,
    nodeRadius,
    cardById,
    traverserByEdgeId,
    userById,
    getFuseGradient,
    BURNT_COLOR,
    TRAVERSER_RADIUS,
    draggingUserId,
    previewBurn?.edgeId,
    pendingBurn?.targetNodeId,
    eligibleTraverserEdgeIds,
    getTraverserRenderPoint,
    detachedDrag?.traverserId,
    detachedDrag?.candidateEdgeId,
  ]);

  const nodePointerAreaPaint = useCallback((node: GraphNodeData, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    const bckgDimensions = nodeBckgDimensionsRef.current.get(node.id);
    if (bckgDimensions) {
      ctx.fillRect(
        (node.x ?? 0) - bckgDimensions[0] / 2,
        (node.y ?? 0) - bckgDimensions[1] / 2,
        bckgDimensions[0],
        bckgDimensions[1]
      );
    }
  }, []);

  const getArrowRelPos = useCallback((link: GraphLinkData) => {
    if (arrowMode !== 'end') return 0.5;
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;
    if (!source || !target) return 1;
    const dx = (target.x ?? 0) - (source.x ?? 0);
    const dy = (target.y ?? 0) - (source.y ?? 0);
    const dz = (target.z ?? 0) - (source.z ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!dist) return 1;
    const offset = Math.min(nodeRadius * 0.05, dist);
    return Math.max(0, Math.min(1, (dist - offset) / dist));
  }, [arrowMode, nodeRadius]);

  const getArrowRelPosMiddle = useCallback((link: GraphLinkData) => {
    if (arrowMode !== 'middle') return 0.5;
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;
    if (!source || !target) return 0.5;
    const dx = (target.x ?? 0) - (source.x ?? 0);
    const dy = (target.y ?? 0) - (source.y ?? 0);
    const dz = (target.z ?? 0) - (source.z ?? 0);
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!dist) return 0.5;
    const arrowLength = Math.max(4, nodeRadius * 0.75);
    const offset = Math.min(arrowLength / 2, dist);
    return Math.max(0, Math.min(1, (dist / 2 + offset) / dist));
  }, [arrowMode, nodeRadius]);

  // Create 3D node object with HTML labels (replaces sphere in labels/full mode)
  const nodeThreeObject = useCallback((node: GraphNodeData) => {
    if (displayMode === 'balls' || !CSS2DObject) {
      return undefined; // Use default sphere
    }

    const entry = updateNodeLabelElement(node, displayMode);
    if (!entry.obj) {
      entry.obj = new CSS2DObject(entry.el);
    }
    return entry.obj;
  }, [displayMode, updateNodeLabelElement]);

  // 3D TODO: mirror traversers/fuse rendering with linkThreeObject or sprites + burn coloring.
  // Suggested approach: use linkThreeObject to draw a tube/line segment for the fuse,
  // and a Sprite or CSS2DObject avatar at the interpolated traverser position (update on tick/zoom).
  // No custom linkThreeObject needed - use built-in arrow rendering for 3D

  const openEdgeStartPicker = useCallback((edgeId: string, x: number, y: number) => {
    if (traverserByEdgeId.has(edgeId)) {
      showToast('That edge already has a traverser', 'warning');
      setEdgeStartPicker(null);
      return;
    }
    if (!eligibleTraverserEdgeIds.has(edgeId)) {
      showToast('That node is blocked or already complete', 'warning');
      setEdgeStartPicker(null);
      return;
    }
    setEdgeStartPicker(prev => (prev && prev.edgeId === edgeId ? null : { edgeId, x, y }));
    cancelPendingBurn();
    suppressNextBackgroundClick();
  }, [
    traverserByEdgeId,
    eligibleTraverserEdgeIds,
    showToast,
    cancelPendingBurn,
    suppressNextBackgroundClick,
  ]);

  const closeEdgeContextMenu = useCallback(() => {
    setEdgeContextMenu(prev => (
      prev.visible
        ? { ...prev, visible: false, edgeId: null }
        : prev
    ));
  }, []);

  const handleEdgeAssign = useCallback((edgeId: string, anchor: { x: number; y: number }) => {
    if (!onTraverserCreate) {
      showToast('Assigning traversers is not available here', 'warning');
      return;
    }
    openEdgeStartPicker(edgeId, anchor.x, anchor.y);
  }, [onTraverserCreate, openEdgeStartPicker, showToast]);

  const handleEdgeDetachTraverser = useCallback((traverserId: string) => {
    if (!onTraverserDelete) {
      showToast('Detaching traversers is not available here', 'warning');
      return;
    }
    onTraverserDelete(traverserId);
    if (pendingBurn?.traverserId === traverserId) {
      cancelPendingBurn();
    }
    if (detachedDrag?.traverserId === traverserId) {
      clearDetachedDrag();
    }
    showToast('Traverser removed', 'info');
  }, [
    onTraverserDelete,
    showToast,
    pendingBurn?.traverserId,
    cancelPendingBurn,
    detachedDrag?.traverserId,
    clearDetachedDrag,
  ]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    if (!onEdgeDelete) {
      showToast('Edge deletion is not available here', 'warning');
      return;
    }
    const edge = edgeById.get(edgeId);
    onEdgeDelete(edgeId);
    if (edgeStartPicker?.edgeId === edgeId) {
      setEdgeStartPicker(null);
    }
    if (previewBurn?.edgeId === edgeId) {
      setPreviewBurn(null);
    }
    if (pendingBurn && edge && pendingBurn.targetNodeId === edge.target) {
      cancelPendingBurn();
    }
    if (detachedDrag?.candidateEdgeId === edgeId) {
      clearDetachedDrag();
    }
  }, [
    onEdgeDelete,
    showToast,
    edgeById,
    edgeStartPicker?.edgeId,
    previewBurn?.edgeId,
    pendingBurn,
    cancelPendingBurn,
    detachedDrag?.candidateEdgeId,
    clearDetachedDrag,
  ]);

  const handleLinkClick = useCallback((link: GraphLinkData, event: MouseEvent) => {
    if (viewMode !== '2D') return;
    if (connectionMode.active) return;
    if (!onTraverserCreate && !onEdgeDelete) return;
    if (!event) return;
    const edgeId = link.edge.id;
    const rect = containerRef.current?.getBoundingClientRect();
    const containerX = rect ? event.clientX - rect.left : event.clientX;
    const containerY = rect ? event.clientY - rect.top : event.clientY;
    setEdgeContextMenu(prev => (
      prev.visible && prev.edgeId === edgeId
        ? { ...prev, visible: false, edgeId: null }
        : {
          visible: true,
          x: event.clientX,
          y: event.clientY,
          containerX,
          containerY,
          edgeId,
        }
    ));
    setEdgeStartPicker(null);
    cancelPendingBurn();
    suppressNextBackgroundClick();
  }, [
    viewMode,
    connectionMode.active,
    onTraverserCreate,
    onEdgeDelete,
    cancelPendingBurn,
    setEdgeContextMenu,
    suppressNextBackgroundClick,
  ]);

  // Handle node left-click - show detail panel or complete connection
  const handleNodeClick = useCallback((node: GraphNodeData, event: MouseEvent) => {
    // Hide tooltip when clicking a node
    setHoverTooltip(prev => ({ ...prev, visible: false, nodeId: null }));
    setEdgeStartPicker(null);
    closeEdgeContextMenu();
    if (pendingBurn) {
      cancelPendingBurn();
    }

    // If in connection mode, complete the connection
    if (connectionMode.active && connectionMode.sourceNode) {
      completeConnection(node);
      return;
    }

    // Otherwise show the detail panel
    setSelectedNode({
      node,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  }, [
    connectionMode.active,
    connectionMode.sourceNode,
    completeConnection,
    pendingBurn,
    cancelPendingBurn,
    closeEdgeContextMenu,
  ]);

  // Handle node hover - track for keyboard shortcuts
  const handleNodeHover = useCallback((node: GraphNodeData | null) => {
    if (node) {
      setHoverTooltip({
        visible: true,
        x: 0,
        y: 0,
        title: node.title,
        nodeId: node.id,
        color: node.color,
        assignee: getAssigneeName(node.card.assignee) || null,
      });
    } else {
      setHoverTooltip(prev => ({ ...prev, visible: false, nodeId: null }));
    }
  }, [getAssigneeName]);

  // Track mouse position for tooltip
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (hoverTooltip.visible) {
        setHoverTooltip(prev => ({
          ...prev,
          x: e.clientX,
          y: e.clientY,
        }));
      }
    };

    if (hoverTooltip.visible) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [hoverTooltip.visible]);

  useEffect(() => {
    if (!hoverTooltip.visible) {
      const canvas = graphRef.current?.canvas?.();
      if (canvas) {
        canvas.classList.remove('clickable');
      }
    }
  }, [hoverTooltip.visible]);

  // Handle background click - close panel and cancel connection mode
  const handleBackgroundClick = useCallback(() => {
    if (suppressBackgroundClickRef.current) {
      suppressBackgroundClickRef.current = false;
      return;
    }
    if (selectedNode) {
      setSelectedNode(null);
    }
    closeEdgeContextMenu();
    if (connectionMode.active) {
      cancelConnectionMode();
    }
    if (pendingBurn) {
      cancelPendingBurn();
    }
    setEdgeStartPicker(null);
    if (previewBurn) {
      setPreviewBurn(null);
    }
  }, [
    selectedNode,
    closeEdgeContextMenu,
    connectionMode.active,
    cancelConnectionMode,
    pendingBurn,
    cancelPendingBurn,
    previewBurn,
  ]);

  // Handle node drag end - unfix the node so user can drag it freely
  // We fix nodes with fx/fy to preserve layout on data updates, but we want
  // to allow users to drag nodes around. When they stop dragging, we remove
  // the fixed position to allow natural graph movement.
  const handleNodeDragEnd = useCallback((node: GraphNodeData) => {
    // Remove fixed position constraints so node can participate in layout
    // Note: force-graph uses undefined (not delete) to unfix
    try {
      node.fx = undefined;
      node.fy = undefined;
      node.fz = undefined;
    } catch {
      // If node is read-only, skip unfixing to avoid runtime errors
    }

    // Cancel any drag-to-connect animation
    if (dragConnectAnimationRef.current) {
      cancelAnimationFrame(dragConnectAnimationRef.current);
      dragConnectAnimationRef.current = null;
    }
    setDragConnect({
      active: false,
      sourceNode: null,
      targetNode: null,
      progress: 0,
      startTime: null,
    });
  }, []);

  // Complete drag-to-connect - create edge from source to target
  const completeDragConnect = useCallback((sourceNode: GraphNodeData, targetNode: GraphNodeData) => {
    if (!onEdgeCreate) return;

    // Don't allow self-connections
    if (sourceNode.id === targetNode.id) {
      return;
    }

    if (isBurntNodeId(targetNode.id)) {
      showToast('Cannot add dependencies to a burnt node', 'warning');
      return;
    }

    // Check if edge already exists
    const edgeExists = data.edges.some(
      e => e.source === sourceNode.id && e.target === targetNode.id
    );
    if (edgeExists) {
      showToast('Connection already exists', 'warning');
      return;
    }

    // Create the edge (source -> target, so target becomes downstream)
    onEdgeCreate(sourceNode.id, targetNode.id);
    showToast(`Connected "${sourceNode.title}" -> "${targetNode.title}"`, 'success');
  }, [onEdgeCreate, data.edges, isBurntNodeId, showToast]);

  // Handle node drag - detect when dragged node touches another node
  const handleNodeDrag = useCallback((node: GraphNodeData) => {
    if (!node.x || !node.y) return;

    // Check if the dragged node is touching any other node
    const TOUCH_DISTANCE = NODE_RADIUS * 3; // Distance to consider "touching"
    let touchingNode: GraphNodeData | null = null;

    for (const otherNode of graphDataView.nodes as GraphNodeData[]) {
      if (otherNode.id === node.id) continue;
      if (!otherNode.x || !otherNode.y) continue;
      if (isBurntNodeId(otherNode.id)) continue;

      const dx = node.x - otherNode.x;
      const dy = node.y - otherNode.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < TOUCH_DISTANCE) {
        touchingNode = otherNode;
        break;
      }
    }

    if (touchingNode) {
      // Nodes are touching
      if (!dragConnect.active || dragConnect.targetNode?.id !== touchingNode.id) {
        // Start new connection timer
        const now = performance.now();
        setDragConnect({
          active: true,
          sourceNode: node,
          targetNode: touchingNode,
          progress: 0,
          startTime: now,
        });

        // Start animation loop
        const animate = () => {
          const elapsed = performance.now() - now;
          const progress = Math.min(elapsed / 1000, 1); // 1.0 seconds

          if (progress >= 1) {
            // Connection complete
            completeDragConnect(node, touchingNode!);
            setDragConnect({
              active: false,
              sourceNode: null,
              targetNode: null,
              progress: 0,
              startTime: null,
            });
            dragConnectAnimationRef.current = null;
          } else {
            setDragConnect(prev => ({ ...prev, progress }));
            dragConnectAnimationRef.current = requestAnimationFrame(animate);
          }
        };

        if (dragConnectAnimationRef.current) {
          cancelAnimationFrame(dragConnectAnimationRef.current);
        }
        dragConnectAnimationRef.current = requestAnimationFrame(animate);
      }
    } else {
      // Nodes not touching - cancel animation
      if (dragConnect.active) {
        if (dragConnectAnimationRef.current) {
          cancelAnimationFrame(dragConnectAnimationRef.current);
          dragConnectAnimationRef.current = null;
        }
        setDragConnect({
          active: false,
          sourceNode: null,
          targetNode: null,
          progress: 0,
          startTime: null,
        });
      }
    }
  }, [graphDataView.nodes, dragConnect.active, dragConnect.targetNode?.id, completeDragConnect, nodeRadius, isBurntNodeId]);

  // Common props for both 2D and 3D graphs
  const commonProps = {
    ref: graphRef,
    width: dimensions.width,
    height: dimensions.height,
    graphData: graphDataForForce,
    backgroundColor: "#000000",
    nodeLabel: () => '', // Disable default tooltip, using custom one
    onNodeClick: handleNodeClick,
    onLinkClick: handleLinkClick,
    onNodeHover: handleNodeHover,
    onBackgroundClick: handleBackgroundClick,
    onNodeDrag: handleNodeDrag,
    onNodeDragEnd: handleNodeDragEnd,
    onZoom: bumpRenderTick,
    onZoomEnd: bumpRenderTick,
    onEngineTick: bumpRenderTick,
    nodeColor: (node: GraphNodeData) => node.color,
    showPointerCursor: (obj: unknown) => Boolean(obj),
  };

  const pendingBurnAnchor = useMemo(() => {
    if (!pendingBurn || viewMode !== '2D') return null;
    if (pendingBurn.anchor) return pendingBurn.anchor;
    const node = nodeByIdRef.current.get(pendingBurn.targetNodeId);
    if (!node || node.x === undefined || node.y === undefined) return null;
    return getScreenCoords(node.x, node.y);
  }, [pendingBurn?.targetNodeId, pendingBurn?.anchor, viewMode, renderTick, getScreenCoords]);

  const projectHudProps = useMemo(() => ({
    onDownloadGraph: handleDownloadGraph,
    onUploadGraph: handleUploadGraph,
    onNewRootNode: openRootNodeCreation,
  }), [handleDownloadGraph, handleUploadGraph, openRootNodeCreation]);

  const userHudProps = useMemo(() => ({
    users: data.users,
    selectedUserIds: selectedAssignees,
    onUserToggle: handleAssigneeToggle,
    onAddUser: handleAddUser,
    onUserDragStart: handleUserDragStart,
    onUserDragEnd: handleUserDragEnd,
  }), [data.users, selectedAssignees, handleAssigneeToggle, handleAddUser, handleUserDragStart, handleUserDragEnd]);

  const filterHudProps = useMemo(() => ({
    viewMode,
    displayMode,
    nodeRadius,
    onNodeRadiusChange: setNodeRadius,
    colorMode,
    arrowMode,
    onViewModeChange: setViewMode,
    onDisplayModeChange: setDisplayMode,
    onColorModeChange: setColorMode,
    onArrowModeChange: setArrowMode,
    devDatasetMode,
    onDevDatasetModeChange,
    cards: data.cards,
    users: data.users,
    selectedAssignees,
    onAssigneeToggle: handleAssigneeToggle,
    categories: themedCategories,
    edges: data.edges,
    searchQuery,
    onSearchChange: setSearchQuery,
    selectedCategories,
    onCategoryToggle: handleCategoryToggle,
    selectedStatuses,
    onStatusToggle: handleStatusToggle,
    blockerThreshold,
    onBlockerThresholdChange: setBlockerThreshold,
    burntAgeThreshold,
    onBurntAgeThresholdChange: setBurntAgeThreshold,
    burntAgeMax: BURNT_AGE_MAX,
  }), [
    viewMode,
    displayMode,
    nodeRadius,
    setNodeRadius,
    colorMode,
    arrowMode,
    setViewMode,
    setDisplayMode,
    setColorMode,
    setArrowMode,
    devDatasetMode,
    onDevDatasetModeChange,
    data.cards,
    data.users,
    themedCategories,
    data.edges,
    selectedAssignees,
    handleAssigneeToggle,
    searchQuery,
    setSearchQuery,
    selectedCategories,
    handleCategoryToggle,
    selectedStatuses,
    handleStatusToggle,
    blockerThreshold,
    setBlockerThreshold,
    burntAgeThreshold,
    setBurntAgeThreshold,
  ]);

  const edgeContextMenuTraverserId = useMemo(() => {
    const edgeTraverser = edgeContextMenu.edgeId
      ? traverserByEdgeId.get(edgeContextMenu.edgeId)
      : null;
    return edgeTraverser?.id ?? null;
  }, [edgeContextMenu.edgeId, traverserByEdgeId]);

  const draggingUser = draggingUserId ? userById.get(draggingUserId) ?? null : null;

  return (
    <div
      ref={containerRef}
      className="graph-shell"
      onDragOver={handleUserDragOver}
      onDrop={handleUserDrop}
      onPointerDown={handleTraverserPointerDown}
    >
      <GraphHudLeft projectHud={projectHud} projectHudProps={projectHudProps} />
      <GraphHudRight
        userHudProps={userHudProps}
        filterHudProps={filterHudProps}
        showSettings={showSettings}
      />

      <Dialog open={addUserDialogOpen} onOpenChange={handleAddUserOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a user</DialogTitle>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={handleAddUserSubmit}>
            <Input
              ref={addUserInputRef}
              value={addUserName}
              onChange={(event) => setAddUserName(event.target.value)}
              placeholder="Enter a name"
              className="border-[var(--graph-modal-input-border)] bg-[var(--graph-modal-input-bg)] text-[var(--graph-modal-text)] placeholder:text-[var(--graph-modal-input-placeholder)] focus-visible:ring-0 focus-visible:border-[var(--graph-modal-input-border)]"
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="text-[var(--graph-modal-secondary-text)] hover:bg-[var(--graph-modal-secondary-hover-bg)] hover:text-[var(--graph-modal-text)]"
                onClick={() => handleAddUserOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[var(--graph-modal-primary-bg)] text-[var(--graph-modal-primary-text)] hover:bg-[var(--graph-modal-primary-hover-bg)]"
                disabled={!addUserName.trim()}
              >
                Add user
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <GraphCanvasLayer
        viewMode={viewMode}
        displayMode={displayMode}
        arrowMode={arrowMode}
        nodeRadius={nodeRadius}
        css2DRendererInstance={css2DRendererInstance}
        commonProps={commonProps}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={nodePointerAreaPaint}
        linkCanvasObject={linkCanvasObject}
        nodeThreeObject={nodeThreeObject}
        getArrowRelPos={getArrowRelPos}
        getArrowRelPosMiddle={getArrowRelPosMiddle}
      />

      <GraphOverlays
        viewMode={viewMode}
        traverserOverlays={traverserOverlays}
        draggingTraverserId={draggingTraverserId}
        onTraverserOverlayPointerDown={handleTraverserOverlayPointerDown}
        draggingUserId={draggingUserId}
        draggingUserGhost={draggingUserGhost}
        draggingUser={draggingUser}
        pendingBurn={pendingBurn}
        pendingBurnAnchor={pendingBurnAnchor}
        onConfirmPendingBurn={confirmPendingBurn}
        onCancelPendingBurn={cancelPendingBurn}
        edgeContextMenu={edgeContextMenu}
        edgeContextMenuTraverserId={edgeContextMenuTraverserId}
        onCloseEdgeContextMenu={closeEdgeContextMenu}
        onEdgeAssign={handleEdgeAssign}
        onEdgeDetach={handleEdgeDetachTraverser}
        onEdgeDelete={handleEdgeDelete}
        edgeStartPicker={edgeStartPicker}
        users={data.users}
        onEdgeStartPickUser={handleEdgeStartPickUser}
        onAddUser={handleAddUser}
        hoverTooltip={hoverTooltip}
        connectionMode={connectionMode}
        onCancelConnectionMode={cancelConnectionMode}
        dragConnect={dragConnect}
      />

      {/* Card Creation Form */}
      <CardCreationForm
        state={cardCreation}
        onClose={closeCardCreation}
        onSubmit={handleCardCreation}
        onTitleChange={(title) => setCardCreation(prev => ({ ...prev, title }))}
        onDescriptionChange={(description) => setCardCreation(prev => ({ ...prev, description }))}
      />

      {/* Card Detail Panel (left-click on node) */}
      {selectedNode && (
        <CardDetailPanel
          key={selectedNode.node.id}
          selectedNode={selectedNode}
          onClose={() => setSelectedNode(null)}
          onCardChange={onCardChange}
          onAssigneeChange={handleCardAssigneeChange}
          users={data.users}
          onCreateDownstream={openDownstreamCreation}
          onCreateUpstream={openUpstreamCreation}
          onLinkDownstream={startDownstreamConnection}
          onLinkUpstream={startUpstreamConnection}
          onDelete={handleDeleteNode}
        />
      )}

      {/* Toast Notification */}
      <ToastNotification state={toast} onClose={hideToast} />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        visible={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

    </div>
  );
}
