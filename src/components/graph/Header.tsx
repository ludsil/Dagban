'use client';

import { useState } from 'react';

interface HeaderProps {
  onLogoClick: () => void;
  onNewRootNode: () => void;
}

export function Header({
  onLogoClick,
  onNewRootNode,
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [currentProject] = useState('Default Project');

  return (
    <div className="header-panel">
      <button
        className="header-logo"
        onClick={onLogoClick}
        title="Settings"
      >
        <div className="header-logo-ball" />
      </button>
      <div className="header-project-switcher">
        <button
          className="header-project-btn"
          onClick={() => setDropdownOpen(!dropdownOpen)}
        >
          <span className="header-project-name">{currentProject}</span>
          <svg
            className={`header-chevron ${dropdownOpen ? 'open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {dropdownOpen && (
          <div className="header-dropdown">
            <button
              className="header-dropdown-item active"
              onClick={() => setDropdownOpen(false)}
            >
              Default Project
            </button>
          </div>
        )}
      </div>
      {/* New Root Node button */}
      <button
        className="new-root-btn"
        onClick={onNewRootNode}
        title="Create new root node"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>New</span>
      </button>
    </div>
  );
}
