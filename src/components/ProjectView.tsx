'use client';

import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import DagbanGraph from '@/components/DagbanGraph';
import { getEmptyGraph, getProjects, Project } from '@/lib/projects';
import { usePersistedGraph } from '@/lib/storage';
import { useGraphUndo, type GraphUpdateOptions } from '@/lib/graph-undo';
import type { DagbanGraph as GraphData, Card, Traverser, User } from '@/lib/types';
import { createUserId } from '@/lib/users';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProjectHeaderProps {
  project: Project;
  projects: Project[];
  onProjectSelect: (projectId: string) => void;
  onNewRootNode: () => void;
  onDownloadGraph: () => void;
  onUploadGraph: (file: File) => void;
  onBackToProjects: () => void;
}

function ProjectHeader({
  project,
  projects,
  onProjectSelect,
  onNewRootNode,
  onDownloadGraph,
  onUploadGraph,
  onBackToProjects,
}: ProjectHeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = () => setDropdownOpen(false);
    if (dropdownOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [dropdownOpen]);

  return (
    <div className="header-panel">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="header-logo"
            title="Project actions"
          >
            <div className="header-logo-ball" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={onDownloadGraph}>Download JSON</DropdownMenuItem>
          <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>Upload JSON</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            onUploadGraph(file);
            event.target.value = '';
          }
        }}
        style={{ display: 'none' }}
      />

      <button
        className="header-back-btn"
        onClick={onBackToProjects}
        title="Back to projects"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3h7l2 3h9v12a2 2 0 01-2 2H5a2 2 0 01-2-2V3z" />
        </svg>
      </button>

      <div className="header-project-switcher">
        <button
          className="header-project-btn"
          onClick={(e) => {
            e.stopPropagation();
            setDropdownOpen(!dropdownOpen);
          }}
        >
          <span className="header-project-name">{project.name}</span>
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
            {projects.map(p => (
              <button
                key={p.id}
                className={`header-dropdown-item ${p.id === project.id ? 'active' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onProjectSelect(p.id);
                  setDropdownOpen(false);
                }}
              >
                {p.name}
              </button>
            ))}
            <div className="header-dropdown-divider" />
            <button
              className="header-dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                onBackToProjects();
              }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3h7l2 3h9v12a2 2 0 01-2 2H5a2 2 0 01-2-2V3z" />
              </svg>
              All Projects
            </button>
          </div>
        )}
      </div>

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

interface ProjectViewProps {
  projectId: string;
}

export default function ProjectView({ projectId }: ProjectViewProps) {
  const router = useRouter();
  const [allProjects] = useState<Project[]>(() => getProjects());
  const [triggerNewNode, setTriggerNewNode] = useState(false);

  // Derive current project from allProjects and projectId
  const project = useMemo(() => {
    return allProjects.find(p => p.id === projectId) || null;
  }, [allProjects, projectId]);

  // Redirect if project not found
  useEffect(() => {
    if (!project) {
      router.push('/');
    }
  }, [project, router]);

  const emptyGraph = useMemo(() => getEmptyGraph(), [projectId]);
  // Use persisted graph with project-specific storage
  const [graph, setGraph] = usePersistedGraph(emptyGraph, projectId);
  const { applyGraphUpdate, handleUndo } = useGraphUndo(setGraph);

  // Handle card updates
  const handleCardChange = useCallback((cardId: string, updates: Partial<GraphData['cards'][0]>) => {
    applyGraphUpdate(prev => ({
      ...prev,
      cards: prev.cards.map(card =>
        card.id === cardId ? { ...card, ...updates, updatedAt: new Date().toISOString() } : card
      ),
    }));
  }, [applyGraphUpdate]);

  // Handle category updates
  const handleCategoryChange = useCallback((categoryId: string, updates: Partial<GraphData['categories'][0]>) => {
    applyGraphUpdate(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId ? { ...cat, ...updates } : cat
      ),
    }));
  }, [applyGraphUpdate]);

  // Handle card creation (with optional parent for downstream or child for upstream)
  const handleCardCreate = useCallback((card: Card, parentCardId?: string, childCardId?: string) => {
    applyGraphUpdate(prev => {
      const newEdges = [...prev.edges];

      if (parentCardId) {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: parentCardId,
          target: card.id,
        });
      }

      if (childCardId) {
        newEdges.push({
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-up`,
          source: card.id,
          target: childCardId,
        });
      }

      return {
        ...prev,
        cards: [...prev.cards, card],
        edges: newEdges,
      };
    });
  }, [applyGraphUpdate]);

  // Handle card deletion (also removes connected edges)
  const handleCardDelete = useCallback((cardId: string) => {
    applyGraphUpdate(prev => {
      const remainingEdges = prev.edges.filter(edge => edge.source !== cardId && edge.target !== cardId);
      return {
        ...prev,
        cards: prev.cards.filter(card => card.id !== cardId),
        edges: remainingEdges,
        traversers: prev.traversers.filter(traverser => remainingEdges.some(edge => edge.id === traverser.edgeId)),
      };
    });
  }, [applyGraphUpdate]);

  // Handle edge creation between existing nodes
  const handleEdgeCreate = useCallback((sourceId: string, targetId: string) => {
    applyGraphUpdate(prev => ({
      ...prev,
      edges: [
        ...prev.edges,
        {
          id: `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          source: sourceId,
          target: targetId,
        },
      ],
    }));
  }, [applyGraphUpdate]);

  const handleEdgeDelete = useCallback((edgeId: string) => {
    applyGraphUpdate(prev => {
      const remainingEdges = prev.edges.filter(edge => edge.id !== edgeId);
      return {
        ...prev,
        edges: remainingEdges,
        traversers: prev.traversers.filter(traverser => traverser.edgeId !== edgeId),
      };
    });
  }, [applyGraphUpdate]);

  const handleUserAdd = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    applyGraphUpdate(prev => {
      const existingIds = new Set(prev.users.map(user => user.id));
      const id = createUserId(trimmed, existingIds);
      const newUser: User = {
        id,
        name: trimmed,
      };
      return {
        ...prev,
        users: [...prev.users, newUser],
      };
    });
  }, [applyGraphUpdate]);

  const handleTraverserCreate = useCallback((traverser: Traverser) => {
    applyGraphUpdate(prev => {
      if (prev.traversers.some(existing => existing.edgeId === traverser.edgeId)) return prev;
      return {
        ...prev,
        traversers: [...prev.traversers, traverser],
      };
    });
  }, [applyGraphUpdate]);

  const handleTraverserUpdate = useCallback((
    traverserId: string,
    updates: Partial<Traverser>,
    options?: GraphUpdateOptions
  ) => {
    applyGraphUpdate(prev => ({
      ...prev,
      traversers: prev.traversers.map(traverser =>
        traverser.id === traverserId ? { ...traverser, ...updates } : traverser
      ),
    }), { transient: options?.transient, recordUndo: options?.recordUndo });
  }, [applyGraphUpdate]);

  const handleTraverserDelete = useCallback((traverserId: string) => {
    applyGraphUpdate(prev => ({
      ...prev,
      traversers: prev.traversers.filter(traverser => traverser.id !== traverserId),
    }));
  }, [applyGraphUpdate]);

  const handleDownloadGraph = useCallback(() => {
    try {
      const json = JSON.stringify(graph, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `${project.name || 'dagban'}-${stamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to download graph JSON', error);
    }
  }, [graph, project.name]);

  const handleUploadGraph = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const parsed = JSON.parse(text);
        const isValid =
          parsed &&
          typeof parsed === 'object' &&
          Array.isArray(parsed.cards) &&
          Array.isArray(parsed.edges) &&
          Array.isArray(parsed.categories) &&
          Array.isArray(parsed.users) &&
          Array.isArray(parsed.traversers);
        if (!isValid) {
          console.warn('Invalid Dagban JSON format');
          return;
        }
        applyGraphUpdate(() => parsed as GraphData);
      } catch (error) {
        console.error('Failed to import graph JSON', error);
      }
    };
    reader.readAsText(file);
  }, [applyGraphUpdate]);

  const handleGraphImport = useCallback((nextGraph: GraphData) => {
    applyGraphUpdate(() => nextGraph);
  }, [applyGraphUpdate]);

  const handleProjectSelect = useCallback((newProjectId: string) => {
    router.push(`/project/${newProjectId}`);
  }, [router]);

  const handleBackToProjects = useCallback(() => {
    router.push('/');
  }, [router]);

  const handleNewRootNode = useCallback(() => {
    setTriggerNewNode(true);
    // Reset trigger after a short delay
    setTimeout(() => setTriggerNewNode(false), 100);
  }, []);

  if (!project) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        <div className="text-gray-500">Loading project...</div>
      </div>
    );
  }

  return (
    <div className="w-screen h-screen">
      <DagbanGraph
        data={graph}
        onCardChange={handleCardChange}
        onCategoryChange={handleCategoryChange}
        onCardCreate={handleCardCreate}
        onCardDelete={handleCardDelete}
        onEdgeCreate={handleEdgeCreate}
        onEdgeDelete={handleEdgeDelete}
        onUserAdd={handleUserAdd}
        onTraverserCreate={handleTraverserCreate}
        onTraverserUpdate={handleTraverserUpdate}
        onTraverserDelete={handleTraverserDelete}
        onUndo={handleUndo}
        projectHeader={
          <ProjectHeader
            project={project}
            projects={allProjects}
            onProjectSelect={handleProjectSelect}
            onNewRootNode={handleNewRootNode}
            onDownloadGraph={handleDownloadGraph}
            onUploadGraph={handleUploadGraph}
            onBackToProjects={handleBackToProjects}
          />
        }
        triggerNewNode={triggerNewNode}
        onGraphImport={handleGraphImport}
      />
    </div>
  );
}
