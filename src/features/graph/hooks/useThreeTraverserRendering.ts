'use client';

/**
 * 3D traverser rendering via 2D canvas overlay.
 *
 * Instead of managing Three.js scene objects (sprites, lines, torus geometry),
 * we overlay a transparent <canvas> on the 3D graph and draw fuse gradients
 * and root rings in screen space — identical to the 2D renderer's visual style.
 *
 * Avatars are handled by HTML overlays (GraphOverlays) via traverserOverlays
 * from useTraverserSystem3D, so this hook only draws:
 *   - Fuse gradient lines on edges (source → traverser position)
 *   - Root progress rings around nodes (background ring + progress arc)
 */

import { useEffect, useRef, useCallback, useMemo } from 'react';
import type { Traverser, Edge, Card } from '@/lib/types';
import type { GraphNodeData, GraphLinkData, ViewMode } from '../types';
import type { PendingBurnState, PreviewBurnState, DetachedDragState } from './useTraverserLogic';
import { clamp } from './useTraverserLogic';
import { ROOT_TRAVERSER_PREFIX, FUSE_ANIMATION_PHASE_SCALE, getShiftedGradientStops as shiftStops } from '../traverserConstants';
import type { GraphTheme } from './useGraphCoordinates';

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------

export type UseThreeTraverserRenderingProps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  graphRef: React.RefObject<any>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  viewMode: ViewMode;
  data: { traversers?: Traverser[]; edges: Edge[] };
  nodeByIdRef: React.RefObject<Map<string, GraphNodeData>>;
  linkByIdRef: React.RefObject<Map<string, GraphLinkData>>;
  pendingBurn: PendingBurnState;
  previewBurn: PreviewBurnState;
  detachedDrag: DetachedDragState;
  nodeRadius: number;
  rootRingRadius: number;
  renderTick: number;
  fuseAnimationTime: number;
  graphTheme: GraphTheme;
  // Drag highlighting
  draggingUserId: string | null;
  draggingTraverserId: string | null;
  spaceHighlightRef: React.RefObject<boolean>;
  rootActiveNodeIds: Set<string>;
  rootTraverserByNodeId: Map<string, Traverser>;
  traverserByEdgeId: Map<string, Traverser>;
  isBurntNodeId: (id: string) => boolean;
  cardById: Map<string, Card>;
  graphDataView: { nodes: GraphNodeData[]; links: GraphLinkData[] };
};

// ---------------------------------------------------------------
// Constants
// ---------------------------------------------------------------

const ROOT_START_ANGLE = -Math.PI / 2;
const BG_RING_STYLE = 'rgba(255, 255, 255, 0.12)';
const HIGHLIGHT_COLOR = 'rgba(56, 189, 248, 0.7)';

// ---------------------------------------------------------------
// Hook
// ---------------------------------------------------------------

export function useThreeTraverserRendering({
  graphRef,
  containerRef,
  viewMode,
  data,
  nodeByIdRef,
  linkByIdRef,
  pendingBurn,
  previewBurn,
  detachedDrag,
  nodeRadius,
  rootRingRadius,
  renderTick,
  fuseAnimationTime,
  graphTheme,
  draggingUserId,
  draggingTraverserId,
  spaceHighlightRef,
  rootActiveNodeIds,
  rootTraverserByNodeId,
  traverserByEdgeId,
  isBurntNodeId,
  cardById,
  graphDataView,
}: UseThreeTraverserRenderingProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // --- Create / destroy the overlay canvas ---

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const canvas = document.createElement('canvas');
    canvas.style.cssText =
      'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
    container.appendChild(canvas);
    canvasRef.current = canvas;

    return () => {
      container.removeChild(canvas);
      canvasRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Gradient helpers ---

  const fuseStops = useMemo(() => [
    { stop: 0, color: graphTheme.fuseRed },
    { stop: 0.45, color: graphTheme.fuseOrange },
    { stop: 0.78, color: graphTheme.fuseYellow },
    { stop: 1, color: graphTheme.fuseRed },
  ], [graphTheme.fuseRed, graphTheme.fuseOrange, graphTheme.fuseYellow]);

  // --- Project 3D → screen ---

  const toScreen = useCallback((x: number, y: number, z: number): { sx: number; sy: number } | null => {
    const g = graphRef.current;
    if (!g || typeof g.graph2ScreenCoords !== 'function') return null;
    const result = g.graph2ScreenCoords(x, y, z);
    if (!result) return null;
    return { sx: result.x, sy: result.y };
  }, [graphRef]);

  /** Compute screen-space radius for a given world-space radius using the camera's right vector. */
  const getScreenRadiusForWorldRadius = useCallback((
    nx: number, ny: number, nz: number, center: { sx: number; sy: number }, worldRadius: number,
  ): number | null => {
    const g = graphRef.current;
    if (!g) return null;
    const camera = typeof g.camera === 'function' ? g.camera() : null;
    if (!camera) return null;

    // Camera right vector (first column of the camera's world matrix)
    const e = camera.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2];
    const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz);
    if (rLen < 1e-6) return null;

    const edge = toScreen(
      nx + (rx / rLen) * worldRadius,
      ny + (ry / rLen) * worldRadius,
      nz + (rz / rLen) * worldRadius,
    );
    if (!edge) return null;
    return Math.sqrt((edge.sx - center.sx) ** 2 + (edge.sy - center.sy) ** 2);
  }, [graphRef, toScreen]);

  /** Compute screen-space ring radius (view-plane-aligned) for root traverser rings. */
  const getScreenRingRadius = useCallback((
    nx: number, ny: number, nz: number, center: { sx: number; sy: number },
  ): number | null => {
    return getScreenRadiusForWorldRadius(nx, ny, nz, center, rootRingRadius);
  }, [getScreenRadiusForWorldRadius, rootRingRadius]);

  // --- Draw one frame ---

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || viewMode !== '3D') return;
    const g = graphRef.current;
    if (!g) return;

    // Resize canvas to match container pixel size
    const container = containerRef.current;
    if (!container) return;
    const dpr = window.devicePixelRatio || 1;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // --- Draw holy node glow ---
    const holyT = performance.now() / 3000;
    const holyAngle = holyT * Math.PI * 2;
    for (const node of graphDataView.nodes) {
      if (!node.holy) continue;
      if (node.x === undefined || node.y === undefined) continue;
      const nx = node.x ?? 0, ny = node.y ?? 0, nz = node.z ?? 0;
      const center = toScreen(nx, ny, nz);
      if (!center) continue;
      const screenRadius = getScreenRadiusForWorldRadius(nx, ny, nz, center, nodeRadius);
      if (!screenRadius || screenRadius < 1) continue;

      const grad = ctx.createConicGradient(holyAngle, center.sx, center.sy);
      grad.addColorStop(0,    '#ff3366');
      grad.addColorStop(0.17, '#ff9933');
      grad.addColorStop(0.33, '#ffdd00');
      grad.addColorStop(0.5,  '#33ff77');
      grad.addColorStop(0.67, '#33bbff');
      grad.addColorStop(0.83, '#aa44ff');
      grad.addColorStop(1,    '#ff3366');

      ctx.save();
      ctx.filter = `blur(${Math.max(screenRadius * 0.4, 3)}px)`;
      ctx.beginPath();
      ctx.arc(center.sx, center.sy, screenRadius, 0, Math.PI * 2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(screenRadius * 0.15, 1);
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.restore();
    }

    // --- Draw drag highlighting (root rings only) ---
    const isDragging = Boolean(draggingUserId) || Boolean(detachedDrag?.traverserId) || spaceHighlightRef.current;
    if (isDragging) {
      // Highlight root-eligible nodes with cyan ring
      for (const node of graphDataView.nodes) {
        if (!rootActiveNodeIds.has(node.id)) continue;
        if (node.x === undefined || node.y === undefined) continue;
        const rootTraverser = rootTraverserByNodeId.get(node.id);
        const rootAvailable = !rootTraverser || rootTraverser.id === detachedDrag?.traverserId;
        const isCandidateRoot = detachedDrag?.candidateRootNodeId === node.id;
        if (!rootAvailable && !isCandidateRoot) continue;

        const nx = node.x ?? 0, ny = node.y ?? 0, nz = node.z ?? 0;
        const center = toScreen(nx, ny, nz);
        if (!center) continue;
        const screenRadius = getScreenRingRadius(nx, ny, nz, center);
        if (!screenRadius || screenRadius < 1) continue;

        ctx.beginPath();
        ctx.arc(center.sx, center.sy, screenRadius, 0, Math.PI * 2);
        ctx.strokeStyle = HIGHLIGHT_COLOR;
        ctx.lineWidth = isCandidateRoot ? 3 : 2;
        ctx.stroke();
      }
    }

    const traversers = data.traversers ?? [];

    const phase = (fuseAnimationTime * FUSE_ANIMATION_PHASE_SCALE) % 1;
    const shiftedStops = shiftStops(fuseStops, phase);

    // Collect root rings to draw (deduplicate by nodeId)
    const rootRingsToDraw = new Map<string, { cx: number; cy: number; screenRadius: number; progress: number }>();

    for (const traverser of traversers) {
      // Only root traversers; silently skip legacy edge traversers
      if (!traverser.edgeId.startsWith(ROOT_TRAVERSER_PREFIX)) continue;
      const isDetached = detachedDrag?.traverserId === traverser.id;

      const rootNodeId = traverser.edgeId.slice(ROOT_TRAVERSER_PREFIX.length);
      const node = nodeByIdRef.current?.get(rootNodeId);
      if (!node || node.x === undefined || node.y === undefined) continue;

      const nx = node.x ?? 0;
      const ny = node.y ?? 0;
      const nz = node.z ?? 0;

      const center = toScreen(nx, ny, nz);
      if (!center) continue;

      // Compute screen-space ring radius using camera-right offset (stable under rotation)
      const screenRadius = getScreenRingRadius(nx, ny, nz, center);
      if (!screenRadius || screenRadius < 1) continue;

      const pos = clamp(traverser.position, 0, 1);

      // Keep the largest progress for this node
      const existing = rootRingsToDraw.get(rootNodeId);
      if (!existing || pos > existing.progress) {
        rootRingsToDraw.set(rootNodeId, {
          cx: center.sx,
          cy: center.sy,
          screenRadius,
          progress: isDetached ? 0 : pos,
        });
      }
    }

    if (!rootRingsToDraw.size) return;

    // --- Draw root rings ---
    for (const [, ring] of rootRingsToDraw) {
      // Background ring (full circle, faint)
      ctx.beginPath();
      ctx.arc(ring.cx, ring.cy, ring.screenRadius, 0, Math.PI * 2);
      ctx.strokeStyle = BG_RING_STYLE;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Progress arc
      if (ring.progress > 0) {
        ctx.beginPath();
        ctx.arc(
          ring.cx, ring.cy, ring.screenRadius,
          ROOT_START_ANGLE,
          ROOT_START_ANGLE + ring.progress * Math.PI * 2,
        );

        // Conic gradient for the ring (matches 2D behavior)
        const conicFactory = (ctx as CanvasRenderingContext2D & {
          createConicGradient?: (startAngle: number, x: number, y: number) => CanvasGradient;
        }).createConicGradient;
        if (typeof conicFactory === 'function') {
          const ringGradient = conicFactory.call(
            ctx,
            ROOT_START_ANGLE + phase * Math.PI * 2,
            ring.cx, ring.cy,
          );
          fuseStops.forEach(({ stop, color }) => ringGradient.addColorStop(stop, color));
          ctx.strokeStyle = ringGradient;
        } else {
          ctx.strokeStyle = graphTheme.fuseOrange;
        }

        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }, [
    viewMode,
    graphRef,
    containerRef,
    data.traversers,
    data.edges,
    nodeByIdRef,
    linkByIdRef,
    detachedDrag,
    nodeRadius,
    rootRingRadius,
    fuseAnimationTime,
    graphTheme,
    toScreen,
    getScreenRadiusForWorldRadius,
    getScreenRingRadius,
    fuseStops,
    draggingUserId,
    rootActiveNodeIds,
    rootTraverserByNodeId,
    traverserByEdgeId,
    isBurntNodeId,
    graphDataView,
  ]);

  // Continuously redraw via rAF in 3D mode (camera orbit/pan doesn't trigger renderTick)
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useEffect(() => {
    if (viewMode !== '3D') {
      // Clear canvas when leaving 3D mode
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    let rafId: number;
    const loop = () => {
      drawRef.current();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [viewMode]);
}
