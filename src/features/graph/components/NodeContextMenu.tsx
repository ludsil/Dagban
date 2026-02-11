'use client';

import { useEffect, useRef } from 'react';
import { NodeContextMenuState, GraphNodeData } from '../types';

interface NodeContextMenuProps {
  state: NodeContextMenuState;
  onClose: () => void;
  onCreateDownstream: (node: GraphNodeData) => void;
  onDelete: (node: GraphNodeData) => void;
}

export function NodeContextMenu({
  state,
  onClose,
  onCreateDownstream,
  onDelete,
}: NodeContextMenuProps) {
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
