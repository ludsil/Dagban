'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Category } from '@/lib/types';
import { ColorMode } from '../types';

interface FilterPanelProps {
  cards: Card[];
  categories: Category[];
  colorMode: ColorMode;
  onColorModeChange: (mode: ColorMode) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategories: Set<string>;
  onCategoryToggle: (categoryId: string) => void;
  selectedAssignees: Set<string>;
  onAssigneeToggle: (assignee: string) => void;
  selectedStatuses: Set<string>;
  onStatusToggle: (status: string) => void;
  onClearFilters: () => void;
}

export function FilterPanel({
  cards,
  categories,
  colorMode,
  onColorModeChange,
  searchQuery,
  onSearchChange,
  selectedCategories,
  onCategoryToggle,
  selectedAssignees,
  onAssigneeToggle,
  selectedStatuses,
  onStatusToggle,
  onClearFilters,
}: FilterPanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Extract unique assignees from cards
  const assignees = useMemo(() => {
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
    return cards.filter(card => !card.assignee).length;
  }, [cards]);

  // Count by category
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    cards.forEach(card => {
      counts.set(card.categoryId, (counts.get(card.categoryId) || 0) + 1);
    });
    return counts;
  }, [cards]);

  // Check if any filters are active
  const hasActiveFilters = selectedCategories.size > 0 ||
    selectedAssignees.size > 0 ||
    selectedStatuses.size > 0 ||
    searchQuery.length > 0;

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  // Handle Cmd+K to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if typing in another input
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      // / key focuses search (like many apps)
      if (e.key === '/') {
        e.preventDefault();
        setIsExpanded(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Map mode button configurations - EU4 style
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
    <div
      ref={panelRef}
      className={`filter-panel ${isExpanded ? 'expanded' : ''}`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => {
        if (!showFilters && !searchQuery) {
          setIsExpanded(false);
        }
      }}
    >
      {/* Collapsed state - just show icon */}
      {!isExpanded && (
        <div className="filter-panel-collapsed">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
      )}

      {/* Expanded state */}
      {isExpanded && (
        <>
          {/* Search bar */}
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

          {/* Map Mode Toggles - EU4 style buttons */}
          <div className="filter-panel-mapmode">
            <div className="filter-panel-mapmode-label">Map Mode</div>
            <div className="filter-panel-mapmode-buttons">
              {mapModes.map(({ mode, label, icon, color }) => (
                <button
                  key={mode}
                  className={`mapmode-btn ${colorMode === mode ? 'active' : ''}`}
                  onClick={() => onColorModeChange(mode)}
                  style={{
                    '--mapmode-color': color,
                  } as React.CSSProperties}
                  title={label}
                >
                  <span className="mapmode-btn-icon">{icon}</span>
                  <span className="mapmode-btn-label">{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Filter toggle */}
          <button
            className={`filter-panel-toggle ${showFilters ? 'active' : ''} ${hasActiveFilters ? 'has-filters' : ''}`}
            onClick={() => setShowFilters(!showFilters)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
            </svg>
            <span>Filters</span>
            {hasActiveFilters && (
              <span className="filter-panel-badge">
                {selectedCategories.size + selectedAssignees.size + selectedStatuses.size}
              </span>
            )}
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              style={{ transform: showFilters ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* Filter sections - collapsible */}
          {showFilters && (
            <div className="filter-panel-sections">
              {/* Clear all button */}
              {hasActiveFilters && (
                <button className="filter-panel-clear" onClick={onClearFilters}>
                  Clear all filters
                </button>
              )}

              {/* Category filter */}
              {categories.length > 0 && (
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
                        style={{
                          '--chip-color': category.color,
                        } as React.CSSProperties}
                      >
                        <span
                          className="filter-chip-dot"
                          style={{ backgroundColor: category.color }}
                        />
                        <span className="filter-chip-label">{category.name}</span>
                        <span className="filter-chip-count">{categoryCounts.get(category.id) || 0}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Assignee filter */}
              {(assignees.length > 0 || unassignedCount > 0) && (
                <div className="filter-panel-section">
                  <div className="filter-panel-section-header">
                    <span>Assignee</span>
                    <span className="filter-panel-section-count">
                      {assignees.length + (unassignedCount > 0 ? 1 : 0)}
                    </span>
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

              {/* Status filter */}
              <div className="filter-panel-section">
                <div className="filter-panel-section-header">
                  <span>Status</span>
                </div>
                <div className="filter-panel-chips">
                  {['active', 'blocked', 'done'].map(status => (
                    <button
                      key={status}
                      className={`filter-chip status-${status} ${selectedStatuses.has(status) ? 'selected' : ''}`}
                      onClick={() => onStatusToggle(status)}
                    >
                      <span className="filter-chip-label">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
