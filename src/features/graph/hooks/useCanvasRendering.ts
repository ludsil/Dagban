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
  spaceHighlightRef: React.RefObject<boolean>;
  pendingBurn: PendingBurnState;
  previewBurn: PreviewBurnState;
  detachedDrag: DetachedDragState;
  cardById: Map<string, Card>;
  traverserByEdgeId: Map<string, Traverser>;
  rootTraverserByNodeId: Map<string, Traverser>;
  rootActiveNodeIds: Set<string>;
  isBurntNodeId: (nodeId: string) => boolean;
  getAssigneeName: (assignee: string | undefined) => string;
  // From useGraphCoordinates
  NODE_RADIUS: number;
  ROOT_RING_RADIUS: number;
  BURNT_COLOR: string;
  FUSE_COLOR: string;
  getTraverserRenderPoint: (source: GraphNodeData, target: GraphNodeData, position: number) => { x: number; y: number; startX: number; startY: number; clampedT: number; offsetT: number };
  getFuseRingGradient: (ctx: CanvasRenderingContext2D, centerX: number, centerY: number) => string | CanvasGradient;
  // Cycle detection
  cycleEdgeIds: Set<string>;
  // Indegree scaling
  scaleByIndegree: boolean;
  indegrees: Map<string, number>;
  maxIndegree: number;
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
  spaceHighlightRef,
  pendingBurn,
  previewBurn,
  detachedDrag,
  cardById,
  traverserByEdgeId,
  rootTraverserByNodeId,
  rootActiveNodeIds,
  isBurntNodeId,
  getAssigneeName,
  NODE_RADIUS,
  ROOT_RING_RADIUS,
  BURNT_COLOR,
  FUSE_COLOR,
  getTraverserRenderPoint,
  getFuseRingGradient,
  nodeBckgDimensionsRef,
  cycleEdgeIds,
  scaleByIndegree,
  indegrees,
  maxIndegree,
}: UseCanvasRenderingProps) {
  // Rotating conic-gradient holy glow — inspired by Aceternity glowing-effect
  // Uses canvas filter blur for a truly continuous glow (no discrete rings)
  const drawHolyGlow = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, _globalScale: number) => {
    const t = performance.now() / 3000;
    const angle = t * Math.PI * 2;

    const grad = ctx.createConicGradient(angle, x, y);
    grad.addColorStop(0,    '#ff3366');
    grad.addColorStop(0.17, '#ff9933');
    grad.addColorStop(0.33, '#ffdd00');
    grad.addColorStop(0.5,  '#33ff77');
    grad.addColorStop(0.67, '#33bbff');
    grad.addColorStop(0.83, '#aa44ff');
    grad.addColorStop(1,    '#ff3366');

    ctx.save();
    ctx.filter = `blur(${Math.max(radius * 0.4, 3)}px)`;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = grad;
    ctx.lineWidth = Math.max(radius * 0.15, 1);
    ctx.globalAlpha = 0.9;
    ctx.stroke();
    ctx.restore();
  }, []);

  // Compute per-node radius when scaling by indegree
  const getNodeRadius = useCallback((nodeId: string) => {
    if (!scaleByIndegree || maxIndegree <= 0) return NODE_RADIUS;
    const degree = indegrees.get(nodeId) || 0;
    // Nodes with 0 or 1 indegree stay at base size; scale up from indegree 2+
    const effective = Math.max(0, degree - 1);
    const effectiveMax = Math.max(1, maxIndegree - 1);
    const scale = 1 + (effective / effectiveMax);
    return NODE_RADIUS * scale;
  }, [scaleByIndegree, indegrees, maxIndegree, NODE_RADIUS]);

  // Custom node rendering for 2D - matches text-nodes example exactly
  const nodeCanvasObject = useCallback((node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const R = getNodeRadius(node.id);
    const ringR = R + 10;
    const rootTraverser = rootTraverserByNodeId.get(node.id);
    const rootAvailable = !rootTraverser || rootTraverser.id === detachedDrag?.traverserId;
    const isRootCandidate =
      ((Boolean(draggingUserId) || Boolean(detachedDrag?.traverserId) || spaceHighlightRef.current) && rootActiveNodeIds.has(node.id) && rootAvailable) ||
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
        ctx.arc(x, y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = Math.max(1.2 / globalScale, 0.6);
        ctx.stroke();

        if (rootProgress > 0) {
          ctx.beginPath();
          ctx.arc(x, y, ringR, startAngle, startAngle + rootProgress * Math.PI * 2);
          ctx.strokeStyle = getFuseRingGradient(ctx, x, y);
          ctx.lineWidth = Math.max(2 / globalScale, 1);
          ctx.stroke();
        }
      }

      // Draw glow effect for connection source
      if (isConnectionSource) {
        ctx.beginPath();
        ctx.arc(x, y, R + 6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.3)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, R + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw spinning circle animation for drag-to-connect on target node
      if (isDragConnectTarget && dragConnect.progress > 0) {
        const animRadius = R + 8;
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
        ctx.arc(x, y, R + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Holy glow effect (balls mode)
      if (node.holy) {
        drawHolyGlow(ctx, x, y, R, globalScale);
      }

      // Balls mode: just draw the colored ball
      ctx.beginPath();
      ctx.arc(x, y, R, 0, 2 * Math.PI);
      ctx.fillStyle = drawColor;
      ctx.fill();

      if (isRootCandidate) {
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
        ctx.lineWidth = 2 / globalScale;
        ctx.stroke();
      }

      // Store dimensions for pointer area
      nodeBckgDimensionsRef.current.set(node.id, [R * 2, R * 2]);
    } else {
      // Labels/Full mode: text IS the node (like text-nodes example)
      const label = node.title;
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;
      const metrics = label ? ctx.measureText(label) : null;
      const textWidth = metrics?.width ?? 0;

      // Use actual glyph bounds for precise vertical centering
      const ascent = metrics?.actualBoundingBoxAscent ?? fontSize * 0.75;
      const descent = metrics?.actualBoundingBoxDescent ?? fontSize * 0.25;
      const textHeight = ascent + descent;
      const vertPad = fontSize * 0.35;

      // For full mode, add space for avatar using standardized config
      const avatarConfig = getAvatarConfig(fontSize);
      const avatarSpace = displayMode === 'full' ? avatarConfig.size + avatarConfig.gap : 0;
      const totalWidth = textWidth + avatarSpace;

      const bckgDimensions: [number, number] = label
        ? [totalWidth + avatarConfig.padding * 2, textHeight + vertPad * 2]
        : [R * 2, R * 2];

      // Draw ball behind the label (matches 3D sphere + label)
      if (rootTraverser && rootProgress !== null) {
        const startAngle = -Math.PI / 2;
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.lineWidth = Math.max(1.2 / globalScale, 0.6);
        ctx.stroke();

        if (rootProgress > 0) {
          ctx.beginPath();
          ctx.arc(x, y, ringR, startAngle, startAngle + rootProgress * Math.PI * 2);
          ctx.strokeStyle = getFuseRingGradient(ctx, x, y);
          ctx.lineWidth = Math.max(2 / globalScale, 1);
          ctx.stroke();
        }
      }

      // Draw glow effect for connection source
      if (isConnectionSource) {
        ctx.beginPath();
        ctx.arc(x, y, R + 6, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(74, 222, 128, 0.3)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y, R + 3, 0, 2 * Math.PI);
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw spinning circle animation for drag-to-connect on target node
      if (isDragConnectTarget && dragConnect.progress > 0) {
        const animRadius = R + 8;
        const progress = dragConnect.progress;
        const rotation = performance.now() / 200;

        ctx.beginPath();
        ctx.arc(x, y, animRadius + 4, 0, 2 * Math.PI);
        ctx.fillStyle = `rgba(74, 222, 128, ${0.2 * progress})`;
        ctx.fill();

        ctx.beginPath();
        ctx.arc(x, y, animRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

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
        ctx.arc(x, y, R + 4, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(74, 222, 128, 0.6)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Holy glow effect (labels/full mode)
      if (node.holy) {
        drawHolyGlow(ctx, x, y, R, globalScale);
      }

      ctx.beginPath();
      ctx.arc(x, y, R, 0, 2 * Math.PI);
      ctx.fillStyle = drawColor;
      ctx.fill();

      if (label) {
        // Draw dark background (matches html-nodes example)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - bckgDimensions[0] / 2, y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

        // Draw text with precise vertical centering using actual glyph metrics.
        // textBaseline 'alphabetic' + computed baseline = visually centered text.
        // Baseline position: rect center + half(ascent - descent) to shift visual center to y.
        ctx.textAlign = displayMode === 'full' ? 'left' : 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = drawColor;
        const baselineY = y + (ascent - descent) / 2;

        if (displayMode === 'full') {
          // Text on left side
          ctx.fillText(label, x - bckgDimensions[0] / 2 + avatarConfig.padding, baselineY);

          // Assignee avatar on right side using standardized utility
          const avatarX = x + bckgDimensions[0] / 2 - avatarConfig.radius - avatarConfig.padding;
          drawAvatar(ctx, getAssigneeName(node.card.assignee), avatarX, y, fontSize, globalScale);
        } else {
          ctx.fillText(label, x, baselineY);
        }
      }

      if (isRootCandidate) {
        ctx.beginPath();
        ctx.arc(x, y, ringR, 0, 2 * Math.PI);
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
    BURNT_COLOR,
    draggingUserId,
    rootActiveNodeIds,
    rootTraverserByNodeId,
    ROOT_RING_RADIUS,
    detachedDrag?.traverserId,
    detachedDrag?.candidateRootNodeId,
    focusedNodeId,
    drawHolyGlow,
    getNodeRadius,
  ]);

  // Custom link rendering for 2D
  const EDGE_COLOR = 'rgba(255, 255, 255, 0.3)';
  const linkCanvasObject = useCallback((link: GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;

    if (source.x === undefined || source.y === undefined || target.x === undefined || target.y === undefined) return;

    // Draw base line from source to target
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = EDGE_COLOR;
    ctx.lineWidth = 1 / globalScale;
    ctx.stroke();

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
      ctx.fillStyle = EDGE_COLOR;
      ctx.fill();
    }

    // Warning triangle on cycle edges
    if (cycleEdgeIds.has(link.edge.id)) {
      const midX = (source.x + target.x) / 2;
      const midY = (source.y + target.y) / 2;
      const edgeAngle = Math.atan2(target.y - source.y, target.x - source.x);
      const offset = Math.max(6 / globalScale, 3);
      const cx = midX + -Math.sin(edgeAngle) * offset;
      const cy = midY + Math.cos(edgeAngle) * offset;

      const triSize = Math.max(5 / globalScale, 2.5);
      ctx.beginPath();
      ctx.moveTo(cx, cy - triSize);
      ctx.lineTo(cx - triSize * 0.87, cy + triSize * 0.5);
      ctx.lineTo(cx + triSize * 0.87, cy + triSize * 0.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(245, 158, 11, 0.85)';
      ctx.fill();

      // Exclamation mark
      const bangSize = triSize * 0.45;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(cx - bangSize * 0.15, cy - bangSize * 0.6, bangSize * 0.3, bangSize * 0.7);
      ctx.fillRect(cx - bangSize * 0.15, cy + bangSize * 0.3, bangSize * 0.3, bangSize * 0.25);
    }

  }, [
    arrowMode,
    nodeRadius,
    cycleEdgeIds,
  ]);

  const nodePointerAreaPaint = useCallback((node: GraphNodeData, color: string, ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = color;
    const x = node.x ?? 0;
    const y = node.y ?? 0;
    const R = getNodeRadius(node.id);

    // Always include the node circle as a clickable area
    ctx.beginPath();
    ctx.arc(x, y, R, 0, 2 * Math.PI);
    ctx.fill();

    // Also include the label background if present
    const bckgDimensions = nodeBckgDimensionsRef.current.get(node.id);
    if (bckgDimensions) {
      ctx.fillRect(
        x - bckgDimensions[0] / 2,
        y - bckgDimensions[1] / 2,
        bckgDimensions[0],
        bckgDimensions[1]
      );
    }
  }, [getNodeRadius]);

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
