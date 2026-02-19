'use client';

import { useCallback, useEffect, useMemo } from 'react';
import type { DagbanGraph as GraphData, Card, Traverser, User, Edge } from '@/lib/types';
import type { GraphNodeData, GraphLinkData, ViewMode, DisplayMode, ToastState } from '../types';
import type { TraverserTuning } from '../traverserTuning';
import { ROOT_TRAVERSER_PREFIX } from '../traverserConstants';
import { useTraverserLogic, clamp } from './useTraverserLogic';

export type { PendingBurnState, PreviewBurnState, DetachedDragState } from './useTraverserLogic';

export type TraverserOverlay = {
  id: string;
  x: number;
  y: number;
  user: User | null;
  isRoot: boolean;
  tangentAngle?: number;
};

export type UseTraverserSystemProps = {
  data: GraphData;
  viewMode: ViewMode;
  displayMode: DisplayMode;
  nodeRadius: number;
  rootRingRadius: number;
  traverserHitRadius: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  renderTick: number;
  graphDataView: { nodes: GraphNodeData[]; links: GraphLinkData[] };
  nodeByIdRef: React.RefObject<Map<string, GraphNodeData>>;
  cardById: Map<string, Card>;
  edgeById: Map<string, Edge>;
  traverserByEdgeId: Map<string, Traverser>;
  traverserById: Map<string, Traverser>;
  userById: Map<string, User>;
  rootActiveNodeIds: Set<string>;
  eligibleTraverserEdgeIds: Set<string>;
  getGraphCoords: (clientX: number, clientY: number) => { x: number; y: number } | null;
  getScreenCoords: (x: number, y: number) => { x: number; y: number } | null;
  getZoomScale: () => number;
  getEdgeNodes: (edgeId: string) => { sourceNode: GraphNodeData; targetNode: GraphNodeData } | null;
  getTraverserRenderPoint: (sourceNode: GraphNodeData, targetNode: GraphNodeData, position: number) => { x: number; y: number };
  getRootTraverserPoint: (node: GraphNodeData, position: number) => { x: number; y: number; angle?: number; startAngle?: number; radius?: number };
  getRootPositionFromCoords: (node: GraphNodeData, point: { x: number; y: number }) => number;
  createTraverserForEdge: (edgeId: string, userId: string, position: number) => Traverser;
  createTraverserForRoot: (nodeId: string, userId: string, position: number) => Traverser;
  onTraverserCreate?: (traverser: Traverser) => void;
  onTraverserUpdate?: (
    traverserId: string,
    updates: Partial<Traverser>,
    options?: { transient?: boolean; recordUndo?: boolean }
  ) => void;
  onTraverserDelete?: (traverserId: string) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  showToast: (message: string, type?: ToastState['type'], action?: ToastState['action']) => void;
  closeEdgeStartPicker: () => void;
  suppressNextBackgroundClick: () => void;
  tuning?: Partial<TraverserTuning>;
};

export function useTraverserSystem({
  data,
  viewMode,
  displayMode,
  nodeRadius,
  rootRingRadius,
  traverserHitRadius,
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
  tuning: tuningOverrides,
}: UseTraverserSystemProps) {
  // Build the 2D coordinate provider
  const coords = useMemo(() => ({
    getGraphCoords,
    getScreenCoords,
    getZoomScale,
    getEdgeNodes,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getRootPositionFromCoords,
  }), [getGraphCoords, getScreenCoords, getZoomScale, getEdgeNodes, getTraverserRenderPoint, getRootTraverserPoint, getRootPositionFromCoords]);

  // Shared traverser logic
  const logic = useTraverserLogic({
    data,
    viewMode,
    displayMode,
    nodeRadius,
    rootRingRadius,
    traverserHitRadius,
    coords,
    cardById,
    edgeById,
    traverserByEdgeId,
    traverserById,
    userById,
    rootActiveNodeIds,
    eligibleTraverserEdgeIds,
    nodeByIdRef,
    graphDataView,
    createTraverserForEdge,
    createTraverserForRoot,
    onTraverserCreate,
    onTraverserUpdate,
    onTraverserDelete,
    onCardChange,
    showToast,
    closeEdgeStartPicker,
    suppressNextBackgroundClick,
    tuning: tuningOverrides,
  });

  // --- 2D: HTML drag-over for user avatar drop ---

  const handleUserDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('application/dagban-user')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        logic.handleUserDragUpdate(event.clientX, event.clientY, rect);
      }
    }
  }, [containerRef, logic.handleUserDragUpdate]);

  const handleUserDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const userId = event.dataTransfer.getData('application/dagban-user');
    if (!userId) return;
    event.preventDefault();
    logic.setDraggingUserGhost(null);
    const gc = getGraphCoords(event.clientX, event.clientY);
    if (!gc) return;
    logic.handleUserDropAtCoords(userId, gc);
  }, [getGraphCoords, logic.handleUserDropAtCoords, logic.setDraggingUserGhost]);

  // --- 2D: canvas pointer-down for hit-testing traversers ---

  const handleTraverserPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== '2D') return;
    if (event.pointerType === 'touch') return;
    const gc = getGraphCoords(event.clientX, event.clientY);
    if (!gc) return;
    const hit = logic.findTraverserHit(gc);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    logic.initiateTraverserDrag(hit.traverserId, event.clientX, event.clientY);
  }, [viewMode, getGraphCoords, logic.findTraverserHit, logic.initiateTraverserDrag]);

  // --- 2D: overlay avatar pointer-down ---

  const handleTraverserOverlayPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, traverserId: string) => {
      if (viewMode !== '2D') return;
      event.preventDefault();
      event.stopPropagation();
      logic.initiateTraverserDrag(traverserId, event.clientX, event.clientY);
      if (event.pointerType !== 'touch') {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    },
    [viewMode, logic.initiateTraverserDrag],
  );

  // --- 2D: window pointer-move/up while dragging a traverser ---

  useEffect(() => {
    if (!logic.draggingTraverserId) return;

    const onPointerMove = (event: PointerEvent) => {
      const gc = getGraphCoords(event.clientX, event.clientY);
      if (!gc) return;
      const prevPointer = logic.lastPointerRef.current;
      const pointerScreen = { x: event.clientX, y: event.clientY };
      logic.lastPointerRef.current = pointerScreen;
      logic.handleTraverserDragMove(gc, pointerScreen, prevPointer);
    };

    const onPointerUp = () => {
      logic.handleTraverserDragEnd();
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [
    logic.draggingTraverserId,
    getGraphCoords,
    logic.handleTraverserDragMove,
    logic.handleTraverserDragEnd,
  ]);

  // --- 2D: screen-space traverser overlays ---

  const traverserOverlays = useMemo(() => {
    if (viewMode !== '2D') return [];
    return (data.traversers || [])
      .map(traverser => {
        let renderPoint: { x: number; y: number } | null = null;
        if (traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) {
          const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
          const node = nodeByIdRef.current?.get(nodeId);
          if (!node || node.x === undefined || node.y === undefined) return null;
          const pos = clamp(traverser.position, 0, 1);
          const render = getRootTraverserPoint(node, pos);
          renderPoint = { x: render.x, y: render.y };
          const isDetached = logic.detachedDrag && logic.detachedDrag.traverserId === traverser.id;
          const tangentAngle = isDetached ? undefined : render.angle !== undefined ? render.angle + Math.PI / 2 : undefined;
          const override =
            logic.detachedDrag && logic.detachedDrag.traverserId === traverser.id
              ? { x: logic.detachedDrag.x, y: logic.detachedDrag.y }
              : renderPoint;
          if (!override) return null;
          const screen = getScreenCoords(override.x, override.y);
          if (!screen) return null;
          const user = userById.get(traverser.userId) || null;
          return { id: traverser.id, x: screen.x, y: screen.y, user, isRoot: true, tangentAngle };
        } else {
          const edgeNodes = getEdgeNodes(traverser.edgeId);
          if (!edgeNodes) return null;
          const { sourceNode, targetNode } = edgeNodes;
          const pos = clamp(traverser.position, 0, 1);
          const render = getTraverserRenderPoint(sourceNode, targetNode, pos);
          renderPoint = { x: render.x, y: render.y };
        }

        const override =
          logic.detachedDrag && logic.detachedDrag.traverserId === traverser.id
            ? { x: logic.detachedDrag.x, y: logic.detachedDrag.y }
            : renderPoint;
        if (!override) return null;
        const screen = getScreenCoords(override.x, override.y);
        if (!screen) return null;
        const user = userById.get(traverser.userId) || null;
        return {
          id: traverser.id,
          x: screen.x,
          y: screen.y,
          user,
          isRoot: traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX),
        };
      })
      .filter(Boolean) as TraverserOverlay[];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    data.traversers,
    viewMode,
    renderTick,
    getEdgeNodes,
    userById,
    getScreenCoords,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    logic.detachedDrag,
    nodeByIdRef,
  ]);

  return {
    pendingBurn: logic.pendingBurn,
    previewBurn: logic.previewBurn,
    setPreviewBurn: logic.setPreviewBurn,
    beginPendingBurn: logic.beginPendingBurn,
    cancelPendingBurn: logic.cancelPendingBurn,
    confirmPendingBurn: logic.confirmPendingBurn,
    clearDetachedDrag: logic.clearDetachedDrag,
    draggingUserId: logic.draggingUserId,
    draggingTraverserId: logic.draggingTraverserId,
    draggingUserGhost: logic.draggingUserGhost,
    detachedDrag: logic.detachedDrag,
    handleUserDragStart: logic.handleUserDragStart,
    handleUserDragEnd: logic.handleUserDragEnd,
    handleUserDragOver,
    handleUserDrop,
    handleTraverserPointerDown,
    handleTraverserOverlayPointerDown,
    traverserOverlays,
  };
}
