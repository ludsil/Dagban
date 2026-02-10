'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Card, placeholderUsers } from '@/lib/types';
import { SelectedNodeInfo, GraphNodeData } from './types';
import { Kbd } from '@/components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface CardDetailPanelProps {
  selectedNode: SelectedNodeInfo;
  onClose: () => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onCreateDownstream?: (parentNode: GraphNodeData) => void;
  onCreateUpstream?: (childNode: GraphNodeData) => void;
  onLinkDownstream?: (sourceNode: GraphNodeData) => void;
  onLinkUpstream?: (targetNode: GraphNodeData) => void;
  onDelete?: (node: GraphNodeData) => void;
}

export function CardDetailPanel({
  selectedNode,
  onClose,
  onCardChange,
  onCreateDownstream,
  onCreateUpstream,
  onLinkDownstream,
  onLinkUpstream,
  onDelete,
}: CardDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const { node, screenX, screenY } = selectedNode;
  const card = node.card;

  // Local state for editing
  // Note: Component is keyed by card.id in DagbanGraph, so state is reset on card change
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [assignee, setAssignee] = useState(card.assignee || '');
  const [showAssigneeInput, setShowAssigneeInput] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);

  // Track shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Refs to track latest values for unmount save (closures capture stale state)
  const stateRef = useRef({ title, description, assignee });
  const cardRef = useRef(card);
  const onCardChangeRef = useRef(onCardChange);

  // Keep refs updated with latest values
  useEffect(() => {
    stateRef.current = { title, description, assignee };
  }, [title, description, assignee]);

  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  useEffect(() => {
    onCardChangeRef.current = onCardChange;
  }, [onCardChange]);

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

  // Save changes when component unmounts (e.g., when clicking another card)
  useEffect(() => {
    return () => {
      const { title, description, assignee } = stateRef.current;
      const card = cardRef.current;
      const onCardChange = onCardChangeRef.current;

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
    };
  }, []); // Empty deps - runs only on unmount

  // Focus on open: title if new/empty, description end if existing
  useEffect(() => {
    if (!card.title && titleRef.current) {
      // New card - focus title
      titleRef.current.focus();
    } else if (descriptionRef.current) {
      // Existing card - focus description and move cursor to end
      descriptionRef.current.focus();
      descriptionRef.current.setSelectionRange(
        descriptionRef.current.value.length,
        descriptionRef.current.value.length
      );
    }
  }, [card.title]);

  // Handle Escape and Enter keys to close panel
  // Note: Click outside is handled by onBackgroundClick in DagbanGraph
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        saveChanges();
        onClose();
      }
      // Enter closes panel (Shift+Enter for newlines is handled on textarea)
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        saveChanges();
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
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

  // Handle Delete button
  const handleDelete = useCallback(() => {
    onClose();
    if (onDelete) {
      onDelete(node);
    }
  }, [onClose, onDelete, node]);

  // Calculate panel position - position to the right of the node, or left if near edge
  const panelWidth = 340;
  const panelHeight = 320;
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

  // Handle Enter key in title - save and close (no newlines allowed)
  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveChanges();
      onClose();
    }
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
        onKeyDown={handleTitleKeyDown}
        placeholder="Untitled"
        rows={1}
      />

      {/* Free text area */}
      <textarea
        ref={descriptionRef}
        className="postit-content"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add notes..."
      />

      {/* Bottom action bar */}
      <div className="postit-actions">
        <div className="postit-actions-left">
          <button
            className={`postit-action-btn ${shiftHeld ? 'shift-active' : ''}`}
            onClick={handleAddTask}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span>Add task</span>
          </button>
          <button
            className={`postit-action-btn ${shiftHeld ? 'shift-active' : ''}`}
            onClick={handleAddDep}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
            <span>Add dep</span>
          </button>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <button type="button" className="postit-kbd-wrapper">
                <Kbd>⇧</Kbd>
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              <p>Hold Shift to link to existing node</p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div className="postit-actions-right">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="postit-delete-icon"
                onClick={handleDelete}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                </svg>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete node</p>
            </TooltipContent>
          </Tooltip>
          <div className="postit-status-badge" style={{ backgroundColor: node.color }}>
            {node.status}
          </div>
        </div>
      </div>
    </div>
  );
}
