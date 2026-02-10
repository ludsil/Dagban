'use client';

import { useMemo } from 'react';
import { ViewMode, DisplayMode, ColorMode, ArrowMode } from './types';
import { Card } from '@/lib/types';

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
}: SettingsPanelProps) {
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
          >
            Indegree
          </button>
          <button
            className={`toggle-btn toggle-btn-outdegree ${colorMode === 'outdegree' ? 'active' : ''}`}
            onClick={() => onColorModeChange('outdegree')}
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
      )}
    </div>
  );
}
