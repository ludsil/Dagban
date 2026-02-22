'use client';

import { useMemo, useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BadgeHelp,
  Check,
  Copy,
  Download,
  FolderOpen,
  FolderTree,
  Menu,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Shapes,
  Trash2,
} from 'lucide-react';

interface ProjectHudProps {
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onNewRootNode: () => void;
  onOpenCategoryManager?: () => void;
  onOpenCopySettings?: () => void;
  onOpenShortcuts?: () => void;
  onResetCanvas?: () => void;
  onBackToProjects?: () => void;
  projectId?: string;
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
  onOpenCopySettings,
  onOpenShortcuts,
  onResetCanvas,
  onBackToProjects,
  projectId,
  projectName,
  projects,
  onProjectSwitch,
  onProjectCreate,
  onProjectDelete,
  onProjectRename,
}: ProjectHudProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayName = projectName || 'Default Project';
  const currentProject = useMemo(() => {
    if (!projects || projects.length === 0) return undefined;
    if (projectId) {
      const byId = projects.find(project => project.id === projectId);
      if (byId) return byId;
    }
    return projects.find(project => project.name === displayName);
  }, [projects, projectId, displayName]);
  const projectCount = projects?.length ?? 0;

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onUploadGraph(file);
    event.target.value = '';
  };

  const handleNewProject = () => {
    if (!onProjectCreate) return;
    window.setTimeout(() => {
      const name = window.prompt('New project name');
      if (name?.trim()) {
        onProjectCreate(name.trim());
      }
    }, 80);
  };

  const handleRenameCurrentProject = () => {
    if (!currentProject || !onProjectRename) return;
    window.setTimeout(() => {
      const name = window.prompt('Rename project', currentProject.name);
      if (name?.trim()) {
        onProjectRename(currentProject.id, name.trim());
      }
    }, 80);
  };

  const handleDeleteCurrentProject = () => {
    if (!currentProject || !onProjectDelete || projectCount <= 1) return;
    const shouldDelete = window.confirm(`Delete "${currentProject.name}"?`);
    if (shouldDelete) {
      onProjectDelete(currentProject.id);
    }
  };

  return (
    <div className="header-panel canvas-menu-shell">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                className="canvas-menu-trigger"
                aria-label="Canvas menu"
              >
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Canvas menu</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          sideOffset={12}
          className="canvas-menu-content"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <DropdownMenuItem className="canvas-menu-item" onClick={onNewRootNode}>
            <Plus className="canvas-menu-icon" />
            <span>New node</span>
            <Kbd className="canvas-menu-kbd">N</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem className="canvas-menu-item" onClick={handleUploadClick}>
            <FolderOpen className="canvas-menu-icon" />
            <span>Open...</span>
            <Kbd className="canvas-menu-kbd">Cmd+O</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem className="canvas-menu-item" onClick={onDownloadGraph}>
            <Download className="canvas-menu-icon" />
            <span>Save to...</span>
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="canvas-menu-item canvas-menu-subtrigger">
              <Settings2 className="canvas-menu-icon" />
              <span>Preferences</span>
              <Kbd className="canvas-menu-kbd">Esc</Kbd>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="canvas-menu-content canvas-menu-subcontent">
              {onOpenCategoryManager && (
                <DropdownMenuItem className="canvas-menu-item" onClick={onOpenCategoryManager}>
                  <Shapes className="canvas-menu-icon" />
                  <span>Categories</span>
                  <Kbd className="canvas-menu-kbd">C</Kbd>
                </DropdownMenuItem>
              )}
              {onOpenCopySettings && (
                <DropdownMenuItem className="canvas-menu-item" onClick={onOpenCopySettings}>
                  <Copy className="canvas-menu-icon" />
                  <span>Copy format</span>
                </DropdownMenuItem>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {(projects && projects.length > 0 && onProjectSwitch) && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="canvas-menu-item canvas-menu-subtrigger">
                <FolderTree className="canvas-menu-icon" />
                <span>Projects</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="canvas-menu-content canvas-menu-subcontent">
                {projects.map((project) => (
                  <DropdownMenuItem
                    key={project.id}
                    className="canvas-menu-item"
                    onClick={() => onProjectSwitch(project.id)}
                  >
                    {project.id === currentProject?.id ? (
                      <Check className="canvas-menu-icon" />
                    ) : (
                      <span className="canvas-menu-icon canvas-menu-icon-placeholder" aria-hidden="true" />
                    )}
                    <span>{project.name}</span>
                  </DropdownMenuItem>
                ))}
                {(onProjectCreate || onProjectRename || onProjectDelete) && (
                  <DropdownMenuSeparator className="canvas-menu-separator" />
                )}
                {onProjectCreate && (
                  <DropdownMenuItem className="canvas-menu-item" onClick={handleNewProject}>
                    <Plus className="canvas-menu-icon" />
                    <span>New project</span>
                  </DropdownMenuItem>
                )}
                {onProjectRename && currentProject && (
                  <DropdownMenuItem className="canvas-menu-item" onClick={handleRenameCurrentProject}>
                    <Pencil className="canvas-menu-icon" />
                    <span>Rename current</span>
                  </DropdownMenuItem>
                )}
                {onProjectDelete && currentProject && projectCount > 1 && (
                  <DropdownMenuItem
                    className="canvas-menu-item"
                    onClick={handleDeleteCurrentProject}
                  >
                    <Trash2 className="canvas-menu-icon" />
                    <span>Delete current</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {(onOpenShortcuts || onResetCanvas || onBackToProjects) && (
            <DropdownMenuSeparator className="canvas-menu-separator" />
          )}
          {onOpenShortcuts && (
            <DropdownMenuItem className="canvas-menu-item" onClick={onOpenShortcuts}>
              <BadgeHelp className="canvas-menu-icon" />
              <span>Hotkeys</span>
              <Kbd className="canvas-menu-kbd">M</Kbd>
            </DropdownMenuItem>
          )}
          {onBackToProjects && (
            <DropdownMenuItem className="canvas-menu-item" onClick={onBackToProjects}>
              <FolderOpen className="canvas-menu-icon" />
              <span>All projects</span>
            </DropdownMenuItem>
          )}
          {onResetCanvas && (
            <DropdownMenuItem className="canvas-menu-item" onClick={onResetCanvas}>
              <RotateCcw className="canvas-menu-icon" />
              <span>Reset canvas</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </div>
  );
}
