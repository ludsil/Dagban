import { Card, Edge } from '@/lib/types';

// Custom node type extending the force-graph node structure
export interface GraphNodeData {
  id: string;
  title: string;
  color: string;
  status: 'blocked' | 'active' | 'done';
  card: Card;
  // Whether this node matches current filter criteria
  matchesFilter?: boolean;
  // Position coordinates (set by force simulation)
  x?: number;
  y?: number;
  z?: number;
  // Velocity coordinates (set by D3 force simulation)
  vx?: number;
  vy?: number;
  vz?: number;
  // Fixed position coordinates (fx/fy/fz lock a node's position)
  // When set, the force simulation will not move this node
  // D3 uses null to unset, undefined means not set
  fx?: number | null;
  fy?: number | null;
  fz?: number | null;
  __bckgDimensions?: [number, number];
}

// Custom link type extending the force-graph link structure
export interface GraphLinkData {
  source: string | GraphNodeData;
  target: string | GraphNodeData;
  edge: Edge;
}

// Selected node info for detail panel
export interface SelectedNodeInfo {
  node: GraphNodeData;
  screenX: number;
  screenY: number;
}

// Node context menu state (right-click on a node)
export interface NodeContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  node: GraphNodeData | null;
}

// Edge context menu state (click on an edge)
export interface EdgeContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  containerX: number;
  containerY: number;
  edgeId: string | null;
}

// Card creation form state
export interface CardCreationState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  description: string;
  parentNodeId: string | null; // null for root node, string for downstream task
  childNodeId: string | null; // string for upstream dependency (new node becomes parent of this)
}

// Connection mode state (for creating edges)
export interface ConnectionModeState {
  active: boolean;
  sourceNode: GraphNodeData | null;
  direction: 'downstream' | 'upstream'; // downstream: source -> clicked, upstream: clicked -> source
}

// Hover tooltip state
export interface HoverTooltipState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  nodeId: string | null;
  color: string | null;
  assignee: string | null;
}

// Toast notification state
export interface ToastState {
  visible: boolean;
  message: string;
  type: 'info' | 'success' | 'warning';
  action?: { label: string; onClick: () => void };
}

// Command palette state
export interface CommandPaletteState {
  visible: boolean;
  query: string;
}

// View and display modes
export type ViewMode = '2D' | '3D';
export type DisplayMode = 'balls' | 'labels' | 'full';
export type ColorMode = 'category' | 'indegree' | 'outdegree';
export type ArrowMode = 'end' | 'middle' | 'none';

// Coordinate provider abstraction for the traverser system.
// 2D and 3D renderers supply their own implementations.
export interface TraverserCoordinateProvider {
  getGraphCoords(clientX: number, clientY: number): { x: number; y: number; z?: number } | null;
  getScreenCoords(x: number, y: number, z?: number): { x: number; y: number } | null;
  getZoomScale(): number;
  getEdgeNodes(edgeId: string): { sourceNode: GraphNodeData; targetNode: GraphNodeData } | null;
  getTraverserRenderPoint(source: GraphNodeData, target: GraphNodeData, position: number): { x: number; y: number; z?: number };
  getRootTraverserPoint(node: GraphNodeData, position: number): { x: number; y: number; z?: number; angle?: number; startAngle?: number; radius?: number };
  getRootPositionFromCoords(node: GraphNodeData, point: { x: number; y: number; z?: number }): number;
}
