'use client';

import { useEffect, useRef } from 'react';
import { CardCreationState } from './types';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { X } from 'lucide-react';

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
        <Button variant="ghost" size="icon-xs" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {/* Title - large, editable */}
      <Textarea
        ref={titleRef}
        className="postit-title border-none shadow-none resize-none min-h-0 p-0 text-lg font-semibold focus-visible:ring-0"
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
      <Textarea
        className="postit-content border-none shadow-none resize-none min-h-[80px] p-0 focus-visible:ring-0"
        value={state.description}
        onChange={(e) => onDescriptionChange(e.target.value)}
        placeholder="Add notes..."
      />

      {/* Bottom action bar */}
      <div className="postit-actions">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={onSubmit}
          disabled={!state.title.trim()}
        >
          Create
        </Button>
      </div>
    </div>
  );
}
