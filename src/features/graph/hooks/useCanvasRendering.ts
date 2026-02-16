import { useCallback } from 'react';
import type { GraphNodeData, GraphLinkData, ConnectionModeState, DisplayMode, ArrowMode } from '../types';
import type { PendingBurnState, PreviewBurnState, DetachedDragState } from './useTraverserLogic';
import { clamp } from './useTraverserLogic';
import { getAvatarConfig, drawAvatar } from '@/lib/avatar';
import type { Card, Traverser } from '@/lib/types';

export type DragConnectState = {
  active: boolean;
  sourceNode: GraphNodeData | null;
  targetNode: GraphNodeData | null;
  progress: number;
  startTime: number | null;
};

export type UseCanvasRenderingProps = {
  displayMode: DisplayMode;
  nodeRadius: number;
  arrowMode: ArrowMode;
  connectionMode: ConnectionModeState;
  dragConnect: DragConnectState;
  draggingUserId: string | null;
  focusedNodeId: string | null;
  pendingBurn: PendingBurnState;
  previewBurn: PreviewBurnState;
  detachedDrag: DetachedDragState;
  cardById: Map<string, Card>;
  traverserByEdgeId: Map<string, Traverser>;
  rootTraverserByNodeId: Map<string, Traverser>;
  rootActiveNodeIds: Set<string>;
  eligibleTraverserEdgeIds: Set<string>;
  isBurntNodeId: (nodeId: string) => boolean;
  getAssigneeName: (assignee: string | undefined) => string;
  // From useGraphCoordinates
  NODE_RADIUS: number;
  ROOT_RING_RADIUS: number;
  BURNT_COLOR: string;
  PENDING_RING_COLOR: string;
  FUSE_COLOR: string;
  getTraverserRenderPoint: (source: GraphNodeData, target: GraphNodeData, position: number) => { x: number; y: number; startX: number; startY: number; clampedT: number; offsetT: number };
  getFuseGradient: (ctx: CanvasRenderingContext2D, startX: number, startY: number, endX: number, endY: number) => CanvasGradient;
  getFuseRingGradient: (ctx: CanvasRenderingContext2D, centerX: number, centerY: number) => string | CanvasGradient;
  // Refs
  nodeBckgDimensionsRef: React.RefObject<Map<string, [number, number]>>;
};

export function useCanvasRendering({
  displayMode,
  nodeRadius,
  arrowMode,
  connectionMode,
  dragConnect,
  draggingUserId,
  focusedNodeId,
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
  BURNT_COLOR,
  PENDING_RING_COLOR,
  FUSE_COLOR,
  getTraverserRenderPoint,
  getFuseGradient,
  getFuseRingGradient,
  nodeBckgDimensionsRef,
}: UseCanvasRenderingProps) {
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
    focusedNodeId,
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
    getFuseGradient,
    BURNT_COLOR,
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

  return {
    nodeCanvasObject,
    linkCanvasObject,
    nodePointerAreaPaint,
    getArrowRelPos,
    getArrowRelPosMiddle,
  };
}
