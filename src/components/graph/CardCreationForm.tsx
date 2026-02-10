'use client';

import { useEffect, useRef } from 'react';
import { CardCreationState } from './types';

interface CardCreationFormProps {
  state: CardCreationState;
  onClose: () => void;
  onSubmit: () => void;
  onTitleChange: (title: string) => void;
  onDescriptionChange: (description: string) => void;
}

export function CardCreationForm({
  state,
  onClose,
  onSubmit,
  onTitleChange,
  onDescriptionChange,
}: CardCreationFormProps) {
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
