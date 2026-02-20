'use client';

import { useMemo, useRef, useEffect, useState } from 'react';
import { ViewMode, DisplayMode, ColorMode } from '../types';
import { Card, Category, Edge } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Circle, Globe, Type, Maximize2, Paintbrush, Filter, Clock } from 'lucide-react';

interface FilterHudProps {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onColorModeChange: (mode: ColorMode) => void;
  cards?: Card[];
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
  burntAgeThreshold?: number;
  onBurntAgeThresholdChange?: (threshold: number) => void;
  burntAgeMax?: number;
}

export function FilterHud({
  viewMode,
  displayMode,
  colorMode,
  onViewModeChange,
  onDisplayModeChange,
  onColorModeChange,
  cards,
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
  burntAgeThreshold = 0,
  onBurntAgeThresholdChange,
  burntAgeMax = 30,
}: FilterHudProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);

  const toggleWorkspace = (ws: string) =>
    setActiveWorkspace(prev => (prev === ws ? null : ws));

  // Handle global hotkeys to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }
      if (e.key === '/' || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Active filter badge count
  const activeFilterCount =
    (selectedCategories?.size || 0) +
    (selectedStatuses?.size || 0) +
    (blockerThreshold > 0 ? 1 : 0);

  return (
    <div className="settings-panel">
      {/* Row 1: Search bar */}
      <div className="settings-top-row">
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
      </div>

      {/* Row 2: Toolbar buttons */}
      <TooltipProvider delayDuration={300}>
        <div className="hud-button-bar">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={viewMode === '3D' ? 'outline' : 'ghost'}
                size="icon-sm"
                className="rounded-sm"
                onClick={() => onViewModeChange(viewMode === '2D' ? '3D' : '2D')}
              >
                {viewMode === '2D' ? <Circle className="size-4" /> : <Globe className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Toggle {viewMode === '2D' ? '3D' : '2D'} view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={displayMode !== 'balls' ? 'outline' : 'ghost'}
                size="icon-sm"
                className="rounded-sm"
                onClick={() => {
                  const modes: DisplayMode[] = ['balls', 'labels', 'full'];
                  const idx = modes.indexOf(displayMode);
                  onDisplayModeChange(modes[(idx + 1) % modes.length]);
                }}
              >
                {displayMode === 'balls' ? <Circle className="size-4" /> : displayMode === 'labels' ? <Type className="size-4" /> : <Maximize2 className="size-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Display: {displayMode}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeWorkspace === 'color' ? 'outline' : 'ghost'}
                size="icon-sm"
                className="rounded-sm"
                onClick={() => toggleWorkspace('color')}
              >
                <Paintbrush className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Color mode</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeWorkspace === 'filter' ? 'outline' : 'ghost'}
                size="icon-sm"
                className="rounded-sm relative"
                onClick={() => toggleWorkspace('filter')}
              >
                <Filter className="size-4" />
                {activeFilterCount > 0 && <span className="hud-ws-badge">{activeFilterCount}</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Filters</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeWorkspace === 'adjust' ? 'outline' : 'ghost'}
                size="icon-sm"
                className="rounded-sm"
                onClick={() => toggleWorkspace('adjust')}
              >
                <Clock className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Burnt age</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

      {/* Row 3: Expandable workspace */}
      {activeWorkspace === 'color' && (
        <div className="hud-workspace">
          <div>
            <div className="hud-workspace-label">Color By</div>
            <TooltipProvider delayDuration={300}>
              <div className="hud-option-row">
                <Button
                  variant={colorMode === 'category' ? 'default' : 'ghost'}
                  size="xs"
                  className="rounded-sm"
                  onClick={() => onColorModeChange('category')}
                >
                  Category
                </Button>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={colorMode === 'indegree' ? 'default' : 'ghost'}
                      size="xs"
                      className="rounded-sm"
                      onClick={() => onColorModeChange('indegree')}
                    >
                      Enablers
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">In-degree: number of incoming edges</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={colorMode === 'outdegree' ? 'default' : 'ghost'}
                      size="xs"
                      className="rounded-sm"
                      onClick={() => onColorModeChange('outdegree')}
                    >
                      Blockers
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Out-degree: number of outgoing edges</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          </div>
        </div>
      )}

      {activeWorkspace === 'filter' && (
        <div className="hud-workspace">
          {/* Category filter */}
          {categories && selectedCategories && onCategoryToggle && categories.length > 0 && (
            <div>
              <div className="hud-workspace-label">Category</div>
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
            <div>
              <div className="hud-workspace-label">Status</div>
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
          )}

          {/* Blocker rate slider */}
          {onBlockerThresholdChange && maxBlockerCount > 0 && (
            <div>
              <div className="hud-workspace-label">Blocker Rate ≥{blockerThreshold}</div>
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
          )}
        </div>
      )}

      {activeWorkspace === 'adjust' && (
        <div className="hud-workspace">
          <div>
            <div className="hud-workspace-label">
              Burnt Age: {burntAgeThreshold === 0 ? 'Hide' : burntAgeThreshold >= burntAgeMax ? 'All' : `${burntAgeThreshold}d`}
            </div>
            <div className="filter-slider-container">
              <input
                type="range"
                className="filter-slider"
                min={0}
                max={burntAgeMax}
                value={burntAgeThreshold}
                onChange={(e) => onBurntAgeThresholdChange?.(parseInt(e.target.value))}
              />
              <div className="filter-slider-labels">
                <span>Hide</span>
                <span>All</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
