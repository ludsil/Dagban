'use client';

import { useCallback, useEffect, useRef, useState, useMemo, type CSSProperties } from 'react';
import { Card, User, Category } from '@/lib/types';
import { getContrastColors } from '@/lib/colors';
import { SelectedNodeInfo, GraphNodeData } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from './UserAvatar';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
} from '@/components/ui/select';
import {
  ArrowDown,
  ArrowUp,
  Bot,
  Check,
  Link,
  Play,
  RotateCcw,
  Square,
  Trash2,
  XCircle,
} from 'lucide-react';
import { CategoryManager } from './CategoryManager';

type AgentType = 'claude-code' | 'codex' | 'cline' | 'aider' | 'custom';

interface CardDetailPanelProps {
  selectedNode: SelectedNodeInfo;
  onClose: () => void;
  onCardChange?: (cardId: string, updates: Partial<Card>) => void;
  onAssigneeChange?: (cardId: string, assigneeId: string | null) => void;
  users?: User[];
  categories?: Category[];
  onCreateDownstream?: (parentNode: GraphNodeData) => void;
  onCreateUpstream?: (childNode: GraphNodeData) => void;
  onLinkDownstream?: (sourceNode: GraphNodeData) => void;
  onLinkUpstream?: (targetNode: GraphNodeData) => void;
  onDelete?: (node: GraphNodeData) => void;
  onCategoryAdd?: (category: Category) => void;
  onCategoryDelete?: (categoryId: string) => void;
  onCategoryChange?: (categoryId: string, updates: Partial<Category>) => void;
  onAssignAgent?: (cardId: string, agentConfig: NonNullable<Card['agentConfig']>) => void;
  onClearAgent?: (cardId: string) => void;
  onStartAgent?: (cardId: string) => void;
  onStopAgent?: (cardId: string) => void;
  onRequestAgentChanges?: (cardId: string, feedback: string) => void;
  onApproveAgent?: (cardId: string) => void;
  onRejectAgent?: (cardId: string, reason?: string) => void;
  bridgeConnected?: boolean;
}

function formatAgentStatus(status?: Card['agentStatus']): string {
  if (!status) return 'idle';
  return status.replace('-', ' ');
}

function normalizeWorkerType(card: Card): 'human' | 'agent' {
  if (card.workerType) return card.workerType;
  return card.agentConfig ? 'agent' : 'human';
}

export function CardDetailPanel({
  selectedNode,
  onClose,
  onCardChange,
  onAssigneeChange,
  users = [],
  categories = [],
  onCreateDownstream,
  onCreateUpstream,
  onLinkDownstream,
  onLinkUpstream,
  onDelete,
  onCategoryAdd,
  onCategoryDelete,
  onCategoryChange,
  onAssignAgent,
  onClearAgent,
  onStartAgent,
  onStopAgent,
  onRequestAgentChanges,
  onApproveAgent,
  onRejectAgent,
  bridgeConnected = false,
}: CardDetailPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const { node, screenX, screenY } = selectedNode;
  const card = node.card;

  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description || '');
  const [assignee, setAssignee] = useState(card.assignee || '');
  const [shiftHeld, setShiftHeld] = useState(false);
  const [localCategoryId, setLocalCategoryId] = useState(card.categoryId);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [workerType, setWorkerType] = useState<'human' | 'agent'>(() => normalizeWorkerType(card));
  const [agentType, setAgentType] = useState<AgentType>(() => card.agentConfig?.type ?? 'codex');
  const [agentCommand, setAgentCommand] = useState(card.agentConfig?.command ?? '');
  const [agentModel, setAgentModel] = useState(card.agentConfig?.model ?? '');
  const [reviewFeedback, setReviewFeedback] = useState('');

  const isHoly = title.trimEnd().endsWith('!!!');
  const userById = useMemo(() => new Map(users.map(user => [user.id, user])), [users]);

  const isBurnt = Boolean(card.burntAt);
  const BURNT_COLOR = '#111827';
  const currentColor = useMemo(() => {
    if (isBurnt) return BURNT_COLOR;
    const cat = categories.find(c => c.id === localCategoryId);
    return cat?.color || node.color;
  }, [isBurnt, localCategoryId, categories, node.color]);
  const colors = useMemo(() => getContrastColors(currentColor), [currentColor]);

  const agentStatus = card.agentStatus ?? 'idle';

  useEffect(() => {
    setWorkerType(normalizeWorkerType(card));
  }, [card.workerType, card.agentConfig]);

  useEffect(() => {
    setAgentType(card.agentConfig?.type ?? 'codex');
    setAgentCommand(card.agentConfig?.command ?? '');
    setAgentModel(card.agentConfig?.model ?? '');
  }, [card.agentConfig]);

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

  const stateRef = useRef({ title, description, assignee });
  const cardRef = useRef(card);
  const onCardChangeRef = useRef(onCardChange);

  useEffect(() => {
    stateRef.current = { title, description, assignee };
  }, [title, description, assignee]);

  useEffect(() => {
    cardRef.current = card;
  }, [card]);

  useEffect(() => {
    onCardChangeRef.current = onCardChange;
  }, [onCardChange]);

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
  }, []);

  useEffect(() => {
    if (!card.title && titleRef.current) {
      titleRef.current.focus();
    } else if (descriptionRef.current) {
      descriptionRef.current.focus();
      descriptionRef.current.setSelectionRange(
        descriptionRef.current.value.length,
        descriptionRef.current.value.length
      );
    }

    if (titleRef.current) {
      titleRef.current.style.height = 'auto';
      titleRef.current.style.height = titleRef.current.scrollHeight + 'px';
    }
  }, [card.title]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

      if (e.key === 'Escape') {
        saveChanges();
        onClose();
      }
      if (e.key === 'Enter' && !e.shiftKey && !isTyping) {
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

  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current?.contains(target)) return;
      if (target.closest('[data-radix-popper-content-wrapper]') || target.closest('[data-radix-select-content]') || target.closest('[data-slot="dialog-overlay"]') || target.closest('[data-slot="dialog-content"]')) return;
      saveChanges();
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [saveChanges, onClose]);

  const buildAgentConfig = useCallback((nextType: AgentType = agentType, nextCommand: string = agentCommand, nextModel: string = agentModel) => {
    return {
      type: nextType,
      command: nextType === 'custom' ? (nextCommand.trim() || undefined) : undefined,
      model: nextModel.trim() || undefined,
    };
  }, [agentType, agentCommand, agentModel]);

  const commitAgentConfig = useCallback((nextType?: AgentType, nextCommand?: string, nextModel?: string) => {
    const config = buildAgentConfig(nextType, nextCommand, nextModel);
    onAssignAgent?.(card.id, config);
  }, [buildAgentConfig, card.id, onAssignAgent]);

  const handleWorkerTypeChange = useCallback((value: string) => {
    if (value === 'human') {
      setWorkerType('human');
      onClearAgent?.(card.id);
      return;
    }

    setWorkerType('agent');
    commitAgentConfig();
  }, [card.id, commitAgentConfig, onClearAgent]);

  const handleAddTask = useCallback((e: React.MouseEvent) => {
    saveChanges();
    onClose();
    if (e.shiftKey && onLinkDownstream) {
      onLinkDownstream(node);
    } else if (onCreateDownstream) {
      onCreateDownstream(node);
    }
  }, [saveChanges, onClose, onCreateDownstream, onLinkDownstream, node]);

  const handleAddDep = useCallback((e: React.MouseEvent) => {
    saveChanges();
    onClose();
    if (e.shiftKey && onLinkUpstream) {
      onLinkUpstream(node);
    } else if (onCreateUpstream) {
      onCreateUpstream(node);
    }
  }, [saveChanges, onClose, onCreateUpstream, onLinkUpstream, node]);

  const handleDelete = useCallback(() => {
    onClose();
    if (onDelete) {
      onDelete(node);
    }
  }, [onClose, onDelete, node]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setTitle(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = e.target.scrollHeight + 'px';
  };

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

  const handleCategoryChange = useCallback((value: string) => {
    setLocalCategoryId(value);
    onCardChange?.(card.id, { categoryId: value });
  }, [card.id, onCardChange]);

  const handleStartAgent = useCallback(() => {
    saveChanges();
    onStartAgent?.(card.id);
  }, [card.id, onStartAgent, saveChanges]);

  const handleStopAgent = useCallback(() => {
    onStopAgent?.(card.id);
  }, [card.id, onStopAgent]);

  const handleApproveAgent = useCallback(() => {
    onApproveAgent?.(card.id);
  }, [card.id, onApproveAgent]);

  const handleRejectAgent = useCallback(() => {
    onRejectAgent?.(card.id, reviewFeedback.trim() || undefined);
  }, [card.id, onRejectAgent, reviewFeedback]);

  const handleRequestChanges = useCallback(() => {
    onRequestAgentChanges?.(card.id, reviewFeedback);
  }, [card.id, onRequestAgentChanges, reviewFeedback]);

  const currentCategory = categories.find(c => c.id === localCategoryId);

  const panelWidth = 300;
  const panelHeight = workerType === 'agent'
    ? (agentStatus === 'awaiting-review' ? 620 : 520)
    : 420;
  const offset = 20;

  let left = screenX + offset;
  let top = screenY - panelHeight / 2;

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

  return (
    <>
      <div
        ref={panelRef}
        className="postit-panel"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${panelWidth}px`,
          backgroundColor: currentColor,
          '--postit-title': colors.title,
          '--postit-body': colors.body,
          '--postit-muted': colors.muted,
          '--postit-action-border': colors.actionBorder,
          '--postit-action-text': colors.actionText,
          '--postit-badge-bg': colors.badgeBg,
        } as CSSProperties}
      >
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
            <SelectContent align="end" position="popper" className="postit-select-content min-w-[180px]">
              <SelectItem value="__unassigned__">
                <span className="flex items-center gap-2">
                  <UserAvatar size="sm" showPlaceholderIcon />
                  <span>Unassigned</span>
                </span>
              </SelectItem>
              <SelectSeparator />
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

        <Textarea
          ref={titleRef}
          className={`postit-title min-h-0 border-none shadow-none px-[14px] py-0 pt-[18px] pr-[56px] focus-visible:ring-0${isHoly ? ' postit-title-holy' : ''}`}
          value={title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          rows={1}
        />

        <Textarea
          ref={descriptionRef}
          className="postit-content min-h-[112px] border-none shadow-none px-[14px] py-0 pb-[10px] focus-visible:ring-0"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Add notes..."
        />

        <div className="postit-worker-section">
          <div className="postit-worker-row">
            <span className="postit-worker-label">Worker</span>
            <Select value={workerType} onValueChange={handleWorkerTypeChange}>
              <SelectTrigger size="sm" className="postit-worker-select">
                <span className="flex items-center gap-1.5">
                  <Bot className="size-3" />
                  <span>{workerType === 'agent' ? 'Agent' : 'Human'}</span>
                </span>
              </SelectTrigger>
              <SelectContent className="postit-select-content" align="end">
                <SelectItem value="human">Human</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {workerType === 'agent' && (
            <>
              <div className="postit-worker-row">
                <span className="postit-worker-label">Agent</span>
                <Select
                  value={agentType}
                  onValueChange={(value) => {
                    const nextType = value as AgentType;
                    setAgentType(nextType);
                    commitAgentConfig(nextType, agentCommand, agentModel);
                  }}
                >
                  <SelectTrigger size="sm" className="postit-worker-select">
                    <span>{agentType}</span>
                  </SelectTrigger>
                  <SelectContent className="postit-select-content" align="end">
                    <SelectItem value="codex">codex</SelectItem>
                    <SelectItem value="claude-code">claude-code</SelectItem>
                    <SelectItem value="cline">cline</SelectItem>
                    <SelectItem value="aider">aider</SelectItem>
                    <SelectItem value="custom">custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {agentType === 'custom' && (
                <Input
                  value={agentCommand}
                  onChange={(event) => setAgentCommand(event.target.value)}
                  onBlur={() => commitAgentConfig(agentType, agentCommand, agentModel)}
                  placeholder="Custom command"
                  className="postit-worker-input"
                />
              )}

              <Input
                value={agentModel}
                onChange={(event) => setAgentModel(event.target.value)}
                onBlur={() => commitAgentConfig(agentType, agentCommand, agentModel)}
                placeholder="Model (optional)"
                className="postit-worker-input"
              />

              <div className="postit-agent-status-row">
                <span className={`postit-agent-status ${agentStatus}`}>{formatAgentStatus(agentStatus)}</span>
                <span className={`postit-bridge-pill ${bridgeConnected ? 'connected' : 'disconnected'}`}>
                  {bridgeConnected ? 'bridge on' : 'bridge off'}
                </span>
              </div>

              <div className="postit-agent-actions">
                {(agentStatus === 'idle' || agentStatus === 'rejected') && (
                  <Button
                    variant="default"
                    size="xs"
                    className="postit-agent-btn"
                    onClick={handleStartAgent}
                  >
                    <Play className="size-3" />
                    <span>Start Agent</span>
                  </Button>
                )}

                {agentStatus === 'running' && (
                  <Button
                    variant="outline"
                    size="xs"
                    className="postit-agent-btn"
                    onClick={handleStopAgent}
                  >
                    <Square className="size-3" />
                    <span>Stop Agent</span>
                  </Button>
                )}

                {agentStatus === 'awaiting-review' && (
                  <>
                    <Textarea
                      value={reviewFeedback}
                      onChange={(event) => setReviewFeedback(event.target.value)}
                      placeholder="Review feedback"
                      className="postit-review-feedback"
                    />
                    <div className="postit-review-actions">
                      <Button
                        variant="default"
                        size="xs"
                        className="postit-agent-btn"
                        onClick={handleApproveAgent}
                      >
                        <Check className="size-3" />
                        <span>Approve</span>
                      </Button>
                      <Button
                        variant="secondary"
                        size="xs"
                        className="postit-agent-btn"
                        onClick={handleRequestChanges}
                      >
                        <RotateCcw className="size-3" />
                        <span>Request Changes</span>
                      </Button>
                      <Button
                        variant="destructive"
                        size="xs"
                        className="postit-agent-btn"
                        onClick={handleRejectAgent}
                      >
                        <XCircle className="size-3" />
                        <span>Reject</span>
                      </Button>
                    </div>
                  </>
                )}

                {agentStatus === 'approved' && (
                  <div className="postit-agent-approved">Approved and ready to burn.</div>
                )}
              </div>

              {card.agentBranch && (
                <div className="postit-agent-meta">Branch: {card.agentBranch}</div>
              )}
              {card.agentSessionId && (
                <div className="postit-agent-meta">Session: {card.agentSessionId}</div>
              )}
            </>
          )}
        </div>

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
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <span className="postit-shift-hint">
                  <span>⇧</span>
                  <Link className="size-2.5" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8}>
                <p>Hold Shift to link existing nodes</p>
              </TooltipContent>
            </Tooltip>
          </div>
          <div className="postit-actions-right">
            <Tooltip delayDuration={100}>
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
            <Button
              variant="ghost"
              size="xs"
              className="postit-category-trigger"
              aria-label="Change category"
              onClick={() => setShowCategoryManager(true)}
            >
              <span className="postit-category-label">
                {currentCategory?.name || 'Category'}
              </span>
            </Button>
          </div>
        </div>
      </div>

      <CategoryManager
        visible={showCategoryManager}
        onClose={() => setShowCategoryManager(false)}
        categories={categories}
        onCategoryAdd={onCategoryAdd}
        onCategoryDelete={onCategoryDelete}
        onCategoryChange={onCategoryChange}
        selectedCategoryId={localCategoryId}
        onSelect={handleCategoryChange}
      />
    </>
  );
}
