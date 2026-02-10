'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { DagbanGraph as GraphData, getCardStatus, getCardColor, Card, Edge, Category, placeholderUsers } from '@/lib/types';
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
  childNodeId: string | null; // string for upstream dependency (new node becomes parent of this)
}

// Hover tooltip state
interface HoverTooltipState {
  visible: boolean;
  x: number;
  y: number;
  title: string;
  nodeId: string | null;
}

// Connection mode state (for creating edges)
interface ConnectionModeState {
  active: boolean;
  sourceNode: GraphNodeData | null;
  direction: 'downstream' | 'upstream'; // downstream: source -> clicked, upstream: clicked -> source
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
  onCardDelete?: (cardId: string) => void;
  onEdgeCreate?: (sourceId: string, targetId: string) => void;
  onUndo?: () => void;
  projectHeader?: React.ReactNode;
  showSettingsProp?: boolean;
  triggerNewNode?: boolean;
}

// Undo action types for internal undo stack
type UndoAction =
  | { type: 'delete_card'; card: Card; connectedEdges: Edge[] }
  | { type: 'create_card'; cardId: string }
  | { type: 'update_card'; cardId: string; previousState: Partial<Card> };

// Toast notification state
interface ToastState {
  visible: boolean;
  message: string;
  type: 'info' | 'success' | 'warning';
  action?: { label: string; onClick: () => void };
}

// Command palette state
interface CommandPaletteState {
  visible: boolean;
  query: string;
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
  onCreateUpstream,
  onLinkDownstream,
  onLinkUpstream,
}: {
  selectedNode: SelectedNodeInfo;
  onClose: () => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCreateDownstream?: (parentNode: GraphNodeData) => void;
  onCreateUpstream?: (childNode: GraphNodeData) => void;
  onLinkDownstream?: (sourceNode: GraphNodeData) => void;
  onLinkUpstream?: (targetNode: GraphNodeData) => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const { node, screenX, screenY } = selectedNode;
  const card = node.card;

  // Local state for editing
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [assignee, setAssignee] = useState(card.assignee || '');
  const [showAssigneeInput, setShowAssigneeInput] = useState(false);

  // Save changes helper
  const saveChanges = useCallback(() => {
    const titleChanged = title !== card.title;
    const descChanged = description !== (card.description || '');
    const assigneeChanged = assignee !== (card.assignee || '');
    if ((titleChanged || descChanged || assigneeChanged) && onCardChange) {
      onCardChange(card.id, {
        title,
        description: description || undefined,
        assignee: assignee || undefined,
      });
    }
  }, [title, description, assignee, card.title, card.description, card.assignee, card.id, onCardChange]);

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

  // Handle Add task button - creates new downstream, or links existing with shift
  const handleAddTask = useCallback((e: React.MouseEvent) => {
    saveChanges();
    onClose();
    if (e.shiftKey && onLinkDownstream) {
      // Shift+click: link to existing node as downstream
      onLinkDownstream(node);
    } else if (onCreateDownstream) {
      // Normal click: create new downstream node
      onCreateDownstream(node);
    }
  }, [saveChanges, onClose, onCreateDownstream, onLinkDownstream, node]);

  // Handle Add dep button - creates new upstream, or links existing with shift
  const handleAddDep = useCallback((e: React.MouseEvent) => {
    saveChanges();
    onClose();
    if (e.shiftKey && onLinkUpstream) {
      // Shift+click: link to existing node as upstream
      onLinkUpstream(node);
    } else if (onCreateUpstream) {
      // Normal click: create new upstream dependency node
      onCreateUpstream(node);
    }
  }, [saveChanges, onClose, onCreateUpstream, onLinkUpstream, node]);

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

      {/* Assignee avatar in top right corner */}
      <div className="postit-assignee-corner">
        {showAssigneeInput ? (
          <select
            className="postit-assignee-dropdown"
            value={assignee}
            onChange={(e) => {
              setAssignee(e.target.value);
              setShowAssigneeInput(false);
            }}
            onBlur={() => setShowAssigneeInput(false)}
            autoFocus
          >
            <option value="">Unassigned</option>
            {placeholderUsers.map(user => (
              <option key={user.id} value={user.name}>{user.name}</option>
            ))}
          </select>
        ) : (
          <button
            className={`postit-assignee-avatar ${!assignee ? 'empty' : ''}`}
            onClick={() => setShowAssigneeInput(true)}
            title={assignee || 'Assign someone'}
          >
            {assignee ? (
              <span className="postit-assignee-initials">
                {assignee.split(' ').map(p => p.charAt(0).toUpperCase()).slice(0, 2).join('')}
              </span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/>
                <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z"/>
              </svg>
            )}
          </button>
        )}
      </div>

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
        <div className="postit-actions-left">
          <button
            className="postit-action-btn"
            onClick={handleAddTask}
            title="Create downstream task (⇧ Shift: link existing)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add task</span>
          </button>
          <button
            className="postit-action-btn"
            onClick={handleAddDep}
            title="Create upstream dependency (⇧ Shift: link existing)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Add dep</span>
          </button>
        </div>
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
  onDelete,
}: {
  state: NodeContextMenuState;
  onClose: () => void;
  onCreateDownstream: (node: GraphNodeData) => void;
  onDelete: (node: GraphNodeData) => void;
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
      <button
        className="context-menu-item context-menu-item-danger"
        onClick={() => {
          if (state.node) {
            onDelete(state.node);
          }
          onClose();
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
        Delete node
      </button>
    </div>
  );
}

// Toast Notification Component
function Toast({ state, onClose }: { state: ToastState; onClose: () => void }) {
  useEffect(() => {
    if (state.visible && !state.action) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [state.visible, state.action, onClose]);

  if (!state.visible) return null;

  return (
    <div className={`toast toast-${state.type}`}>
      <span>{state.message}</span>
      {state.action && (
        <button className="toast-action" onClick={state.action.onClick}>
          {state.action.label}
        </button>
      )}
      <button className="toast-close" onClick={onClose}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Command Palette Component
function CommandPalette({
  state,
  nodes,
  onClose,
  onSelectNode,
  onQueryChange,
  onNewNode,
}: {
  state: CommandPaletteState;
  nodes: GraphNodeData[];
  onClose: () => void;
  onSelectNode: (node: GraphNodeData) => void;
  onQueryChange: (query: string) => void;
  onNewNode: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Filter nodes based on query
  const filteredNodes = useMemo(() => {
    if (!state.query.trim()) return nodes.slice(0, 10);
    const lowerQuery = state.query.toLowerCase();
    return nodes
      .filter(node => node.title.toLowerCase().includes(lowerQuery))
      .slice(0, 10);
  }, [nodes, state.query]);

  // Reset selection when filtered results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [filteredNodes.length]);

  useEffect(() => {
    if (state.visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [state.visible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!state.visible) return;

      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filteredNodes.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredNodes[selectedIndex]) {
          onSelectNode(filteredNodes[selectedIndex]);
          onClose();
        } else if (state.query.trim()) {
          onNewNode();
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [state.visible, filteredNodes, selectedIndex, onClose, onSelectNode, onNewNode, state.query]);

  if (!state.visible) return null;

  return (
    <div className="command-palette-overlay" onClick={onClose}>
      <div className="command-palette" onClick={e => e.stopPropagation()}>
        <div className="command-palette-header">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Search nodes or type to create..."
            value={state.query}
            onChange={(e) => onQueryChange(e.target.value)}
          />
          <span className="command-palette-hint">esc to close</span>
        </div>
        <div className="command-palette-results">
          {filteredNodes.map((node, index) => (
            <button
              key={node.id}
              className={`command-palette-item ${index === selectedIndex ? 'selected' : ''}`}
              onClick={() => {
                onSelectNode(node);
                onClose();
              }}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              <div
                className="command-palette-item-dot"
                style={{ backgroundColor: node.color }}
              />
              <span className="command-palette-item-title">{node.title}</span>
              <span className="command-palette-item-status">{node.status}</span>
            </button>
          ))}
          {filteredNodes.length === 0 && state.query.trim() && (
            <button
              className="command-palette-item selected"
              onClick={() => {
                onNewNode();
                onClose();
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="command-palette-item-title">Create &quot;{state.query}&quot;</span>
            </button>
          )}
        </div>
        <div className="command-palette-footer">
          <span><kbd>up/down</kbd> navigate</span>
          <span><kbd>enter</kbd> select</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}

// Keyboard Shortcuts Help Panel
function KeyboardShortcutsHelp({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;

  return (
    <div className="shortcuts-help">
      <div className="shortcuts-help-header">
        <span>Keyboard Shortcuts</span>
        <button className="shortcuts-help-close" onClick={onClose}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
      <div className="shortcuts-help-list">
        <div className="shortcut-item">
          <kbd>Cmd</kbd>+<kbd>Z</kbd>
          <span>Undo last action</span>
        </div>
        <div className="shortcut-item">
          <kbd>Cmd</kbd>+<kbd>K</kbd>
          <span>Open command palette</span>
        </div>
        <div className="shortcut-item">
          <kbd>?</kbd>
          <span>Show this help</span>
        </div>
      </div>
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
// Filter Panel Component with search bar and map-mode toggles
function FilterPanel({
  searchQuery,
  onSearchChange,
  colorMode,
  onColorModeChange,
  matchCount,
  totalCount,
}: {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  matchCount: number;
  totalCount: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus search on Cmd+F / Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
      // Escape clears search when focused
      if (e.key === 'Escape' && document.activeElement === inputRef.current) {
        onSearchChange('');
        inputRef.current?.blur();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onSearchChange]);

  return (
    <div className="filter-panel">
      {/* Search bar */}
      <div className="filter-search-container">
        <svg className="filter-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8" />
          <path d="M21 21l-4.35-4.35" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="filter-search-input"
          placeholder="Filter nodes..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <>
            <span className="filter-search-count">
              {matchCount}/{totalCount}
            </span>
            <button
              className="filter-search-clear"
              onClick={() => onSearchChange('')}
              title="Clear search"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* Divider */}
      <div className="filter-divider" />

      {/* Map mode toggles */}
      <div className="filter-mode-group">
        <button
          className={`filter-mode-btn ${colorMode === 'category' ? 'active' : ''}`}
          onClick={() => onColorModeChange('category')}
          title="Color by category"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
          </svg>
        </button>
        <button
          className={`filter-mode-btn filter-mode-indegree ${colorMode === 'indegree' ? 'active' : ''}`}
          onClick={() => onColorModeChange('indegree')}
          title="Color by indegree (incoming connections)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
        <button
          className={`filter-mode-btn filter-mode-outdegree ${colorMode === 'outdegree' ? 'active' : ''}`}
          onClick={() => onColorModeChange('outdegree')}
          title="Color by outdegree (outgoing connections)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </button>
      </div>
    </div>
  );
}


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
  }, [data.edges, onCardDelete, showToast]);

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
    showToast(`Connected "${sourceNode?.title}" → "${targetNode?.title}"`, 'success');
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
      <Toast state={toast} onClose={hideToast} />

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
