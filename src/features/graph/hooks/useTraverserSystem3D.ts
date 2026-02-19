'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DagbanGraph as GraphData, Card, Traverser, User, Edge } from '@/lib/types';
import type { GraphNodeData, GraphLinkData, ViewMode, DisplayMode, TraverserCoordinateProvider } from '../types';
import type { TraverserTuning } from '../traverserTuning';
import { ROOT_TRAVERSER_PREFIX } from '../traverserConstants';
import { useTraverserLogic, clamp } from './useTraverserLogic';

export type { PendingBurnState, PreviewBurnState, DetachedDragState } from './useTraverserLogic';

export type TraverserOverlay3D = {
  id: string;
  x: number;
  y: number;
  user: User | null;
  isRoot: boolean;
  tangentAngle?: number;
};

export type UseTraverserSystem3DProps = {
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
  linkByIdRef: React.RefObject<Map<string, GraphLinkData>>;
  cardById: Map<string, Card>;
  edgeById: Map<string, Edge>;
  traverserByEdgeId: Map<string, Traverser>;
  traverserById: Map<string, Traverser>;
  userById: Map<string, User>;
  rootActiveNodeIds: Set<string>;
  eligibleTraverserEdgeIds: Set<string>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphRef: React.RefObject<any>;
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
  closeEdgeStartPicker: () => void;
  suppressNextBackgroundClick: () => void;
  tuning?: Partial<TraverserTuning>;
};

// Reference distance for zoom scale calculation.
// When the camera is at this distance from the origin, getZoomScale returns 1.
const REFERENCE_CAMERA_DISTANCE = 300;

export function useTraverserSystem3D({
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
  linkByIdRef,
  cardById,
  edgeById,
  traverserByEdgeId,
  traverserById,
  userById,
  rootActiveNodeIds,
  eligibleTraverserEdgeIds,
  graphRef,
  createTraverserForEdge,
  createTraverserForRoot,
  onTraverserCreate,
  onTraverserUpdate,
  onTraverserDelete,
  onCardChange,
  closeEdgeStartPicker,
  suppressNextBackgroundClick,
  tuning: tuningOverrides,
}: UseTraverserSystem3DProps) {
  // --- 3D helper: graph ref accessor ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = (): any => graphRef.current;

  // --- 3D coordinate provider ---

  const getGraphCoords = useCallback((clientX: number, clientY: number): { x: number; y: number; z?: number } | null => {
    const g = graph();
    if (!g || typeof g.screen2GraphCoords !== 'function') return null;
    const camera = typeof g.camera === 'function' ? g.camera() : null;
    if (!camera) return null;
    // Distance from camera to origin — used as the depth plane
    const distance = camera.position.length();
    // react-force-graph-3d screen2GraphCoords expects renderer-local coords
    const renderer = typeof g.renderer === 'function' ? g.renderer() : null;
    if (!renderer) return null;
    const canvas = renderer.domElement as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;
    const result = g.screen2GraphCoords(localX, localY, distance);
    return result ? { x: result.x, y: result.y, z: result.z } : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getScreenCoords = useCallback((x: number, y: number, z?: number): { x: number; y: number } | null => {
    const g = graph();
    if (!g || typeof g.graph2ScreenCoords !== 'function') return null;
    const result = g.graph2ScreenCoords(x, y, z ?? 0);
    if (!result) return null;
    // graph2ScreenCoords returns renderer-local coordinates
    return { x: result.x, y: result.y };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getZoomScale = useCallback((): number => {
    const g = graph();
    if (!g) return 1;
    const camera = typeof g.camera === 'function' ? g.camera() : null;
    if (!camera) return 1;
    // Use inverse camera distance as zoom proxy
    return REFERENCE_CAMERA_DISTANCE / Math.max(camera.position.length(), 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getEdgeNodes = useCallback((edgeId: string): { sourceNode: GraphNodeData; targetNode: GraphNodeData } | null => {
    const link = linkByIdRef.current?.get(edgeId);
    if (!link) return null;
    const sourceNode = typeof link.source === 'string'
      ? nodeByIdRef.current?.get(link.source)
      : link.source;
    const targetNode = typeof link.target === 'string'
      ? nodeByIdRef.current?.get(link.target)
      : link.target;
    if (!sourceNode || !targetNode) return null;
    if (sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) {
      return null;
    }
    return { sourceNode, targetNode };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getTraverserRenderPoint = useCallback((
    sourceNode: GraphNodeData,
    targetNode: GraphNodeData,
    position: number,
  ): { x: number; y: number; z?: number } => {
    const sx = sourceNode.x ?? 0;
    const sy = sourceNode.y ?? 0;
    const sz = sourceNode.z ?? 0;
    const tx = targetNode.x ?? 0;
    const ty = targetNode.y ?? 0;
    const tz = targetNode.z ?? 0;
    const dx = tx - sx;
    const dy = ty - sy;
    const dz = tz - sz;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!dist) {
      return { x: sx, y: sy, z: sz };
    }
    const safeOffset = Math.min(nodeRadius, dist * 0.45);
    const offsetT = safeOffset / dist;
    const clampedT = clamp(position, offsetT, 1 - offsetT);
    return {
      x: sx + dx * clampedT,
      y: sy + dy * clampedT,
      z: sz + dz * clampedT,
    };
  }, [nodeRadius]);

  /** Compute screen-space ring radius using camera-right offset (matches rendering hook). */
  const getScreenRingRadius = useCallback((
    nx: number, ny: number, nz: number,
    centerX: number, centerY: number,
  ): number | null => {
    const g = graph();
    if (!g) return null;
    const camera = typeof g.camera === 'function' ? g.camera() : null;
    if (!camera) return null;
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rLen < 1e-6) return null;
    const edge = getScreenCoords(
      nx + (rx / rLen) * rootRingRadius,
      ny + (ry / rLen) * rootRingRadius,
      nz + (rz / rLen) * rootRingRadius,
    );
    if (!edge) return null;
    return Math.sqrt((edge.x - centerX) ** 2 + (edge.y - centerY) ** 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRingRadius, getScreenCoords]);

  const getRootTraverserPoint = useCallback((
    node: GraphNodeData,
    position: number,
  ): { x: number; y: number; z?: number; angle?: number; startAngle?: number; radius?: number } => {
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;
    const cz = node.z ?? 0;

    const ROOT_START_ANGLE = -Math.PI / 2;
    const angle = ROOT_START_ANGLE + clamp(position, 0, 1) * Math.PI * 2;

    // Compute the ring position in screen space (matching the canvas overlay),
    // then back-project to 3D so that world-space coordinates are consistent
    // with the visual ring under perspective projection.
    const g = graph();
    const centerScreen = getScreenCoords(cx, cy, cz);
    if (g && centerScreen) {
      const screenR = getScreenRingRadius(cx, cy, cz, centerScreen.x, centerScreen.y);
      if (screenR && screenR >= 1) {
        const sx = centerScreen.x + Math.cos(angle) * screenR;
        const sy = centerScreen.y + Math.sin(angle) * screenR;
        // Back-project from screen to 3D at the node's depth
        const camera = typeof g.camera === 'function' ? g.camera() : null;
        if (camera && typeof g.screen2GraphCoords === 'function') {
          const distance = camera.position.length();
          const result = g.screen2GraphCoords(sx, sy, distance);
          if (result) {
            return {
              x: result.x,
              y: result.y,
              z: result.z,
              angle,
              startAngle: ROOT_START_ANGLE,
              radius: rootRingRadius,
            };
          }
        }
      }
    }

    // Fallback: simple XY ring (no camera available)
    return {
      x: cx + Math.cos(angle) * rootRingRadius,
      y: cy + Math.sin(angle) * rootRingRadius,
      z: cz,
      angle,
      startAngle: ROOT_START_ANGLE,
      radius: rootRingRadius,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRingRadius, getScreenCoords, getScreenRingRadius]);

  const getRootPositionFromCoords = useCallback((
    node: GraphNodeData,
    point: { x: number; y: number; z?: number },
  ): number => {
    // Compute position in screen space to match the screen-space ring rendering.
    // Project both the node center and the input point to screen, then compute
    // the angle relative to the ring's start angle.
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;
    const cz = node.z ?? 0;

    const centerScreen = getScreenCoords(cx, cy, cz);
    const pointScreen = getScreenCoords(point.x, point.y, point.z);
    if (!centerScreen || !pointScreen) {
      // Fallback: simple XY angle
      const dx = point.x - cx;
      const dy = point.y - cy;
      const ROOT_START_ANGLE = -Math.PI / 2;
      const angle = Math.atan2(dy, dx);
      let theta = angle - ROOT_START_ANGLE;
      if (theta < 0) theta += Math.PI * 2;
      return clamp(theta / (Math.PI * 2), 0, 1);
    }

    const dx = pointScreen.x - centerScreen.x;
    const dy = pointScreen.y - centerScreen.y;
    const ROOT_START_ANGLE = -Math.PI / 2;
    const angle = Math.atan2(dy, dx);
    let theta = angle - ROOT_START_ANGLE;
    if (theta < 0) theta += Math.PI * 2;
    return clamp(theta / (Math.PI * 2), 0, 1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getScreenCoords]);

  // Screen-space detach delta: project node center, compute screen-space ring radius,
  // then compare with the projected drag point's distance from the ring.
  // Returns the delta in world-space units (scaled by rootRingRadius / screenR) so
  // the shared logic's DETACH_DISTANCE thresholds work without modification.
  const getRootRingDetachDelta = useCallback((
    node: GraphNodeData,
    graphCoords: { x: number; y: number; z?: number },
  ): number | null => {
    const nx = node.x ?? 0, ny = node.y ?? 0, nz = node.z ?? 0;
    const centerScreen = getScreenCoords(nx, ny, nz);
    const pointScreen = getScreenCoords(graphCoords.x, graphCoords.y, graphCoords.z);
    if (!centerScreen || !pointScreen) return null;

    const g = graph();
    if (!g) return null;
    const camera = typeof g.camera === 'function' ? g.camera() : null;
    if (!camera) return null;
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rLen < 1e-6) return null;
    const edgeScreen = getScreenCoords(
      nx + (rx / rLen) * rootRingRadius,
      ny + (ry / rLen) * rootRingRadius,
      nz + (rz / rLen) * rootRingRadius,
    );
    if (!edgeScreen) return null;
    const screenR = Math.sqrt((edgeScreen.x - centerScreen.x) ** 2 + (edgeScreen.y - centerScreen.y) ** 2);
    if (screenR < 1) return null;

    const screenDist = Math.sqrt((pointScreen.x - centerScreen.x) ** 2 + (pointScreen.y - centerScreen.y) ** 2);
    const screenDelta = Math.abs(screenDist - screenR);
    // Convert screen-pixel delta back to world units so DETACH_DISTANCE comparison works
    return screenDelta * (rootRingRadius / screenR);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rootRingRadius, getScreenCoords]);

  // Screen-space edge projection: project the drag point and edge endpoints to screen,
  // do 2D segment projection there, then convert distance back to world units.
  const projectToEdgeScreen = useCallback((
    graphCoords: { x: number; y: number; z?: number },
    sourceNode: GraphNodeData,
    targetNode: GraphNodeData,
  ): { t: number; distance: number } | null => {
    const pointScreen = getScreenCoords(graphCoords.x, graphCoords.y, graphCoords.z);
    const srcScreen = getScreenCoords(sourceNode.x!, sourceNode.y!, sourceNode.z ?? 0);
    const tgtScreen = getScreenCoords(targetNode.x!, targetNode.y!, targetNode.z ?? 0);
    if (!pointScreen || !srcScreen || !tgtScreen) return null;

    // 2D projection in screen space
    const dx = tgtScreen.x - srcScreen.x;
    const dy = tgtScreen.y - srcScreen.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq < 1) return null;

    let t = ((pointScreen.x - srcScreen.x) * dx + (pointScreen.y - srcScreen.y) * dy) / lengthSq;
    t = clamp(t, 0, 1);
    const projX = srcScreen.x + t * dx;
    const projY = srcScreen.y + t * dy;
    const screenDist = Math.hypot(pointScreen.x - projX, pointScreen.y - projY);

    // Convert screen-pixel distance to world units using edge length ratio
    const sx = sourceNode.x! - targetNode.x!;
    const sy = sourceNode.y! - targetNode.y!;
    const sz = (sourceNode.z ?? 0) - (targetNode.z ?? 0);
    const worldEdgeLen = Math.sqrt(sx * sx + sy * sy + sz * sz);
    const screenEdgeLen = Math.sqrt(lengthSq);
    const scale = screenEdgeLen > 1 ? worldEdgeLen / screenEdgeLen : 1;

    return { t, distance: screenDist * scale };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getScreenCoords]);

  // Build the 3D coordinate provider
  const coords: TraverserCoordinateProvider = useMemo(() => ({
    getGraphCoords,
    getScreenCoords,
    getZoomScale,
    getEdgeNodes,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getRootPositionFromCoords,
    getRootRingDetachDelta,
    projectToEdgeScreen,
  }), [getGraphCoords, getScreenCoords, getZoomScale, getEdgeNodes, getTraverserRenderPoint, getRootTraverserPoint, getRootPositionFromCoords, getRootRingDetachDelta, projectToEdgeScreen]);

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
    closeEdgeStartPicker,
    suppressNextBackgroundClick,
    tuning: tuningOverrides,
  });

  // --- 3D: HTML drag-over for user avatar drop ---

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

  // --- 3D: canvas pointer-down for hit-testing traversers ---

  // In 3D, traversers are grabbed only via their overlay buttons (not canvas hit-test)
  // to avoid intercepting camera orbit/pan gestures.
  const handleTraverserPointerDown = useCallback((_event: React.PointerEvent<HTMLDivElement>) => {
    // no-op: 3D traversers use overlay buttons for grab
  }, []);

  // --- 3D: overlay avatar pointer-down ---

  const handleTraverserOverlayPointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, traverserId: string) => {
      if (viewMode !== '3D') return;
      event.preventDefault();
      event.stopPropagation();
      logic.initiateTraverserDrag(traverserId, event.clientX, event.clientY);
      if (event.pointerType !== 'touch') {
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
    },
    [viewMode, logic.initiateTraverserDrag],
  );

  // --- 3D: window pointer-move/up while dragging a traverser ---

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

  // --- 3D: screen-space traverser overlays (project 3D to screen) ---
  // Computed via rAF loop so overlays track camera pan/orbit/zoom every frame,
  // rather than relying on React re-renders via renderTick.

  const ROOT_START_ANGLE_CONST = -Math.PI / 2;
  const [traverserOverlays, setTraverserOverlays] = useState<TraverserOverlay3D[]>([]);

  const computeOverlaysRef = useRef<() => TraverserOverlay3D[]>(() => []);
  computeOverlaysRef.current = () => {
    if (viewMode !== '3D') return [];
    return (data.traversers || [])
      .map(traverser => {
        const isDetached = logic.detachedDrag && logic.detachedDrag.traverserId === traverser.id;

        if (traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) {
          const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
          const node = nodeByIdRef.current?.get(nodeId);
          if (!node || node.x === undefined || node.y === undefined) return null;

          if (isDetached) {
            const screen = getScreenCoords(logic.detachedDrag!.x, logic.detachedDrag!.y, logic.detachedDrag!.z);
            if (!screen) return null;
            const user = userById.get(traverser.userId) || null;
            return { id: traverser.id, x: screen.x, y: screen.y, user, isRoot: true } as TraverserOverlay3D;
          }

          // Compute position directly in screen space to match the canvas overlay ring
          const nx = node.x ?? 0, ny = node.y ?? 0, nz = node.z ?? 0;
          const centerScreen = getScreenCoords(nx, ny, nz);
          if (!centerScreen) return null;
          const screenR = getScreenRingRadius(nx, ny, nz, centerScreen.x, centerScreen.y);
          if (!screenR || screenR < 1) return null;

          const pos = clamp(traverser.position, 0, 1);
          const angle = ROOT_START_ANGLE_CONST + pos * Math.PI * 2;
          const sx = centerScreen.x + Math.cos(angle) * screenR;
          const sy = centerScreen.y + Math.sin(angle) * screenR;
          const tangentAngle = angle + Math.PI / 2;

          const user = userById.get(traverser.userId) || null;
          return { id: traverser.id, x: sx, y: sy, user, isRoot: true, tangentAngle } as TraverserOverlay3D;
        } else {
          const edgeNodes = getEdgeNodes(traverser.edgeId);
          if (!edgeNodes) return null;
          const { sourceNode, targetNode } = edgeNodes;
          const pos = clamp(traverser.position, 0, 1);
          const render = getTraverserRenderPoint(sourceNode, targetNode, pos);
          const renderPoint = { x: render.x, y: render.y, z: render.z };

          const override = isDetached
            ? { x: logic.detachedDrag!.x, y: logic.detachedDrag!.y, z: logic.detachedDrag!.z }
            : renderPoint;
          const screen = getScreenCoords(override.x, override.y, override.z);
          if (!screen) return null;
          const user = userById.get(traverser.userId) || null;
          return {
            id: traverser.id,
            x: screen.x,
            y: screen.y,
            user,
            isRoot: false,
          } as TraverserOverlay3D;
        }
      })
      .filter(Boolean) as TraverserOverlay3D[];
  };

  const prevOverlaysRef = useRef<string>('');

  useEffect(() => {
    if (viewMode !== '3D') {
      setTraverserOverlays([]);
      prevOverlaysRef.current = '';
      return;
    }
    let rafId: number;
    const loop = () => {
      const next = computeOverlaysRef.current();
      // Only trigger React re-render if positions actually changed
      const key = next.map(o => `${o.id}:${o.x.toFixed(1)},${o.y.toFixed(1)}`).join('|');
      if (key !== prevOverlaysRef.current) {
        prevOverlaysRef.current = key;
        setTraverserOverlays(next);
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [viewMode]);

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
