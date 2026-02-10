'use client';

import { useMemo, useRef, useEffect } from 'react';
import { ViewMode, DisplayMode, ColorMode, ArrowMode } from './types';
import { Card, Category, Edge } from '@/lib/types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface SettingsPanelProps {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  arrowMode: ArrowMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onArrowModeChange: (mode: ArrowMode) => void;
  // Assignee filter props
  cards?: Card[];
  selectedAssignees?: Set<string>;
  onAssigneeToggle?: (assignee: string) => void;
  // Extended filter props
  categories?: Category[];
  edges?: Edge[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  selectedCategories?: Set<string>;
  onCategoryToggle?: (categoryId: string) => void;
  selectedStatuses?: Set<string>;
  onStatusToggle?: (status: string) => void;
  blockerThreshold?: number;
  onBlockerThresholdChange?: (threshold: number) => void;
}

export function SettingsPanel({
  viewMode,
  displayMode,
  colorMode,
  arrowMode,
  onViewModeChange,
  onDisplayModeChange,
  onColorModeChange,
  onArrowModeChange,
  cards,
  selectedAssignees,
  onAssigneeToggle,
  categories,
  edges,
  searchQuery = '',
  onSearchChange,
  selectedCategories,
  onCategoryToggle,
  selectedStatuses,
  onStatusToggle,
  blockerThreshold = 0,
  onBlockerThresholdChange,
}: SettingsPanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Handle / key to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Extract unique assignees from cards
  const assignees = useMemo(() => {
    if (!cards) return [];
    const assigneeSet = new Set<string>();
    cards.forEach(card => {
      if (card.assignee) {
        assigneeSet.add(card.assignee);
      }
    });
    return Array.from(assigneeSet).sort((a, b) => a.localeCompare(b));
  }, [cards]);

  // Count cards per assignee
  const assigneeCounts = useMemo(() => {
    if (!cards) return new Map<string, number>();
    const counts = new Map<string, number>();
    cards.forEach(card => {
      if (card.assignee) {
        counts.set(card.assignee, (counts.get(card.assignee) || 0) + 1);
      }
    });
    return counts;
  }, [cards]);

  // Count unassigned cards
  const unassignedCount = useMemo(() => {
    if (!cards) return 0;
    return cards.filter(card => !card.assignee).length;
  }, [cards]);

  // Compute blocker counts (how many cards each card blocks = outdegree)
  const blockerCounts = useMemo(() => {
    if (!edges) return new Map<string, number>();
    const counts = new Map<string, number>();
    edges.forEach(edge => {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
    });
    return counts;
  }, [edges]);

  // Get max blocker count
  const maxBlockerCount = useMemo(() => {
    if (blockerCounts.size === 0) return 0;
    return Math.max(...blockerCounts.values());
  }, [blockerCounts]);

  // Count cards per category
  const categoryCounts = useMemo(() => {
    if (!cards || !categories) return new Map<string, number>();
    const counts = new Map<string, number>();
    cards.forEach(card => {
      counts.set(card.categoryId, (counts.get(card.categoryId) || 0) + 1);
    });
    return counts;
  }, [cards, categories]);

  // Count cards per status (active/blocked/done)
  const statusCounts = useMemo(() => {
    if (!cards || !edges) return { active: 0, blocked: 0, done: 0 };
    const counts = { active: 0, blocked: 0, done: 0 };
    cards.forEach(card => {
      const incomingEdges = edges.filter(e => e.target === card.id);
      const hasIncompleteIncoming = incomingEdges.some(e => e.progress < 100);
      if (hasIncompleteIncoming) {
        counts.blocked++;
      } else {
        const outgoingEdges = edges.filter(e => e.source === card.id);
        const allOutgoingComplete = outgoingEdges.length > 0 && outgoingEdges.every(e => e.progress >= 100);
        if (allOutgoingComplete) {
          counts.done++;
        } else {
          counts.active++;
        }
      }
    });
    return counts;
  }, [cards, edges]);

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };
  return (
    <div className="settings-panel">
      <div className="settings-row">
        <span className="settings-label">View</span>
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(value) => value && onViewModeChange(value as ViewMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="2D">2D</ToggleGroupItem>
          <ToggleGroupItem value="3D">3D</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="settings-row">
        <span className="settings-label">Display</span>
        <ToggleGroup
          type="single"
          value={displayMode}
          onValueChange={(value) => value && onDisplayModeChange(value as DisplayMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="balls">Balls</ToggleGroupItem>
          <ToggleGroupItem value="labels">Labels</ToggleGroupItem>
          <ToggleGroupItem value="full">Full</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="settings-row">
        <span className="settings-label">Color</span>
        <ToggleGroup
          type="single"
          value={colorMode}
          onValueChange={(value) => value && onColorModeChange(value as ColorMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="category">Category</ToggleGroupItem>
          <ToggleGroupItem value="indegree">Indegree</ToggleGroupItem>
          <ToggleGroupItem value="outdegree">Outdegree</ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="settings-row">
        <span className="settings-label">Arrows</span>
        <ToggleGroup
          type="single"
          value={arrowMode}
          onValueChange={(value) => value && onArrowModeChange(value as ArrowMode)}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="end">End</ToggleGroupItem>
          <ToggleGroupItem value="middle">Middle</ToggleGroupItem>
          <ToggleGroupItem value="none">None</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Search filter */}
      {onSearchChange && (
        <div className="filter-section">
          <div className="filter-section-header">
            <span className="filter-section-title">Search</span>
            <span className="filter-section-hint">/</span>
          </div>
          <input
            ref={searchInputRef}
            type="text"
            className="filter-search-input"
            placeholder="Filter nodes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
      )}

      {/* Category filter */}
      {categories && selectedCategories && onCategoryToggle && categories.length > 0 && (
        <div className="filter-section">
          <div className="filter-section-header">
            <span className="filter-section-title">Category</span>
            <span className="filter-section-count">{categories.length}</span>
          </div>
          <div className="filter-category-list">
            {categories.map(category => (
              <button
                key={category.id}
                className={`filter-category-item ${selectedCategories.has(category.id) ? 'selected' : ''}`}
                onClick={() => onCategoryToggle(category.id)}
              >
                <div className="filter-category-dot" style={{ backgroundColor: category.color }} />
                <span className="filter-category-name">{category.name}</span>
                <span className="filter-category-count">{categoryCounts.get(category.id) || 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status filter */}
      {selectedStatuses && onStatusToggle && (
        <div className="filter-section">
          <div className="filter-section-header">
            <span className="filter-section-title">Status</span>
            <span className="filter-section-count">3</span>
          </div>
          <div className="filter-status-list">
            <button
              className={`filter-status-item ${selectedStatuses.has('active') ? 'selected' : ''}`}
              onClick={() => onStatusToggle('active')}
            >
              <div className="filter-status-dot active" />
              <span className="filter-status-name">Active</span>
              <span className="filter-status-count">{statusCounts.active}</span>
            </button>
            <button
              className={`filter-status-item ${selectedStatuses.has('blocked') ? 'selected' : ''}`}
              onClick={() => onStatusToggle('blocked')}
            >
              <div className="filter-status-dot blocked" />
              <span className="filter-status-name">Blocked</span>
              <span className="filter-status-count">{statusCounts.blocked}</span>
            </button>
            <button
              className={`filter-status-item ${selectedStatuses.has('done') ? 'selected' : ''}`}
              onClick={() => onStatusToggle('done')}
            >
              <div className="filter-status-dot done" />
              <span className="filter-status-name">Done</span>
              <span className="filter-status-count">{statusCounts.done}</span>
            </button>
          </div>
        </div>
      )}

      {/* Blocker rate filter */}
      {onBlockerThresholdChange && maxBlockerCount > 0 && (
        <div className="filter-section">
          <div className="filter-section-header">
            <span className="filter-section-title">Blocker Rate</span>
            <span className="filter-section-value">≥{blockerThreshold}</span>
          </div>
          <div className="filter-slider-container">
            <input
              type="range"
              className="filter-slider"
              min={0}
              max={maxBlockerCount}
              value={blockerThreshold}
              onChange={(e) => onBlockerThresholdChange(parseInt(e.target.value))}
            />
            <div className="filter-slider-labels">
              <span>0</span>
              <span>{maxBlockerCount}</span>
            </div>
          </div>
          <div className="filter-slider-hint">
            Show nodes blocking ≥{blockerThreshold} others
          </div>
        </div>
      )}

      {/* Assignee filter section - full list with names and counts */}
      {cards && selectedAssignees && onAssigneeToggle && (assignees.length > 0 || unassignedCount > 0) && (
        <div className="filter-section">
          <div className="filter-section-header">
            <span className="filter-section-title">Assignee</span>
            <span className="filter-section-count">{assignees.length + (unassignedCount > 0 ? 1 : 0)}</span>
          </div>
          <div className="filter-assignee-list">
            {assignees.map(assignee => (
              <button
                key={assignee}
                className={`filter-assignee-item ${selectedAssignees.has(assignee) ? 'selected' : ''}`}
                onClick={() => onAssigneeToggle(assignee)}
              >
                <Avatar size="sm">
                  <AvatarFallback>{getInitials(assignee)}</AvatarFallback>
                </Avatar>
                <span className="filter-assignee-name">{assignee}</span>
                <span className="filter-assignee-count">{assigneeCounts.get(assignee) || 0}</span>
              </button>
            ))}
            {unassignedCount > 0 && (
              <button
                className={`filter-assignee-item ${selectedAssignees.has('__unassigned__') ? 'selected' : ''}`}
                onClick={() => onAssigneeToggle('__unassigned__')}
              >
                <Avatar size="sm">
                  <AvatarFallback>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="8" r="4" />
                      <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
                    </svg>
                  </AvatarFallback>
                </Avatar>
                <span className="filter-assignee-name">Unassigned</span>
                <span className="filter-assignee-count">{unassignedCount}</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
