'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DagbanGraph as GraphData, Card, Traverser, User, Edge } from '@/lib/types';
import type { GraphNodeData, GraphLinkData, ViewMode, DisplayMode, ToastState } from '../types';
import { defaultTraverserTuning, type TraverserTuning } from '../traverserTuning';
import { ROOT_TRAVERSER_PREFIX } from '../traverserConstants';

export type PendingBurnState = {
  traverserId: string | null;
  targetNodeId: string;
  initiatorUserId: string | null;
  anchor?: { x: number; y: number };
} | null;

export type PreviewBurnState = {
  edgeId: string;
  targetNodeId: string;
} | null;

export type DetachedDragState = {
  traverserId: string;
  x: number;
  y: number;
  candidateEdgeId: string | null;
  candidatePosition: number | null;
  candidateRootNodeId?: string | null;
  candidateRootPosition?: number | null;
} | null;

export type TraverserOverlay = {
  id: string;
  x: number;
  y: number;
  user: User | null;
  isRoot: boolean;
};

export type UseTraverserSystemProps = {
  data: GraphData;
  viewMode: ViewMode;
  displayMode: DisplayMode;
  nodeRadius: number;
  rootRingRadius: number;
  traverserHitRadius: number;
  containerRef: React.RefObject<HTMLDivElement>;
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
  getRootTraverserPoint: (node: GraphNodeData, position: number) => { x: number; y: number };
  getRootPositionFromCoords: (node: GraphNodeData, point: { x: number; y: number }) => number;
  createTraverserForEdge: (edgeId: string, userId: string, position: number) => Traverser;
  createTraverserForRoot: (nodeId: string, userId: string, position: number) => Traverser;
  onTraverserCreate?: (traverser: Traverser) => void;
  onTraverserUpdate?: (traverserId: string, updates: Partial<Traverser>) => void;
  onTraverserDelete?: (traverserId: string) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  showToast: (message: string, type?: ToastState['type'], action?: ToastState['action']) => void;
  closeEdgeStartPicker: () => void;
  suppressNextBackgroundClick: () => void;
  tuning?: Partial<TraverserTuning>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function projectPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    const dist = Math.hypot(px - ax, py - ay);
    return { t: 0, x: ax, y: ay, distance: dist };
  }

  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  t = clamp(t, 0, 1);
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  const dist = Math.hypot(px - projX, py - projY);
  return { t, x: projX, y: projY, distance: dist };
}

function distanceToLine(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return Math.hypot(px - ax, py - ay);
  }
  const t = ((px - ax) * dx + (py - ay) * dy) / lengthSq;
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.hypot(px - projX, py - projY);
}

function resolveTuning(overrides?: Partial<TraverserTuning>): TraverserTuning {
  if (!overrides) return defaultTraverserTuning;
  return {
    ...defaultTraverserTuning,
    ...overrides,
    magnetStrength: {
      ...defaultTraverserTuning.magnetStrength,
      ...overrides.magnetStrength,
    },
    rootSnapMultiplier: {
      ...defaultTraverserTuning.rootSnapMultiplier,
      ...overrides.rootSnapMultiplier,
    },
  };
}

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
  const tuning = useMemo(() => resolveTuning(tuningOverrides), [tuningOverrides]);

  const [pendingBurn, setPendingBurn] = useState<PendingBurnState>(null);
  const [previewBurn, setPreviewBurn] = useState<PreviewBurnState>(null);
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [draggingTraverserId, setDraggingTraverserId] = useState<string | null>(null);
  const [draggingUserGhost, setDraggingUserGhost] = useState<{ x: number; y: number } | null>(null);
  const [detachedDrag, setDetachedDrag] = useState<DetachedDragState>(null);
  const draggingTraverserRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragAngleRef = useRef<number | null>(null);
  const lastDragStateRef = useRef<{ t: number; targetNodeId: string } | null>(null);

  const DETACH_DISTANCE = nodeRadius * tuning.detachDistanceMultiplier;
  const ORTHOGONAL_DETACH_ANGLE = tuning.detachAngleDeg;
  const DETACH_DISTANCE_BOOST = tuning.detachDistanceBoost;
  const MIN_PERP_DETACH_PX = tuning.minPerpDetachPx;
  const SELECTION_THRESHOLD = 0.97;

  const beginPendingBurn = useCallback((targetNodeId: string, traverser: Traverser | null, initiatorUserId: string | null, anchor?: { x: number; y: number }) => {
    setPendingBurn(prev => {
      if (prev && prev.traverserId === (traverser?.id || null) && prev.targetNodeId === targetNodeId) {
        return prev;
      }
      return {
        traverserId: traverser?.id || null,
        targetNodeId,
        initiatorUserId,
        anchor,
      };
    });
  }, []);

  const cancelPendingBurn = useCallback(() => {
    setPendingBurn(null);
    setPreviewBurn(null);
  }, []);

  const clearDetachedDrag = useCallback(() => {
    setDetachedDrag(null);
  }, []);

  const confirmPendingBurn = useCallback(() => {
    if (!pendingBurn) return;
    if (!onCardChange) return;

    const targetCard = cardById.get(pendingBurn.targetNodeId);
    if (!targetCard) return;
    const now = new Date().toISOString();
    onCardChange(pendingBurn.targetNodeId, { burntAt: now });

    if (pendingBurn.traverserId && onTraverserDelete) {
      onTraverserDelete(pendingBurn.traverserId);
    }

    // Add traversers to downstream edges that have assignees
    data.edges.forEach(edge => {
      if (edge.source !== pendingBurn.targetNodeId) return;
      if (traverserByEdgeId.has(edge.id)) return;
      const edgeTarget = cardById.get(edge.target);
      if (!edgeTarget?.assignee) return;
      if (!onTraverserCreate) return;
      onTraverserCreate(createTraverserForEdge(edge.id, edgeTarget.assignee, 0));
    });

    setPendingBurn(null);
    setPreviewBurn(null);
    showToast('Node burnt', 'success');
  }, [
    pendingBurn,
    cardById,
    onCardChange,
    onTraverserCreate,
    onTraverserDelete,
    data.edges,
    traverserByEdgeId,
    createTraverserForEdge,
    showToast,
  ]);

  const updateTraverserPosition = useCallback((traverser: Traverser, nextPosition: number) => {
    if (!onTraverserUpdate) return;
    onTraverserUpdate(traverser.id, {
      position: clamp(nextPosition, 0, 1),
      updatedAt: new Date().toISOString(),
    });
  }, [onTraverserUpdate]);

  const findClosestEdge = useCallback((point: { x: number; y: number }, allowedEdgeIds?: Set<string>, maxDistanceOverride?: number) => {
    const zoom = getZoomScale();
    const maxDistance = (maxDistanceOverride ?? tuning.dragEdgeSearchRadius) / zoom;
    let closest: { edgeId: string; position: number; distance: number } | null = null;

    for (const edge of data.edges) {
      if (allowedEdgeIds && !allowedEdgeIds.has(edge.id)) continue;
      const edgeNodes = getEdgeNodes(edge.id);
      if (!edgeNodes) continue;
      const { sourceNode, targetNode } = edgeNodes;
      const projection = projectPointToSegment(
        point.x,
        point.y,
        sourceNode.x!,
        sourceNode.y!,
        targetNode.x!,
        targetNode.y!
      );
      if (projection.distance > maxDistance) continue;
      if (!closest || projection.distance < closest.distance) {
        closest = { edgeId: edge.id, position: projection.t, distance: projection.distance };
      }
    }

    return closest;
  }, [data.edges, getEdgeNodes, getZoomScale, tuning.dragEdgeSearchRadius]);

  const findClosestRootNode = useCallback((point: { x: number; y: number }) => {
    if (rootActiveNodeIds.size === 0) return null;
    const zoom = getZoomScale();
    const rootSnapMultiplier = displayMode === 'balls' ? tuning.rootSnapMultiplier.balls : tuning.rootSnapMultiplier.labels;
    const baseRadius = Math.max(rootRingRadius, nodeRadius * rootSnapMultiplier);
    const maxDistance = baseRadius / zoom;
    const ringTolerance = (nodeRadius * 0.9) / zoom;
    const nodeTolerance = (nodeRadius * 1.5) / zoom;
    let closest: { nodeId: string; distance: number } | null = null;

    for (const node of graphDataView.nodes as GraphNodeData[]) {
      if (!rootActiveNodeIds.has(node.id)) continue;
      if (node.x === undefined || node.y === undefined) continue;
      const dist = Math.hypot(point.x - node.x, point.y - node.y);
      if (dist > maxDistance + ringTolerance) continue;
      const ringDistance = Math.abs(dist - rootRingRadius);
      if (ringDistance > ringTolerance && dist > nodeTolerance) continue;
      const metric = ringDistance <= ringTolerance ? ringDistance : dist;
      if (!closest || metric < closest.distance) {
        closest = { nodeId: node.id, distance: metric };
      }
    }

    return closest;
  }, [
    graphDataView.nodes,
    rootActiveNodeIds,
    getZoomScale,
    nodeRadius,
    displayMode,
    rootRingRadius,
    tuning.rootSnapMultiplier.balls,
    tuning.rootSnapMultiplier.labels,
  ]);

  const findTraverserHit = useCallback((point: { x: number; y: number }) => {
    const zoom = getZoomScale();
    const hitDistance = traverserHitRadius / zoom;
    for (const traverser of data.traversers || []) {
      let tx = 0;
      let ty = 0;
      if (traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) {
        const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
        const node = nodeByIdRef.current?.get(nodeId);
        if (!node || node.x === undefined || node.y === undefined) continue;
        const render = getRootTraverserPoint(node, traverser.position);
        tx = render.x;
        ty = render.y;
      } else {
        const edgeNodes = getEdgeNodes(traverser.edgeId);
        if (!edgeNodes) continue;
        const { sourceNode, targetNode } = edgeNodes;
        const render = getTraverserRenderPoint(sourceNode, targetNode, traverser.position);
        tx = render.x;
        ty = render.y;
      }
      const dist = Math.hypot(point.x - tx, point.y - ty);
      if (dist <= hitDistance) {
        return { traverserId: traverser.id };
      }
    }
    return null;
  }, [
    data.traversers,
    getEdgeNodes,
    getZoomScale,
    traverserHitRadius,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    nodeByIdRef,
  ]);

  const handleUserDragStart = useCallback((userId: string) => {
    setDraggingUserId(userId);
    closeEdgeStartPicker();
    setPendingBurn(null);
    setPreviewBurn(null);
  }, [closeEdgeStartPicker]);

  const handleUserDragEnd = useCallback(() => {
    setDraggingUserId(null);
    setDraggingUserGhost(null);
  }, []);

  const updateDraggingUserGhost = useCallback((clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const baseX = clientX - rect.left;
    const baseY = clientY - rect.top;
    const coords = getGraphCoords(clientX, clientY);
    if (!coords) {
      setDraggingUserGhost({ x: baseX, y: baseY });
      return;
    }

    const rootCandidate = findClosestRootNode(coords);
    let rootCandidateId: string | null = null;
    let rootCandidatePosition: number | null = null;
    if (rootCandidate) {
      const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
      if (!traverserByEdgeId.has(rootEdgeId)) {
        const rootNode = nodeByIdRef.current?.get(rootCandidate.nodeId);
        if (rootNode) {
          rootCandidateId = rootCandidate.nodeId;
          rootCandidatePosition = getRootPositionFromCoords(rootNode, coords);
        }
      }
    }

    const candidate = findClosestEdge(coords, eligibleTraverserEdgeIds, tuning.ghostEdgeSearchRadius);
    const preferRoot = rootCandidateId && (!candidate || (rootCandidate.distance <= candidate.distance));
    const selectedCandidate = preferRoot ? null : candidate;
    const selectedRootId = preferRoot ? rootCandidateId : null;
    const selectedRootPosition = preferRoot ? rootCandidatePosition : null;

    let targetX = baseX;
    let targetY = baseY;
    if (selectedRootId) {
      const rootNode = nodeByIdRef.current?.get(selectedRootId);
      if (rootNode) {
        const render = getRootTraverserPoint(rootNode, selectedRootPosition ?? 0);
        const screen = getScreenCoords(render.x, render.y);
        if (screen) {
          targetX = screen.x;
          targetY = screen.y;
        }
      }
    } else if (selectedCandidate) {
      const candidateNodes = getEdgeNodes(selectedCandidate.edgeId);
      if (candidateNodes) {
        const render = getTraverserRenderPoint(
          candidateNodes.sourceNode,
          candidateNodes.targetNode,
          selectedCandidate.position
        );
        const screen = getScreenCoords(render.x, render.y);
        if (screen) {
          targetX = screen.x;
          targetY = screen.y;
        }
      }
    }

    setDraggingUserGhost(prev => {
      const hasMagnetTarget = Boolean(selectedRootId || selectedCandidate);
      const strength = hasMagnetTarget ? tuning.magnetStrength.ghostTarget : tuning.magnetStrength.ghostFree;
      const startX = prev ? prev.x : baseX;
      const startY = prev ? prev.y : baseY;
      return {
        x: startX + (targetX - startX) * strength,
        y: startY + (targetY - startY) * strength,
      };
    });
  }, [
    getGraphCoords,
    findClosestRootNode,
    traverserByEdgeId,
    getRootPositionFromCoords,
    findClosestEdge,
    eligibleTraverserEdgeIds,
    getEdgeNodes,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getScreenCoords,
    tuning.ghostEdgeSearchRadius,
    tuning.magnetStrength.ghostTarget,
    tuning.magnetStrength.ghostFree,
    nodeByIdRef,
    containerRef,
  ]);

  const handleUserDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes('application/dagban-user')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      updateDraggingUserGhost(event.clientX, event.clientY);
    }
  }, [updateDraggingUserGhost]);

  const handleUserDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    const userId = event.dataTransfer.getData('application/dagban-user');
    if (!userId) return;
    event.preventDefault();
    setDraggingUserGhost(null);

    const coords = getGraphCoords(event.clientX, event.clientY);
    if (!coords) return;
    const rootCandidate = findClosestRootNode(coords);
    if (rootCandidate) {
      if (!onTraverserCreate) return;
      const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
      if (traverserByEdgeId.has(rootEdgeId)) {
        showToast('Root already has active progress', 'info');
        setDraggingUserId(null);
        return;
      }
      const node = nodeByIdRef.current?.get(rootCandidate.nodeId);
      const position = node ? getRootPositionFromCoords(node, coords) : 0;
      const traverser = createTraverserForRoot(rootCandidate.nodeId, userId, position);
      onTraverserCreate(traverser);
      closeEdgeStartPicker();
      setDraggingUserId(null);
      showToast('Root progress started', 'success');
      return;
    }

    if (!onTraverserCreate) return;

    if (eligibleTraverserEdgeIds.size === 0) {
      showToast('No available edges yet. Drop on a root node to start.', 'info');
      return;
    }

    const closestAny = findClosestEdge(coords, undefined, tuning.ghostEdgeSearchRadius);
    if (!closestAny) {
      showToast('Drop on an available edge to add a traverser', 'warning');
      return;
    }
    if (traverserByEdgeId.has(closestAny.edgeId)) {
      showToast('That edge already has a traverser', 'warning');
      return;
    }
    if (!eligibleTraverserEdgeIds.has(closestAny.edgeId)) {
      showToast('That node is blocked or already complete', 'warning');
      return;
    }

    const traverser = createTraverserForEdge(closestAny.edgeId, userId, closestAny.position);
    onTraverserCreate(traverser);
    closeEdgeStartPicker();
    setDraggingUserId(null);

    if (closestAny.position >= SELECTION_THRESHOLD) {
      const edge = edgeById.get(closestAny.edgeId);
      if (edge) {
        beginPendingBurn(edge.target, traverser, traverser.userId);
        setPreviewBurn({ edgeId: closestAny.edgeId, targetNodeId: edge.target });
        suppressNextBackgroundClick();
      }
    }
  }, [
    onTraverserCreate,
    getGraphCoords,
    findClosestEdge,
    traverserByEdgeId,
    createTraverserForEdge,
    createTraverserForRoot,
    beginPendingBurn,
    getRootPositionFromCoords,
    edgeById,
    showToast,
    SELECTION_THRESHOLD,
    eligibleTraverserEdgeIds,
    findClosestRootNode,
    suppressNextBackgroundClick,
    closeEdgeStartPicker,
    tuning.ghostEdgeSearchRadius,
    nodeByIdRef,
  ]);

  const handleTraverserPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (viewMode !== '2D') return;
    const coords = getGraphCoords(event.clientX, event.clientY);
    if (!coords) return;
    const hit = findTraverserHit(coords);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    closeEdgeStartPicker();
    if (pendingBurn) {
      cancelPendingBurn();
    }
    if (previewBurn) {
      setPreviewBurn(null);
    }
    if (detachedDrag) {
      setDetachedDrag(null);
    }
    setDraggingTraverserId(hit.traverserId);
    draggingTraverserRef.current = hit.traverserId;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    dragAngleRef.current = null;
  }, [
    viewMode,
    getGraphCoords,
    findTraverserHit,
    pendingBurn,
    cancelPendingBurn,
    previewBurn,
    detachedDrag,
    closeEdgeStartPicker,
  ]);

  const handleTraverserOverlayPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>, traverserId: string) => {
    if (viewMode !== '2D') return;
    event.preventDefault();
    event.stopPropagation();
    closeEdgeStartPicker();
    if (pendingBurn) {
      cancelPendingBurn();
    }
    if (previewBurn) {
      setPreviewBurn(null);
    }
    if (detachedDrag) {
      setDetachedDrag(null);
    }
    setDraggingTraverserId(traverserId);
    draggingTraverserRef.current = traverserId;
    lastPointerRef.current = { x: event.clientX, y: event.clientY };
    dragAngleRef.current = null;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }, [
    viewMode,
    pendingBurn,
    cancelPendingBurn,
    previewBurn,
    detachedDrag,
    closeEdgeStartPicker,
  ]);

  useEffect(() => {
    if (!draggingTraverserId) return;

    const handlePointerMove = (event: PointerEvent) => {
      const activeId = draggingTraverserRef.current;
      if (!activeId) return;
      const traverser = traverserById.get(activeId);
      if (!traverser) return;
      const coords = getGraphCoords(event.clientX, event.clientY);
      if (!coords) return;
      const prevPointer = lastPointerRef.current;
      const pointerScreen = { x: event.clientX, y: event.clientY };
      lastPointerRef.current = pointerScreen;
      const isRootTraverser = traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX);

      if (isRootTraverser) {
        const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
        const node = nodeByIdRef.current?.get(nodeId);
        if (!node || node.x === undefined || node.y === undefined) return;
        const dx = coords.x - node.x;
        const dy = coords.y - node.y;
        const dist = Math.hypot(dx, dy);
        const detachDelta = Math.abs(dist - rootRingRadius);

        if ((detachedDrag && detachedDrag.traverserId === traverser.id) || detachDelta > DETACH_DISTANCE) {
          if (pendingBurn) {
            setPendingBurn(null);
          }
          if (previewBurn) {
            setPreviewBurn(null);
          }
          const allowedEdgeIds = new Set(eligibleTraverserEdgeIds);
          const candidate = findClosestEdge(coords, allowedEdgeIds, tuning.dragEdgeSearchRadius);
          const rootCandidate = findClosestRootNode(coords);
          let rootCandidateId: string | null = null;
          let rootCandidatePosition: number | null = null;
          if (rootCandidate) {
            const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
            const existingRoot = traverserByEdgeId.get(rootEdgeId);
            if (!existingRoot || existingRoot.id === traverser.id) {
              const rootNode = nodeByIdRef.current?.get(rootCandidate.nodeId);
              if (rootNode) {
                rootCandidateId = rootCandidate.nodeId;
                rootCandidatePosition = getRootPositionFromCoords(rootNode, coords);
              }
            }
          }
          if (rootCandidateId && (!candidate || (rootCandidate.distance <= candidate.distance))) {
            const rootNode = nodeByIdRef.current?.get(rootCandidateId);
            if (rootNode) {
              const render = getRootTraverserPoint(rootNode, rootCandidatePosition ?? 0);
              setDetachedDrag({
                traverserId: traverser.id,
                x: render.x,
                y: render.y,
                candidateEdgeId: null,
                candidatePosition: null,
                candidateRootNodeId: rootCandidateId,
                candidateRootPosition: rootCandidatePosition ?? 0,
              });
            } else {
              setDetachedDrag({
                traverserId: traverser.id,
                x: coords.x,
                y: coords.y,
                candidateEdgeId: null,
                candidatePosition: null,
                candidateRootNodeId: null,
                candidateRootPosition: null,
              });
            }
          } else if (candidate) {
            const candidateNodes = getEdgeNodes(candidate.edgeId);
            if (candidateNodes) {
              const render = getTraverserRenderPoint(candidateNodes.sourceNode, candidateNodes.targetNode, candidate.position);
              setDetachedDrag({
                traverserId: traverser.id,
                x: render.x,
                y: render.y,
                candidateEdgeId: candidate.edgeId,
                candidatePosition: candidate.position,
                candidateRootNodeId: null,
                candidateRootPosition: null,
              });
            } else {
              setDetachedDrag({
                traverserId: traverser.id,
                x: coords.x,
                y: coords.y,
                candidateEdgeId: null,
                candidatePosition: null,
                candidateRootNodeId: null,
                candidateRootPosition: null,
              });
            }
          } else {
            setDetachedDrag({
              traverserId: traverser.id,
              x: coords.x,
              y: coords.y,
              candidateEdgeId: null,
              candidatePosition: null,
              candidateRootNodeId: null,
              candidateRootPosition: null,
            });
          }
          return;
        }

        if (detachedDrag && detachedDrag.traverserId === traverser.id) {
          setDetachedDrag(null);
        }

        let position = getRootPositionFromCoords(node, coords);
        const currentPosition = traverser.position ?? 0;
        if (Math.abs(position - currentPosition) > 0.5) {
          position = currentPosition;
        }
        updateTraverserPosition(traverser, position);
        lastDragStateRef.current = { t: position, targetNodeId: node.id };

        if (position >= SELECTION_THRESHOLD) {
          setPreviewBurn(prev => {
            if (prev && prev.edgeId === traverser.edgeId && prev.targetNodeId === node.id) {
              return prev;
            }
            return { edgeId: traverser.edgeId, targetNodeId: node.id };
          });
        } else if (previewBurn?.edgeId === traverser.edgeId) {
          setPreviewBurn(null);
        }
        if (pendingBurn?.traverserId === traverser.id && position < SELECTION_THRESHOLD) {
          setPendingBurn(null);
        }
        return;
      }
      const edgeNodes = getEdgeNodes(traverser.edgeId);
      if (!edgeNodes) return;
      const { sourceNode, targetNode } = edgeNodes;
      const projection = projectPointToSegment(
        coords.x,
        coords.y,
        sourceNode.x!,
        sourceNode.y!,
        targetNode.x!,
        targetNode.y!
      );
      const lineDistance = distanceToLine(
        coords.x,
        coords.y,
        sourceNode.x!,
        sourceNode.y!,
        targetNode.x!,
        targetNode.y!
      );
      const sourceScreen = getScreenCoords(sourceNode.x!, sourceNode.y!);
      const targetScreen = getScreenCoords(targetNode.x!, targetNode.y!);
      if (prevPointer && sourceScreen && targetScreen) {
        const edgeDx = targetScreen.x - sourceScreen.x;
        const edgeDy = targetScreen.y - sourceScreen.y;
        const edgeLength = Math.hypot(edgeDx, edgeDy);
        const deltaX = pointerScreen.x - prevPointer.x;
        const deltaY = pointerScreen.y - prevPointer.y;
        const moveDistance = Math.hypot(deltaX, deltaY);
        if (moveDistance > 1e-3 && edgeLength > 1e-3) {
          const dot = (deltaX * edgeDx + deltaY * edgeDy) / (moveDistance * edgeLength);
          const clamped = Math.max(-1, Math.min(1, dot));
          const angle = Math.acos(Math.abs(clamped)) * (180 / Math.PI);
          dragAngleRef.current = angle;
        }
      } else if (prevPointer) {
        const edgeDx = targetNode.x! - sourceNode.x!;
        const edgeDy = targetNode.y! - sourceNode.y!;
        const edgeLength = Math.hypot(edgeDx, edgeDy);
        const prevGraph = getGraphCoords(prevPointer.x, prevPointer.y);
        const deltaX = coords.x - (prevGraph?.x ?? coords.x);
        const deltaY = coords.y - (prevGraph?.y ?? coords.y);
        const moveDistance = Math.hypot(deltaX, deltaY);
        if (moveDistance > 1e-3 && edgeLength > 1e-3) {
          const dot = (deltaX * edgeDx + deltaY * edgeDy) / (moveDistance * edgeLength);
          const clamped = Math.max(-1, Math.min(1, dot));
          const angle = Math.acos(Math.abs(clamped)) * (180 / Math.PI);
          dragAngleRef.current = angle;
        }
      }
      const dragAngle = dragAngleRef.current ?? 0;
      const orthogonalEnough = dragAngle >= ORTHOGONAL_DETACH_ANGLE;
      const zoom = getZoomScale();
      const lineDistanceScreen = sourceScreen && targetScreen
        ? distanceToLine(pointerScreen.x, pointerScreen.y, sourceScreen.x, sourceScreen.y, targetScreen.x, targetScreen.y)
        : lineDistance * zoom;
      const baseDetachThreshold = DETACH_DISTANCE * DETACH_DISTANCE_BOOST * zoom;
      const detachThreshold = Math.max(baseDetachThreshold, MIN_PERP_DETACH_PX);

      const allowedEdgeIds = new Set(eligibleTraverserEdgeIds);
      allowedEdgeIds.add(traverser.edgeId);

      if ((detachedDrag && detachedDrag.traverserId === traverser.id) || (orthogonalEnough && lineDistanceScreen > detachThreshold)) {
        if (pendingBurn) {
          setPendingBurn(null);
        }
        if (previewBurn) {
          setPreviewBurn(null);
        }
        const candidate = findClosestEdge(coords, allowedEdgeIds, tuning.dragEdgeSearchRadius);
        const rootCandidate = findClosestRootNode(coords);
        let rootCandidateId: string | null = null;
        let rootCandidatePosition: number | null = null;
        if (rootCandidate) {
          const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
          const existingRoot = traverserByEdgeId.get(rootEdgeId);
          if (!existingRoot || existingRoot.id === traverser.id) {
            const rootNode = nodeByIdRef.current?.get(rootCandidate.nodeId);
            if (rootNode) {
              rootCandidateId = rootCandidate.nodeId;
              rootCandidatePosition = getRootPositionFromCoords(rootNode, coords);
            }
          }
        }

        const preferRoot = rootCandidateId && (!candidate || (rootCandidate.distance <= candidate.distance));
        const selectedCandidate = preferRoot ? null : candidate;
        const selectedRootId = preferRoot ? rootCandidateId : null;
        const selectedRootPosition = preferRoot ? rootCandidatePosition : null;

        let targetX = coords.x;
        let targetY = coords.y;
        if (selectedRootId) {
          const rootNode = nodeByIdRef.current?.get(selectedRootId);
          if (rootNode) {
            const render = getRootTraverserPoint(rootNode, selectedRootPosition ?? 0);
            targetX = render.x;
            targetY = render.y;
          }
        } else if (selectedCandidate) {
          const candidateNodes = getEdgeNodes(selectedCandidate.edgeId);
          if (candidateNodes) {
            const render = getTraverserRenderPoint(
              candidateNodes.sourceNode,
              candidateNodes.targetNode,
              selectedCandidate.position
            );
            targetX = render.x;
            targetY = render.y;
          }
        }

        const fallbackRender = getTraverserRenderPoint(
          sourceNode,
          targetNode,
          clamp(traverser.position ?? projection.t, 0, 1)
        );

        setDetachedDrag(prev => {
          const hasMagnetTarget = Boolean(selectedRootId || selectedCandidate);
          const strength = hasMagnetTarget ? tuning.magnetStrength.detachTarget : tuning.magnetStrength.detachFree;
          const startX = prev?.traverserId === traverser.id ? prev.x : (fallbackRender?.x ?? targetX);
          const startY = prev?.traverserId === traverser.id ? prev.y : (fallbackRender?.y ?? targetY);
          const nextX = startX + (targetX - startX) * strength;
          const nextY = startY + (targetY - startY) * strength;
          return {
            traverserId: traverser.id,
            x: nextX,
            y: nextY,
            candidateEdgeId: selectedCandidate?.edgeId ?? null,
            candidatePosition: selectedCandidate?.position ?? null,
            candidateRootNodeId: selectedRootId ?? null,
            candidateRootPosition: selectedRootPosition ?? null,
          };
        });
        return;
      }

      if (detachedDrag && detachedDrag.traverserId === traverser.id) {
        setDetachedDrag(null);
      }

      updateTraverserPosition(traverser, projection.t);
      lastDragStateRef.current = { t: projection.t, targetNodeId: targetNode.id };
      if (projection.t >= SELECTION_THRESHOLD) {
        setPreviewBurn(prev => {
          if (prev && prev.edgeId === traverser.edgeId && prev.targetNodeId === targetNode.id) {
            return prev;
          }
          return { edgeId: traverser.edgeId, targetNodeId: targetNode.id };
        });
      } else if (previewBurn?.edgeId === traverser.edgeId) {
        setPreviewBurn(null);
      }
      if (pendingBurn?.traverserId === traverser.id && projection.t < SELECTION_THRESHOLD) {
        setPendingBurn(null);
      }
    };

    const handlePointerUp = () => {
      const activeId = draggingTraverserRef.current;
      if (activeId) {
        const traverser = traverserById.get(activeId);
        const lastDrag = lastDragStateRef.current;
        if (traverser && detachedDrag && detachedDrag.traverserId === activeId) {
          if (detachedDrag.candidateRootNodeId) {
            const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${detachedDrag.candidateRootNodeId}`;
            const existing = traverserByEdgeId.get(rootEdgeId);
            if (existing && existing.id !== traverser.id) {
              showToast('Root already has active progress', 'warning');
            } else if (onTraverserUpdate) {
              onTraverserUpdate(traverser.id, {
                edgeId: rootEdgeId,
                position: clamp(detachedDrag.candidateRootPosition ?? 0, 0, 1),
                updatedAt: new Date().toISOString(),
              });
            }
          } else if (detachedDrag.candidateEdgeId) {
            const existing = traverserByEdgeId.get(detachedDrag.candidateEdgeId);
            if (existing && existing.id !== traverser.id) {
              showToast('That edge already has a traverser', 'warning');
            } else if (onTraverserUpdate) {
              onTraverserUpdate(traverser.id, {
                edgeId: detachedDrag.candidateEdgeId,
                position: clamp(detachedDrag.candidatePosition ?? 0, 0, 1),
                updatedAt: new Date().toISOString(),
              });
            }
          } else if (onTraverserDelete) {
            onTraverserDelete(traverser.id);
            showToast('Traverser removed', 'info');
          }
          setDetachedDrag(null);
          setPreviewBurn(null);
        } else if (traverser && lastDrag && lastDrag.t >= SELECTION_THRESHOLD) {
          beginPendingBurn(lastDrag.targetNodeId, traverser, traverser.userId);
          setPreviewBurn({ edgeId: traverser.edgeId, targetNodeId: lastDrag.targetNodeId });
          suppressNextBackgroundClick();
        } else {
          setPreviewBurn(null);
        }
      }
      setDraggingTraverserId(null);
      draggingTraverserRef.current = null;
      lastDragStateRef.current = null;
      lastPointerRef.current = null;
      dragAngleRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [
    draggingTraverserId,
    traverserById,
    getGraphCoords,
    getScreenCoords,
    getZoomScale,
    getEdgeNodes,
    updateTraverserPosition,
    beginPendingBurn,
    previewBurn?.edgeId,
    previewBurn?.targetNodeId,
    suppressNextBackgroundClick,
    pendingBurn?.traverserId,
    SELECTION_THRESHOLD,
    DETACH_DISTANCE,
    DETACH_DISTANCE_BOOST,
    ORTHOGONAL_DETACH_ANGLE,
    MIN_PERP_DETACH_PX,
    rootRingRadius,
    detachedDrag,
    findClosestEdge,
    findClosestRootNode,
    eligibleTraverserEdgeIds,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getRootPositionFromCoords,
    onTraverserUpdate,
    onTraverserDelete,
    traverserByEdgeId,
    showToast,
    nodeByIdRef,
    tuning.dragEdgeSearchRadius,
    tuning.magnetStrength.detachTarget,
    tuning.magnetStrength.detachFree,
  ]);

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
        } else {
          const edgeNodes = getEdgeNodes(traverser.edgeId);
          if (!edgeNodes) return null;
          const { sourceNode, targetNode } = edgeNodes;
          const pos = clamp(traverser.position, 0, 1);
          const render = getTraverserRenderPoint(sourceNode, targetNode, pos);
          renderPoint = { x: render.x, y: render.y };
        }

        const override =
          detachedDrag && detachedDrag.traverserId === traverser.id
            ? { x: detachedDrag.x, y: detachedDrag.y }
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
  }, [
    data.traversers,
    viewMode,
    renderTick,
    getEdgeNodes,
    userById,
    getScreenCoords,
    getTraverserRenderPoint,
    getRootTraverserPoint,
    detachedDrag,
    nodeByIdRef,
  ]);

  return {
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
  };
}
