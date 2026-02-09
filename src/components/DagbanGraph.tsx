'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Edge, Category } from '@/lib/types';

// Dynamic import to avoid SSR issues with force-graph
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-gray-900 flex items-center justify-center text-gray-400">Loading graph...</div>
});

interface Props {
  data: GraphData;
  onEdgeProgressChange?: (edgeId: string, progress: number) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
}

// Custom node type extending the force-graph node structure
interface GraphNodeData {
  title: string;
  color: string;
  status: 'blocked' | 'active' | 'done';
  card: Card;
}

// Custom link type extending the force-graph link structure
interface GraphLinkData {
  progress: number;
  edge: Edge;
}

export default function DagbanGraph({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  // Convert dagban data to force-graph format
  const graphData = {
    nodes: data.cards.map(card => {
      const status = getCardStatus(card, data.edges, data.cards);
      const color = getCardColor(card, status, data.categories);
      return {
        id: card.id,
        title: card.title,
        color,
        status,
        card,
      };
    }),
    links: data.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      progress: edge.progress,
      edge,
    })),
  };

  // Resize handling
  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // Zoom to fit all nodes on initial load after layout stabilizes
  useEffect(() => {
    // Wait for the force simulation to stabilize before zooming to fit
    const timer = setTimeout(() => {
      if (graphRef.current) {
        graphRef.current.zoomToFit(400, 50); // 400ms transition, 50px padding
      }
    }, 500); // Wait 500ms for initial layout to settle
    return () => clearTimeout(timer);
  }, [data]); // Re-run when data changes

  // Node radius
  const NODE_RADIUS = 8;

  // Custom node rendering - colored balls (text on hover via nodeLabel)
  const nodeCanvasObject = useCallback((node: { x?: number; y?: number } & GraphNodeData, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Draw ball
    ctx.beginPath();
    ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
    ctx.fillStyle = node.color;
    ctx.fill();

    // Border for active cards
    if (node.status === 'active') {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }, []);

  // Custom link rendering - fuse style
  const linkCanvasObject = useCallback((link: { source: { x: number; y: number }; target: { x: number; y: number } } & GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source;
    const target = link.target;

    if (!source.x || !target.x) return;

    const progress = link.progress / 100;

    // Calculate the point where the fuse has burned to
    const burnX = source.x + (target.x - source.x) * progress;
    const burnY = source.y + (target.y - source.y) * progress;

    // Unburned part (ahead of progress) - bright
    ctx.beginPath();
    ctx.moveTo(burnX, burnY);
    ctx.lineTo(target.x, target.y);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.8)'; // amber
    ctx.lineWidth = 3 / globalScale;
    ctx.stroke();

    // Burned part (behind progress) - dim
    ctx.beginPath();
    ctx.moveTo(source.x, source.y);
    ctx.lineTo(burnX, burnY);
    ctx.strokeStyle = 'rgba(107, 114, 128, 0.5)'; // gray
    ctx.lineWidth = 3 / globalScale;
    ctx.stroke();

    // Fuse head / spark point
    if (progress > 0 && progress < 1) {
      ctx.beginPath();
      ctx.arc(burnX, burnY, 5 / globalScale, 0, 2 * Math.PI);
      ctx.fillStyle = '#fbbf24'; // amber
      ctx.fill();
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1 / globalScale;
      ctx.stroke();
    }
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG = ForceGraph2D as any;

  return (
    <div ref={containerRef} className="w-full h-full bg-gray-900">
      <FG
        ref={graphRef}
        width={dimensions.width}
        height={dimensions.height}
        graphData={graphData}
        nodeCanvasObject={nodeCanvasObject}
        nodePointerAreaPaint={(node: { x?: number; y?: number } & GraphNodeData, color: string, ctx: CanvasRenderingContext2D) => {
          const x = node.x ?? 0;
          const y = node.y ?? 0;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
          ctx.fill();
        }}
        linkCanvasObject={linkCanvasObject}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={1}
        backgroundColor="#111827"
        nodeLabel={(node: GraphNodeData) => node.card.description || node.title}
        onNodeClick={(node: GraphNodeData) => {
          console.log('Clicked node:', node);
        }}
      />
    </div>
  );
}
