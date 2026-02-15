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
import { ChevronDown, Download, Plus, Upload } from 'lucide-react';

interface ProjectHudProps {
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onNewRootNode: () => void;
}

export function ProjectHud({
  onDownloadGraph,
  onUploadGraph,
  onNewRootNode,
}: ProjectHudProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
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
      <DropdownMenu>
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
        <DropdownMenuContent align="start" className={dropdownContentClass}>
          <DropdownMenuItem className={dropdownItemClass} onClick={onDownloadGraph}>
            <Download className="graph-dropdown-icon" />
            <span>Export graph</span>
          </DropdownMenuItem>
          <DropdownMenuItem className={dropdownItemClass} onClick={handleUploadClick}>
            <Upload className="graph-dropdown-icon" />
            <span>Import graph</span>
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
