'use client';

import { useMemo, useRef, type ChangeEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Check,
  Download,
  FolderOpen,
  Keyboard,
  Menu,
  Pencil,
  Plus,
  Settings2,
  Shapes,
  Trash2,
  Users,
} from 'lucide-react';

interface ProjectHudProps {
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onNewRootNode: () => void;
  onOpenCategoryManager?: () => void;
  onOpenCopySettings?: () => void;
  onOpenShortcuts?: () => void;
  onOpenUserManager?: () => void;
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
  onOpenUserManager,
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

  const hasProjects = projects && projects.length > 0 && onProjectSwitch;

  return (
    <div className="project-hud">
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-lg"
                className="project-hud-trigger"
                aria-label="Menu"
              >
                <Menu className="size-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">Menu</TooltipContent>
        </Tooltip>
        <DropdownMenuContent
          align="start"
          sideOffset={8}
          className="project-hud-content"
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          {/* Project name header */}
          <DropdownMenuLabel className="project-hud-project-name">
            {displayName}
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="bg-white/10" />

          {/* Graph actions */}
          <DropdownMenuItem className="project-hud-item" onClick={onNewRootNode}>
            <Plus className="size-4 opacity-60" />
            <span>New node</span>
            <Kbd>N</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem className="project-hud-item" onClick={handleUploadClick}>
            <FolderOpen className="size-4 opacity-60" />
            <span>Open...</span>
            <Kbd>&#8984;O</Kbd>
          </DropdownMenuItem>
          <DropdownMenuItem className="project-hud-item" onClick={onDownloadGraph}>
            <Download className="size-4 opacity-60" />
            <span>Save to...</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="bg-white/10" />

          {/* Settings */}
          {onOpenCategoryManager && (
            <DropdownMenuItem className="project-hud-item" onClick={onOpenCategoryManager}>
              <Shapes className="size-4 opacity-60" />
              <span>Categories</span>
              <Kbd>C</Kbd>
            </DropdownMenuItem>
          )}
          {onOpenUserManager && (
            <DropdownMenuItem className="project-hud-item" onClick={onOpenUserManager}>
              <Users className="size-4 opacity-60" />
              <span>Users</span>
              <Kbd>U</Kbd>
            </DropdownMenuItem>
          )}
          {onOpenCopySettings && (
            <DropdownMenuItem className="project-hud-item" onClick={onOpenCopySettings}>
              <Settings2 className="size-4 opacity-60" />
              <span>Settings</span>
              <Kbd>Esc</Kbd>
            </DropdownMenuItem>
          )}
          {onOpenShortcuts && (
            <DropdownMenuItem className="project-hud-item" onClick={onOpenShortcuts}>
              <Keyboard className="size-4 opacity-60" />
              <span>Hotkeys</span>
              <Kbd>M</Kbd>
            </DropdownMenuItem>
          )}

          {/* Projects section */}
          {hasProjects && (
            <>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuLabel className="project-hud-label">Projects</DropdownMenuLabel>
              {projects.map((project) => (
                <DropdownMenuItem
                  key={project.id}
                  className="project-hud-item"
                  onClick={() => onProjectSwitch(project.id)}
                >
                  {project.id === currentProject?.id ? (
                    <Check className="size-3.5 text-white/70" />
                  ) : (
                    <span className="size-3.5" />
                  )}
                  <span className="truncate">{project.name}</span>
                </DropdownMenuItem>
              ))}
              {onProjectCreate && (
                <DropdownMenuItem className="project-hud-item" onClick={handleNewProject}>
                  <Plus className="size-4 opacity-60" />
                  <span>New project</span>
                </DropdownMenuItem>
              )}
              {onProjectRename && currentProject && (
                <DropdownMenuItem className="project-hud-item" onClick={handleRenameCurrentProject}>
                  <Pencil className="size-4 opacity-60" />
                  <span>Rename project</span>
                </DropdownMenuItem>
              )}
              {onProjectDelete && currentProject && projectCount > 1 && (
                <DropdownMenuItem className="project-hud-item project-hud-item-danger" onClick={handleDeleteCurrentProject}>
                  <Trash2 className="size-4" />
                  <span>Delete project</span>
                </DropdownMenuItem>
              )}
            </>
          )}

          {onBackToProjects && (
            <>
              <DropdownMenuSeparator className="bg-white/10" />
              <DropdownMenuItem className="project-hud-item" onClick={onBackToProjects}>
                <FolderOpen className="size-4 opacity-60" />
                <span>All projects</span>
              </DropdownMenuItem>
            </>
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
