'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type { DagbanGraph as GraphData, Card, Traverser, User, Edge } from '@/lib/types';
import type { GraphNodeData, GraphLinkData, ViewMode, DisplayMode, TraverserCoordinateProvider } from '../types';
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
  eligibleTraverserEdgeIds: Set<string>;
  nodeByIdRef: React.RefObject<Map<string, GraphNodeData>>;
  graphDataView: { nodes: GraphNodeData[]; links: GraphLinkData[] };
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
  showToast: (message: string, type?: 'info' | 'success' | 'warning', action?: { label: string; onClick: () => void }) => void;
  closeEdgeStartPicker: () => void;
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
    }, { transient: true });
  }, [onTraverserUpdate]);

  // --- Finding functions ---

  const findClosestEdge = useCallback((point: { x: number; y: number }, allowedEdgeIds?: Set<string>, maxDistanceOverride?: number) => {
    const zoom = coords.getZoomScale();
    const maxDistance = (maxDistanceOverride ?? tuning.dragEdgeSearchRadius) / zoom;
    let closest: { edgeId: string; position: number; distance: number } | null = null;

    for (const edge of data.edges) {
      if (allowedEdgeIds && !allowedEdgeIds.has(edge.id)) continue;
      const edgeNodes = coords.getEdgeNodes(edge.id);
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
  }, [data.edges, coords, tuning.dragEdgeSearchRadius]);

  const findClosestRootNode = useCallback((point: { x: number; y: number }) => {
    if (rootActiveNodeIds.size === 0) return null;
    const rootSnapMultiplier = displayMode === 'balls' ? tuning.rootSnapMultiplier.balls : tuning.rootSnapMultiplier.labels;
    const captureMargin = nodeRadius * rootSnapMultiplier;
    const captureRadius = rootRingRadius + captureMargin;
    let closest: { nodeId: string; distance: number } | null = null;

    for (const node of graphDataView.nodes as GraphNodeData[]) {
      if (!rootActiveNodeIds.has(node.id)) continue;
      if (node.x === undefined || node.y === undefined) continue;
      const dist = Math.hypot(point.x - node.x, point.y - node.y);
      if (dist > captureRadius) continue;
      const ringDistance = Math.abs(dist - rootRingRadius);
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
    tuning.rootSnapMultiplier.balls,
    tuning.rootSnapMultiplier.labels,
  ]);

  const findTraverserHit = useCallback((point: { x: number; y: number }) => {
    const zoom = coords.getZoomScale();
    const hitDistance = traverserHitRadius / zoom;
    for (const traverser of data.traversers || []) {
      let tx = 0;
      let ty = 0;
      if (traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) {
        const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
        const node = nodeByIdRef.current?.get(nodeId);
        if (!node || node.x === undefined || node.y === undefined) continue;
        const render = coords.getRootTraverserPoint(node, traverser.position);
        tx = render.x;
        ty = render.y;
      } else {
        const edgeNodes = coords.getEdgeNodes(traverser.edgeId);
        if (!edgeNodes) continue;
        const { sourceNode, targetNode } = edgeNodes;
        const render = coords.getTraverserRenderPoint(sourceNode, targetNode, traverser.position);
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
    coords,
    traverserHitRadius,
    nodeByIdRef,
  ]);

  // --- User drag state ---

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

  // --- Core drag logic (called by view-specific wrappers) ---

  const handleTraverserDragMove = useCallback((
    graphCoords: { x: number; y: number },
    screenCoords: { x: number; y: number },
    prevScreenCoords: { x: number; y: number } | null,
  ) => {
    const activeId = draggingTraverserRef.current;
    if (!activeId) return;
    const traverser = traverserById.get(activeId);
    if (!traverser) return;
    const isRootTraverser = traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX);

    if (isRootTraverser) {
      const nodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
      const node = nodeByIdRef.current?.get(nodeId);
      if (!node || node.x === undefined || node.y === undefined) return;
      const dx = graphCoords.x - node.x;
      const dy = graphCoords.y - node.y;
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
        const candidate = findClosestEdge(graphCoords, allowedEdgeIds, tuning.dragEdgeSearchRadius);
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
        const rootSnapMult = displayMode === 'balls' ? tuning.rootSnapMultiplier.balls : tuning.rootSnapMultiplier.labels;
        const rootBias = nodeRadius * rootSnapMult;
        const preferRoot = rootCandidateId && (!candidate || (rootCandidate!.distance <= candidate.distance + rootBias));
        const selectedCandidate = preferRoot ? null : candidate;
        const selectedRootId = preferRoot ? rootCandidateId : null;
        const selectedRootPosition = preferRoot ? rootCandidatePosition : null;

        let targetX = graphCoords.x;
        let targetY = graphCoords.y;
        if (selectedRootId) {
          const rootNode = nodeByIdRef.current?.get(selectedRootId);
          if (rootNode) {
            const render = coords.getRootTraverserPoint(rootNode, selectedRootPosition ?? 0);
            targetX = render.x;
            targetY = render.y;
          }
        } else if (selectedCandidate) {
          const candidateNodes = coords.getEdgeNodes(selectedCandidate.edgeId);
          if (candidateNodes) {
            const render = coords.getTraverserRenderPoint(
              candidateNodes.sourceNode,
              candidateNodes.targetNode,
              selectedCandidate.position
            );
            targetX = render.x;
            targetY = render.y;
          }
        }

        const currentRender = coords.getRootTraverserPoint(node, clamp(traverser.position ?? 0, 0, 1));
        setDetachedDrag(prev => {
          const hasMagnetTarget = Boolean(selectedRootId || selectedCandidate);
          const strength = hasMagnetTarget ? tuning.magnetStrength.detachTarget : tuning.magnetStrength.detachFree;
          const startX = prev?.traverserId === traverser.id ? prev.x : currentRender.x;
          const startY = prev?.traverserId === traverser.id ? prev.y : currentRender.y;
          return {
            traverserId: traverser.id,
            x: startX + (targetX - startX) * strength,
            y: startY + (targetY - startY) * strength,
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
      return;
    }

    // --- Edge traverser drag ---
    const edgeNodes = coords.getEdgeNodes(traverser.edgeId);
    if (!edgeNodes) return;
    const { sourceNode, targetNode } = edgeNodes;
    const projection = projectPointToSegment(
      graphCoords.x,
      graphCoords.y,
      sourceNode.x!,
      sourceNode.y!,
      targetNode.x!,
      targetNode.y!
    );
    const lineDistance = distanceToLine(
      graphCoords.x,
      graphCoords.y,
      sourceNode.x!,
      sourceNode.y!,
      targetNode.x!,
      targetNode.y!
    );
    const sourceScreen = coords.getScreenCoords(sourceNode.x!, sourceNode.y!);
    const targetScreen = coords.getScreenCoords(targetNode.x!, targetNode.y!);
    if (prevScreenCoords && sourceScreen && targetScreen) {
      const edgeDx = targetScreen.x - sourceScreen.x;
      const edgeDy = targetScreen.y - sourceScreen.y;
      const edgeLength = Math.hypot(edgeDx, edgeDy);
      const deltaX = screenCoords.x - prevScreenCoords.x;
      const deltaY = screenCoords.y - prevScreenCoords.y;
      const moveDistance = Math.hypot(deltaX, deltaY);
      if (moveDistance > 1e-3 && edgeLength > 1e-3) {
        const dot = (deltaX * edgeDx + deltaY * edgeDy) / (moveDistance * edgeLength);
        const clamped = Math.max(-1, Math.min(1, dot));
        const angle = Math.acos(Math.abs(clamped)) * (180 / Math.PI);
        dragAngleRef.current = angle;
      }
    } else if (prevScreenCoords) {
      const edgeDx = targetNode.x! - sourceNode.x!;
      const edgeDy = targetNode.y! - sourceNode.y!;
      const edgeLength = Math.hypot(edgeDx, edgeDy);
      const prevGraph = coords.getGraphCoords(prevScreenCoords.x, prevScreenCoords.y);
      const deltaX = graphCoords.x - (prevGraph?.x ?? graphCoords.x);
      const deltaY = graphCoords.y - (prevGraph?.y ?? graphCoords.y);
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
    const zoom = coords.getZoomScale();
    const lineDistanceScreen = sourceScreen && targetScreen
      ? distanceToLine(screenCoords.x, screenCoords.y, sourceScreen.x, sourceScreen.y, targetScreen.x, targetScreen.y)
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
      const candidate = findClosestEdge(graphCoords, allowedEdgeIds, tuning.dragEdgeSearchRadius);
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

      const rootSnapMult = displayMode === 'balls' ? tuning.rootSnapMultiplier.balls : tuning.rootSnapMultiplier.labels;
      const rootBias = nodeRadius * rootSnapMult;
      const preferRoot = rootCandidateId && (!candidate || (rootCandidate!.distance <= candidate.distance + rootBias));
      const selectedCandidate = preferRoot ? null : candidate;
      const selectedRootId = preferRoot ? rootCandidateId : null;
      const selectedRootPosition = preferRoot ? rootCandidatePosition : null;

      let targetX = graphCoords.x;
      let targetY = graphCoords.y;
      if (selectedRootId) {
        const rootNode = nodeByIdRef.current?.get(selectedRootId);
        if (rootNode) {
          const render = coords.getRootTraverserPoint(rootNode, selectedRootPosition ?? 0);
          targetX = render.x;
          targetY = render.y;
        }
      } else if (selectedCandidate) {
        const candidateNodes = coords.getEdgeNodes(selectedCandidate.edgeId);
        if (candidateNodes) {
          const render = coords.getTraverserRenderPoint(
            candidateNodes.sourceNode,
            candidateNodes.targetNode,
            selectedCandidate.position
          );
          targetX = render.x;
          targetY = render.y;
        }
      }

      const fallbackRender = coords.getTraverserRenderPoint(
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
  }, [
    traverserById,
    coords,
    updateTraverserPosition,
    previewBurn?.edgeId,
    previewBurn?.targetNodeId,
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
    traverserByEdgeId,
    nodeByIdRef,
    nodeRadius,
    tuning.dragEdgeSearchRadius,
    tuning.magnetStrength.detachTarget,
    tuning.magnetStrength.detachFree,
    tuning.rootSnapMultiplier.balls,
    tuning.rootSnapMultiplier.labels,
    displayMode,
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
  }, [
    traverserById,
    detachedDrag,
    traverserByEdgeId,
    onTraverserUpdate,
    onTraverserDelete,
    showToast,
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

    const candidate = findClosestEdge(graphCoords, eligibleTraverserEdgeIds, tuning.ghostEdgeSearchRadius);
    const rootSnapMult = displayMode === 'balls' ? tuning.rootSnapMultiplier.balls : tuning.rootSnapMultiplier.labels;
    const rootBias = nodeRadius * rootSnapMult;
    const preferRoot = rootCandidateId && (!candidate || (rootCandidate!.distance <= candidate.distance + rootBias));
    const selectedCandidate = preferRoot ? null : candidate;
    const selectedRootId = preferRoot ? rootCandidateId : null;
    const selectedRootPosition = preferRoot ? rootCandidatePosition : null;

    let targetX = baseX;
    let targetY = baseY;
    if (selectedRootId) {
      const rootNode = nodeByIdRef.current?.get(selectedRootId);
      if (rootNode) {
        const render = coords.getRootTraverserPoint(rootNode, selectedRootPosition ?? 0);
        const screen = coords.getScreenCoords(render.x, render.y);
        if (screen) {
          targetX = screen.x;
          targetY = screen.y;
        }
      }
    } else if (selectedCandidate) {
      const candidateNodes = coords.getEdgeNodes(selectedCandidate.edgeId);
      if (candidateNodes) {
        const render = coords.getTraverserRenderPoint(
          candidateNodes.sourceNode,
          candidateNodes.targetNode,
          selectedCandidate.position
        );
        const screen = coords.getScreenCoords(render.x, render.y);
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
    coords,
    findClosestRootNode,
    traverserByEdgeId,
    findClosestEdge,
    eligibleTraverserEdgeIds,
    tuning.ghostEdgeSearchRadius,
    tuning.magnetStrength.ghostTarget,
    tuning.magnetStrength.ghostFree,
    tuning.rootSnapMultiplier.balls,
    tuning.rootSnapMultiplier.labels,
    displayMode,
    nodeRadius,
    nodeByIdRef,
  ]);

  const handleUserDropAtCoords = useCallback((userId: string, graphCoords: { x: number; y: number }) => {
    setDraggingUserGhost(null);

    const rootCandidate = findClosestRootNode(graphCoords);
    if (rootCandidate) {
      if (!onTraverserCreate) return;
      const rootEdgeId = `${ROOT_TRAVERSER_PREFIX}${rootCandidate.nodeId}`;
      if (traverserByEdgeId.has(rootEdgeId)) {
        showToast('Root already has active progress', 'info');
        setDraggingUserId(null);
        return;
      }
      const node = nodeByIdRef.current?.get(rootCandidate.nodeId);
      const position = node ? coords.getRootPositionFromCoords(node, graphCoords) : 0;
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

    const closestAny = findClosestEdge(graphCoords, undefined, tuning.ghostEdgeSearchRadius);
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
    coords,
    findClosestEdge,
    traverserByEdgeId,
    createTraverserForEdge,
    createTraverserForRoot,
    beginPendingBurn,
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

  // --- Traverser drag initiation ---

  const initiateTraverserDrag = useCallback((traverserId: string, clientX: number, clientY: number) => {
    closeEdgeStartPicker();
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
    closeEdgeStartPicker,
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
    findClosestEdge,
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
