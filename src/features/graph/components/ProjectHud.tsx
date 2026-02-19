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
import { Check, ChevronDown, Download, Palette, Pencil, Plus, Trash2, Upload } from 'lucide-react';

interface ProjectHudProps {
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onNewRootNode: () => void;
  onOpenCategoryManager?: () => void;
  projectName?: string;
  projects?: { id: string; name: string }[];
  onProjectSwitch?: (projectId: string) => void;
  onProjectCreate?: (name: string) => void;
  onProjectDelete?: (projectId: string) => void;
  onProjectRename?: (projectId: string, name: string) => void;
}

export function ProjectHud({
  onDownloadGraph,
  onUploadGraph,
  onNewRootNode,
  onOpenCategoryManager,
  projectName,
  projects,
  onProjectSwitch,
  onProjectCreate,
  onProjectDelete,
  onProjectRename,
}: ProjectHudProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = projectName || 'Default Project';

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadGraph(file);
    event.target.value = '';
  };

  const handleNewProject = () => {
    setDropdownOpen(false);
    // Use setTimeout to let the dropdown close before showing prompt
    setTimeout(() => {
      const name = window.prompt('New project name');
      if (name?.trim()) {
        onProjectCreate?.(name.trim());
      }
    }, 100);
  };

  const handleRenameProject = (projectId: string, currentName: string) => {
    setDropdownOpen(false);
    setTimeout(() => {
      const name = window.prompt('Rename project', currentName);
      if (name?.trim()) {
        onProjectRename?.(projectId, name.trim());
      }
    }, 100);
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
            <span className="header-project-name">{displayName}</span>
            <ChevronDown className={`size-3 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className={dropdownContentClass} style={{ minWidth: 200 }}>
          <DropdownMenuLabel className="graph-dropdown-label">
            Projects
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="graph-dropdown-separator" />
          {projects?.map((project) => (
            <DropdownMenuItem
              key={project.id}
              className={dropdownItemClass}
              onClick={() => {
                onProjectSwitch?.(project.id);
                setDropdownOpen(false);
              }}
            >
              {project.name === displayName && (
                <Check className="graph-dropdown-icon" />
              )}
              <span className={project.name !== displayName ? 'pl-[22px]' : ''}>{project.name}</span>
              <div className="ml-auto flex items-center gap-1">
                <button
                  className="project-action-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRenameProject(project.id, project.name);
                  }}
                  title="Rename"
                >
                  <Pencil className="size-3" />
                </button>
                {projects.length > 1 && (
                  <button
                    className="project-action-btn project-action-btn-danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onProjectDelete?.(project.id);
                    }}
                    title="Delete"
                  >
                    <Trash2 className="size-3" />
                  </button>
                )}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator className="graph-dropdown-separator" />
          <DropdownMenuItem
            className={dropdownItemClass}
            onClick={handleNewProject}
          >
            <Plus className="graph-dropdown-icon" />
            <span>New project</span>
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
