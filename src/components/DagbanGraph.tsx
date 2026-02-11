'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Category } from '@/lib/types';
import { getGradientColor, computeIndegrees, computeOutdegrees, getMaxDegree } from '@/lib/colors';
import { getAvatarConfig, drawAvatar, getAvatarCSSStyles, getAvatarHTMLContent } from '@/lib/avatar';

// Import extracted components
import {
  CardDetailPanel,
  CardCreationForm,
  CommandPalette,
  ToastNotification,
  KeyboardShortcutsHelp,
  Header,
  SettingsPanel,
  // Types
  GraphNodeData,
  GraphLinkData,
  SelectedNodeInfo,
  CardCreationState,
  HoverTooltipState,
  ToastState,
  CommandPaletteState,
  ConnectionModeState,
  UndoAction,
  ViewMode,
  DisplayMode,
  ColorMode,
  ArrowMode,
} from './graph';

// Dynamic imports to avoid SSR issues - use separate packages to avoid AFRAME/VR deps
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">Loading graph...</div>
});

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">Loading graph...</div>
});

const INITIAL_3D_CAMERA_DISTANCE = 300;

interface Props {
  data: GraphData;
  onEdgeProgressChange?: (edgeId: string, progress: number) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
  onCategoryAdd?: (category: Category) => void;
  onCategoryDelete?: (categoryId: string) => void;
  onCardCreate?: (card: Card, parentCardId?: string, childCardId?: string) => void;
  onCardDelete?: (cardId: string) => void;
  onEdgeCreate?: (sourceId: string, targetId: string) => void;
  onUndo?: () => void;
  projectHeader?: React.ReactNode;
  showSettingsProp?: boolean;
  triggerNewNode?: boolean;
  devDatasetMode?: 'sample' | 'miserables';
  onDevDatasetModeChange?: (mode: 'sample' | 'miserables') => void;
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
  onUndo,
  projectHeader,
  showSettingsProp = true,
  triggerNewNode = false,
  devDatasetMode,
  onDevDatasetModeChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const initial3DCameraSetRef = useRef(false);
  // Keep stable graph data and node/link identities to avoid full re-init on updates
  const graphDataRef = useRef<{ nodes: GraphNodeData[]; links: GraphLinkData[] }>({ nodes: [], links: [] });
  const nodeByIdRef = useRef<Map<string, GraphNodeData>>(new Map());
  const linkByIdRef = useRef<Map<string, GraphLinkData>>(new Map());
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('balls');
  const [nodeRadius, setNodeRadius] = useState(8);
  const [colorMode, setColorMode] = useState<ColorMode>('category');
  const [arrowMode, setArrowMode] = useState<ArrowMode>('end');
  const [showSettings, setShowSettings] = useState(showSettingsProp);
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

  // Command palette state
  const [commandPalette, setCommandPalette] = useState<CommandPaletteState>({
    visible: false,
    query: '',
  });

  // Keyboard shortcuts help state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

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

  // Undo stack for local undo functionality
  const undoStackRef = useRef<UndoAction[]>([]);

  // Filter state
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [blockerThreshold, setBlockerThreshold] = useState(0);

  // Show toast notification
  const showToast = useCallback((message: string, type: ToastState['type'] = 'info', action?: ToastState['action']) => {
    setToast({ visible: true, message, type, action });
  }, []);

  // Hide toast
  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

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

    return true;
  }, [searchQuery, selectedCategories, selectedStatuses, selectedAssignees, blockerThreshold, blockerCounts]);

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
      const avatarContent = getAvatarHTMLContent(node.card.assignee, 10);
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
  }, [getOrCreateLabelEntry]);

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
      const categoryColor = getCardColor(card, status, data.categories);
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
          progress: edge.progress,
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

      if (link.progress !== edge.progress) {
        linkUpdates.progress = edge.progress;
        visualChanged = true;
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

    graphDataRef.current = { nodes, links };
    setGraphDataView(graphDataRef.current);
    if (structuralChanged || !hasSeededGraphRef.current) {
      setGraphDataForForce(graphDataRef.current);
      hasSeededGraphRef.current = true;
    }

    if (structuralChanged) {
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
    data.categories,
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
    if (onUndo) {
      onUndo();
      showToast('Undone', 'success');
      return;
    }

    // Local undo if no external handler
    const action = undoStackRef.current.pop();
    if (!action) {
      showToast('Nothing to undo', 'warning');
      return;
    }

    if (action.type === 'delete_card' && onCardCreate) {
      // Restore deleted card
      onCardCreate(action.card);
      showToast(`Restored "${action.card.title}"`, 'success');
    }
  }, [onUndo, onCardCreate, showToast]);

  // Handle delete node
  const handleDeleteNode = useCallback((node: GraphNodeData) => {
    if (!onCardDelete) return;

    // Find connected edges
    const connectedEdges = data.edges.filter(
      e => e.source === node.id || e.target === node.id
    );

    // Store undo action
    undoStackRef.current.push({
      type: 'delete_card',
      card: node.card,
      connectedEdges,
    });

    // Delete the card
    onCardDelete(node.id);

    // Show toast with undo option
    showToast(`Deleted "${node.title}"`, 'info', {
      label: 'Undo',
      onClick: () => {
        handleUndo();
      },
    });
  }, [data.edges, onCardDelete, showToast, handleUndo]);

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
    setConnectionMode({
      active: true,
      sourceNode: targetNode, // Store the target node here, we'll swap in completeConnection
      direction: 'upstream',
    });
    showToast(`Click a node to make it upstream of "${targetNode.title}"`, 'info');
  }, [showToast]);

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
  }, [connectionMode.sourceNode, connectionMode.direction, onEdgeCreate, data.edges, data.cards, showToast, cancelConnectionMode]);

  // Keyboard shortcuts handler (must be after handleDeleteNode and handleUndo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Escape cancels connection mode
      if (e.key === 'Escape' && connectionMode.active) {
        e.preventDefault();
        cancelConnectionMode();
        showToast('Connection cancelled', 'info');
        return;
      }

      // Skip if command palette is open (it handles its own keys)
      if (commandPalette.visible) return;

      // Cmd+Z / Ctrl+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Cmd+K / Ctrl+K - Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPalette({ visible: true, query: '' });
      }

      // ? - Show keyboard shortcuts help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowShortcutsHelp(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoverTooltip.nodeId, commandPalette.visible, connectionMode.active, graphDataView.nodes, handleDeleteNode, handleUndo, cancelConnectionMode, showToast]);

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

  // Handle command palette node selection
  const handleCommandPaletteSelectNode = useCallback((node: GraphNodeData) => {
    // Center graph on selected node
    if (graphRef.current && node.x !== undefined && node.y !== undefined) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, []);

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
  }, []);

  // Close card creation form
  const closeCardCreation = useCallback(() => {
    setCardCreation(prev => ({ ...prev, visible: false, title: '', description: '', parentNodeId: null, childNodeId: null }));
  }, []);

  // Handle card creation submission
  const handleCardCreation = useCallback(() => {
    const titleValue = typeof cardCreation.title === 'string' ? cardCreation.title : '';
    if (!titleValue.trim() || !onCardCreate) return;
    const descriptionValue = typeof cardCreation.description === 'string' ? cardCreation.description : '';

    const now = new Date().toISOString();
    const newCard: Card = {
      id: generateId(),
      title: titleValue.trim(),
      description: descriptionValue.trim() || undefined,
      categoryId: data.categories.length > 0 ? data.categories[0].id : '',
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
  }, [cardCreation, data.categories, onCardCreate, closeCardCreation]);

  // Node radius
  const NODE_RADIUS = nodeRadius;

  // Custom node rendering for 2D - matches text-nodes example exactly
  const nodeCanvasObject = useCallback((node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Check if this is the source node in connection mode
    const isConnectionSource = connectionMode.active && connectionMode.sourceNode?.id === node.id;

    // Check if this node is part of a drag-to-connect animation
    const isDragConnectTarget = dragConnect.active && dragConnect.targetNode?.id === node.id;
    const isDragConnectSource = dragConnect.active && dragConnect.sourceNode?.id === node.id;

    if (displayMode === 'balls') {
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
      ctx.fillStyle = node.color;
      ctx.fill();

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
      ctx.beginPath();
      ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Draw dark background (matches html-nodes example)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x - bckgDimensions[0] / 2, y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

      // Draw text (centered, or left-aligned if full mode with avatar)
      ctx.textAlign = displayMode === 'full' ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = node.color;

      if (displayMode === 'full') {
        // Text on left side
        ctx.fillText(label, x - bckgDimensions[0] / 2 + avatarConfig.padding, y);

        // Assignee avatar on right side using standardized utility
        const avatarX = x + bckgDimensions[0] / 2 - avatarConfig.radius - avatarConfig.padding;
        drawAvatar(ctx, node.card.assignee, avatarX, y, fontSize, globalScale);
      } else {
        ctx.fillText(label, x, y);
      }

      // Store dimensions for pointer area
      nodeBckgDimensionsRef.current.set(node.id, bckgDimensions);
    }
  }, [displayMode, nodeRadius, connectionMode.active, connectionMode.sourceNode?.id, dragConnect.active, dragConnect.progress, dragConnect.sourceNode?.id, dragConnect.targetNode?.id]);

  // Custom link rendering for 2D - uniform line with small arrow in middle
  const linkCanvasObject = useCallback((link: GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;

    if (!source.x || !target.x) return;

    // Draw uniform line from source to target
    ctx.beginPath();
    ctx.moveTo(source.x, source.y!);
    ctx.lineTo(target.x, target.y!);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 / globalScale;
    ctx.stroke();

    // Draw arrow based on arrowMode
    if (arrowMode !== 'none') {
      const angle = Math.atan2(target.y! - source.y!, target.x - source.x);
      const arrowLength = Math.max(4, NODE_RADIUS * 0.75);
      const arrowWidth = Math.PI / 6;

      let arrowX: number, arrowY: number;
      if (arrowMode === 'end') {
        const arrowOffset = NODE_RADIUS;
        arrowX = target.x - arrowOffset * Math.cos(angle);
        arrowY = target.y! - arrowOffset * Math.sin(angle);
      } else {
        // middle
        const midX = (source.x + target.x) / 2;
        const midY = (source.y! + target.y!) / 2;
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
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fill();
    }
  }, [arrowMode, nodeRadius]);

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

  // No custom linkThreeObject needed - use built-in arrow rendering for 3D

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG2D = ForceGraph2D as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG3D = ForceGraph3D as any;

  // Handle node left-click - show detail panel or complete connection
  const handleNodeClick = useCallback((node: GraphNodeData, event: MouseEvent) => {
    // Hide tooltip when clicking a node
    setHoverTooltip(prev => ({ ...prev, visible: false, nodeId: null }));

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
  }, [connectionMode.active, connectionMode.sourceNode, completeConnection]);

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
        assignee: node.card.assignee || null,
      });
    } else {
      setHoverTooltip(prev => ({ ...prev, visible: false, nodeId: null }));
    }
  }, []);

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

  // Handle background click - close panel and cancel connection mode
  const handleBackgroundClick = useCallback(() => {
    if (selectedNode) {
      setSelectedNode(null);
    }
    if (connectionMode.active) {
      cancelConnectionMode();
    }
  }, [selectedNode, connectionMode.active, cancelConnectionMode]);

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
  }, [onEdgeCreate, data.edges, showToast]);

  // Handle node drag - detect when dragged node touches another node
  const handleNodeDrag = useCallback((node: GraphNodeData) => {
    if (!node.x || !node.y) return;

    // Check if the dragged node is touching any other node
    const TOUCH_DISTANCE = NODE_RADIUS * 3; // Distance to consider "touching"
    let touchingNode: GraphNodeData | null = null;

    for (const otherNode of graphDataView.nodes as GraphNodeData[]) {
      if (otherNode.id === node.id) continue;
      if (!otherNode.x || !otherNode.y) continue;

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
  }, [graphDataView.nodes, dragConnect.active, dragConnect.targetNode?.id, completeDragConnect, nodeRadius]);

  // Common props for both 2D and 3D graphs
  const commonProps = {
    ref: graphRef,
    width: dimensions.width,
    height: dimensions.height,
    graphData: graphDataForForce,
    backgroundColor: "#000000",
    nodeLabel: () => '', // Disable default tooltip, using custom one
    onNodeClick: handleNodeClick,
    onNodeHover: handleNodeHover,
    onBackgroundClick: handleBackgroundClick,
    onNodeDrag: handleNodeDrag,
    onNodeDragEnd: handleNodeDragEnd,
    nodeColor: (node: GraphNodeData) => node.color,
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#000000] relative"
    >
      {projectHeader || (
        <Header
          onLogoClick={() => setShowSettings(!showSettings)}
          onNewRootNode={openRootNodeCreation}
        />
      )}
      {showSettings && (
        <SettingsPanel
          viewMode={viewMode}
          displayMode={displayMode}
          nodeRadius={nodeRadius}
          onNodeRadiusChange={setNodeRadius}
          colorMode={colorMode}
          arrowMode={arrowMode}
          onViewModeChange={setViewMode}
          onDisplayModeChange={setDisplayMode}
          onColorModeChange={setColorMode}
          onArrowModeChange={setArrowMode}
          devDatasetMode={devDatasetMode}
          onDevDatasetModeChange={onDevDatasetModeChange}
          cards={data.cards}
          selectedAssignees={selectedAssignees}
          onAssigneeToggle={handleAssigneeToggle}
          categories={data.categories}
          edges={data.edges}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategories={selectedCategories}
          onCategoryToggle={handleCategoryToggle}
          selectedStatuses={selectedStatuses}
          onStatusToggle={handleStatusToggle}
          blockerThreshold={blockerThreshold}
          onBlockerThresholdChange={setBlockerThreshold}
        />
      )}


      {viewMode === '2D' ? (
        <FG2D
          {...commonProps}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: GraphNodeData, color: string, ctx: CanvasRenderingContext2D) => {
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
          }}
          linkCanvasObject={linkCanvasObject}
          linkColor={() => 'rgba(255,255,255,0.2)'}
        />
      ) : css2DRendererInstance ? (
        <FG3D
          {...commonProps}
          extraRenderers={[css2DRendererInstance]}
          nodeThreeObject={displayMode !== 'balls' ? nodeThreeObject : undefined}
          nodeThreeObjectExtend={true}
          nodeRelSize={nodeRadius}
          linkWidth={1}
          linkOpacity={0.6}
          linkColor={() => 'rgba(255, 255, 255, 0.4)'}
          linkDirectionalArrowLength={arrowMode !== 'none' ? Math.max(4, nodeRadius * 0.75) : 0}
          linkDirectionalArrowColor={() => 'rgba(255, 255, 255, 0.7)'}
          linkDirectionalArrowRelPos={arrowMode === 'end' ? getArrowRelPos : arrowMode === 'middle' ? getArrowRelPosMiddle : 0.5}
          nodeOpacity={1}
        />
      ) : (
        <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">Loading 3D graph...</div>
      )}

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
          onCreateDownstream={openDownstreamCreation}
          onCreateUpstream={openUpstreamCreation}
          onLinkDownstream={startDownstreamConnection}
          onLinkUpstream={startUpstreamConnection}
          onDelete={handleDeleteNode}
        />
      )}

      {/* Node Hover Tooltip */}
      {hoverTooltip.visible && hoverTooltip.x > 0 && (
        <div
          className="node-hover-tooltip"
          style={{
            left: `${hoverTooltip.x + 12}px`,
            top: `${hoverTooltip.y + 12}px`,
          }}
        >
          <span style={{ color: hoverTooltip.color || 'inherit' }}>{hoverTooltip.title}</span>
          <div className={`tooltip-assignee-avatar ${!hoverTooltip.assignee ? 'empty' : ''}`}>
            {hoverTooltip.assignee ? (
              <span className="tooltip-assignee-initials">
                {hoverTooltip.assignee.split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('')}
              </span>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" opacity="0.4">
                <circle cx="12" cy="8" r="4" />
                <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
              </svg>
            )}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      <ToastNotification state={toast} onClose={hideToast} />

      {/* Command Palette */}
      <CommandPalette
        state={commandPalette}
        nodes={graphDataView.nodes}
        onClose={() => setCommandPalette({ visible: false, query: '' })}
        onSelectNode={handleCommandPaletteSelectNode}
        onQueryChange={(query) => setCommandPalette(prev => ({ ...prev, query }))}
        onNewNode={() => openRootNodeCreation(commandPalette.query)}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        visible={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* Connection Mode Indicator */}
      {connectionMode.active && connectionMode.sourceNode && (
        <div className="connection-mode-indicator">
          <div className="connection-mode-source">
            <div
              className="connection-mode-dot"
              style={{ backgroundColor: connectionMode.sourceNode.color }}
            />
            <span>{connectionMode.sourceNode.title}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span className="connection-mode-hint">Click a node to connect</span>
          <button className="connection-mode-cancel" onClick={cancelConnectionMode}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Drag-to-Connect Progress Indicator */}
      {dragConnect.active && dragConnect.sourceNode && dragConnect.targetNode && (
        <div className="drag-connect-indicator">
          <div className="drag-connect-progress-bar">
            <div
              className="drag-connect-progress-fill"
              style={{ width: `${dragConnect.progress * 100}%` }}
            />
          </div>
          <span className="drag-connect-text">
            Connecting: {dragConnect.sourceNode.title} → {dragConnect.targetNode.title}
          </span>
        </div>
      )}

    </div>
  );
}
