'use client';

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChevronDown, Plus } from 'lucide-react';

interface HeaderProps {
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onNewRootNode: () => void;
}

export function Header({
  onDownloadGraph,
  onUploadGraph,
  onNewRootNode,
}: HeaderProps) {
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
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onDownloadGraph}>
            Download JSON
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleUploadClick}>
            Upload JSON
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
