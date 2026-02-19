import { useCallback } from 'react';
import type { DagbanGraph as GraphData, Card, Edge, Traverser } from '@/lib/types';
import type {
  GraphNodeData,
  GraphLinkData,
  SelectedNodeInfo,
  EdgeContextMenuState,
  HoverTooltipState,
  ToastState,
  ConnectionModeState,
  ViewMode,
} from '../types';
import type { DragConnectState } from './useCanvasRendering';
import type { PendingBurnState, PreviewBurnState, DetachedDragState } from './useTraverserLogic';
import { ROOT_TRAVERSER_PREFIX } from '../traverserConstants';

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

export interface UseGraphInteractionsProps {
  // Data
  data: GraphData;
  themedCategories: { id: string; name: string; color: string }[];
  graphDataView: { nodes: GraphNodeData[]; links: GraphLinkData[] };

  // State values
  viewMode: ViewMode;
  connectionMode: ConnectionModeState;
  pendingBurn: PendingBurnState;
  previewBurn: PreviewBurnState;
  detachedDrag: DetachedDragState;
  edgeStartPicker: { edgeId: string; x: number; y: number } | null;
  edgeContextMenu: EdgeContextMenuState;
  selectedNode: SelectedNodeInfo | null;
  focusedNodeId: string | null;
  dragConnect: DragConnectState;
  nodeRadius: number;

  // Data maps
  cardById: Map<string, Card>;
  edgeById: Map<string, Edge>;
  traverserByEdgeId: Map<string, Traverser>;
  rootActiveNodeIds: Set<string>;
  eligibleTraverserEdgeIds: Set<string>;

  // State setters
  setSelectedNode: React.Dispatch<React.SetStateAction<SelectedNodeInfo | null>>;
  setFocusedNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setHoverTooltip: React.Dispatch<React.SetStateAction<HoverTooltipState>>;
  setEdgeContextMenu: React.Dispatch<React.SetStateAction<EdgeContextMenuState>>;
  setEdgeStartPicker: React.Dispatch<React.SetStateAction<{ edgeId: string; x: number; y: number } | null>>;
  setPendingSelectNodeId: React.Dispatch<React.SetStateAction<string | null>>;
  setConnectionMode: React.Dispatch<React.SetStateAction<ConnectionModeState>>;
  setDragConnect: React.Dispatch<React.SetStateAction<DragConnectState>>;
  setRenderTick: React.Dispatch<React.SetStateAction<number>>;
  setPreviewBurn: (burn: PreviewBurnState) => void;

  // Refs
  containerRef: React.RefObject<HTMLDivElement | null>;
  graphRef: React.RefObject<any>;
  suppressBackgroundClickRef: React.MutableRefObject<boolean>;
  renderRafRef: React.MutableRefObject<number | null>;
  dragConnectAnimationRef: React.MutableRefObject<number | null>;

  // Prop callbacks
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCardCreate?: (card: Card, parentCardId?: string, childCardId?: string) => void;
  onCardDelete?: (cardId: string) => void;
  onEdgeCreate?: (sourceId: string, targetId: string) => void;
  onEdgeDelete?: (edgeId: string) => void;
  onTraverserCreate?: (traverser: Traverser) => void;
  onTraverserUpdate?: (
    traverserId: string,
    updates: Partial<Traverser>,
    options?: { transient?: boolean; recordUndo?: boolean }
  ) => void;
  onTraverserDelete?: (traverserId: string) => void;
  onUndo?: () => boolean;

  // Traverser system callbacks
  cancelPendingBurn: () => void;
  confirmPendingBurn: () => void;
  clearDetachedDrag: () => void;

  // Functions from other hooks
  isBurntNodeId: (nodeId: string) => boolean;
  showToast: (message: string, type?: ToastState['type'], action?: ToastState['action']) => void;
  getAssigneeName: (assigneeId?: string) => string;
}

export function useGraphInteractions({
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
  focusedNodeId,
  dragConnect,
  nodeRadius,
  cardById,
  edgeById,
  traverserByEdgeId,
  rootActiveNodeIds,
  eligibleTraverserEdgeIds,
  setSelectedNode,
  setFocusedNodeId,
  setHoverTooltip,
  setEdgeContextMenu,
  setEdgeStartPicker,
  setPendingSelectNodeId,
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
}: UseGraphInteractionsProps) {
  // --- Helpers ---

  const bumpRenderTick = useCallback(() => {
    if (renderRafRef.current !== null) return;
    renderRafRef.current = requestAnimationFrame(() => {
      renderRafRef.current = null;
      setRenderTick(prev => prev + 1);
    });
  }, []);

  const suppressNextBackgroundClick = useCallback(() => {
    suppressBackgroundClickRef.current = true;
    requestAnimationFrame(() => {
      suppressBackgroundClickRef.current = false;
    });
  }, []);

  // --- Undo & Delete ---

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

  // --- Connection mode (creating edges by clicking) ---

  const startDownstreamConnection = useCallback((sourceNode: GraphNodeData) => {
    setConnectionMode({
      active: true,
      sourceNode,
      direction: 'downstream',
    });
    showToast(`Click a node to make it downstream of "${sourceNode.title}"`, 'info');
  }, [showToast]);

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

  const cancelConnectionMode = useCallback(() => {
    setConnectionMode({
      active: false,
      sourceNode: null,
      direction: 'downstream',
    });
  }, []);

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

    // Check if edge already exists (either direction)
    const edgeExists = data.edges.some(
      e => (e.source === sourceId && e.target === targetId) ||
           (e.source === targetId && e.target === sourceId)
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

  // --- Card creation ---

  // Helper: create a blank card and queue it for selection
  const createAndSelectCard = useCallback((parentCardId?: string, childCardId?: string) => {
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
    onCardCreate(newCard, parentCardId, childCardId);
    setPendingSelectNodeId(newCard.id);
  }, [onCardCreate, themedCategories, setPendingSelectNodeId]);

  // Fast root-node spawn (also used by "New node" button)
  const createEmptyRootNode = useCallback(() => {
    createAndSelectCard();
  }, [createAndSelectCard]);

  const openRootNodeCreation = useCallback((_initialTitle?: string) => {
    createAndSelectCard();
  }, [createAndSelectCard]);

  const openDownstreamCreation = useCallback((parentNode: GraphNodeData) => {
    createAndSelectCard(parentNode.id);
  }, [createAndSelectCard]);

  const openUpstreamCreation = useCallback((childNode: GraphNodeData) => {
    if (isBurntNodeId(childNode.id)) {
      showToast('Cannot add dependencies to a burnt node', 'warning');
      return;
    }
    createAndSelectCard(undefined, childNode.id);
  }, [createAndSelectCard, isBurntNodeId, showToast]);

  // --- Traverser/assignee handlers ---

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
    // closeEdgeStartPicker is defined below but referenced here via closure
  ]);

  // --- Edge interactions ---

  const closeEdgeStartPicker = useCallback(() => {
    setEdgeStartPicker(null);
  }, []);

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
    connectionMode.active,
    onTraverserCreate,
    onEdgeDelete,
    cancelPendingBurn,
    setEdgeContextMenu,
    suppressNextBackgroundClick,
  ]);

  // --- Node interactions ---

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

    // Shift+click: create edge from focused node to clicked node
    if (event.shiftKey && focusedNodeId && focusedNodeId !== node.id && onEdgeCreate) {
      // Validate: no burnt target, no duplicate edge
      if (isBurntNodeId(node.id)) {
        showToast('Cannot add dependencies to a burnt node', 'warning');
      } else {
        const edgeExists = data.edges.some(
          e => (e.source === focusedNodeId && e.target === node.id) ||
               (e.source === node.id && e.target === focusedNodeId)
        );
        if (edgeExists) {
          showToast('Connection already exists', 'warning');
        } else {
          onEdgeCreate(focusedNodeId, node.id);
          showToast(`Connected → "${node.title}"`, 'success');
        }
      }
      // Always advance focus to clicked node (enables chaining)
      setFocusedNodeId(node.id);
      setSelectedNode({
        node,
        screenX: event.clientX,
        screenY: event.clientY,
      });
      return;
    }

    // Select node: set focus + open detail panel
    setFocusedNodeId(node.id);
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
    focusedNodeId,
    onEdgeCreate,
    isBurntNodeId,
    data.edges,
    showToast,
  ]);

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

  const handleBackgroundClick = useCallback(() => {
    if (suppressBackgroundClickRef.current) {
      suppressBackgroundClickRef.current = false;
      return;
    }
    if (selectedNode) {
      setSelectedNode(null);
    }
    setFocusedNodeId(null);
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

    // Check if edge already exists (either direction)
    const edgeExists = data.edges.some(
      e => (e.source === sourceNode.id && e.target === targetNode.id) ||
           (e.source === targetNode.id && e.target === sourceNode.id)
    );
    if (edgeExists) {
      showToast('Connection already exists', 'warning');
      return;
    }

    // Create the edge (source -> target, so target becomes downstream)
    onEdgeCreate(sourceNode.id, targetNode.id);
    showToast(`Connected "${sourceNode.title}" -> "${targetNode.title}"`, 'success');
  }, [onEdgeCreate, data.edges, isBurntNodeId, showToast]);

  const handleNodeDrag = useCallback((node: GraphNodeData) => {
    if (!node.x || !node.y) return;

    // Check if the dragged node is touching any other node
    const TOUCH_DISTANCE = nodeRadius * 3; // Distance to consider "touching"
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
          const progress = Math.min(elapsed / 650, 1); // 0.65 seconds

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

  return {
    // Helpers
    bumpRenderTick,
    suppressNextBackgroundClick,

    // Undo & Delete
    handleUndo,
    handleDeleteNode,

    // Connection mode
    startDownstreamConnection,
    startUpstreamConnection,
    cancelConnectionMode,
    completeConnection,

    // Card creation
    createEmptyRootNode,
    openRootNodeCreation,
    openDownstreamCreation,
    openUpstreamCreation,

    // Traverser/assignee handlers
    createTraverserForEdge,
    createTraverserForRoot,
    handleCardAssigneeChange,
    handleEdgeStartPickUser,

    // Edge interactions
    openEdgeStartPicker,
    closeEdgeStartPicker,
    closeEdgeContextMenu,
    handleEdgeAssign,
    handleEdgeDetachTraverser,
    handleEdgeDelete,
    handleLinkClick,

    // Node interactions
    handleNodeClick,
    handleNodeHover,
    handleBackgroundClick,
    handleNodeDrag,
    handleNodeDragEnd,
    completeDragConnect,
  };
}
