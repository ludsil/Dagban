'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Download, Palette, Plus, Upload } from 'lucide-react';

interface ProjectHudProps {
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onNewRootNode: () => void;
  onOpenCategoryManager?: () => void;
}

export function ProjectHud({
  onDownloadGraph,
  onUploadGraph,
  onNewRootNode,
  onOpenCategoryManager,
}: ProjectHudProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentProject] = useState('Default Project');

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadGraph(file);
    event.target.value = '';
  };

  const dropdownContentClass = 'graph-dropdown-content';
  const dropdownItemClass = 'graph-dropdown-item';

  return (
    <div className="header-panel">
      <DropdownMenu open={logoMenuOpen} onOpenChange={setLogoMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="header-logo"
            title="Project actions"
          >
            <div className="header-logo-ball" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className={dropdownContentClass}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <DropdownMenuItem className={dropdownItemClass} onClick={onDownloadGraph}>
            <Download className="graph-dropdown-icon" />
            <span>Export graph</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={dropdownItemClass} onClick={handleUploadClick}>
            <Upload className="graph-dropdown-icon" />
            <span>Import graph</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="graph-dropdown-separator" />
          <DropdownMenuItem className={dropdownItemClass} onClick={() => {
            setLogoMenuOpen(false);
            onOpenCategoryManager?.();
          }}>
            <Palette className="graph-dropdown-icon" />
            <span>Categories</span>
            <kbd className="ml-auto rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] text-white/50">C</kbd>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="header-project-btn gap-1">
            <span className="header-project-name">{currentProject}</span>
            <ChevronDown className={`size-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={dropdownContentClass}>
          <DropdownMenuLabel className="graph-dropdown-label">
            Project
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="graph-dropdown-separator" />
          <DropdownMenuItem className={dropdownItemClass} onClick={() => setDropdownOpen(false)}>
            Default Project
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {/* New Root Node button */}
      <Button
        variant="default"
        size="xs"
        className="header-new-btn"
        onClick={onNewRootNode}
        title="Create new root node"
      >
        <Plus className="size-3" />
        <span>New node</span>
      </Button>
    </div>
  );
}
