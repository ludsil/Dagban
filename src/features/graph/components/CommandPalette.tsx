'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { CommandPaletteState, GraphNodeData } from '../types';

interface CommandPaletteProps {
  state: CommandPaletteState;
  nodes: GraphNodeData[];
  onClose: () => void;
  onSelectNode: (node: GraphNodeData) => void;
  onQueryChange: (query: string) => void;
  onNewNode: () => void;
}

export function CommandPalette({
  state,
  nodes,
  onClose,
  onSelectNode,
  onQueryChange,
  onNewNode,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevFilterLength, setPrevFilterLength] = useState(0);

  // Filter nodes based on query
  const filteredNodes = useMemo(() => {
    if (!state.query.trim()) return nodes.slice(0, 10);
    const lowerQuery = state.query.toLowerCase();
    return nodes
      .filter(node => node.title.toLowerCase().includes(lowerQuery))
      .slice(0, 10);
  }, [nodes, state.query]);

  // Reset selection when filtered results change (during render, not in effect)
  if (filteredNodes.length !== prevFilterLength) {
    setSelectedIndex(0);
    setPrevFilterLength(filteredNodes.length);
  }

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
