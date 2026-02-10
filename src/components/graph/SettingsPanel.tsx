'use client';

import { useMemo } from 'react';
import { ViewMode, DisplayMode, ColorMode, ArrowMode } from './types';
import { Card } from '@/lib/types';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Toggle } from '@/components/ui/toggle';
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
      {/* Assignee filter section - full list with names and counts */}
      {cards && selectedAssignees && onAssigneeToggle && (assignees.length > 0 || unassignedCount > 0) && (
        <div className="filter-section">
          <div className="filter-section-header">
            <span className="filter-section-title">Assignee</span>
            <span className="filter-section-count">{assignees.length + (unassignedCount > 0 ? 1 : 0)}</span>
          </div>
          <div className="filter-assignee-list">
            {assignees.map(assignee => (
              <Toggle
                key={assignee}
                pressed={selectedAssignees.has(assignee)}
                onPressedChange={() => onAssigneeToggle(assignee)}
                className="filter-assignee-toggle"
              >
                <Avatar size="sm">
                  <AvatarFallback>{getInitials(assignee)}</AvatarFallback>
                </Avatar>
                <span className="filter-assignee-name">{assignee}</span>
                <span className="filter-assignee-count">{assigneeCounts.get(assignee) || 0}</span>
              </Toggle>
            ))}
            {unassignedCount > 0 && (
              <Toggle
                pressed={selectedAssignees.has('__unassigned__')}
                onPressedChange={() => onAssigneeToggle('__unassigned__')}
                className="filter-assignee-toggle"
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
              </Toggle>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
