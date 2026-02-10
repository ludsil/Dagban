'use client';

import { useMemo, useRef, useEffect } from 'react';
import { ViewMode, DisplayMode, ColorMode, ArrowMode } from './types';
import { Card, Category, Edge } from '@/lib/types';

interface SettingsPanelProps {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  arrowMode: ArrowMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onArrowModeChange: (mode: ArrowMode) => void;
  cards?: Card[];
  selectedAssignees?: Set<string>;
  onAssigneeToggle?: (assignee: string) => void;
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
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === '/') {
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

  // Compute blocker counts
  const blockerCounts = useMemo(() => {
    if (!edges) return new Map<string, number>();
    const counts = new Map<string, number>();
    edges.forEach(edge => {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
    });
    return counts;
  }, [edges]);

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

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  // Map mode configs
  const mapModes: { mode: ColorMode; label: string; icon: React.ReactNode; color: string }[] = [
    {
      mode: 'category',
      label: 'Category',
      color: '#4ade80',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
    },
    {
      mode: 'indegree',
      label: 'Blockers',
      color: '#7dd3fc',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14" />
          <path d="M19 12l-7 7-7-7" />
        </svg>
      ),
    },
    {
      mode: 'outdegree',
      label: 'Impact',
      color: '#fdba74',
      icon: (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
      ),
    },
  ];

  return (
    <div className="settings-panel">
      {/* Search bar at top - most important */}
      {onSearchChange && (
        <div className="filter-panel-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="filter-panel-search-input"
            placeholder="Search nodes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button
              className="filter-panel-search-clear"
              onClick={() => onSearchChange('')}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <span className="filter-panel-search-hint">/</span>
        </div>
      )}

      {/* Map Mode - EU4 style buttons */}
      <div className="filter-panel-mapmode">
        <div className="filter-panel-mapmode-label">Map Mode</div>
        <div className="filter-panel-mapmode-buttons">
          {mapModes.map(({ mode, label, icon, color }) => (
            <button
              key={mode}
              className={`mapmode-btn ${colorMode === mode ? 'active' : ''}`}
              onClick={() => onColorModeChange(mode)}
              style={{ '--mapmode-color': color } as React.CSSProperties}
              title={label}
            >
              <span className="mapmode-btn-icon">{icon}</span>
              <span className="mapmode-btn-label">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* View Settings */}
      <div className="filter-panel-section">
        <div className="filter-panel-section-header">
          <span>View</span>
        </div>
        <div className="filter-panel-chips">
          {(['2D', '3D'] as ViewMode[]).map(mode => (
            <button
              key={mode}
              className={`filter-chip ${viewMode === mode ? 'selected' : ''}`}
              onClick={() => onViewModeChange(mode)}
            >
              <span className="filter-chip-label">{mode}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Display Settings */}
      <div className="filter-panel-section">
        <div className="filter-panel-section-header">
          <span>Display</span>
        </div>
        <div className="filter-panel-chips">
          {(['balls', 'labels', 'full'] as DisplayMode[]).map(mode => (
            <button
              key={mode}
              className={`filter-chip ${displayMode === mode ? 'selected' : ''}`}
              onClick={() => onDisplayModeChange(mode)}
            >
              <span className="filter-chip-label">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Arrows Settings */}
      <div className="filter-panel-section">
        <div className="filter-panel-section-header">
          <span>Arrows</span>
        </div>
        <div className="filter-panel-chips">
          {(['end', 'middle', 'none'] as ArrowMode[]).map(mode => (
            <button
              key={mode}
              className={`filter-chip ${arrowMode === mode ? 'selected' : ''}`}
              onClick={() => onArrowModeChange(mode)}
            >
              <span className="filter-chip-label">{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Category filter */}
      {categories && selectedCategories && onCategoryToggle && categories.length > 0 && (
        <div className="filter-panel-section">
          <div className="filter-panel-section-header">
            <span>Category</span>
            <span className="filter-panel-section-count">{categories.length}</span>
          </div>
          <div className="filter-panel-chips">
            {categories.map(category => (
              <button
                key={category.id}
                className={`filter-chip ${selectedCategories.has(category.id) ? 'selected' : ''}`}
                onClick={() => onCategoryToggle(category.id)}
                style={{ '--chip-color': category.color } as React.CSSProperties}
              >
                <span className="filter-chip-dot" style={{ backgroundColor: category.color }} />
                <span className="filter-chip-label">{category.name}</span>
                <span className="filter-chip-count">{categoryCounts.get(category.id) || 0}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Status filter */}
      {selectedStatuses && onStatusToggle && (
        <div className="filter-panel-section">
          <div className="filter-panel-section-header">
            <span>Status</span>
          </div>
          <div className="filter-panel-chips">
            {['active', 'blocked', 'done'].map(status => (
              <button
                key={status}
                className={`filter-chip status-${status} ${selectedStatuses?.has(status) ? 'selected' : ''}`}
                onClick={() => onStatusToggle(status)}
              >
                <span className="filter-chip-label">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Blocker rate filter */}
      {onBlockerThresholdChange && maxBlockerCount > 0 && (
        <div className="filter-panel-section">
          <div className="filter-panel-section-header">
            <span>Blocker Rate</span>
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
        </div>
      )}

      {/* Assignee filter */}
      {cards && selectedAssignees && onAssigneeToggle && (assignees.length > 0 || unassignedCount > 0) && (
        <div className="filter-panel-section">
          <div className="filter-panel-section-header">
            <span>Assignee</span>
            <span className="filter-panel-section-count">{assignees.length + (unassignedCount > 0 ? 1 : 0)}</span>
          </div>
          <div className="filter-panel-assignees">
            {assignees.map(assignee => (
              <button
                key={assignee}
                className={`filter-assignee ${selectedAssignees.has(assignee) ? 'selected' : ''}`}
                onClick={() => onAssigneeToggle(assignee)}
              >
                <div className="filter-assignee-avatar">
                  <span>{getInitials(assignee)}</span>
                </div>
                <span className="filter-assignee-name">{assignee}</span>
                <span className="filter-assignee-count">{assigneeCounts.get(assignee) || 0}</span>
              </button>
            ))}
            {unassignedCount > 0 && (
              <button
                className={`filter-assignee ${selectedAssignees.has('__unassigned__') ? 'selected' : ''}`}
                onClick={() => onAssigneeToggle('__unassigned__')}
              >
                <div className="filter-assignee-avatar unassigned">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M12 14c-4 0-7 2-7 4v2h14v-2c0-2-3-4-7-4z" />
                  </svg>
                </div>
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
