'use client';

import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
import { Card, User } from '@/lib/types';
import { getContrastColors } from '@/lib/colors';
import { SelectedNodeInfo, GraphNodeData } from '../types';
import { Kbd } from '@/components/ui/kbd';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { UserAvatar } from './UserAvatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';

interface CardDetailPanelProps {
  selectedNode: SelectedNodeInfo;
  onClose: () => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onAssigneeChange?: (cardId: string, assigneeId: string | null) => void;
  users?: User[];
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
  onAssigneeChange,
  users = [],
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
  const [shiftHeld, setShiftHeld] = useState(false);
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);
  const colors = useMemo(() => getContrastColors(node.color), [node.color]);

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
    // Auto-resize title textarea to fit existing multi-line content
    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
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
  const panelWidth = 260;
  const panelHeight = 360;
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

  const assigneeUser = assignee ? userById.get(assignee) : undefined;
  const assigneeLabel = assigneeUser?.name || assignee;

  const handleAssigneeChange = useCallback((value: string) => {
    const nextAssignee = value === '__unassigned__' ? '' : value;
    setAssignee(nextAssignee);
    onAssigneeChange?.(card.id, nextAssignee ? nextAssignee : null);
    cardRef.current = { ...cardRef.current, assignee: nextAssignee || undefined };
  }, [card.id, onAssigneeChange]);

  return (
    <div
      ref={panelRef}
      className="postit-panel"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        backgroundColor: node.color,
        '--postit-title': colors.title,
        '--postit-body': colors.body,
        '--postit-muted': colors.muted,
        '--postit-action-border': colors.actionBorder,
        '--postit-action-text': colors.actionText,
        '--postit-badge-bg': colors.badgeBg,
      } as React.CSSProperties}
    >
      {/* Assignee avatar in top right corner */}
      <div className="postit-assignee-corner">
        <Select
          value={assignee || '__unassigned__'}
          onValueChange={handleAssigneeChange}
        >
          <SelectTrigger
            size="sm"
            className="h-6 w-6 rounded-full p-0 border-none shadow-none cursor-pointer focus:ring-0 focus:outline-none focus-visible:ring-0 focus-visible:outline-none [&>svg]:hidden"
            aria-label="Assign user"
          >
            <UserAvatar user={assigneeUser} name={assigneeLabel} size="sm" />
          </SelectTrigger>
          <SelectContent align="end" position="popper" className="min-w-[180px]">
            <SelectItem value="__unassigned__">
              <span className="flex items-center gap-2">
                <UserAvatar size="sm" showPlaceholderIcon />
                <span>Unassigned</span>
              </span>
            </SelectItem>
            {users.map(user => (
              <SelectItem key={user.id} value={user.id}>
                <span className="flex items-center gap-2">
                  <UserAvatar user={user} size="sm" />
                  <span>{user.name}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className={`postit-action-icon${shiftHeld ? ' shift-active' : ''}`}
                onClick={handleAddTask}
              >
                <ArrowUp className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              <p>{shiftHeld ? 'Link existing downstream task' : 'Add downstream task'}</p>
            </TooltipContent>
          </Tooltip>
          <Tooltip delayDuration={100}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className={`postit-action-icon${shiftHeld ? ' shift-active' : ''}`}
                onClick={handleAddDep}
              >
                <ArrowDown className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={8}>
              <p>{shiftHeld ? 'Link existing dependency' : 'Add dependency'}</p>
            </TooltipContent>
          </Tooltip>
          <Kbd className="postit-kbd-hint">⇧</Kbd>
        </div>
        <div className="postit-actions-right">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                className="postit-delete-icon"
                onClick={handleDelete}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Delete node</p>
            </TooltipContent>
          </Tooltip>
          <div className="postit-status-badge">
            {node.status}
          </div>
        </div>
      </div>
    </div>
  );
}
