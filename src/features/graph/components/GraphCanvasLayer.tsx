'use client';

import dynamic from 'next/dynamic';
import type { GraphLinkData, GraphNodeData, ViewMode, DisplayMode, ArrowMode } from '../types';

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">
      Loading graph...
    </div>
  ),
});

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">
      Loading graph...
    </div>
  ),
});

interface GraphCanvasLayerProps {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  arrowMode: ArrowMode;
  nodeRadius: number;
  css2DRendererInstance: unknown;
  commonProps: Record<string, unknown>;
  nodeCanvasObject: (node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => void;
  nodePointerAreaPaint: (node: GraphNodeData, color: string, ctx: CanvasRenderingContext2D) => void;
  linkCanvasObject: (link: GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => void;
  nodeThreeObject?: (node: GraphNodeData) => unknown;
  getArrowRelPos: (link: GraphLinkData) => number;
  getArrowRelPosMiddle: (link: GraphLinkData) => number;
}

export function GraphCanvasLayer({
  viewMode,
  displayMode,
  arrowMode,
  nodeRadius,
  css2DRendererInstance,
  commonProps,
  nodeCanvasObject,
  nodePointerAreaPaint,
  linkCanvasObject,
  nodeThreeObject,
  getArrowRelPos,
  getArrowRelPosMiddle,
}: GraphCanvasLayerProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG2D = ForceGraph2D as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG3D = ForceGraph3D as any;

  return (
    <div className="graph-canvas">
      {viewMode === '2D' ? (
        <FG2D
          {...commonProps}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={nodePointerAreaPaint}
          linkCanvasObject={linkCanvasObject}
          linkColor={() => 'rgba(255,255,255,0.2)'}
        />
      ) : css2DRendererInstance ? (
        <FG3D
          {...commonProps}
          extraRenderers={[css2DRendererInstance]}
          nodeThreeObject={displayMode !== 'balls' ? nodeThreeObject : undefined}
          nodeThreeObjectExtend={true}
          nodeRelSize={nodeRadius}
          linkWidth={1}
          linkOpacity={0.6}
          linkColor={() => 'rgba(255, 255, 255, 0.4)'}
          linkDirectionalArrowLength={arrowMode !== 'none' ? Math.max(4, nodeRadius * 0.75) : 0}
          linkDirectionalArrowColor={() => 'rgba(255, 255, 255, 0.7)'}
          linkDirectionalArrowRelPos={arrowMode === 'end' ? getArrowRelPos : arrowMode === 'middle' ? getArrowRelPosMiddle : 0.5}
          nodeOpacity={1}
        />
      ) : (
        <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">
          Loading 3D graph...
        </div>
      )}
    </div>
  );
}
