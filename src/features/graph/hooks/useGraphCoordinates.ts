'use client';

import { useCallback, useMemo } from 'react';
import type { GraphNodeData, GraphLinkData } from '../types';
import { clamp } from './useTraverserLogic';
import { FUSE_ANIMATION_PHASE_SCALE, getShiftedGradientStops } from '../traverserConstants';

export type GraphTheme = {
  fuseRed: string;
  fuseOrange: string;
  fuseYellow: string;
  categoryDefault: string;
};

export type UseGraphCoordinatesProps = {
  graphRef: React.RefObject<unknown>;
  nodeByIdRef: React.RefObject<Map<string, GraphNodeData>>;
  linkByIdRef: React.RefObject<Map<string, GraphLinkData>>;
  nodeRadius: number;
  fuseAnimationTime: number;
  graphTheme: GraphTheme;
};

export function useGraphCoordinates({
  graphRef,
  nodeByIdRef,
  linkByIdRef,
  nodeRadius,
  fuseAnimationTime,
  graphTheme,
}: UseGraphCoordinatesProps) {
  // --- Derived constants ---
  const NODE_RADIUS = nodeRadius;
  const ROOT_RING_RADIUS = NODE_RADIUS + 10;
  const ROOT_START_ANGLE = -Math.PI / 2;
  const BURNT_COLOR = 'rgba(17, 24, 39, 0.9)';
  const PENDING_RING_COLOR = 'rgba(148, 163, 184, 0.8)';
  const FUSE_COLOR = graphTheme.fuseOrange;

  const FUSE_GRADIENT_STOPS = useMemo(() => ([
    { stop: 0, color: graphTheme.fuseRed },
    { stop: 0.45, color: graphTheme.fuseOrange },
    { stop: 0.78, color: graphTheme.fuseYellow },
    { stop: 1, color: graphTheme.fuseRed },
  ]), [graphTheme.fuseRed, graphTheme.fuseOrange, graphTheme.fuseYellow]);

  const fuseGradientPhase = useMemo(() => (fuseAnimationTime * FUSE_ANIMATION_PHASE_SCALE) % 1, [fuseAnimationTime]);

  // --- Coordinate conversion ---

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graph = () => graphRef.current as any;

  const getGraphCoords = useCallback((clientX: number, clientY: number) => {
    const g = graph();
    if (!g || typeof g.screen2GraphCoords !== 'function') {
      return null;
    }
    const canvas = typeof g.canvas === 'function' ? g.canvas() : null;
    if (!canvas) {
      return g.screen2GraphCoords(clientX, clientY) as { x: number; y: number };
    }
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const localX = (clientX - rect.left) * scaleX;
    const localY = (clientY - rect.top) * scaleY;
    return g.screen2GraphCoords(localX, localY) as { x: number; y: number };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getZoomScale = useCallback(() => {
    const g = graph();
    if (!g || typeof g.zoom !== 'function') {
      return 1;
    }
    return g.zoom() as number;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getScreenCoords = useCallback((x: number, y: number) => {
    const g = graph();
    if (!g || typeof g.graph2ScreenCoords !== 'function') {
      return null;
    }
    const coords = g.graph2ScreenCoords(x, y) as { x: number; y: number } | null;
    if (!coords) return null;
    const canvas = typeof g.canvas === 'function' ? g.canvas() : null;
    if (!canvas) return coords;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    const isAbsolute =
      coords.x >= rect.left &&
      coords.x <= rect.right &&
      coords.y >= rect.top &&
      coords.y <= rect.bottom;

    if (isAbsolute) {
      return {
        x: coords.x - rect.left,
        y: coords.y - rect.top,
      };
    }

    const isDevicePixels = coords.x > rect.width || coords.y > rect.height;
    if (isDevicePixels && scaleX && scaleY) {
      return {
        x: coords.x / scaleX,
        y: coords.y / scaleY,
      };
    }

    return coords;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Edge/node lookups ---

  const getEdgeNodes = useCallback((edgeId: string) => {
    const link = linkByIdRef.current.get(edgeId);
    if (!link) return null;
    const sourceNode = typeof link.source === 'string'
      ? nodeByIdRef.current.get(link.source)
      : link.source;
    const targetNode = typeof link.target === 'string'
      ? nodeByIdRef.current.get(link.target)
      : link.target;
    if (!sourceNode || !targetNode) return null;
    if (sourceNode.x === undefined || sourceNode.y === undefined || targetNode.x === undefined || targetNode.y === undefined) {
      return null;
    }
    return { sourceNode, targetNode };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- Traverser position calculations ---

  const getTraverserRenderPoint = useCallback((
    sourceNode: GraphNodeData,
    targetNode: GraphNodeData,
    position: number
  ) => {
    const sx = sourceNode.x ?? 0;
    const sy = sourceNode.y ?? 0;
    const tx = targetNode.x ?? 0;
    const ty = targetNode.y ?? 0;
    const dx = tx - sx;
    const dy = ty - sy;
    const dist = Math.hypot(dx, dy);
    if (!dist) {
      return {
        x: sx,
        y: sy,
        startX: sx,
        startY: sy,
        clampedT: position,
        offsetT: 0,
      };
    }

    const ux = dx / dist;
    const uy = dy / dist;
    const safeOffset = Math.min(NODE_RADIUS, dist * 0.45);
    const offsetT = safeOffset / dist;
    const clampedT = clamp(position, offsetT, 1 - offsetT);
    const startX = sx + ux * safeOffset;
    const startY = sy + uy * safeOffset;
    const x = sx + dx * clampedT;
    const y = sy + dy * clampedT;

    return { x, y, startX, startY, clampedT, offsetT };
  }, [NODE_RADIUS]);

  const getRootTraverserPoint = useCallback((
    node: GraphNodeData,
    position: number
  ) => {
    const cx = node.x ?? 0;
    const cy = node.y ?? 0;
    const angle = ROOT_START_ANGLE + clamp(position, 0, 1) * Math.PI * 2;
    return {
      x: cx + Math.cos(angle) * ROOT_RING_RADIUS,
      y: cy + Math.sin(angle) * ROOT_RING_RADIUS,
      angle,
      startAngle: ROOT_START_ANGLE,
      radius: ROOT_RING_RADIUS,
    };
  }, [ROOT_RING_RADIUS, ROOT_START_ANGLE]);

  const getRootPositionFromCoords = useCallback((node: GraphNodeData, point: { x: number; y: number }) => {
    const dx = point.x - (node.x ?? 0);
    const dy = point.y - (node.y ?? 0);
    const angle = Math.atan2(dy, dx);
    let theta = angle - ROOT_START_ANGLE;
    if (theta < 0) theta += Math.PI * 2;
    return clamp(theta / (Math.PI * 2), 0, 1);
  }, [ROOT_START_ANGLE]);

  // --- Fuse gradient helpers ---

  const getShiftedGradientStopsLocal = useCallback((phase: number) => {
    return getShiftedGradientStops(FUSE_GRADIENT_STOPS, phase);
  }, [FUSE_GRADIENT_STOPS]);

  const getFuseGradient = useCallback((
    ctx: CanvasRenderingContext2D,
    startX: number,
    startY: number,
    endX: number,
    endY: number,
  ) => {
    const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
    const shiftedStops = getShiftedGradientStopsLocal(fuseGradientPhase);
    shiftedStops.forEach(({ stop, color }) => gradient.addColorStop(stop, color));
    return gradient;
  }, [getShiftedGradientStopsLocal, fuseGradientPhase]);

  const getFuseRingGradient = useCallback((ctx: CanvasRenderingContext2D, centerX: number, centerY: number) => {
    const conicFactory = (ctx as CanvasRenderingContext2D & {
      createConicGradient?: (startAngle: number, x: number, y: number) => CanvasGradient;
    }).createConicGradient;
    if (typeof conicFactory !== 'function') {
      return FUSE_COLOR;
    }
    const gradient = conicFactory.call(ctx, -Math.PI / 2 + fuseGradientPhase * Math.PI * 2, centerX, centerY);
    FUSE_GRADIENT_STOPS.forEach(({ stop, color }) => gradient.addColorStop(stop, color));
    return gradient;
  }, [FUSE_COLOR, FUSE_GRADIENT_STOPS, fuseGradientPhase]);

  return {
    // Constants
    NODE_RADIUS,
    ROOT_RING_RADIUS,
    ROOT_START_ANGLE,
    BURNT_COLOR,
    PENDING_RING_COLOR,
    FUSE_COLOR,
    FUSE_GRADIENT_STOPS,
    fuseGradientPhase,

    // Coordinate conversions
    getGraphCoords,
    getZoomScale,
    getScreenCoords,
    getEdgeNodes,

    // Traverser positions
    getTraverserRenderPoint,
    getRootTraverserPoint,
    getRootPositionFromCoords,

    // Gradient helpers
    getShiftedGradientStops: getShiftedGradientStopsLocal,
    getFuseGradient,
    getFuseRingGradient,
  };
}
