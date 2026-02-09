'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Edge, Category } from '@/lib/types';

// Dynamic imports to avoid SSR issues - use separate packages to avoid AFRAME/VR deps
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-black flex items-center justify-center text-gray-500">Loading graph...</div>
});

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-black flex items-center justify-center text-gray-500">Loading graph...</div>
});

interface Props {
  data: GraphData;
  onEdgeProgressChange?: (edgeId: string, progress: number) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
}

// Custom node type extending the force-graph node structure
interface GraphNodeData {
  id: string;
  title: string;
  color: string;
  status: 'blocked' | 'active' | 'done';
  card: Card;
  x?: number;
  y?: number;
  z?: number;
}

// Custom link type extending the force-graph link structure
interface GraphLinkData {
  source: string | GraphNodeData;
  target: string | GraphNodeData;
  progress: number;
  edge: Edge;
}

type ViewMode = '2D' | '3D';
type DisplayMode = 'balls' | 'labels' | 'full';

// Header Component with logo and project switcher
function Header({
  onLogoClick,
}: {
  onLogoClick: () => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currentProject] = useState('Default Project');

  return (
    <div className="header-panel">
      <button
        className="header-logo"
        onClick={onLogoClick}
        title="Settings"
      >
        <div className="header-logo-ball" />
      </button>
      <div className="header-project-switcher">
        <button
          className="header-project-btn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <span className="header-project-name">{currentProject}</span>
          <svg
            className={`header-chevron ${dropdownOpen ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="header-dropdown">
            <button
              className="header-dropdown-item active"
              onClick={() => setDropdownOpen(false)}
            >
              Default Project
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// Settings Panel Component
function SettingsPanel({
  viewMode,
  displayMode,
  onViewModeChange,
  onDisplayModeChange,
}: {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
}) {
  return (
    <div className="settings-panel">
      <div className="settings-row">
        <span className="settings-label">View</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${viewMode === '2D' ? 'active' : ''}`}
            onClick={() => onViewModeChange('2D')}
          >
            2D
          </button>
          <button
            className={`toggle-btn ${viewMode === '3D' ? 'active' : ''}`}
            onClick={() => onViewModeChange('3D')}
          >
            3D
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Display</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${displayMode === 'balls' ? 'active' : ''}`}
            onClick={() => onDisplayModeChange('balls')}
          >
            Balls
          </button>
          <button
            className={`toggle-btn ${displayMode === 'labels' ? 'active' : ''}`}
            onClick={() => onDisplayModeChange('labels')}
          >
            Labels
          </button>
          <button
            className={`toggle-btn ${displayMode === 'full' ? 'active' : ''}`}
            onClick={() => onDisplayModeChange('full')}
          >
            Full
          </button>
        </div>
      </div>
    </div>
  );
}

// Lazy-loaded three.js modules (only loaded client-side)
let THREE: typeof import('three') | null = null;
let CSS2DRenderer: typeof import('three/examples/jsm/renderers/CSS2DRenderer.js').CSS2DRenderer | null = null;
let CSS2DObject: typeof import('three/examples/jsm/renderers/CSS2DRenderer.js').CSS2DObject | null = null;

// Initialize three.js modules (called only on client)
async function initThree() {
  if (!THREE) {
    THREE = await import('three');
    const css2d = await import('three/examples/jsm/renderers/CSS2DRenderer.js');
    CSS2DRenderer = css2d.CSS2DRenderer;
    CSS2DObject = css2d.CSS2DObject;
  }
}

export default function DagbanGraph({ data }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('balls');
  const [showSettings, setShowSettings] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [css2DRendererInstance, setCss2DRendererInstance] = useState<any>(null);

  // Load three.js on mount
  useEffect(() => {
    initThree().then(() => {
      if (CSS2DRenderer) {
        setCss2DRendererInstance(new CSS2DRenderer());
      }
    });
  }, []);

  // Convert dagban data to force-graph format
  const graphData = useMemo(() => ({
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
  }), [data]);

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

  // Zoom to fit on load
  useEffect(() => {
    const timer = setTimeout(() => {
      if (graphRef.current) {
        // 2D: large padding so it barely zooms, 3D: normal zoom
        const padding = viewMode === '2D' ? 200 : 50;
        graphRef.current.zoomToFit(400, padding);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [viewMode]);

  // Node radius
  const NODE_RADIUS = 8;

  // Custom node rendering for 2D - balls + text label (like html-nodes example)
  const nodeCanvasObject = useCallback((node: GraphNodeData, ctx: CanvasRenderingContext2D) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Always draw the colored ball
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

    // Add text label below ball for labels/full mode
    if (displayMode === 'labels' || displayMode === 'full') {
      const label = node.title;
      const fontSize = 12;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      const textWidth = ctx.measureText(label).width;
      const padding = 4;
      const bgHeight = fontSize + 2;
      const picSize = displayMode === 'full' ? 14 : 0;
      const picGap = displayMode === 'full' ? 4 : 0;
      const totalWidth = textWidth + padding * 2 + picSize + picGap;
      const labelY = y + NODE_RADIUS + 4;

      // Draw background - matches html-nodes example exactly
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.beginPath();
      ctx.roundRect(
        x - totalWidth / 2,
        labelY - 1,
        totalWidth,
        bgHeight + 2,
        4
      );
      ctx.fill();

      // Draw text
      ctx.fillStyle = node.color;
      ctx.fillText(label, x - totalWidth / 2 + padding, labelY);

      // Draw profile pic on the RIGHT side of text (full mode only)
      if (displayMode === 'full') {
        const picX = x - totalWidth / 2 + padding + textWidth + picGap + picSize / 2;
        const picY = labelY + bgHeight / 2;

        // Placeholder circle
        ctx.beginPath();
        ctx.arc(picX, picY, picSize / 2, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Person icon
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.beginPath();
        ctx.arc(picX, picY - 1.5, 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(picX, picY + 3, 3, Math.PI, 0, false);
        ctx.fill();
      }
    }
  }, [displayMode]);

  // Custom link rendering for 2D - fuse style
  const linkCanvasObject = useCallback((link: GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;

    if (!source.x || !target.x) return;

    const progress = link.progress / 100;

    // Calculate the point where the fuse has burned to
    const burnX = source.x + ((target.x - source.x) * progress);
    const burnY = source.y! + ((target.y! - source.y!) * progress);

    // Unburned part (ahead of progress) - bright white
    ctx.beginPath();
    ctx.moveTo(burnX, burnY);
    ctx.lineTo(target.x, target.y!);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();

    // Burned part (behind progress) - dim
    ctx.beginPath();
    ctx.moveTo(source.x, source.y!);
    ctx.lineTo(burnX, burnY);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 2 / globalScale;
    ctx.stroke();

    // Fuse head / spark point
    if (progress > 0 && progress < 1) {
      ctx.beginPath();
      ctx.arc(burnX, burnY, 4 / globalScale, 0, 2 * Math.PI);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.fill();
    }
  }, []);

  // Create 3D node object with HTML labels (replaces sphere in labels/full mode)
  const nodeThreeObject = useCallback((node: GraphNodeData) => {
    if (displayMode === 'balls' || !CSS2DObject) {
      return undefined; // Use default sphere
    }

    const nodeEl = document.createElement('div');
    nodeEl.className = 'node-label';
    nodeEl.style.color = node.color;
    nodeEl.style.display = 'flex';
    nodeEl.style.alignItems = 'center';
    nodeEl.style.gap = '4px';

    if (displayMode === 'labels') {
      nodeEl.textContent = node.title;
    } else if (displayMode === 'full') {
      // Create container for full mode: text + profile pic on the RIGHT
      // Using inline flex container to ensure horizontal layout
      nodeEl.innerHTML = `
        <div style="display: flex; align-items: center; gap: 4px; flex-direction: row;">
          <span>${node.title}</span>
          <div style="
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: rgba(255,255,255,0.2);
            border: 1px solid rgba(255,255,255,0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          ">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
              <circle cx="12" cy="8" r="4"/>
              <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z"/>
            </svg>
          </div>
        </div>
      `;
    }

    return new CSS2DObject(nodeEl);
  }, [displayMode]);

  // Custom 3D link rendering with fuse effect
  const linkThreeObject = useCallback((link: GraphLinkData) => {
    if (!THREE) return null;

    const progress = link.progress / 100;

    // Create a group to hold both parts of the fuse
    const group = new THREE.Group();

    // We'll update positions in linkPositionUpdate
    // For now, return a simple line that will be updated
    const material = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6
    });
    const geometry = new THREE.BufferGeometry();
    const line = new THREE.Line(geometry, material);

    // Store progress for later use
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (group as any).fuseProgress = progress;
    group.add(line);

    return group;
  }, []);

  // Update 3D link positions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkPositionUpdate = useCallback((group: any, link: GraphLinkData) => {
    if (!THREE) return false;

    const source = link.source as GraphNodeData | undefined;
    const target = link.target as GraphNodeData | undefined;

    // Guard against undefined nodes during initialization
    if (!source || !target || source.x === undefined || target.x === undefined) return false;

    const progress = link.progress / 100;
    const sx = source.x, sy = source.y ?? 0, sz = source.z ?? 0;
    const tx = target.x, ty = target.y ?? 0, tz = target.z ?? 0;

    // Clear existing children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    // Burned position
    const bx = sx + (tx - sx) * progress;
    const by = sy + (ty - sy) * progress;
    const bz = sz + (tz - sz) * progress;

    // Unburned part (bright)
    const unburnedGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(bx, by, bz),
      new THREE.Vector3(tx, ty, tz)
    ]);
    const unburnedMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.6
    });
    group.add(new THREE.Line(unburnedGeom, unburnedMat));

    // Burned part (dim)
    const burnedGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(sx, sy, sz),
      new THREE.Vector3(bx, by, bz)
    ]);
    const burnedMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.15
    });
    group.add(new THREE.Line(burnedGeom, burnedMat));

    // Spark point
    if (progress > 0 && progress < 1) {
      const sparkGeom = new THREE.SphereGeometry(2, 8, 8);
      const sparkMat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.9
      });
      const spark = new THREE.Mesh(sparkGeom, sparkMat);
      spark.position.set(bx, by, bz);
      group.add(spark);
    }

    return true;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG2D = ForceGraph2D as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG3D = ForceGraph3D as any;

  // Common props for both 2D and 3D graphs
  const commonProps = {
    ref: graphRef,
    width: dimensions.width,
    height: dimensions.height,
    graphData: graphData,
    backgroundColor: "#000000",
    nodeLabel: (node: GraphNodeData) => node.card.description || node.title,
    onNodeClick: (node: GraphNodeData) => {
      console.log('Clicked node:', node);
    },
    nodeColor: (node: GraphNodeData) => node.color,
    linkDirectionalArrowLength: 3,  // Smaller arrows
    linkDirectionalArrowRelPos: 1,
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-black relative">
      <Header onLogoClick={() => setShowSettings(!showSettings)} />
      {showSettings && (
        <SettingsPanel
          viewMode={viewMode}
          displayMode={displayMode}
          onViewModeChange={setViewMode}
          onDisplayModeChange={setDisplayMode}
        />
      )}

      {viewMode === '2D' ? (
        <FG2D
          {...commonProps}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: GraphNodeData, color: string, ctx: CanvasRenderingContext2D) => {
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            ctx.fillStyle = color;
            // Always include ball area for clicking
            ctx.beginPath();
            ctx.arc(x, y, NODE_RADIUS + 4, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkCanvasObject={linkCanvasObject}
          linkColor={() => 'rgba(255,255,255,0.2)'}
          d3VelocityDecay={0.3}
          d3AlphaDecay={0.02}
          d3Force={(forceName: string, force: unknown) => {
            if (forceName === 'charge' && force) {
              // @ts-expect-error - force methods
              force.strength(-200); // Strong repulsion = sparse
            }
            if (forceName === 'link' && force) {
              // @ts-expect-error - force methods
              force.distance(100); // Longer links = sparse
            }
          }}
        />
      ) : css2DRendererInstance ? (
        <FG3D
          {...commonProps}
          extraRenderers={[css2DRendererInstance]}
          nodeThreeObject={displayMode !== 'balls' ? nodeThreeObject : undefined}
          nodeThreeObjectExtend={true}
          linkThreeObject={linkThreeObject}
          linkPositionUpdate={linkPositionUpdate}
          linkOpacity={0.6}
          nodeOpacity={1}
        />
      ) : (
        <div className="w-full h-full bg-black flex items-center justify-center text-gray-500">Loading 3D graph...</div>
      )}

    </div>
  );
}
