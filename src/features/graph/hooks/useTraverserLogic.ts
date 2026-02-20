'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { DagbanGraph as GraphData, Card, Traverser, User, Edge } from '@/lib/types';
import type { GraphNodeData, GraphLinkData, ViewMode, DisplayMode, TraverserCoordinateProvider } from '../types';
import { defaultTraverserTuning, type TraverserTuning } from '../traverserTuning';
import { ROOT_TRAVERSER_PREFIX, BURN_FUSE_DURATION_MS } from '../traverserConstants';
import type { BurnFuseAnimation } from '../traverserConstants';

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
  z?: number;
  candidateRootNodeId?: string | null;
  candidateRootPosition?: number | null;
} | null;

export type UseTraverserLogicProps = {
  data: GraphData;
  viewMode: ViewMode;
  displayMode: DisplayMode;
  nodeRadius: number;
  rootRingRadius: number;
  traverserHitRadius: number;
  coords: TraverserCoordinateProvider;
  cardById: Map<string, Card>;
  edgeById: Map<string, Edge>;
  traverserByEdgeId: Map<string, Traverser>;
  traverserById: Map<string, Traverser>;
  userById: Map<string, User>;
  rootActiveNodeIds: Set<string>;
  nodeByIdRef: React.RefObject<Map<string, GraphNodeData>>;
  graphDataView: { nodes: GraphNodeData[]; links: GraphLinkData[] };
  createTraverserForRoot: (nodeId: string, userId: string, position: number) => Traverser;
  onTraverserCreate?: (traverser: Traverser) => void;
  onTraverserUpdate?: (
    traverserId: string,
    updates: Partial<Traverser>,
    options?: { transient?: boolean; recordUndo?: boolean }
  ) => void;
  onTraverserDelete?: (traverserId: string) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onBurnFuseStart?: (animation: BurnFuseAnimation) => void;
  suppressNextBackgroundClick: () => void;
  tuning?: Partial<TraverserTuning>;
};

// --- Pure helpers ---

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function projectPointToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
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

export function distanceToLine(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
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

export function resolveTuning(overrides?: Partial<TraverserTuning>): TraverserTuning {
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

// --- Main hook ---

export function useTraverserLogic({
  data,
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
  nodeByIdRef,
  graphDataView,
  createTraverserForRoot,
  onTraverserCreate,
  onTraverserUpdate,
  onTraverserDelete,
  onCardChange,
  onBurnFuseStart,
  suppressNextBackgroundClick,
  tuning: tuningOverrides,
}: UseTraverserLogicProps) {
  const tuning = useMemo(() => resolveTuning(tuningOverrides), [tuningOverrides]);

  // --- State ---
  const [pendingBurn, setPendingBurn] = useState<PendingBurnState>(null);
  const [previewBurn, setPreviewBurn] = useState<PreviewBurnState>(null);
  const [draggingUserId, setDraggingUserId] = useState<string | null>(null);
  const [draggingTraverserId, setDraggingTraverserId] = useState<string | null>(null);
  const [draggingUserGhost, setDraggingUserGhost] = useState<{ x: number; y: number } | null>(null);
  const [detachedDrag, setDetachedDrag] = useState<DetachedDragState>(null);

  // --- Refs ---
  const draggingTraverserRef = useRef<string | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const dragAngleRef = useRef<number | null>(null);
  const lastDragStateRef = useRef<{ t: number; targetNodeId: string } | null>(null);

  // --- Computed constants ---
  const DETACH_DISTANCE = nodeRadius * tuning.detachDistanceMultiplier;
  const ORTHOGONAL_DETACH_ANGLE = tuning.detachAngleDeg;
  const DETACH_DISTANCE_BOOST = tuning.detachDistanceBoost;
  const MIN_PERP_DETACH_PX = tuning.minPerpDetachPx;
  const SELECTION_THRESHOLD = 0.97;

  // --- Core logic callbacks ---

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

    // Guard: remove ALL traversers on incoming edges to the burned node
    if (onTraverserDelete) {
      data.edges.forEach(edge => {
        if (edge.target !== pendingBurn.targetNodeId) return;
        const traverser = traverserByEdgeId.get(edge.id);
        if (traverser && traverser.id !== pendingBurn.traverserId) {
          onTraverserDelete(traverser.id);
        }
      });
      // Also remove any root traverser orbiting the burned node
      const rootEdgeId = ROOT_TRAVERSER_PREFIX + pendingBurn.targetNodeId;
      const rootTraverser = traverserByEdgeId.get(rootEdgeId);
      if (rootTraverser && rootTraverser.id !== pendingBurn.traverserId) {
        onTraverserDelete(rootTraverser.id);
      }
    }

    // Fire burn fuse animation on incoming edges (source → burntNode)
    const incomingEdges = data.edges
      .filter(edge => edge.target === pendingBurn.targetNodeId)
      .map(edge => ({ id: edge.id, source: edge.source }));
    if (incomingEdges.length > 0 && onBurnFuseStart) {
      onBurnFuseStart({
        id: `burn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        burntNodeId: pendingBurn.targetNodeId,
        edges: incomingEdges,
        startTime: performance.now(),
        duration: BURN_FUSE_DURATION_MS,
      });
    }

    // Auto-spawn root traversers on downstream active nodes (outgoing edges)
    if (onTraverserCreate) {
      data.edges.forEach(edge => {
        if (edge.source !== pendingBurn.targetNodeId) return;
        const downstreamCard = cardById.get(edge.target);
        if (!downstreamCard?.assignee) return;
        if (!rootActiveNodeIds.has(edge.target)) return;
        const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${edge.target}`;
        if (traverserByEdgeId.has(rootEdgeId)) return;
        const traverser = createTraverserForRoot(edge.target, downstreamCard.assignee, 0);
        onTraverserCreate(traverser);
      });
    }

    setPendingBurn(null);
    setPreviewBurn(null);
  }, [
    pendingBurn,
    cardById,
    onCardChange,
    onTraverserDelete,
    onTraverserCreate,
    onBurnFuseStart,
    data.edges,
    traverserByEdgeId,
    rootActiveNodeIds,
    createTraverserForRoot,
  ]);

  const updateTraverserPosition = useCallback((traverser: Traverser, nextPosition: number) => {
    if (!onTraverserUpdate) return;
    onTraverserUpdate(traverser.id, {
      position: clamp(nextPosition, 0, 1),
      updatedAt: new Date().toISOString(),
    }, { transient: true });
  }, [onTraverserUpdate]);

  // --- Finding functions ---

  const findClosestRootNode = useCallback((point: { x: number; y: number; z?: number }) => {
    if (rootActiveNodeIds.size === 0) return null;
    const rootSnapMultiplier = displayMode === 'balls' ? tuning.rootSnapMultiplier.balls : tuning.rootSnapMultiplier.labels;
    const captureMargin = nodeRadius * rootSnapMultiplier;
    let closest: { nodeId: string; distance: number } | null = null;

    for (const node of graphDataView.nodes as GraphNodeData[]) {
      if (!rootActiveNodeIds.has(node.id)) continue;
      if (node.x === undefined || node.y === undefined) continue;
      // Use screen-space ring distance when available (3D), else world-space
      const ringDistance = coords.getRootRingDetachDelta?.(node, point)
        ?? Math.abs(Math.hypot(point.x - node.x, point.y - node.y) - rootRingRadius);
      if (ringDistance > captureMargin) continue;
      if (!closest || ringDistance < closest.distance) {
        closest = { nodeId: node.id, distance: ringDistance };
      }
    }

    return closest;
  }, [
    graphDataView.nodes,
    rootActiveNodeIds,
    nodeRadius,
    displayMode,
    rootRingRadius,
    coords,
    tuning.rootSnapMultiplier.balls,
    tuning.rootSnapMultiplier.labels,
  ]);

  const findTraverserHit = useCallback((point: { x: number; y: number }) => {
    const zoom = coords.getZoomScale();
    const hitDistance = traverserHitRadius / zoom;
    for (const traverser of data.traversers || []) {
      // Only root traversers exist now; silently skip legacy edge traversers
      if (!traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) continue;
      const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
      const node = nodeByIdRef.current?.get(nodeId);
      if (!node || node.x === undefined || node.y === undefined) continue;
      const render = coords.getRootTraverserPoint(node, traverser.position);
      const dist = Math.hypot(point.x - render.x, point.y - render.y);
      if (dist <= hitDistance) {
        return { traverserId: traverser.id };
      }
    }
    return null;
  }, [
    data.traversers,
    coords,
    traverserHitRadius,
    nodeByIdRef,
  ]);

  // --- User drag state ---

  const handleUserDragStart = useCallback((userId: string) => {
    setDraggingUserId(userId);
    setPendingBurn(null);
    setPreviewBurn(null);
  }, []);

  const handleUserDragEnd = useCallback(() => {
    setDraggingUserId(null);
    setDraggingUserGhost(null);
  }, []);

  // --- Core drag logic (called by view-specific wrappers) ---

  const handleTraverserDragMove = useCallback((
    graphCoords: { x: number; y: number; z?: number },
    _screenCoords: { x: number; y: number },
    _prevScreenCoords: { x: number; y: number } | null,
  ) => {
    const activeId = draggingTraverserRef.current;
    if (!activeId) return;
    const traverser = traverserById.get(activeId);
    if (!traverser) return;

    // Only root traversers are supported now; silently ignore legacy edge traversers
    if (!traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) return;

    const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
    const node = nodeByIdRef.current?.get(nodeId);
    if (!node || node.x === undefined || node.y === undefined) return;

    // Use screen-space detach delta in 3D (avoids perspective distortion of world-space ring)
    const detachDelta = coords.getRootRingDetachDelta?.(node, graphCoords)
      ?? Math.abs(Math.hypot(graphCoords.x - node.x, graphCoords.y - node.y) - rootRingRadius);

    if ((detachedDrag && detachedDrag.traverserId === traverser.id) || detachDelta > DETACH_DISTANCE) {
      if (pendingBurn) {
        setPendingBurn(null);
      }
      if (previewBurn) {
        setPreviewBurn(null);
      }
      // Only snap to other node rings, never edges
      const rootCandidate = findClosestRootNode(graphCoords);
      let rootCandidateId: string | null = null;
      let rootCandidatePosition: number | null = null;
      if (rootCandidate) {
        const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
        const existingRoot = traverserByEdgeId.get(rootEdgeId);
        if (!existingRoot || existingRoot.id === traverser.id) {
          const rootNode = nodeByIdRef.current?.get(rootCandidate.nodeId);
          if (rootNode) {
            rootCandidateId = rootCandidate.nodeId;
            rootCandidatePosition = coords.getRootPositionFromCoords(rootNode, graphCoords);
          }
        }
      }

      let targetX = graphCoords.x;
      let targetY = graphCoords.y;
      let targetZ = graphCoords.z;
      if (rootCandidateId) {
        const rootNode = nodeByIdRef.current?.get(rootCandidateId);
        if (rootNode) {
          const render = coords.getRootTraverserPoint(rootNode, rootCandidatePosition ?? 0);
          targetX = render.x;
          targetY = render.y;
          targetZ = render.z;
        }
      }

      const currentRender = coords.getRootTraverserPoint(node, clamp(traverser.position ?? 0, 0, 1));
      setDetachedDrag(prev => {
        const hasMagnetTarget = Boolean(rootCandidateId);
        const strength = hasMagnetTarget ? tuning.magnetStrength.detachTarget : tuning.magnetStrength.detachFree;
        const startX = prev?.traverserId === traverser.id ? prev.x : currentRender.x;
        const startY = prev?.traverserId === traverser.id ? prev.y : currentRender.y;
        const startZ = prev?.traverserId === traverser.id ? (prev.z ?? 0) : (currentRender.z ?? 0);
        return {
          traverserId: traverser.id,
          x: startX + (targetX - startX) * strength,
          y: startY + (targetY - startY) * strength,
          z: startZ + ((targetZ ?? 0) - startZ) * strength,
          candidateRootNodeId: rootCandidateId ?? null,
          candidateRootPosition: rootCandidatePosition ?? null,
        };
      });
      return;
    }

    if (detachedDrag && detachedDrag.traverserId === traverser.id) {
      setDetachedDrag(null);
    }

    let position = coords.getRootPositionFromCoords(node, graphCoords);
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
  }, [
    traverserById,
    coords,
    updateTraverserPosition,
    previewBurn?.edgeId,
    previewBurn?.targetNodeId,
    pendingBurn?.traverserId,
    SELECTION_THRESHOLD,
    DETACH_DISTANCE,
    rootRingRadius,
    detachedDrag,
    findClosestRootNode,
    traverserByEdgeId,
    nodeByIdRef,
    tuning.magnetStrength.detachTarget,
    tuning.magnetStrength.detachFree,
    pendingBurn,
    previewBurn,
  ]);

  const handleTraverserDragEnd = useCallback(() => {
    const activeId = draggingTraverserRef.current;
    if (activeId) {
      const traverser = traverserById.get(activeId);
      const lastDrag = lastDragStateRef.current;
      if (traverser && detachedDrag && detachedDrag.traverserId === activeId) {
        if (detachedDrag.candidateRootNodeId) {
          const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${detachedDrag.candidateRootNodeId}`;
          const existing = traverserByEdgeId.get(rootEdgeId);
          if (existing && existing.id !== traverser.id) {
            // Root already has active progress — silently reject
          } else if (onTraverserUpdate) {
            onTraverserUpdate(traverser.id, {
              edgeId: rootEdgeId,
              position: clamp(detachedDrag.candidateRootPosition ?? 0, 0, 1),
              updatedAt: new Date().toISOString(),
            });
          }
        } else if (onTraverserDelete) {
          onTraverserDelete(traverser.id);
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
  }, [
    traverserById,
    detachedDrag,
    traverserByEdgeId,
    onTraverserUpdate,
    onTraverserDelete,
    beginPendingBurn,
    suppressNextBackgroundClick,
    SELECTION_THRESHOLD,
  ]);

  const handleUserDragUpdate = useCallback((clientX: number, clientY: number, containerRect: DOMRect) => {
    const baseX = clientX - containerRect.left;
    const baseY = clientY - containerRect.top;
    const graphCoords = coords.getGraphCoords(clientX, clientY);
    if (!graphCoords) {
      setDraggingUserGhost({ x: baseX, y: baseY });
      return;
    }

    const rootCandidate = findClosestRootNode(graphCoords);
    let rootCandidateId: string | null = null;
    let rootCandidatePosition: number | null = null;
    if (rootCandidate) {
      const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
      if (!traverserByEdgeId.has(rootEdgeId)) {
        const rootNode = nodeByIdRef.current?.get(rootCandidate.nodeId);
        if (rootNode) {
          rootCandidateId = rootCandidate.nodeId;
          rootCandidatePosition = coords.getRootPositionFromCoords(rootNode, graphCoords);
        }
      }
    }

    let targetX = baseX;
    let targetY = baseY;
    if (rootCandidateId) {
      const rootNode = nodeByIdRef.current?.get(rootCandidateId);
      if (rootNode) {
        const render = coords.getRootTraverserPoint(rootNode, rootCandidatePosition ?? 0);
        const screen = coords.getScreenCoords(render.x, render.y, render.z);
        if (screen) {
          targetX = screen.x;
          targetY = screen.y;
        }
      }
    }

    setDraggingUserGhost(prev => {
      const hasMagnetTarget = Boolean(rootCandidateId);
      const strength = hasMagnetTarget ? tuning.magnetStrength.ghostTarget : tuning.magnetStrength.ghostFree;
      const startX = prev ? prev.x : baseX;
      const startY = prev ? prev.y : baseY;
      return {
        x: startX + (targetX - startX) * strength,
        y: startY + (targetY - startY) * strength,
      };
    });
  }, [
    coords,
    findClosestRootNode,
    traverserByEdgeId,
    tuning.magnetStrength.ghostTarget,
    tuning.magnetStrength.ghostFree,
    nodeByIdRef,
  ]);

  const handleUserDropAtCoords = useCallback((userId: string, graphCoords: { x: number; y: number }) => {
    setDraggingUserGhost(null);

    const rootCandidate = findClosestRootNode(graphCoords);
    if (rootCandidate) {
      if (!onTraverserCreate) return;
      const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
      if (traverserByEdgeId.has(rootEdgeId)) {
        setDraggingUserId(null);
        return;
      }
      const node = nodeByIdRef.current?.get(rootCandidate.nodeId);
      const position = node ? coords.getRootPositionFromCoords(node, graphCoords) : 0;
      const traverser = createTraverserForRoot(rootCandidate.nodeId, userId, position);
      onTraverserCreate(traverser);
      setDraggingUserId(null);
      return;
    }

    // No root node found — drop is a no-op
    setDraggingUserId(null);
  }, [
    onTraverserCreate,
    coords,
    traverserByEdgeId,
    createTraverserForRoot,
    findClosestRootNode,
    nodeByIdRef,
  ]);

  // --- Traverser drag initiation ---

  const initiateTraverserDrag = useCallback((traverserId: string, clientX: number, clientY: number) => {
    if (pendingBurn) {
      setPendingBurn(null);
      setPreviewBurn(null);
    }
    if (previewBurn) {
      setPreviewBurn(null);
    }
    if (detachedDrag) {
      setDetachedDrag(null);
    }
    setDraggingTraverserId(traverserId);
    draggingTraverserRef.current = traverserId;
    lastPointerRef.current = { x: clientX, y: clientY };
    dragAngleRef.current = null;
  }, [
    pendingBurn,
    previewBurn,
    detachedDrag,
  ]);

  return {
    // State
    pendingBurn,
    previewBurn,
    setPreviewBurn,
    draggingUserId,
    setDraggingUserId,
    draggingTraverserId,
    draggingUserGhost,
    setDraggingUserGhost,
    detachedDrag,

    // Refs
    draggingTraverserRef,
    lastPointerRef,
    dragAngleRef,
    lastDragStateRef,

    // Core callbacks
    beginPendingBurn,
    cancelPendingBurn,
    clearDetachedDrag,
    confirmPendingBurn,
    updateTraverserPosition,

    // Finding functions
    findClosestRootNode,
    findTraverserHit,

    // User drag
    handleUserDragStart,
    handleUserDragEnd,
    handleUserDragUpdate,
    handleUserDropAtCoords,

    // Traverser drag
    initiateTraverserDrag,
    handleTraverserDragMove,
    handleTraverserDragEnd,

    // Tuning
    tuning,
    SELECTION_THRESHOLD,
  };
}
