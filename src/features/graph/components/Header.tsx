'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Plus } from 'lucide-react';

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
      <Button
        variant="ghost"
        size="icon-sm"
        className="header-logo"
        onClick={onLogoClick}
        title="Settings"
      >
        <div className="header-logo-ball" />
      </Button>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="header-project-btn gap-1">
            <span className="header-project-name">{currentProject}</span>
            <ChevronDown className={`size-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setDropdownOpen(false)}>
            Default Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* New Root Node button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onNewRootNode}
        title="Create new root node"
      >
        <Plus className="size-4" />
        <span>New</span>
      </Button>
    </div>
  );
}
