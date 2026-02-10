'use client';

import { useMemo, useState } from 'react';
import { Card } from '@/lib/types';

interface FilterSidebarProps {
  cards: Card[];
  selectedAssignees: Set<string>;
  onAssigneeToggle: (assignee: string) => void;
  onClearFilters: () => void;
}

export function FilterSidebar({
  cards,
  selectedAssignees,
  onAssigneeToggle,
  onClearFilters,
}: FilterSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Extract unique assignees from cards
  const assignees = useMemo(() => {
    const assigneeSet = new Set<string>();
    cards.forEach(card => {
      if (card.assignee) {
        assigneeSet.add(card.assignee);
      }
    });
    // Sort alphabetically
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

  const hasFilters = selectedAssignees.size > 0;

  // Get initials from name
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0).toUpperCase())
      .slice(0, 2)
      .join('');
  };

  if (assignees.length === 0 && unassignedCount === cards.length) {
    // No assignees to filter by
    return null;
  }

  return (
    <div className={`filter-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="filter-sidebar-header">
        <button
          className="filter-sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? 'Expand filters' : 'Collapse filters'}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(180deg)', transition: 'transform 0.2s ease' }}
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        {!collapsed && (
          <>
            <span className="filter-sidebar-title">Filters</span>
            {hasFilters && (
              <button
                className="filter-sidebar-clear"
                onClick={onClearFilters}
              >
                Clear
              </button>
            )}
          </>
        )}
      </div>

      {!collapsed && (
        <div className="filter-sidebar-content">
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
        </div>
      )}
    </div>
  );
}
