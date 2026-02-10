'use client';

import { ViewMode, DisplayMode, ColorMode } from './types';

interface SettingsPanelProps {
  viewMode: ViewMode;
  displayMode: DisplayMode;
  colorMode: ColorMode;
  onViewModeChange: (mode: ViewMode) => void;
  onDisplayModeChange: (mode: DisplayMode) => void;
  onColorModeChange: (mode: ColorMode) => void;
}

export function SettingsPanel({
  viewMode,
  displayMode,
  colorMode,
  onViewModeChange,
  onDisplayModeChange,
  onColorModeChange,
}: SettingsPanelProps) {
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
    </div>
  );
}
