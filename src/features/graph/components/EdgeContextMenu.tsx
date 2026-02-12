'use client';

import { useEffect, useRef } from 'react';
import { EdgeContextMenuState } from '../types';

interface EdgeContextMenuProps {
  state: EdgeContextMenuState;
  traverserId: string | null;
  onClose: () => void;
  onAssign: (edgeId: string, anchor: { x: number; y: number }) => void;
  onDetach: (traverserId: string) => void;
  onDelete: (edgeId: string) => void;
}

export function EdgeContextMenu({
  state,
  traverserId,
  onClose,
  onAssign,
  onDetach,
  onDelete,
}: EdgeContextMenuProps) {
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

  if (!state.visible || !state.edgeId) return null;

  const edgeId = state.edgeId;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{
        left: `${state.x}px`,
        top: `${state.y}px`,
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {traverserId ? (
        <button
          className="context-menu-item"
          onClick={() => {
            onDetach(traverserId);
            onClose();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M8 12h8" />
            <path d="M5 12h1" />
            <path d="M18 12h1" />
            <path d="M4 8h3a3 3 0 0 1 3 3v2a3 3 0 0 1-3 3H4" />
            <path d="M20 8h-3a3 3 0 0 0-3 3v2a3 3 0 0 0 3 3h3" />
          </svg>
          Detach traverser
        </button>
      ) : (
        <button
          className="context-menu-item"
          onClick={() => {
            onAssign(edgeId, { x: state.containerX, y: state.containerY });
            onClose();
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M16 11c1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3 1.34 3 3 3z" />
            <path d="M6 11c1.66 0 3-1.34 3-3S7.66 5 6 5 3 6.34 3 8s1.34 3 3 3z" />
            <path d="M6 13c-2.21 0-4 1.79-4 4v2h8v-2c0-2.21-1.79-4-4-4z" />
            <path d="M16 13c-1.1 0-2.1.44-2.83 1.17" />
            <path d="M19 16h4" />
            <path d="M21 14v4" />
          </svg>
          Assign traverser
        </button>
      )}
      <button
        className="context-menu-item context-menu-item-danger"
        onClick={() => {
          onDelete(edgeId);
          onClose();
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
        </svg>
        Delete edge
      </button>
    </div>
  );
}
