'use client';

import { useCallback, useEffect, useRef, useState, useMemo, type FormEvent } from 'react';
import { DagbanGraph as GraphData, Card, Category, Traverser } from '@/lib/types';

import { useTraverserSystem } from './hooks/useTraverserSystem';
import { useGraphData } from './hooks/useGraphData';
import { useGraphCoordinates } from './hooks/useGraphCoordinates';
import { useCanvasRendering, type DragConnectState } from './hooks/useCanvasRendering';
import { useGraphInteractions } from './hooks/useGraphInteractions';
import type { TraverserTuning } from './traverserTuning';
import { ROOT_TRAVERSER_PREFIX } from './traverserConstants';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// Import extracted components
import {
  CardDetailPanel,
  CardCreationForm,
  CommandPalette,
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
  CommandPaletteState,
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

function generateTraverserId(): string {
  return `traverser-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
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
  const suppressBackgroundClickRef = useRef(false);
  const renderRafRef = useRef<number | null>(null);
  const dragConnectAnimationRef = useRef<number | null>(null);

  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('balls');
  const [nodeRadius, setNodeRadius] = useState(8);
  const [colorMode, setColorMode] = useState<ColorMode>('category');
  const [arrowMode, setArrowMode] = useState<ArrowMode>('end');
  const showSettings = showSettingsProp;

  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);
  const [renderTick, setRenderTick] = useState(0);
  const [fuseAnimationTime, setFuseAnimationTime] = useState(0);
  const fuseAnimationRef = useRef<number | null>(null);

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
  const [dragConnect, setDragConnect] = useState<DragConnectState>({
    active: false,
    sourceNode: null,
    targetNode: null,
    progress: 0,
    startTime: null,
  });

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

  // Filter state
  const BURNT_AGE_MAX = 30;
  const [selectedAssignees, setSelectedAssignees] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [blockerThreshold, setBlockerThreshold] = useState(0);
  const [burntAgeThreshold, setBurntAgeThreshold] = useState(BURNT_AGE_MAX);

  // ============================================================
  // Hook 1: Graph data reconciliation, maps, Three.js, labels
  // ============================================================
  const {
    CSS2DObject,
    graphReady,
    graphDataView,
    graphDataForForce,
    css2DRendererInstance,
    graphTheme,
    nodeByIdRef,
    linkByIdRef,
    nodeBckgDimensionsRef,
    themedCategories,
    cardById,
    isBurntNodeId,
    edgeById,
    traverserByEdgeId,
    traverserById,
    userById,
    rootTraverserByNodeId,
    getAssigneeName,
    eligibleTraverserEdgeIds,
    rootActiveNodeIds,
    updateNodeLabelElement,
  } = useGraphData({
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
  });

  // Show toast notification
  const showToast = useCallback((message: string, type: ToastState['type'] = 'info', action?: ToastState['action']) => {
    setToast({ visible: true, message, type, action });
  }, []);

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

  // ============================================================
  // Hook 2: Coordinate conversions + gradient helpers
  // ============================================================
  const {
    NODE_RADIUS,
    ROOT_RING_RADIUS,
    getGraphCoords,
    getZoomScale,
    getScreenCoords,
    getEdgeNodes,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getRootPositionFromCoords,
    getFuseGradient,
    getFuseRingGradient,
    BURNT_COLOR: _BURNT_COLOR,
    PENDING_RING_COLOR: _PENDING_RING_COLOR,
    FUSE_COLOR: _FUSE_COLOR,
  } = useGraphCoordinates({
    graphRef,
    nodeByIdRef,
    linkByIdRef,
    nodeRadius,
    fuseAnimationTime,
    graphTheme,
  });

  const TRAVERSER_RADIUS = 9;
  const TRAVERSER_HIT_RADIUS = TRAVERSER_RADIUS + 4;

  // --- Inline callbacks to break circular dep between useTraverserSystem ↔ useGraphInteractions ---
  const closeEdgeStartPicker = useCallback(() => {
    setEdgeStartPicker(null);
  }, []);

  const suppressNextBackgroundClick = useCallback(() => {
    suppressBackgroundClickRef.current = true;
    requestAnimationFrame(() => {
      suppressBackgroundClickRef.current = false;
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

  // ============================================================
  // Hook 3: Traverser system (drag, burn, overlays)
  // ============================================================
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

  // ============================================================
  // Hook 4: Interaction handlers (undo, delete, connections, etc.)
  // ============================================================
  const {
    bumpRenderTick,
    handleUndo,
    handleDeleteNode,
    startDownstreamConnection,
    startUpstreamConnection,
    cancelConnectionMode,
    completeConnection,
    openRootNodeCreation,
    openDownstreamCreation,
    openUpstreamCreation,
    closeCardCreation,
    handleCardCreation,
    handleCardAssigneeChange,
    handleEdgeStartPickUser,
    openEdgeStartPicker,
    closeEdgeContextMenu,
    handleEdgeAssign,
    handleEdgeDetachTraverser,
    handleEdgeDelete,
    handleLinkClick,
    handleNodeClick,
    handleNodeHover,
    handleBackgroundClick,
    handleNodeDrag,
    handleNodeDragEnd,
  } = useGraphInteractions({
    data,
    themedCategories,
    graphDataView,
    viewMode,
    connectionMode,
    pendingBurn,
    previewBurn,
    detachedDrag,
    edgeStartPicker,
    edgeContextMenu,
    selectedNode,
    cardCreation,
    dragConnect,
    nodeRadius,
    cardById,
    edgeById,
    traverserByEdgeId,
    rootActiveNodeIds,
    eligibleTraverserEdgeIds,
    setSelectedNode,
    setHoverTooltip,
    setEdgeContextMenu,
    setEdgeStartPicker,
    setCardCreation,
    setConnectionMode,
    setDragConnect,
    setRenderTick,
    setPreviewBurn,
    containerRef,
    graphRef,
    suppressBackgroundClickRef,
    renderRafRef,
    dragConnectAnimationRef,
    onCardChange,
    onCardCreate,
    onCardDelete,
    onEdgeCreate,
    onEdgeDelete,
    onTraverserCreate,
    onTraverserUpdate,
    onTraverserDelete,
    onUndo,
    cancelPendingBurn,
    confirmPendingBurn,
    clearDetachedDrag,
    isBurntNodeId,
    showToast,
    getAssigneeName,
  });

  // Trigger new node creation from parent component
  useEffect(() => {
    if (triggerNewNode) {
      openRootNodeCreation();
    }
  }, [triggerNewNode, openRootNodeCreation]);

  // Handle command palette node selection
  const handleCommandPaletteSelectNode = useCallback((node: GraphNodeData) => {
    if (graphRef.current && node.x !== undefined && node.y !== undefined) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  }, []);

  // ============================================================
  // Effects: Fuse animation, wheel/pointer, resize, 3D camera
  // ============================================================

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

  // Keyboard shortcuts handler
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
  }, [
    hoverTooltip.nodeId,
    commandPalette.visible,
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
    cancelConnectionMode,
    showToast,
  ]);

  // ============================================================
  // Hook 5: Canvas rendering callbacks
  // ============================================================
  const {
    nodeCanvasObject,
    linkCanvasObject,
    nodePointerAreaPaint,
    getArrowRelPos,
    getArrowRelPosMiddle,
  } = useCanvasRendering({
    displayMode,
    nodeRadius,
    arrowMode,
    connectionMode,
    dragConnect,
    draggingUserId,
    pendingBurn,
    previewBurn,
    detachedDrag,
    cardById,
    traverserByEdgeId,
    rootTraverserByNodeId,
    rootActiveNodeIds,
    eligibleTraverserEdgeIds,
    isBurntNodeId,
    getAssigneeName,
    NODE_RADIUS,
    ROOT_RING_RADIUS,
    BURNT_COLOR: _BURNT_COLOR,
    PENDING_RING_COLOR: _PENDING_RING_COLOR,
    FUSE_COLOR: _FUSE_COLOR,
    getTraverserRenderPoint,
    getFuseGradient,
    getFuseRingGradient,
    nodeBckgDimensionsRef,
  });

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
  }, [displayMode, updateNodeLabelElement, CSS2DObject]);

  // ============================================================
  // Props assembly + JSX
  // ============================================================

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

    </div>
  );
}
