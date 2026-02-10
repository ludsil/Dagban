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
    <div className="absolute top-4 left-4 z-[1000] flex items-center gap-3 rounded-lg border border-white/10 bg-black/70 px-3 py-2 backdrop-blur-sm">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onLogoClick}
        title="Settings"
      >
        <div className="size-4 rounded-full bg-[radial-gradient(circle_at_30%_30%,#4ade80,#16a34a)] shadow-[0_0_8px_rgba(74,222,128,0.4)]" />
      </Button>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-1.5">
            <span className="text-[13px] font-medium text-white/90">{currentProject}</span>
            <ChevronDown className={`size-3 text-white/50 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => setDropdownOpen(false)}>
            Default Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
