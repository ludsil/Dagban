'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Edge, Category } from '@/lib/types';
import { getGradientColor, computeIndegrees, computeOutdegrees, getMaxDegree } from '@/lib/colors';

// Selected node info for detail panel
interface SelectedNodeInfo {
  node: GraphNodeData;
  screenX: number;
  screenY: number;
}

// Node context menu state (right-click on a node)
interface NodeContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: GraphNodeData | null;
}

// Card creation form state
interface CardCreationState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  description: string;
  parentNodeId: string | null; // null for root node, string for downstream task
}

// Hover tooltip state
interface HoverTooltipState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
}

// Dynamic imports to avoid SSR issues - use separate packages to avoid AFRAME/VR deps
const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">Loading graph...</div>
});

const ForceGraph3D = dynamic(() => import('react-force-graph-3d'), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">Loading graph...</div>
});

interface Props {
  data: GraphData;
  onEdgeProgressChange?: (edgeId: string, progress: number) => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
  onCategoryAdd?: (category: Category) => void;
  onCategoryDelete?: (categoryId: string) => void;
  onCardCreate?: (card: Card, parentCardId?: string) => void;
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

// Card Detail Panel Component - Figma post-it style
function CardDetailPanel({
  selectedNode,
  onClose,
  onCardChange,
  onCreateDownstream,
}: {
  selectedNode: SelectedNodeInfo;
  onClose: () => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCreateDownstream?: (parentNode: GraphNodeData) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const { node, screenX, screenY } = selectedNode;
  const card = node.card;

  // Local state for editing
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');

  // Save changes helper
  const saveChanges = useCallback(() => {
    const titleChanged = title !== card.title;
    const descChanged = description !== (card.description || '');
    if ((titleChanged || descChanged) && onCardChange) {
      onCardChange(card.id, {
        title,
        description: description || undefined,
      });
    }
  }, [title, description, card.title, card.description, card.id, onCardChange]);

  // Focus title on open
  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, []);

  // Handle click outside to close (and save if changes)
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        saveChanges();
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        saveChanges();
        onClose();
      }
    };

    // Delay adding listener to prevent immediate close from the same click
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    document.addEventListener('keydown', handleEscape);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, saveChanges]);

  // Handle creating downstream task
  const handleCreateDownstream = useCallback(() => {
    // Save any pending changes first
    saveChanges();
    onClose();
    if (onCreateDownstream) {
      onCreateDownstream(node);
    }
  }, [saveChanges, onClose, onCreateDownstream, node]);

  // Calculate panel position - position to the right of the node, or left if near edge
  const panelWidth = 320;
  const panelHeight = 280;
  const offset = 20;

  let left = screenX + offset;
  let top = screenY - panelHeight / 2;

  // Adjust if panel would go off-screen
  if (typeof window !== 'undefined') {
    if (left + panelWidth > window.innerWidth - 20) {
      left = screenX - panelWidth - offset;
    }
    if (top < 20) {
      top = 20;
    }
    if (top + panelHeight > window.innerHeight - 20) {
      top = window.innerHeight - panelHeight - 20;
    }
  }

  // Auto-resize textarea
  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

  return (
    <div
      ref={panelRef}
      className="postit-panel"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* Status indicator bar at top */}
      <div className="postit-status-bar" style={{ backgroundColor: node.color }} />

      {/* Title - large, editable */}
      <textarea
        ref={titleRef}
        className="postit-title"
        value={title}
        onChange={handleTitleChange}
        placeholder="Untitled"
        rows={1}
      />

      {/* Free text area */}
      <textarea
        className="postit-content"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add notes..."
      />

      {/* Bottom action bar */}
      <div className="postit-actions">
        <button
          className="postit-action-btn"
          onClick={handleCreateDownstream}
          title="Create downstream task"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span>Add task</span>
        </button>
        <div className="postit-status-badge" style={{ backgroundColor: node.color }}>
          {node.status}
        </div>
      </div>
    </div>
  );
}

// Node Context Menu Component (right-click on node)
function NodeContextMenu({
  state,
  onClose,
  onCreateDownstream,
}: {
  state: NodeContextMenuState;
  onClose: () => void;
  onCreateDownstream: (node: GraphNodeData) => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  if (!state.visible || !state.node) return null;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
    >
      <button
        className="context-menu-item"
        onClick={() => {
          if (state.node) {
            onCreateDownstream(state.node);
          }
          onClose();
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        Create downstream task
      </button>
    </div>
  );
}

// Card Creation Form Component - post-it style
function CardCreationForm({
  state,
  onClose,
  onSubmit,
  onTitleChange,
  onDescriptionChange,
}: {
  state: CardCreationState;
  onClose: () => void;
  onSubmit: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
}) {
  const formRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    // Focus the input when form opens
    if (state.visible && titleRef.current) {
      setTimeout(() => titleRef.current?.focus(), 50);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose, state.visible]);

  if (!state.visible) return null;

  // Calculate position - center on screen for root nodes, or near click for downstream
  let left = state.x;
  let top = state.y;
  const formWidth = 320;
  const formHeight = 240;

  // Adjust if panel would go off-screen
  if (typeof window !== 'undefined') {
    if (left + formWidth > window.innerWidth - 20) {
      left = window.innerWidth - formWidth - 20;
    }
    if (left < 20) {
      left = 20;
    }
    if (top + formHeight > window.innerHeight - 20) {
      top = window.innerHeight - formHeight - 20;
    }
    if (top < 20) {
      top = 20;
    }
  }

  const isDownstream = state.parentNodeId !== null;

  return (
    <div
      ref={formRef}
      className="postit-panel postit-creation"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
    >
      {/* Header */}
      <div className="postit-creation-header">
        <span>{isDownstream ? 'New Downstream Task' : 'New Root Node'}</span>
        <button className="postit-close" onClick={onClose}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Title - large, editable */}
      <textarea
        ref={titleRef}
        className="postit-title"
        value={state.title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Title..."
        rows={1}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && state.title.trim()) {
            e.preventDefault();
            onSubmit();
          }
        }}
      />

      {/* Description */}
      <textarea
        className="postit-content"
        value={state.description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Add notes..."
      />

      {/* Bottom action bar */}
      <div className="postit-actions">
        <button className="postit-cancel-btn" onClick={onClose}>
          Cancel
        </button>
        <button
          className="postit-create-btn"
          onClick={onSubmit}
          disabled={!state.title.trim()}
        >
          Create
        </button>
      </div>
    </div>
  );
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
type ColorMode = 'category' | 'indegree' | 'outdegree';

// Header Component with logo and project switcher
function Header({
  onLogoClick,
  onNewRootNode,
}: {
  onLogoClick: () => void;
  onNewRootNode: () => void;
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
      {/* New Root Node button */}
      <button
        className="new-root-btn"
        onClick={onNewRootNode}
        title="Create new root node"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New</span>
      </button>
    </div>
  );
}

// Settings Panel Component
function SettingsPanel({
  viewMode,
  displayMode,
  colorMode,
  onViewModeChange,
  onDisplayModeChange,
  onColorModeChange,
}: {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onColorModeChange: (mode: ColorMode) => void;
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
      <div className="settings-row">
        <span className="settings-label">Color</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${colorMode === 'category' ? 'active' : ''}`}
            onClick={() => onColorModeChange('category')}
          >
            Category
          </button>
          <button
            className={`toggle-btn toggle-btn-indegree ${colorMode === 'indegree' ? 'active' : ''}`}
            onClick={() => onColorModeChange('indegree')}
          >
            Indegree
          </button>
          <button
            className={`toggle-btn toggle-btn-outdegree ${colorMode === 'outdegree' ? 'active' : ''}`}
            onClick={() => onColorModeChange('outdegree')}
          >
            Outdegree
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

// Generate unique ID for new cards
function generateId(): string {
  return `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default function DagbanGraph({ data, onCardChange, onCardCreate }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('balls');
  const [colorMode, setColorMode] = useState<ColorMode>('category');
  const [showSettings, setShowSettings] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [css2DRendererInstance, setCss2DRendererInstance] = useState<any>(null);

  // Node context menu state (right-click on node)
  const [nodeContextMenu, setNodeContextMenu] = useState<NodeContextMenuState>({
    visible: false,
    x: 0,
    y: 0,
    node: null,
  });

  // Card creation form state
  const [cardCreation, setCardCreation] = useState<CardCreationState>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    description: '',
    parentNodeId: null,
  });

  // Hover tooltip state
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
  });

  // Load three.js on mount
  useEffect(() => {
    initThree().then(() => {
      if (CSS2DRenderer) {
        setCss2DRendererInstance(new CSS2DRenderer());
      }
    });
  }, []);

  // Compute degree maps for color modes
  const { indegrees, outdegrees, maxIndegree, maxOutdegree } = useMemo(() => {
    const indegrees = computeIndegrees(data.edges);
    const outdegrees = computeOutdegrees(data.edges);
    return {
      indegrees,
      outdegrees,
      maxIndegree: getMaxDegree(indegrees),
      maxOutdegree: getMaxDegree(outdegrees),
    };
  }, [data.edges]);

  // Convert dagban data to force-graph format
  const graphData = useMemo(() => ({
    nodes: data.cards.map(card => {
      const status = getCardStatus(card, data.edges, data.cards);
      const categoryColor = getCardColor(card, status, data.categories);

      // Compute color based on colorMode
      let color: string;
      if (colorMode === 'indegree') {
        const degree = indegrees.get(card.id) || 0;
        color = getGradientColor('indegree', degree, maxIndegree);
      } else if (colorMode === 'outdegree') {
        const degree = outdegrees.get(card.id) || 0;
        color = getGradientColor('outdegree', degree, maxOutdegree);
      } else {
        color = categoryColor;
      }

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
  }), [data, colorMode, indegrees, outdegrees, maxIndegree, maxOutdegree]);

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

  // Close node context menu
  const closeNodeContextMenu = useCallback(() => {
    setNodeContextMenu(prev => ({ ...prev, visible: false, node: null }));
  }, []);

  // Open card creation form for new root node
  const openRootNodeCreation = useCallback(() => {
    // Center on screen
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: '',
      description: '',
      parentNodeId: null,
    });
  }, []);

  // Open card creation form for downstream task
  const openDownstreamCreation = useCallback((parentNode: GraphNodeData) => {
    // Position near the center of the screen
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: '',
      description: '',
      parentNodeId: parentNode.id,
    });
  }, []);

  // Close card creation form
  const closeCardCreation = useCallback(() => {
    setCardCreation(prev => ({ ...prev, visible: false, title: '', description: '', parentNodeId: null }));
  }, []);

  // Handle card creation submission
  const handleCardCreation = useCallback(() => {
    if (!cardCreation.title.trim() || !onCardCreate) return;

    const now = new Date().toISOString();
    const newCard: Card = {
      id: generateId(),
      title: cardCreation.title.trim(),
      description: cardCreation.description.trim() || undefined,
      categoryId: data.categories.length > 0 ? data.categories[0].id : '',
      createdAt: now,
      updatedAt: now,
    };

    onCardCreate(newCard, cardCreation.parentNodeId || undefined);
    closeCardCreation();
  }, [cardCreation, data.categories, onCardCreate, closeCardCreation]);

  // Node radius
  const NODE_RADIUS = 8;

  // Custom node rendering for 2D - matches text-nodes example exactly
  const nodeCanvasObject = useCallback((node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    if (displayMode === 'balls') {
      // Balls mode: just draw the colored ball
      ctx.beginPath();
      ctx.arc(x, y, NODE_RADIUS, 0, 2 * Math.PI);
      ctx.fillStyle = node.color;
      ctx.fill();

      // Store dimensions for pointer area
      (node as GraphNodeData & { __bckgDimensions?: [number, number] }).__bckgDimensions = [NODE_RADIUS * 2, NODE_RADIUS * 2];
    } else {
      // Labels/Full mode: text IS the node (like text-nodes example)
      const label = node.title;
      const fontSize = 12 / globalScale;
      ctx.font = `${fontSize}px Sans-Serif`;
      const textWidth = ctx.measureText(label).width;

      // For full mode, add space for profile pic
      const picSize = displayMode === 'full' ? fontSize * 1.2 : 0;
      const picGap = displayMode === 'full' ? fontSize * 0.3 : 0;
      const totalWidth = textWidth + picSize + picGap;

      const bckgDimensions: [number, number] = [totalWidth + fontSize * 0.4, fontSize * 1.2]; // padding

      // Draw dark background (matches html-nodes example)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(x - bckgDimensions[0] / 2, y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

      // Draw text (centered, or left-aligned if full mode with pic)
      ctx.textAlign = displayMode === 'full' ? 'left' : 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = node.color;

      if (displayMode === 'full') {
        // Text on left side
        ctx.fillText(label, x - bckgDimensions[0] / 2 + fontSize * 0.2, y);

        // Profile pic on right side
        const picX = x + bckgDimensions[0] / 2 - picSize / 2 - fontSize * 0.2;
        const picY = y;
        const picRadius = picSize / 2;

        // Placeholder circle
        ctx.beginPath();
        ctx.arc(picX, picY, picRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();

        // Person icon (scaled)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        const headRadius = picRadius * 0.35;
        const bodyRadius = picRadius * 0.5;
        ctx.beginPath();
        ctx.arc(picX, picY - headRadius * 0.8, headRadius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(picX, picY + bodyRadius * 0.8, bodyRadius, Math.PI, 0, false);
        ctx.fill();
      } else {
        ctx.fillText(label, x, y);
      }

      // Store dimensions for pointer area
      (node as GraphNodeData & { __bckgDimensions?: [number, number] }).__bckgDimensions = bckgDimensions;
    }
  }, [displayMode]);

  // Custom link rendering for 2D - uniform line with small arrow in middle
  const linkCanvasObject = useCallback((link: GraphLinkData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const source = link.source as GraphNodeData;
    const target = link.target as GraphNodeData;

    if (!source.x || !target.x) return;

    // Draw uniform line from source to target
    ctx.beginPath();
    ctx.moveTo(source.x, source.y!);
    ctx.lineTo(target.x, target.y!);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 1 / globalScale;
    ctx.stroke();

    // Draw small arrow in the middle of the edge (fixed size, doesn't scale with zoom)
    const midX = (source.x + target.x) / 2;
    const midY = (source.y! + target.y!) / 2;
    const angle = Math.atan2(target.y! - source.y!, target.x - source.x);
    const arrowLength = 2; // Fixed size in graph units
    const arrowWidth = Math.PI / 4; // 45 degrees - wider angle to maintain width with shorter length

    ctx.beginPath();
    ctx.moveTo(
      midX + arrowLength * Math.cos(angle),
      midY + arrowLength * Math.sin(angle)
    );
    ctx.lineTo(
      midX - arrowLength * Math.cos(angle - arrowWidth),
      midY - arrowLength * Math.sin(angle - arrowWidth)
    );
    ctx.lineTo(
      midX - arrowLength * Math.cos(angle + arrowWidth),
      midY - arrowLength * Math.sin(angle + arrowWidth)
    );
    ctx.closePath();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fill();
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

  // Update 3D link positions - uniform line with arrow in middle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkPositionUpdate = useCallback((group: any, link: GraphLinkData) => {
    if (!THREE) return false;

    const source = link.source as GraphNodeData | undefined;
    const target = link.target as GraphNodeData | undefined;

    // Guard against undefined nodes during initialization
    if (!source || !target || source.x === undefined || target.x === undefined) return false;

    const sx = source.x, sy = source.y ?? 0, sz = source.z ?? 0;
    const tx = target.x, ty = target.y ?? 0, tz = target.z ?? 0;

    // Clear existing children
    while (group.children.length > 0) {
      group.remove(group.children[0]);
    }

    // Uniform line from source to target
    const lineGeom = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(sx, sy, sz),
      new THREE.Vector3(tx, ty, tz)
    ]);
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.3
    });
    group.add(new THREE.Line(lineGeom, lineMat));

    // Arrow cone in the middle
    const midX = (sx + tx) / 2;
    const midY = (sy + ty) / 2;
    const midZ = (sz + tz) / 2;

    const arrowGeom = new THREE.ConeGeometry(1.5, 3, 8);
    const arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5
    });
    const arrow = new THREE.Mesh(arrowGeom, arrowMat);
    arrow.position.set(midX, midY, midZ);

    // Orient arrow to point from source to target
    const direction = new THREE.Vector3(tx - sx, ty - sy, tz - sz).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
    arrow.setRotationFromQuaternion(quaternion);

    group.add(arrow);

    return true;
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG2D = ForceGraph2D as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const FG3D = ForceGraph3D as any;

  // Handle node right-click - show context menu
  const handleNodeRightClick = useCallback((node: GraphNodeData, event: MouseEvent) => {
    event.preventDefault();
    setNodeContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      node,
    });
  }, []);

  // Handle node hover - show tooltip
  const handleNodeHover = useCallback((node: GraphNodeData | null, prevNode: GraphNodeData | null) => {
    if (node) {
      // We need to track the mouse position for the tooltip
      // The tooltip position will be updated via mousemove
      setHoverTooltip({
        visible: true,
        x: 0, // Will be updated by mousemove
        y: 0,
        title: node.title,
      });
    } else {
      setHoverTooltip(prev => ({ ...prev, visible: false }));
    }
  }, []);

  // Track mouse position for tooltip
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (hoverTooltip.visible) {
        setHoverTooltip(prev => ({
          ...prev,
          x: e.clientX,
          y: e.clientY,
        }));
      }
    };

    if (hoverTooltip.visible) {
      window.addEventListener('mousemove', handleMouseMove);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, [hoverTooltip.visible]);

  // Common props for both 2D and 3D graphs
  const commonProps = {
    ref: graphRef,
    width: dimensions.width,
    height: dimensions.height,
    graphData: graphData,
    backgroundColor: "#000000",
    nodeLabel: (node: GraphNodeData) => node.card.description || node.title,
    onNodeRightClick: handleNodeRightClick,
    nodeColor: (node: GraphNodeData) => node.color,
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#000000] relative"
    >
      <Header
        onLogoClick={() => setShowSettings(!showSettings)}
        onNewRootNode={openRootNodeCreation}
      />
      {showSettings && (
        <SettingsPanel
          viewMode={viewMode}
          displayMode={displayMode}
          colorMode={colorMode}
          onViewModeChange={setViewMode}
          onDisplayModeChange={setDisplayMode}
          onColorModeChange={setColorMode}
        />
      )}

      {viewMode === '2D' ? (
        <FG2D
          {...commonProps}
          nodeCanvasObject={nodeCanvasObject}
          nodePointerAreaPaint={(node: GraphNodeData & { __bckgDimensions?: [number, number] }, color: string, ctx: CanvasRenderingContext2D) => {
            ctx.fillStyle = color;
            const bckgDimensions = node.__bckgDimensions;
            if (bckgDimensions) {
              ctx.fillRect(
                (node.x ?? 0) - bckgDimensions[0] / 2,
                (node.y ?? 0) - bckgDimensions[1] / 2,
                bckgDimensions[0],
                bckgDimensions[1]
              );
            }
          }}
          linkCanvasObject={linkCanvasObject}
          linkColor={() => 'rgba(255,255,255,0.2)'}
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
        <div className="w-full h-full bg-[#000000] flex items-center justify-center text-gray-500">Loading 3D graph...</div>
      )}

      {/* Node Context Menu (right-click on node) */}
      <NodeContextMenu
        state={nodeContextMenu}
        onClose={closeNodeContextMenu}
        onCreateDownstream={openDownstreamCreation}
      />

      {/* Card Creation Form */}
      <CardCreationForm
        state={cardCreation}
        onClose={closeCardCreation}
        onSubmit={handleCardCreation}
        onTitleChange={(title) => setCardCreation(prev => ({ ...prev, title }))}
        onDescriptionChange={(description) => setCardCreation(prev => ({ ...prev, description }))}
      />

    </div>
  );
}
