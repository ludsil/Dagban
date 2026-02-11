'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { ViewMode, DisplayMode, ColorMode, ArrowMode } from './types';
import { Card, Category, Edge } from '@/lib/types';

interface SettingsPanelProps {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  arrowMode: ArrowMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  nodeRadius: number;
  onNodeRadiusChange: (radius: number) => void;
  onColorModeChange: (mode: ColorMode) => void;
  onArrowModeChange: (mode: ArrowMode) => void;
  devDatasetMode?: 'sample' | 'miserables';
  onDevDatasetModeChange?: (mode: 'sample' | 'miserables') => void;
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
  nodeRadius,
  onNodeRadiusChange,
  onColorModeChange,
  onArrowModeChange,
  devDatasetMode,
  onDevDatasetModeChange,
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (section: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

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

  return (
    <div className="settings-panel">
      {/* Search bar at top */}
      {onSearchChange && (
        <div className="settings-search">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className="settings-search-input"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button className="settings-search-clear" onClick={() => onSearchChange('')}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <span className="settings-search-hint">/</span>
        </div>
      )}

      <div className="settings-row">
        <span className="settings-label">View</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${viewMode === '2D' ? 'active' : ''}`}
            onClick={() => onViewModeChange('2D')}
          >
            2D
          </button>
          <button
            className={`toggle-btn ${viewMode === '3D' ? 'active' : ''}`}
            onClick={() => onViewModeChange('3D')}
          >
            3D
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Display</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${displayMode === 'balls' ? 'active' : ''}`}
            onClick={() => onDisplayModeChange('balls')}
          >
            Balls
          </button>
          <button
            className={`toggle-btn ${displayMode === 'labels' ? 'active' : ''}`}
            onClick={() => onDisplayModeChange('labels')}
          >
            Labels
          </button>
          <button
            className={`toggle-btn ${displayMode === 'full' ? 'active' : ''}`}
            onClick={() => onDisplayModeChange('full')}
          >
            Full
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Node Size</span>
        <div className="toggle-group">
          {[4, 5, 6, 7, 8].map(size => (
            <button
              key={size}
              className={`toggle-btn ${nodeRadius === size ? 'active' : ''}`}
              onClick={() => onNodeRadiusChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Color</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${colorMode === 'category' ? 'active' : ''}`}
            onClick={() => onColorModeChange('category')}
          >
            Category
          </button>
          <button
            className={`toggle-btn toggle-btn-indegree ${colorMode === 'indegree' ? 'active' : ''}`}
            onClick={() => onColorModeChange('indegree')}
            title="How many dependencies block this node"
          >
            Indegree
          </button>
          <button
            className={`toggle-btn toggle-btn-outdegree ${colorMode === 'outdegree' ? 'active' : ''}`}
            onClick={() => onColorModeChange('outdegree')}
            title="How many nodes this one blocks"
          >
            Outdegree
          </button>
        </div>
      </div>
      <div className="settings-row">
        <span className="settings-label">Arrows</span>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${arrowMode === 'end' ? 'active' : ''}`}
            onClick={() => onArrowModeChange('end')}
          >
            End
          </button>
          <button
            className={`toggle-btn ${arrowMode === 'middle' ? 'active' : ''}`}
            onClick={() => onArrowModeChange('middle')}
          >
            Middle
          </button>
          <button
            className={`toggle-btn ${arrowMode === 'none' ? 'active' : ''}`}
            onClick={() => onArrowModeChange('none')}
          >
            None
          </button>
        </div>
      </div>
      {devDatasetMode && onDevDatasetModeChange && (
        <div className="settings-row">
          <span className="settings-label">Dataset</span>
          <div className="toggle-group">
            <button
              className={`toggle-btn ${devDatasetMode === 'sample' ? 'active' : ''}`}
              onClick={() => onDevDatasetModeChange('sample')}
            >
              Sample
            </button>
            <button
              className={`toggle-btn ${devDatasetMode === 'miserables' ? 'active' : ''}`}
              onClick={() => onDevDatasetModeChange('miserables')}
            >
              Miserables
            </button>
          </div>
        </div>
      )}

      {/* Category filter */}
      {categories && selectedCategories && onCategoryToggle && categories.length > 0 && (
        <div className="filter-section">
          <div className="filter-section-header" onClick={() => toggleSection('category')}>
            <span className="filter-section-title">Category</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="filter-section-count">{categories.length}</span>
              <svg className={`filter-section-toggle ${collapsedSections.has('category') ? 'collapsed' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className={`filter-section-content ${collapsedSections.has('category') ? 'collapsed' : ''}`}>
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
        </div>
      )}

      {/* Status filter */}
      {selectedStatuses && onStatusToggle && (
        <div className="filter-section">
          <div className="filter-section-header" onClick={() => toggleSection('status')}>
            <span className="filter-section-title">Status</span>
            <svg className={`filter-section-toggle ${collapsedSections.has('status') ? 'collapsed' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </div>
          <div className={`filter-section-content ${collapsedSections.has('status') ? 'collapsed' : ''}`}>
            <div className="filter-status-list">
              <button
                className={`filter-status-item ${selectedStatuses.has('active') ? 'selected' : ''}`}
                onClick={() => onStatusToggle('active')}
              >
                <div className="filter-status-dot active" />
                <span className="filter-status-name">Active</span>
              </button>
              <button
                className={`filter-status-item ${selectedStatuses.has('blocked') ? 'selected' : ''}`}
                onClick={() => onStatusToggle('blocked')}
              >
                <div className="filter-status-dot blocked" />
                <span className="filter-status-name">Blocked</span>
              </button>
              <button
                className={`filter-status-item ${selectedStatuses.has('done') ? 'selected' : ''}`}
                onClick={() => onStatusToggle('done')}
              >
                <div className="filter-status-dot done" />
                <span className="filter-status-name">Done</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Blocker rate filter */}
      {onBlockerThresholdChange && maxBlockerCount > 0 && (
        <div className="filter-section">
          <div className="filter-section-header" onClick={() => toggleSection('blocker')}>
            <span className="filter-section-title">Blocker Rate</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="filter-section-value">≥{blockerThreshold}</span>
              <svg className={`filter-section-toggle ${collapsedSections.has('blocker') ? 'collapsed' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className={`filter-section-content ${collapsedSections.has('blocker') ? 'collapsed' : ''}`}>
            <div className="filter-slider-container">
              <input
                type="range"
                className="filter-slider"
                min={0}
                max={maxBlockerCount}
                value={blockerThreshold}
                onChange={(e) => onBlockerThresholdChange(parseInt(e.target.value))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Assignee filter */}
      {cards && selectedAssignees && onAssigneeToggle && (assignees.length > 0 || unassignedCount > 0) && (
        <div className="filter-section">
          <div className="filter-section-header" onClick={() => toggleSection('assignee')}>
            <span className="filter-section-title">Assignee</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="filter-section-count">{assignees.length + (unassignedCount > 0 ? 1 : 0)}</span>
              <svg className={`filter-section-toggle ${collapsedSections.has('assignee') ? 'collapsed' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </div>
          </div>
          <div className={`filter-section-content ${collapsedSections.has('assignee') ? 'collapsed' : ''}`}>
            <div className="filter-assignee-list">
              {assignees.map(assignee => (
                <button
                  key={assignee}
                  className={`filter-assignee-item ${selectedAssignees.has(assignee) ? 'selected' : ''}`}
                  onClick={() => onAssigneeToggle(assignee)}
                >
                  <div className="filter-assignee-avatar">
                    <span className="filter-assignee-initials">{getInitials(assignee)}</span>
                  </div>
                  <span className="filter-assignee-name">{assignee}</span>
                  <span className="filter-assignee-count">{assigneeCounts.get(assignee) || 0}</span>
                </button>
              ))}
              {unassignedCount > 0 && (
                <button
                  className={`filter-assignee-item ${selectedAssignees.has('__unassigned__') ? 'selected' : ''}`}
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
        </div>
      )}
    </div>
  );
}
