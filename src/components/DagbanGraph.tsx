'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Category } from '@/lib/types';
import { getGradientColor, computeIndegrees, computeOutdegrees, getMaxDegree } from '@/lib/colors';

// Import extracted components
import {
  CardDetailPanel,
  NodeContextMenu,
  CardCreationForm,
  CommandPalette,
  ToastNotification,
  KeyboardShortcutsHelp,
  Header,
  SettingsPanel,
  // Types
  GraphNodeData,
  GraphLinkData,
  SelectedNodeInfo,
  NodeContextMenuState,
  CardCreationState,
  HoverTooltipState,
  ToastState,
  CommandPaletteState,
  ConnectionModeState,
  UndoAction,
  ViewMode,
  DisplayMode,
  ColorMode,
} from './graph';

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
  onCardDelete?: (cardId: string) => void;
  onEdgeCreate?: (sourceId: string, targetId: string) => void;
  onUndo?: () => void;
  projectHeader?: React.ReactNode;
  showSettingsProp?: boolean;
  triggerNewNode?: boolean;
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

export default function DagbanGraph({
  data,
  onCardChange,
  onCardCreate,
  onCardDelete,
  onEdgeCreate,
  onUndo,
  projectHeader,
  showSettingsProp = true,
  triggerNewNode = false,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const graphRef = useRef<any>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [viewMode, setViewMode] = useState<ViewMode>('2D');
  const [displayMode, setDisplayMode] = useState<DisplayMode>('balls');
  const [colorMode, setColorMode] = useState<ColorMode>('category');
  const [showSettings, setShowSettings] = useState(showSettingsProp);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [css2DRendererInstance, setCss2DRendererInstance] = useState<any>(null);
  const [selectedNode, setSelectedNode] = useState<SelectedNodeInfo | null>(null);

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
    childNodeId: null,
  });

  // Hover tooltip state (tracks which node is hovered for keyboard shortcuts)
  const [hoverTooltip, setHoverTooltip] = useState<HoverTooltipState>({
    visible: false,
    x: 0,
    y: 0,
    title: '',
    nodeId: null,
  });

  // Toast notification state
  const [toast, setToast] = useState<ToastState>({
    visible: false,
    message: '',
    type: 'info',
  });

  // Command palette state
  const [commandPalette, setCommandPalette] = useState<CommandPaletteState>({
    visible: false,
    query: '',
  });

  // Keyboard shortcuts help state
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Connection mode state (for creating edges between nodes)
  const [connectionMode, setConnectionMode] = useState<ConnectionModeState>({
    active: false,
    sourceNode: null,
    direction: 'downstream',
  });

  // Undo stack for local undo functionality
  const undoStackRef = useRef<UndoAction[]>([]);

  // Show toast notification
  const showToast = useCallback((message: string, type: ToastState['type'] = 'info', action?: ToastState['action']) => {
    setToast({ visible: true, message, type, action });
  }, []);

  // Hide toast
  const hideToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

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

  // Handle undo
  const handleUndo = useCallback(() => {
    if (onUndo) {
      onUndo();
      showToast('Undone', 'success');
      return;
    }

    // Local undo if no external handler
    const action = undoStackRef.current.pop();
    if (!action) {
      showToast('Nothing to undo', 'warning');
      return;
    }

    if (action.type === 'delete_card' && onCardCreate) {
      // Restore deleted card
      onCardCreate(action.card);
      showToast(`Restored "${action.card.title}"`, 'success');
    }
  }, [onUndo, onCardCreate, showToast]);

  // Handle delete node
  const handleDeleteNode = useCallback((node: GraphNodeData) => {
    if (!onCardDelete) return;

    // Find connected edges
    const connectedEdges = data.edges.filter(
      e => e.source === node.id || e.target === node.id
    );

    // Store undo action
    undoStackRef.current.push({
      type: 'delete_card',
      card: node.card,
      connectedEdges,
    });

    // Delete the card
    onCardDelete(node.id);

    // Show toast with undo option
    showToast(`Deleted "${node.title}"`, 'info', {
      label: 'Undo',
      onClick: () => {
        handleUndo();
      },
    });
  }, [data.edges, onCardDelete, showToast, handleUndo]);

  // Start downstream connection mode - selected node becomes source, pick target
  const startDownstreamConnection = useCallback((sourceNode: GraphNodeData) => {
    setConnectionMode({
      active: true,
      sourceNode,
      direction: 'downstream',
    });
    showToast(`Click a node to make it downstream of "${sourceNode.title}"`, 'info');
  }, [showToast]);

  // Start upstream connection mode - selected node becomes target, pick source
  const startUpstreamConnection = useCallback((targetNode: GraphNodeData) => {
    setConnectionMode({
      active: true,
      sourceNode: targetNode, // Store the target node here, we'll swap in completeConnection
      direction: 'upstream',
    });
    showToast(`Click a node to make it upstream of "${targetNode.title}"`, 'info');
  }, [showToast]);

  // Cancel connection mode
  const cancelConnectionMode = useCallback(() => {
    setConnectionMode({
      active: false,
      sourceNode: null,
      direction: 'downstream',
    });
  }, []);

  // Complete connection - create edge based on direction
  const completeConnection = useCallback((clickedNode: GraphNodeData) => {
    if (!connectionMode.sourceNode || !onEdgeCreate) return;

    // Determine source and target based on direction
    let sourceId: string;
    let targetId: string;

    if (connectionMode.direction === 'downstream') {
      // sourceNode -> clickedNode
      sourceId = connectionMode.sourceNode.id;
      targetId = clickedNode.id;
    } else {
      // clickedNode -> sourceNode (upstream)
      sourceId = clickedNode.id;
      targetId = connectionMode.sourceNode.id;
    }

    // Don't allow self-connections
    if (sourceId === targetId) {
      showToast('Cannot connect a node to itself', 'warning');
      return;
    }

    // Check if edge already exists
    const edgeExists = data.edges.some(
      e => e.source === sourceId && e.target === targetId
    );
    if (edgeExists) {
      showToast('Connection already exists', 'warning');
      cancelConnectionMode();
      return;
    }

    // Create the edge
    onEdgeCreate(sourceId, targetId);
    const sourceNode = data.cards.find(c => c.id === sourceId);
    const targetNode = data.cards.find(c => c.id === targetId);
    showToast(`Connected "${sourceNode?.title}" -> "${targetNode?.title}"`, 'success');
    cancelConnectionMode();
  }, [connectionMode.sourceNode, connectionMode.direction, onEdgeCreate, data.edges, data.cards, showToast, cancelConnectionMode]);

  // Keyboard shortcuts handler (must be after handleDeleteNode and handleUndo)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // Escape cancels connection mode
      if (e.key === 'Escape' && connectionMode.active) {
        e.preventDefault();
        cancelConnectionMode();
        showToast('Connection cancelled', 'info');
        return;
      }

      // Skip if command palette is open (it handles its own keys)
      if (commandPalette.visible) return;

      // Cmd+Z / Ctrl+Z - Undo
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Cmd+K / Ctrl+K - Command palette
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPalette({ visible: true, query: '' });
      }

      // ? - Show keyboard shortcuts help
      if (e.key === '?' && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowShortcutsHelp(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hoverTooltip.nodeId, commandPalette.visible, connectionMode.active, graphData.nodes, handleDeleteNode, handleUndo, cancelConnectionMode, showToast]);

  // Open card creation form for new root node
  const openRootNodeCreation = useCallback((initialTitle?: string) => {
    // Center on screen
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: initialTitle || '',
      description: '',
      parentNodeId: null,
      childNodeId: null,
    });
  }, []);

  // Trigger new node creation from parent component
  useEffect(() => {
    if (triggerNewNode) {
      openRootNodeCreation();
    }
  }, [triggerNewNode, openRootNodeCreation]);

  // Handle command palette node selection
  const handleCommandPaletteSelectNode = useCallback((node: GraphNodeData) => {
    // Center graph on selected node
    if (graphRef.current && node.x !== undefined && node.y !== undefined) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
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
      childNodeId: null,
    });
  }, []);

  // Open card creation form for upstream dependency
  const openUpstreamCreation = useCallback((childNode: GraphNodeData) => {
    const centerX = typeof window !== 'undefined' ? window.innerWidth / 2 - 160 : 400;
    const centerY = typeof window !== 'undefined' ? window.innerHeight / 2 - 120 : 300;

    setCardCreation({
      visible: true,
      x: centerX,
      y: centerY,
      title: '',
      description: '',
      parentNodeId: null,
      childNodeId: childNode.id,
    });
  }, []);

  // Close card creation form
  const closeCardCreation = useCallback(() => {
    setCardCreation(prev => ({ ...prev, visible: false, title: '', description: '', parentNodeId: null, childNodeId: null }));
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

    // Create the card (with optional parent for downstream)
    onCardCreate(newCard, cardCreation.parentNodeId || undefined);

    // If this is an upstream dependency, create edge from new card to child
    if (cardCreation.childNodeId && onEdgeCreate) {
      onEdgeCreate(newCard.id, cardCreation.childNodeId);
    }

    closeCardCreation();
  }, [cardCreation, data.categories, onCardCreate, onEdgeCreate, closeCardCreation]);

  // Node radius
  const NODE_RADIUS = 8;

  // Custom node rendering for 2D - matches text-nodes example exactly
  const nodeCanvasObject = useCallback((node: GraphNodeData, ctx: CanvasRenderingContext2D, globalScale: number) => {
    const x = node.x ?? 0;
    const y = node.y ?? 0;

    // Check if this is the source node in connection mode
    const isConnectionSource = connectionMode.active && connectionMode.sourceNode?.id === node.id;

    if (displayMode === 'balls') {
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

        // Assignee avatar on right side
        const picX = x + bckgDimensions[0] / 2 - picSize / 2 - fontSize * 0.2;
        const picY = y;
        const picRadius = picSize / 2;

        // Circle background
        ctx.beginPath();
        ctx.arc(picX, picY, picRadius, 0, 2 * Math.PI);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 1 / globalScale;
        ctx.stroke();

        // Get assignee initials or show placeholder icon
        const assignee = node.card.assignee;
        if (assignee) {
          // Draw initials
          const initials = assignee
            .split(' ')
            .map(part => part.charAt(0).toUpperCase())
            .slice(0, 2)
            .join('');
          ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
          ctx.font = `bold ${fontSize * 0.6}px Sans-Serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(initials, picX, picY);
        } else {
          // Person icon placeholder (scaled)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          const headRadius = picRadius * 0.35;
          const bodyRadius = picRadius * 0.5;
          ctx.beginPath();
          ctx.arc(picX, picY - headRadius * 0.8, headRadius, 0, 2 * Math.PI);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(picX, picY + bodyRadius * 0.8, bodyRadius, Math.PI, 0, false);
          ctx.fill();
        }
      } else {
        ctx.fillText(label, x, y);
      }

      // Store dimensions for pointer area
      (node as GraphNodeData & { __bckgDimensions?: [number, number] }).__bckgDimensions = bckgDimensions;
    }
  }, [displayMode, connectionMode.active, connectionMode.sourceNode?.id]);

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
      // Create container for full mode: text + assignee avatar on the RIGHT
      // Using inline flex container to ensure horizontal layout
      const assignee = node.card.assignee;
      const avatarContent = assignee
        ? `<span style="color: rgba(255,255,255,0.9); font-size: 10px; font-weight: bold;">${assignee.split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('')}</span>`
        : `<svg width="10" height="10" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)">
            <circle cx="12" cy="8" r="4"/>
            <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z"/>
          </svg>`;

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
            ${avatarContent}
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

  // Handle node left-click - show detail panel or complete connection
  const handleNodeClick = useCallback((node: GraphNodeData, event: MouseEvent) => {
    // If in connection mode, complete the connection
    if (connectionMode.active && connectionMode.sourceNode) {
      completeConnection(node);
      return;
    }

    // Otherwise show the detail panel
    setSelectedNode({
      node,
      screenX: event.clientX,
      screenY: event.clientY,
    });
  }, [connectionMode.active, connectionMode.sourceNode, completeConnection]);

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

  // Handle node hover - track for keyboard shortcuts
  const handleNodeHover = useCallback((node: GraphNodeData | null) => {
    if (node) {
      setHoverTooltip({
        visible: true,
        x: 0,
        y: 0,
        title: node.title,
        nodeId: node.id,
      });
    } else {
      setHoverTooltip(prev => ({ ...prev, visible: false, nodeId: null }));
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
    nodeLabel: () => '', // Disable default tooltip, using custom one
    onNodeClick: handleNodeClick,
    onNodeHover: handleNodeHover,
    onNodeRightClick: handleNodeRightClick,
    nodeColor: (node: GraphNodeData) => node.color,
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-[#000000] relative"
    >
      {projectHeader || (
        <Header
          onLogoClick={() => setShowSettings(!showSettings)}
          onNewRootNode={openRootNodeCreation}
        />
      )}
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
        onDelete={handleDeleteNode}
      />

      {/* Card Creation Form */}
      <CardCreationForm
        state={cardCreation}
        onClose={closeCardCreation}
        onSubmit={handleCardCreation}
        onTitleChange={(title) => setCardCreation(prev => ({ ...prev, title }))}
        onDescriptionChange={(description) => setCardCreation(prev => ({ ...prev, description }))}
      />

      {/* Card Detail Panel (left-click on node) */}
      {selectedNode && (
        <CardDetailPanel
          selectedNode={selectedNode}
          onClose={() => setSelectedNode(null)}
          onCardChange={onCardChange}
          onCreateDownstream={openDownstreamCreation}
          onCreateUpstream={openUpstreamCreation}
          onLinkDownstream={startDownstreamConnection}
          onLinkUpstream={startUpstreamConnection}
          onDelete={handleDeleteNode}
        />
      )}

      {/* Node Hover Tooltip */}
      {hoverTooltip.visible && hoverTooltip.x > 0 && (
        <div
          className="node-hover-tooltip"
          style={{
            left: `${hoverTooltip.x + 12}px`,
            top: `${hoverTooltip.y + 12}px`,
          }}
        >
          {hoverTooltip.title}
        </div>
      )}

      {/* Toast Notification */}
      <ToastNotification state={toast} onClose={hideToast} />

      {/* Command Palette */}
      <CommandPalette
        state={commandPalette}
        nodes={graphData.nodes}
        onClose={() => setCommandPalette({ visible: false, query: '' })}
        onSelectNode={handleCommandPaletteSelectNode}
        onQueryChange={(query) => setCommandPalette(prev => ({ ...prev, query }))}
        onNewNode={() => openRootNodeCreation(commandPalette.query)}
      />

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        visible={showShortcutsHelp}
        onClose={() => setShowShortcutsHelp(false)}
      />

      {/* Connection Mode Indicator */}
      {connectionMode.active && connectionMode.sourceNode && (
        <div className="connection-mode-indicator">
          <div className="connection-mode-source">
            <div
              className="connection-mode-dot"
              style={{ backgroundColor: connectionMode.sourceNode.color }}
            />
            <span>{connectionMode.sourceNode.title}</span>
          </div>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          <span className="connection-mode-hint">Click a node to connect</span>
          <button className="connection-mode-cancel" onClick={cancelConnectionMode}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

    </div>
  );
}
